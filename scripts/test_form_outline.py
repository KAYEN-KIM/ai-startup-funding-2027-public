"""P0.21 local-only form outline parsing and source-bound candidate tests."""
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import zipfile
from xml.sax.saxutils import escape
from attachment_core import ExtractError
from form_outline_core import heading_from_unit, infer_lines, extract_outline
from form_outline_cli import execute, ROOT

def hwpx(*paragraphs):
    with io.BytesIO() as stream:
        with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('mimetype','application/hwp+zip')
            body=''.join('<hp:p><hp:run><hp:t>'+escape(x)+'</hp:t></hp:run></hp:p>'
                         for x in paragraphs)
            z.writestr('Contents/section0.xml','<sec xmlns:hp="urn:hwp">'+body+'</sec>')
        return stream.getvalue()

class ExtractionTests(unittest.TestCase):
    def test_headings_and_locators(self):
        raw=hwpx(
            "1. 문제인식", "2026년 하반기 시장은 앞으로 지속 확대될 것으로 전망됩니다.",
            "2-1. 실현가능성", "3. 사업비 구성", "지원 대상은 창업기업입니다.",
            "팀 구성",
        )
        result=extract_outline(raw,'https://www.bizinfo.go.kr/a','양식.hwpx')
        self.assertEqual(result['schema'],'local-form-outline-candidates/v1')
        self.assertEqual(result['document']['format'],'hwpx')
        self.assertEqual(result['document']['source_status'],'self_supplied_unverified')
        self.assertEqual([x['heading'] for x in result['candidates']],
                         ['1. 문제인식','2-1. 실현가능성','3. 사업비 구성','팀 구성'])
        self.assertIn('section0.xml / paragraph 1',result['candidates'][0]['locator'])
        self.assertTrue(all(x['status']=='candidate_unverified' for x in result['candidates']))
        self.assertNotIn('시장 확대',json.dumps(result,ensure_ascii=False))

    def test_untrusted_contact_heading_not_retained(self):
        self.assertIsNone(heading_from_unit('1. 010-1234-5678'))
        self.assertIsNone(heading_from_unit('1. user@example.com'))
        self.assertIsNone(heading_from_unit('1. 991231-1234567'))
        self.assertEqual(heading_from_unit('1. 창업아이템의 실현가능성')[1],'numbered')

    def test_body_not_promoted(self):
        for row in ('재무 상태에 따라 사업 지원을 받을 수 있습니다.',
                    '사업비 지원 1억 원은 평가 후 협의해야 한다',
                    '문제인식에 관하여 설명합니다.',
                    '2. 창업을 준비하는 회사는 서류를 모두 작성하고 제출합니다.'):
            self.assertIsNone(heading_from_unit(row))

    def test_safe_limit_and_provenance(self):
        many=[{'text':str(i)+'. 항목제목','locator':'PDF p.1 / text-line '+str(i)} for i in range(1,100)]
        result=infer_lines(many,'f'*64,'pdf','test',file_label='form.pdf')
        self.assertEqual(len(result['candidates']),40)
        self.assertTrue(result['truncated_candidates'])
        self.assertEqual(result['document']['sha256'],'f'*64)
        self.assertTrue(all(x['locator'].startswith('PDF') for x in result['candidates']))

    def test_no_false_official_source_verification(self):
        result=extract_outline(hwpx('1. 문제인식'),'','form.hwpx')
        self.assertEqual(result['document']['source_status'],'self_supplied_unverified')
        with self.assertRaises(ValueError):
            extract_outline(hwpx('1. 문제인식'),'https://evil.example/a','form.hwpx')
        with self.assertRaises(ValueError):
            extract_outline(hwpx('1. 문제인식'),'https://www.bizinfo.go.kr/?token=secret','form.hwpx')

    def test_reject_unsafe_zip_and_unsupported(self):
        with self.assertRaises(ExtractError):
            extract_outline(b'not a form')
        with self.assertRaises(ExtractError):
            extract_outline(hwpx('1. 문제인식')+b'x'*8_000_000)

    def test_bad_unit_count_rejected(self):
        items=[{'text':'아무 내용','locator':'loc'}]*6001
        with self.assertRaises(ExtractError):
            infer_lines(items,'a'*64,'hwpx','test')

class CliTests(unittest.TestCase):
    def test_offline_end_to_end_cli_writes_local_only(self):
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'sample.hwpx';dst=Path(folder)/'candidates.json'
            src.write_bytes(hwpx('1. 문제인식','2. 실현가능성','일반 설명 문장입니다.'))
            status=execute(src,dst,'https://www.bizinfo.go.kr/a','공식 다운로드 양식')
            self.assertEqual(status['candidate_count'],2)
            payload=json.loads(dst.read_text(encoding='utf-8'))
            self.assertEqual(len(payload['candidates']),2)
            self.assertNotIn(str(src),dst.read_text(encoding='utf-8'))
            self.assertEqual(payload['document']['file_label'],'공식 다운로드 양식')
            with self.assertRaisesRegex(ValueError,'output_already_exists'):
                execute(src,dst)

    def test_refuse_public_repository_output(self):
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'a.hwpx';src.write_bytes(hwpx('1. 문제인식'))
            with self.assertRaisesRegex(ValueError,'outside_public_repository'):
                execute(src,ROOT/'data'/'local_private_form.json')
            self.assertFalse((ROOT/'data'/'local_private_form.json').exists())

    def test_url_and_extension_are_checked_without_network(self):
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'input.txt';src.write_text('data',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'unsupported_input'):
                execute(src,Path(folder)/'out.json')
            src=Path(folder)/'input.hwpx';src.write_bytes(hwpx('1. 문제인식'))
            with self.assertRaisesRegex(ValueError,'source_not_allowlisted'):
                execute(src,Path(folder)/'out.json','https://untrusted.example/a')
            self.assertFalse((Path(folder)/'out.json').exists())

    def test_cli_error_no_absolute_file_path(self):
        with tempfile.TemporaryDirectory() as folder:
            bad=Path(folder)/'broken.hwpx';bad.write_bytes(b'bad')
            out=Path(folder)/'candidate.json'
            cmd=[sys.executable,str(ROOT/'scripts/form_outline_cli.py'),
                 '--input',str(bad),'--output',str(out)]
            run=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8',timeout=45)
            self.assertNotEqual(run.returncode,0)
            self.assertFalse(out.exists())
            self.assertNotIn(str(bad),run.stderr)

    def test_missing_file_does_not_disclose_absolute_path(self):
        with tempfile.TemporaryDirectory() as folder:
            missing=Path(folder)/"private-name-with-address.hwpx"
            out=Path(folder)/"unused.json"
            cmd=[sys.executable,str(ROOT/"scripts/form_outline_cli.py"),
                 "--input",str(missing),"--output",str(out)]
            run=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",timeout=45)
            self.assertEqual(run.returncode,2)
            self.assertIn("filesystem_access_failed",run.stderr)
            self.assertNotIn(str(missing),run.stderr)

if __name__=="__main__":unittest.main()
