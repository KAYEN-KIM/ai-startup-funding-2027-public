"""Offline regressions for the P0.16 source adapters and failure-preserving state."""
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, parse_qs
import json
import unittest
from agency_core import *
from refresh_agencies import collect, page_url, allowed_target, robots_permission, render_markdown

NOW=datetime.fromisoformat('2026-10-30T19:00:00+09:00')
LATER=datetime.fromisoformat('2026-10-31T08:00:00+09:00')

def xml(title='2027년 초기창업 신규 주관기관 모집 공고',bid='1072172'):
    return ('<rss><channel><title>중소벤처기업부 사업공고</title><item><title>'+title+'</title>'
            '<link><![CDATA[https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx='+bid+']]></link>'
            '<pubDate>20261030175306</pubDate></item></channel></rss>').encode()

def board(n=16982,title='2027년 AI 지원기업 모집',period='2026-10-30 12:00 ~ 2026-11-30 15:00'):
    return (f'<html><head><title>정보통신산업진흥원 사업공고</title></head><body><table><tr>'
            f'<td>D-31</td><td><a href="./nttDetail?tab=2&amp;bbsNo=4&amp;nttNo={n}">{title}</a>'
            f'<span>신청기간 : {period}</span></td><td>공개 담당자 이름은 저장 금지</td><td>2026-10-30</td>'
            '</tr></table></body></html>').encode()

def transport(url,agency):
    if urlsplit(url).path=='/robots.txt':return b'User-agent: *\nAllow: /','text/plain',url,'utf-8'
    if agency=='mss':return xml(),'text/xml',url,'utf-8'
    page=int(parse_qs(urlsplit(url).query)['curPage'][0])
    return board(16982-page),'text/html',url,'utf-8'

def row(title='2027년 AI 창업 지원사업',end='2026-11-30'):
    return make_row('nipa','https://www.nipa.kr/home/bsnsAll/0/nttDetail?bbsNo=4&nttNo=16982',title,'2026-10-30 ~ '+end)

class ParsingTests(unittest.TestCase):
    def test_mss_official_identity_and_operator(self):
        r=parse_listing('mss',xml(),SOURCES['mss']['url'])[0]
        self.assertEqual(r['kind'],'operator');self.assertEqual(r['years'],[2027])
        self.assertEqual(r['published_date'],'2026-10-30');self.assertIsNone(r['deadline'])
    def test_nipa_identity_clock_and_no_contact(self):
        r=parse_listing('nipa',board(),page_url('nipa',1))[0]
        self.assertEqual(r['opens'],'2026-10-30T12:00:00+09:00')
        self.assertEqual(r['deadline'],'2026-11-30T15:00:00+09:00')
        self.assertNotIn('담당자',compact(r));self.assertEqual(r['kind'],'candidate')
    def test_invalid_and_reversed_clocks_are_unknown(self):
        for period in ('2026-10-30 25:00 ~ 2026-11-30 15:00', '2026-10-30 12:00 ~ 2026-10-30 09:00'):
            with self.subTest(period=period):
                r=parse_listing('nipa',board(period=period),page_url('nipa',1))[0]
                self.assertIsNone(r['deadline']);self.assertEqual(r['deadline_precision'],'unknown')
    def test_date_only_not_invented_clock(self):
        r=parse_listing('nipa',board(period='2026-10-30 ~ 2026-11-30'),page_url('nipa',1))[0]
        self.assertEqual(r['deadline'],'2026-11-30')
    def test_lone_date_does_not_become_deadline(self):
        r=parse_listing('nipa',board(period='2026-10-30 ~ 예산 소진'),page_url('nipa',1))[0]
        self.assertIsNone(r['deadline'])
    def test_multi_years_and_unknown_year_preserved(self):
        self.assertEqual(row('2026년·2027년 AI 지원')['years'],[2026,2027])
        self.assertEqual(row('AI 기업 모집 공고')['years'],[])
    def test_procurement_not_grant(self):
        self.assertEqual(title_kind('2027 AI 포럼 운영 용역 모집'),'procurement')
    def test_contest_and_policy_not_grant(self):
        self.assertEqual(title_kind('모두의 AI 공모전'),'competition')
        self.assertEqual(title_kind('2027 스마트 제조 통합공고'),'policy')
    def test_execution_organization_not_assumed_operator(self):
        self.assertEqual(title_kind('AI 실증 수행기관 모집'),'candidate')
    def test_general_startup_and_adjacent_policy_lanes(self):
        self.assertEqual(relevant('2027 초기창업패키지 모집'),'startup_general')
        self.assertEqual(relevant('2027 스마트 제조혁신 지원사업 통합공고'),'digital_related')
        self.assertIsNone(relevant('2027 전통시장 환경개선 지원'))
    def test_source_canonicalization_matches_category_variants(self):
        a=canonical_notice('https://nipa.kr/home/bsnsAll/00/nttDetail?tab=2&nttNo=16982&bbsNo=4&bsnsDtlsIemNo=849')
        self.assertEqual(a,row()['source'])
    def test_unapproved_notice_urls_rejected(self):
        for url in ['http://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172',
                    'https://www.mss.go.kr.evil.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172',
                    'https://u:p@www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172',
                    'https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172&token=x',
                    'https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172&bcIdx=1',
                    'https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=86&bcIdx=1072172',
                    'https://127.0.0.1/nttDetail?bbsNo=4&nttNo=16982']:
            with self.subTest(url=url):self.assertIsNone(canonical_notice(url))
    def test_login_and_empty_pages_fail_closed(self):
        for raw in [b'<html>Sign in</html>',b'<html><title>Information</title></html>',
                    '<html>정보통신산업진흥원 사업공고 게시물 없음</html>'.encode()]:
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):parse_listing('nipa',raw,page_url('nipa',1))
    def test_changed_table_columns_fail_closed(self):
        with self.assertRaises(ValueError):parse_listing('nipa',board().replace(b'</tr>',b'<td>extra</td></tr>'),page_url('nipa',1))
    def test_truncated_table_rejected(self):
        with self.assertRaises(ValueError):parse_listing('nipa',board().replace(b'</tr>',b''),page_url('nipa',1))
    def test_unexpected_external_link_rejected(self):
        with self.assertRaises(ValueError):parse_listing('nipa',board().replace(b'./nttDetail',b'https://evil.kr/nttDetail'),page_url('nipa',1))
    def test_duplicate_rss_ids_rejected(self):
        data=xml();item=data[data.index(b'<item>'):data.index(b'</item>')+7]
        with self.assertRaises(ValueError):parse_listing('mss',data.replace(b'</channel>',item+b'</channel>'),SOURCES['mss']['url'])
    def test_xml_entities_and_unknown_channel_rejected(self):
        with self.assertRaises(ValueError):parse_listing('mss',b'<!DOCTYPE rss>'+xml(),SOURCES['mss']['url'])
        with self.assertRaises(ValueError):parse_listing('mss',xml().replace('중소벤처기업부'.encode(),b'Other'),SOURCES['mss']['url'])
    def test_scripts_are_not_rows(self):
        r=parse_listing('nipa',board()+b'<script><tr><td>ignore</td></tr></script>',page_url('nipa',1))
        self.assertEqual(len(r),1)

class PolicyTests(unittest.TestCase):
    def test_exact_list_targets_only(self):
        self.assertTrue(allowed_target(page_url('nipa',2),'nipa'))
        self.assertFalse(allowed_target(page_url('nipa',2)+'&token=a','nipa'))
        self.assertFalse(allowed_target('https://www.nipa.kr/login','nipa'))
        self.assertFalse(allowed_target('https://localhost/robots.txt','mss'))
    def test_page_bound(self):
        for p in [0,4,True]:
            with self.assertRaises(ValueError):page_url('nipa',p)
    def test_robots_wildcard_disallow(self):
        allowed,_=robots_permission(b'User-agent: *\nDisallow: /kocca/*/list.do','https://www.kocca.kr/kocca/pims/list.do?x=1')
        self.assertFalse(allowed)
    def test_robots_longest_allow(self):
        allowed,_=robots_permission(b'User-agent: *\nDisallow: /\nAllow: /rss/','https://mss.go.kr/rss/smba/board/310.do')
        self.assertTrue(allowed)
    def test_specific_google_agent_does_not_apply(self):
        self.assertTrue(robots_permission(b'User-agent: Googlebot\nDisallow: /','https://www.nipa.kr/home/2-2')[0])
    def test_specific_bot_rule_overrides_star(self):
        text=b'User-agent: *\nAllow: /\nUser-agent: FundingRadarBot\nDisallow: /rss/'
        self.assertFalse(robots_permission(text,'https://mss.go.kr/rss/smba/board/310.do')[0])
    def test_robots_failure_is_not_no_change(self):
        def fail(url,a):raise URLError('transport unavailable')
        d=collect(empty_document(),[],NOW,fail,lambda _:None)
        self.assertEqual(d['run']['status'],'failed');self.assertEqual(d['sources']['mss']['status'],'failed')
    def test_robots_denial_does_not_fetch_list(self):
        calls=[]
        def denied(url,a):
            calls.append(url);return b'User-agent: *\nDisallow: /','text/plain',url,'utf-8'
        d=collect(empty_document(),[],NOW,denied,lambda _:None)
        self.assertEqual(len(calls),2);self.assertTrue(all('/robots.txt' in u for u in calls))
        self.assertEqual(d['sources']['nipa']['status'],'policy_blocked')
    def test_robots_html_challenge_not_bypassed(self):
        with self.assertRaises(ValueError):robots_permission(b'<html>login</html>','https://www.nipa.kr/')

class StateTests(unittest.TestCase):
    def full(self):return collect(empty_document(),[],NOW,transport,lambda _:None)
    def test_full_bounded_run_never_claims_complete(self):
        d=self.full();validate_document(d)
        self.assertEqual(d['run']['status'],'ok_scoped');self.assertEqual(d['run']['rows_checked'],4)
        self.assertEqual(len(d['records']),4);self.assertTrue(all(s['coverage_complete'] is False for s in d['sources'].values()))
    def test_unchanged_repeat_updates_observation_not_review(self):
        d=collect(self.full(),[],LATER,transport,lambda _:None)
        self.assertTrue(all(s['status']=='ok_no_change' for s in d['sources'].values()))
        self.assertFalse(any(r['review_required'] for r in d['records'].values()))
    def test_later_failure_preserves_data_and_success_time(self):
        old=self.full()
        def fail(url,a):raise TimeoutError()
        d=collect(old,[],LATER,fail,lambda _:None)
        self.assertEqual(d['records'],old['records'])
        self.assertEqual(d['sources']['mss']['last_success_at'],old['sources']['mss']['last_success_at'])
        self.assertNotEqual(d['sources']['mss']['last_attempt_at'],old['sources']['mss']['last_attempt_at'])
    def test_failed_source_does_not_block_other_source(self):
        def partly(url,a):
            if a=='mss':raise URLError('down')
            return transport(url,a)
        d=collect(empty_document(),[],NOW,partly,lambda _:None)
        self.assertEqual(d['run']['status'],'partial');self.assertEqual(d['run']['sources_ok'],1)
        self.assertEqual(len(d['records']),3)
    def test_repeated_pages_are_partial_not_exhaustive(self):
        def repeated(url,a):
            if a=='nipa' and '/robots' not in url:return board(),'text/html',url,'utf-8'
            return transport(url,a)
        d=collect(empty_document(),[],NOW,repeated,lambda _:None)
        self.assertEqual(d['sources']['nipa']['status'],'partial')
        self.assertIsNone(d['sources']['nipa']['last_success_at'])
    def test_changed_value_preserves_old_snapshot_and_sticky_review(self):
        d,_,_=merge_rows(empty_document(),[row()],NOW.isoformat(),[])
        updated,_,n=merge_rows(d,[row(end='2026-12-01')],LATER.isoformat(),[])
        self.assertEqual(n,1);self.assertTrue(updated['records']['NIPA-16982']['review_required'])
        self.assertEqual(updated['records']['NIPA-16982']['history'][0]['snapshot']['deadline'],'2026-11-30')
        third,_,n=merge_rows(updated,[row(end='2026-12-01')],LATER.isoformat(),[])
        self.assertEqual(n,0);self.assertTrue(third['records']['NIPA-16982']['review_required'])
    def test_missing_from_limited_window_is_not_deleted(self):
        old=self.full();d,_,_=merge_rows(old,[],LATER.isoformat(),[])
        self.assertEqual(d,old)
    def test_exact_url_matches_without_program_mutation(self):
        r=row();p={'id':'NIPA-OLD','title':r['title'],'source':r['source'],'deadline':'2026-11-29'};before=deepcopy(p)
        d,_,_=merge_rows(empty_document(),[r],NOW.isoformat(),[p])
        match=d['records'][r['id']]
        self.assertEqual(match['matched_program_ids'],['NIPA-OLD']);self.assertEqual(match['differences'][0]['field'],'deadline');self.assertEqual(p,before)
    def test_title_match_is_only_possible_duplicate(self):
        r=row();p={'id':'BIZINFO-123','title':r['title'],'source':'https://www.bizinfo.go.kr/notice'}
        d,_,_=merge_rows(empty_document(),[r],NOW.isoformat(),[p])
        self.assertEqual(d['records'][r['id']]['possible_duplicate_ids'],['BIZINFO-123']);self.assertEqual(d['records'][r['id']]['matched_program_ids'],[])
    def test_date_only_does_not_overwrite_verified_time(self):
        r=row();p={'id':'NIPA-OLD','title':r['title'],'source':r['source'],'deadline':'2026-11-30T15:00:00+09:00'}
        self.assertEqual(crosscheck(r,[p])[2],[])
    def test_history_is_bounded(self):
        d=empty_document()
        for i in range(1,9):d,_,_=merge_rows(d,[row(end=f'2026-12-{i:02d}')],NOW.isoformat(),[])
        self.assertEqual(len(d['records']['NIPA-16982']['history']),5)
    def test_input_documents_not_mutated(self):
        old=self.full();snapshot=deepcopy(old);collect(old,[],LATER,transport,lambda _:None)
        self.assertEqual(old,snapshot)
    def test_private_fields_and_tampered_title_rejected(self):
        d=self.full();d['records']['MSS-1072172']['company_profile']={}
        with self.assertRaises(ValueError):validate_document(d)
        d=self.full();d['records']['MSS-1072172']['title']='forged title'
        with self.assertRaises(ValueError):validate_document(d)
    def test_nested_unknown_values_fail_closed(self):
        for field,value in [('years',{'private':'forbidden'}),('application_period_raw',{'memo':'forbidden'}),('deadline','2026-02-30')]:
            d=self.full();r=d['records']['MSS-1072172'];r[field]=value;r['fingerprint']=digest({k:r[k] for k in ROW_FIELDS})
            with self.subTest(field=field):
                with self.assertRaises(ValueError):validate_document(d)
    def test_falsely_fresh_success_rejected(self):
        d=self.full();d['sources']['mss']['last_success_at']='2026-10-01T00:00:00+09:00'
        with self.assertRaises(ValueError):validate_document(d)
    def test_automatic_approval_rejected(self):
        d=self.full();d['automatic_approval']=True
        with self.assertRaises(ValueError):validate_document(d)
    def test_summary_escapes_untrusted_markdown(self):
        d=self.full();r=d['records']['NIPA-16981'];r['title']='AI <script>bad</script> [x](https://evil.kr)';r['fingerprint']=digest({k:r[k] for k in ROW_FIELDS})
        text=render_markdown(d)
        self.assertNotIn('<script>',text);self.assertNotIn('[x](',text)
    def test_no_credentials_models_or_user_files_in_collectors(self):
        source=Path(__file__).with_name('refresh_agencies.py').read_text(encoding='utf-8')
        for forbidden in ['os.environ','subprocess','openai','anthropic','api_key','BIZINFO_API_KEY','application_documents']:
            with self.subTest(forbidden=forbidden):self.assertNotIn(forbidden,source)

if __name__=='__main__':unittest.main()
