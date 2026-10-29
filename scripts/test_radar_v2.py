"""Offline regression suite; no network, secrets, or changes to production data."""
import copy
import datetime as dt
import json
import unittest
from unittest.mock import patch
from radar_core import official_url, parse_period, record_from_fields, collect_pages, fields_from_xml, merge, relevance, AUTO_LEVEL
from refresh_v2 import inspect_page, update_evidence

TODAY=dt.date(2026,10,29)
AT="2026-10-29T09:00:00+09:00"
URL="https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000127500"

def field(i=500, title="2027년 AI 기술 창업 지원사업", total=1):
    return {"seq": "PBLN_000000000127"+str(i), "title":title, "reqstDt":"20261020 ~ 20261120", "totCnt":str(total), "link":URL, "trgetNm":"중소기업"}

def xml(rows, total=None):
    from xml.sax.saxutils import escape
    items="".join("<item>"+"".join("<"+k+">"+escape(str(v))+"</"+k+">" for k,v in f.items())+"</item>" for f in rows)
    count="<totCnt>"+str(total)+"</totCnt>" if total is not None else ""
    return ("<rss><channel>"+count+items+"</channel></rss>").encode()

class URLs(unittest.TestCase):
    def test_official(self): self.assertTrue(official_url(URL))
    def test_lookalike(self): self.assertFalse(official_url("https://bizinfo.go.kr.evil.example/a"))
    def test_nonofficial_kr(self): self.assertFalse(official_url("https://notgovernment.kr/a"))
    def test_userinfo(self): self.assertFalse(official_url("https://password@www.bizinfo.go.kr/a"))
    def test_secret_url(self): self.assertFalse(official_url(URL+"&crtfcKey=SECRET"))
    def test_local(self): self.assertFalse(official_url("https://127.0.0.1/private"))
    def test_port(self): self.assertFalse(official_url("https://www.bizinfo.go.kr:9999/a"))

class Discovery(unittest.TestCase):
    def test_formats(self):
        for s in ("20261020 ~ 20261120","2026.10.20 ~ 2026.11.20","2026년 10월 20일 ~ 2026년 11월 20일"):
            self.assertEqual(parse_period(s),("2026-10-20","2026-11-20","date"))
    def test_time(self): self.assertEqual(parse_period("2026-10-20 ~ 2026-11-20 15:00")[1],"2026-11-20T15:00:00+09:00")
    def test_lone_date_unknown(self): self.assertEqual(parse_period("2026-11-20 마감"),(None,None,"unknown"))
    def test_invalid_date(self): self.assertEqual(parse_period("2026-02-30 ~ 2026-03-01"),(None,None,"unknown"))
    def test_general_startup_not_dropped(self): self.assertEqual(relevance("2027년 초기창업패키지 모집"),"startup_general")
    def test_generic_rd_not_ai(self): self.assertIsNone(relevance("2027년 철도 R&D 모집"))
    def test_operator_not_beneficiary(self): self.assertEqual(record_from_fields(field(title="2027 AI 주관기관 선정 공고"),TODAY)["mode"],"operator")
    def test_multiyear(self): self.assertEqual(record_from_fields(field(title="2026년ㆍ2027년 Physical AI 실증"),TODAY)["years"],[2026,2027])
    def test_attachments_not_verified(self):
        f=field();f.update(flpthNm="https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=FILE_TEST",fileNm="공고.pdf")
        r=record_from_fields(f,TODAY);self.assertEqual(r["attachments"][0]["status"],"link_only_not_read");self.assertEqual(r["mode"],"discovery")
    def test_year_not_in_title_marked(self): self.assertEqual(record_from_fields(field(title="AI 기술 지원"),TODAY)["year_basis"],"collection_year_inferred")
    def test_complete_pagination(self):
        pages={1:xml([field(500,total=3),field(501,total=3)]),2:xml([field(502,total=3)])}
        _,scan=collect_pages(lambda n,size:pages[n],TODAY,2,4)
        self.assertTrue(scan["coverage_complete"]);self.assertEqual(scan["checked_count"],3)
    def test_repeated_page_is_partial(self):
        _,scan=collect_pages(lambda n,size:xml([field(total=3)]),TODAY,1,4)
        self.assertFalse(scan["coverage_complete"]);self.assertIn("repeated_or_invalid_page",scan["errors"])
    def test_failure_not_no_change(self):
        def fail(n,size): raise TimeoutError("secret URL must not be logged")
        _,scan=collect_pages(fail,TODAY)
        self.assertEqual(scan["errors"],["TimeoutError"]);self.assertFalse(scan["coverage_complete"])
    def test_zero_confirmed_total(self):
        records,scan=collect_pages(lambda n,size:xml([],0),TODAY)
        self.assertEqual(records,[]);self.assertTrue(scan["coverage_complete"])
    def test_empty_unknown_not_success(self):
        _,scan=collect_pages(lambda n,size:xml([]),TODAY)
        self.assertFalse(scan["coverage_complete"])
    def test_entity_rejected(self):
        with self.assertRaises(ValueError): fields_from_xml(b'<!DOCTYPE rss [<!ENTITY a "evil">]><rss/>')

class PreserveAndReview(unittest.TestCase):
    def setup_data(self):
        old=record_from_fields(field(),TODAY);old["mode"]="beneficiary";old["source_level"]="official_notice_summary_verified";old["deadline"]="2026-11-20T15:00:00+09:00"
        return {"schema":"public-funding-radar/v1","items":[old]}, {"schema":"public-funding-reviews/v1","items":[]}
    def test_manual_date_not_overwritten(self):
        known,reviews=self.setup_data();r=record_from_fields(field(),TODAY);r["deadline"]="2026-11-21"
        new,rv,c=merge(known,[r],reviews,AT)
        self.assertEqual(new["items"][0]["deadline"],known["items"][0]["deadline"]);self.assertTrue(c["suggested"]);self.assertTrue(rv["items"])
    def test_time_not_erased(self):
        known,reviews=self.setup_data();_,rv,_=merge(known,[record_from_fields(field(),TODAY)],reviews,AT)
        self.assertFalse(any(x["field"]=="deadline" for x in rv["items"]))
    def test_missing_date_preserves(self):
        known,reviews=self.setup_data();known["items"][0].update(mode="discovery",source_level=AUTO_LEVEL)
        r=record_from_fields(field(),TODAY);r["deadline"]=None
        new,_,_=merge(known,[r],reviews,AT)
        self.assertEqual(new["items"][0]["deadline"],known["items"][0]["deadline"])
    def test_no_mutation_input(self):
        known,reviews=self.setup_data();before=copy.deepcopy(known);r=record_from_fields(field(),TODAY);r["deadline"]="2026-12-01";merge(known,[r],reviews,AT)
        self.assertEqual(known,before);self.assertEqual(reviews["items"],[])
    def test_review_idempotent(self):
        known,reviews=self.setup_data();r=record_from_fields(field(),TODAY);r["deadline"]="2026-12-01"
        _,rv,_=merge(known,[r],reviews,AT);_,rv2,c=merge(known,[r],rv,AT)
        self.assertEqual(rv,rv2);self.assertEqual(c["suggested"],0)
    def test_no_deletion_outside_window(self):
        known,reviews=self.setup_data();new,_,_=merge(known,[],reviews,AT);self.assertEqual(new,known)

class Evidence(unittest.TestCase):
    def html(self,extra=""):
        return ('<html><head><title>공식 AI 기술 창업 사업</title></head><body><main>2027년 AI 기술 창업 지원사업 '+('사업 내용 시험 자료입니다. '*20)+extra+'</main></body></html>').encode()
    def test_not_promoted(self): self.assertEqual(inspect_page(self.html(),URL,"2027년 AI 기술 창업 지원사업")["level"],"html_retrieved_not_eligibility_verified")
    def test_login_error_rejected(self):
        with self.assertRaises(ValueError): inspect_page(b'<html><body>Please log in</body></html>',URL,"2027년 AI 기술 창업 지원사업")
    @patch("refresh_v2.time.sleep")
    def test_failure_preserves_success(self,_sleep):
        p=record_from_fields(field(),TODAY);e={"records":{p["id"]:{"last_success_at":"2026-10-28T08:00:00+09:00","body_sha256":"abc"}}}
        def fail(url):raise TimeoutError()
        got=update_evidence({"items":[p]},e,AT,fail,1)
        self.assertEqual(got["records"][p["id"]]["body_sha256"],"abc");self.assertEqual(got["records"][p["id"]]["status"],"fetch_failed")
    @patch("refresh_v2.time.sleep")
    def test_hash_change_stays_pending(self,_sleep):
        p=record_from_fields(field(),TODAY);e={"records":{p["id"]:{"body_sha256":"old"}}}
        def ok(url):return self.html(),"text/html",URL,"utf-8"
        e=update_evidence({"items":[p]},e,AT,ok,1);self.assertTrue(e["records"][p["id"]]["review_required"])
        e=update_evidence({"items":[p]},e,AT,ok,1);self.assertTrue(e["records"][p["id"]]["review_required"])

if __name__=="__main__":unittest.main(verbosity=2)
