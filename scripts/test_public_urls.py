"""Stable public file identity and in-memory currently published download links."""
import copy, datetime, html, json, unittest
from unittest.mock import patch
from public_urls import stable_attachment_url as stable, scrub_transport_urls as scrub
from radar_core import official_url, record_from_fields, merge
from attachment_core import approved_url, validate_public, ExtractError, extract
from refresh_attachments import doc_id, update_manifest, linked_download, update_document, require_public_destination
from refresh_v2 import inspect_page
from test_attachments import state, record, item, hwpx, AT, URL, SOURCE
SIGNED=URL+'&downloadToken=PUBLIC_LINK_SIGNATURE'
class PublicUrlTests(unittest.TestCase):
    def test_canonical_stable_id(self):self.assertEqual(stable(SIGNED),URL)
    def test_token_rotation_same_identity(self):self.assertEqual(stable(SIGNED),stable(URL+'&downloadToken=ROTATED'))
    def test_signed_public_url_not_publishable(self):self.assertFalse(approved_url(SIGNED));self.assertFalse(official_url(SIGNED))
    def test_unsigned_url_remains_approved(self):self.assertTrue(approved_url(URL));self.assertTrue(official_url(URL))
    def test_wrong_host_not_sanitized_into_trust(self):
        u=SIGNED.replace('www.bizinfo.go.kr','bizinfo.go.kr.evil.test');self.assertEqual(stable(u),u);self.assertFalse(approved_url(stable(u)))
    def test_other_official_paths_not_sanctioned(self):
        u=SIGNED.replace('/cmm/fms/fileDown.do','/admin/private');self.assertEqual(stable(u),u);self.assertFalse(approved_url(stable(u)))
    def test_userinfo_not_accepted(self):self.assertFalse(approved_url(stable(SIGNED.replace('https://','https://user:pass@'))))
    def test_other_secrets_still_rejected(self):self.assertFalse(approved_url(stable(SIGNED+'&api_key=DO_NOT_COPY')))
    def test_missing_file_id_not_sanitized(self):self.assertEqual(stable('https://www.bizinfo.go.kr/cmm/fms/fileDown.do?downloadToken=x'),'https://www.bizinfo.go.kr/cmm/fms/fileDown.do?downloadToken=x')
    def test_case_insensitive_parameter(self):self.assertEqual(stable(URL+'&DOWNLOADTOKEN=VALUE'),URL)
    def test_file_sn_preserved(self):self.assertIn('fileSn=1',stable(SIGNED.replace('fileSn=0','fileSn=1')))
    def test_different_files_not_collapsed(self):self.assertNotEqual(stable(SIGNED),stable(SIGNED.replace('FILE_000000001','FILE_000000002')))
    def test_non_string_values_preserved(self):self.assertIsNone(stable(None));self.assertEqual(stable(2),2)
    def test_recursive_copy_not_mutation(self):
        v={'attachments':[{'url':SIGNED}],'state':'candidate_unverified'};old=copy.deepcopy(v);n=scrub(v);self.assertEqual(v,old);self.assertEqual(n['attachments'][0]['url'],URL);self.assertEqual(n['state'],'candidate_unverified')
    def test_public_api_metadata_has_no_signature(self):
        f={'title':'2027 AI 창업 모집','seq':'PBLN_000000000127501','flpthNm':SIGNED,'fileNm':'공고'}
        r=record_from_fields(f,datetime.date(2026,10,30));self.assertEqual(r['attachments'][0]['url'],URL);self.assertNotIn('PUBLIC_LINK_SIGNATURE',json.dumps(r))
    def test_doc_id_does_not_change_with_signature(self):self.assertEqual(doc_id('P',SIGNED),doc_id('P',URL+'&downloadToken=NEXT'))
    def test_manifest_has_no_false_change_on_signature_rotation(self):
        s=state();update_manifest(s,item(),[{'url':SIGNED}],AT);n=len(s['records']);changed=update_manifest(s,item(),[{'url':URL+'&downloadToken=NEXT'}],'later');self.assertFalse(changed);self.assertEqual(len(s['records']),n);self.assertNotIn('downloadToken',json.dumps(s))
    def test_existing_legacy_id_is_retained(self):
        s=state();r=record();r['id']='legacy-existing-id';s['records'][r['id']]=r;s['programs']['P']={'document_ids':[r['id']]};update_manifest(s,item(),[{'url':SIGNED}],AT);self.assertEqual(s['programs']['P']['document_ids'],['legacy-existing-id']);self.assertEqual(len(s['records']),1)
    def test_html_evidence_defaults_to_stable(self):
        raw=('<html><title>AI 창업</title><p>'+('AI 창업 실제 공고 확인 '*30)+'</p><a href="'+html.escape(SIGNED)+'">공고문 다운로드</a></html>').encode()
        public=inspect_page(raw,SOURCE,'AI 창업');transport=inspect_page(raw,SOURCE,'AI 창업',transport_links=True)
        self.assertEqual(public['attachments'][0]['url'],URL);self.assertEqual(transport['attachments'][0]['url'],SIGNED)
    def test_fetch_uses_only_matching_public_link_in_memory(self):
        calls=[];raw=linked_download(item(),URL,[{'url':SIGNED}],fetcher=lambda u:calls.append(u) or b'body');self.assertEqual(raw,b'body');self.assertEqual(calls,[SIGNED])
    def test_no_match_never_guesses_a_signature(self):
        calls=[]
        with self.assertRaises(ExtractError):linked_download(item(),URL,[{'url':SIGNED.replace('fileSn=0','fileSn=2')}],fetcher=lambda u:calls.append(u))
        self.assertEqual(calls,[])
    def test_signed_fetch_does_not_persist_transport_url(self):
        calls=[];r=record();out=update_document(r,AT,lambda u:linked_download(item(),u,[{'url':SIGNED}],fetcher=lambda q:calls.append(q) or hwpx()),extract)
        self.assertEqual(out['status'],'text_extracted');self.assertEqual(calls,[SIGNED]);self.assertNotIn('PUBLIC_LINK_SIGNATURE',json.dumps(out))
    def test_private_destination_still_blocked(self):
        with patch('socket.getaddrinfo',return_value=[(0,0,0,'',('127.0.0.1',443))]):
            with self.assertRaises(ExtractError):require_public_destination(SIGNED)
    def test_schema_rejects_signed_published_record(self):
        s=state();r=record();r['url']=SIGNED;s['records'][r['id']]=r
        with self.assertRaises(ValueError):validate_public(s)

if __name__=='__main__':unittest.main()
