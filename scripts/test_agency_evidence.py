"""P0.17 offline source binding, transport, retention and publication regressions."""
from copy import deepcopy
from datetime import timedelta
from html import escape
import json
from pathlib import Path
import socket
import unittest
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, parse_qsl
from unittest.mock import patch
import agency_evidence as E
from agency_core import empty_document as empty_listing
from refresh_agencies import collect as list_collect
from test_agencies import transport, NOW
from test_attachments import hwpx
from attachment_core import extract, ExtractError

MSS='https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172'
NIPA='https://www.nipa.kr/home/bsnsAll/0/nttDetail?bbsNo=4&nttNo=16981&tab=2'
TITLE='2027년 AI 창업기업 지원 공고'

def listing():return list_collect(empty_listing(),[],NOW,transport=transport,pause=lambda _:None)
def file_url(source,token='opaque0001',filename='reference01234.hwpx'):
    if 'mss.go.kr' in source:
        number=dict(parse_qsl(urlsplit(source).query))['bcIdx']
        return 'https://www.mss.go.kr/common/board/Download.do?cbIdx=310&bcIdx='+number+'&streFileNm='+filename
    return 'https://www.nipa.kr/comm/getFile?srvcId=BBSTY1&upperNo='+token+'&fileTy=ATTACH&fileNo='+token+'xxx'

def page(source,title=TITLE,token='opaque0001',body='기업 대상 기술 개발 신청요건은 첨부문서에서 확인하십시오.',links=True):
    url=escape(file_url(source,token),quote=True)
    if 'mss.go.kr' in source:
        return ('<html><h4 id="sj">'+escape(title)+'</h4><textarea id="editContents">'+escape('<p>'+body+'</p>')+'</textarea>'
                +(f'<a href="{url}">내려받기</a>' if links else '')+'</html>').encode()
    return ('<table><tr><td class="tbTit">'+escape(title)+'</td></tr><tr><td>내용</td><td>'+body+'</td></tr>'
            +'<tr><td>첨부파일</td><td>'+(f'<a href="{url}">공고문.hwpx (파일크기: 78 KB)</a>' if links else '')+'</td></tr></table>').encode()

class Fake:
    def __init__(self,discovery=None,raw=None,token='opaque0001'):
        self.d=discovery or listing();self.raw=raw or hwpx();self.token=token;self.calls=[];self.fail_notice=False;self.fail_file=False;self.body='기업 대상 기술 개발 신청요건은 첨부문서에서 확인하십시오.'
    def notice(self,source):
        self.calls.append(('notice',source))
        if self.fail_notice:raise URLError('private internal diagnostic must not leak')
        row=next(x for x in self.d['records'].values() if x['source']==source)
        return page(source,row['title'],self.token,self.body),'text/html',source,'utf-8'
    def file(self,url,source):
        self.calls.append(('file',url))
        if self.fail_file:raise HTTPError(url,403,'Access denied',{},None)
        assert E.allowed_file(url,source)
        return self.raw

def collected(**kwargs):
    d=listing();return E.collect(d,E.empty_document(),NOW,client=Fake(d),parser=extract,**kwargs)

class IdentityTests(unittest.TestCase):
    def test_exact_mss_file_route(self):self.assertTrue(E.allowed_file(file_url(MSS),MSS))
    def test_nipa_literal_opaque_file_route(self):self.assertTrue(E.allowed_file(file_url(NIPA),NIPA))
    def test_wrong_notice_file_rejected(self):self.assertFalse(E.allowed_file(file_url(MSS).replace('1072172','1072173'),MSS))
    def test_unknown_query_key_rejected(self):self.assertFalse(E.allowed_file(file_url(NIPA)+'&token=secret',NIPA))
    def test_duplicate_query_key_rejected(self):self.assertFalse(E.allowed_file(file_url(MSS)+'&cbIdx=310',MSS))
    def test_cross_agency_file_rejected(self):self.assertFalse(E.allowed_file(file_url(MSS),NIPA))
    def test_arbitrary_hosts_and_credentials(self):
        for bad in ('https://localhost/file.pdf','https://www.mss.go.kr.evil.kr/file.pdf',file_url(MSS).replace('https://','https://user:pwd@'),file_url(MSS).replace('https:','http:')):
            with self.subTest(url=bad):self.assertFalse(E.allowed_file(bad,MSS))
    def test_directory_traversal_rejected(self):self.assertFalse(E.allowed_file(file_url(MSS,filename='../private.pdf'),MSS))
    def test_other_download_identity_redirect_rejected(self):self.assertFalse(E.same_transport(file_url(NIPA),file_url(NIPA,'different0002'),NIPA,'file'))
    def test_same_notice_redirect_allowed(self):self.assertTrue(E.same_transport(MSS,MSS.replace('www.mss','mss'),MSS,'notice'))
    def test_private_dns_rejected(self):
        c=E.Client(pause=lambda _:None,resolver=lambda *a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))])
        with self.assertRaisesRegex(ValueError,'nonpublic_destination'):c.public_host(MSS)
    def test_public_dns_passes(self):
        c=E.Client(pause=lambda _:None,resolver=lambda *a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443))]);c.public_host(MSS)
    def test_robots_denial_prevents_notice(self):
        c=E.Client(pause=lambda _:None);c.policies['www.mss.go.kr']=b'User-agent: *\nDisallow: /site/'
        with self.assertRaisesRegex(ValueError,'robots_disallowed'):c.notice(MSS)
    def test_file_robots_denial_is_blocked(self):
        c=E.Client(pause=lambda _:None);c.policies['www.nipa.kr']=b'User-agent: *\nDisallow: /comm/'
        with self.assertRaisesRegex(ExtractError,'source_not_linked'):c.file(file_url(NIPA),NIPA)
    def test_redirect_cannot_change_notice_id(self):self.assertFalse(E.same_transport(MSS,MSS.replace('1072172','1072173'),MSS,'notice'))

class ExtraGuards(unittest.TestCase):
    def test_notice_unknown_query_is_blocked(self):
        self.assertFalse(E.allowed_notice(MSS+'&next=anything',MSS))
    def test_notice_extra_query_redirect_blocked(self):
        self.assertFalse(E.same_transport(NIPA,NIPA+'&returnTo=other',NIPA,'notice'))
    def test_missing_robots_is_not_error_page_success(self):
        c=E.Client(pause=lambda _:None)
        c.policies['www.mss.go.kr']=b'<html>sign in</html>'
        with self.assertRaises(ValueError):c.permission(MSS,MSS)
    def test_nipa_parameters_not_in_public_files(self):
        d=collected()
        text=json.dumps(d)
        self.assertNotIn('upperNo=',text);self.assertNotIn('fileNo=',text)

class ParserTests(unittest.TestCase):
    def test_mss_title_and_body_bound(self):
        info,links=E.parse_notice(page(MSS),MSS,TITLE);self.assertEqual(len(info['documents']),1);self.assertEqual(len(links),1)
    def test_nipa_title_and_body_bound(self):
        info,_=E.parse_notice(page(NIPA),NIPA,TITLE);self.assertEqual(info['documents'][0]['public_url'],NIPA)
    def test_nipa_transport_rotation_does_not_change_identity(self):
        a,_=E.parse_notice(page(NIPA,token='tokenone00'),NIPA,TITLE)
        b,_=E.parse_notice(page(NIPA,token='tokentwo00'),NIPA,TITLE)
        self.assertEqual(a,b);self.assertNotIn('upperNo',json.dumps(a))
    def test_page_scripts_do_not_prove_notice_title(self):
        raw=page(MSS,title='다른 공고입니다')+('<script>'+TITLE+'</script>').encode()
        with self.assertRaisesRegex(ValueError,'title_mismatch'):E.parse_notice(raw,MSS,TITLE)
    def test_duplicate_current_title_rejected(self):
        with self.assertRaisesRegex(ValueError,'title_mismatch'):E.parse_notice(page(MSS)+('<h4 id="sj">'+TITLE+'</h4>').encode(),MSS,TITLE)
    def test_missing_body_is_failure(self):
        with self.assertRaisesRegex(ValueError,'body_missing'):E.parse_notice(page(MSS,body=''),MSS,TITLE)
    def test_navigation_count_does_not_change_body_hash(self):
        a,_=E.parse_notice(page(MSS)+b'<footer>views 1</footer>',MSS,TITLE)
        b,_=E.parse_notice(page(MSS)+b'<footer>views 2</footer>',MSS,TITLE)
        self.assertEqual(a,b)
    def test_no_link_is_not_full_verification(self):
        a,_=E.parse_notice(page(NIPA,links=False),NIPA,TITLE);self.assertEqual(a['documents'],[])
    def test_external_file_link_not_followed(self):
        raw=page(NIPA).replace(b'https://www.nipa.kr/comm/getFile',b'https://evil.kr/comm/getFile')
        info,links=E.parse_notice(raw,NIPA,TITLE);self.assertEqual(links,{});self.assertEqual(info['unhandled_links'],1)
    def test_duplicate_nipa_name_fails_closed(self):
        raw=page(NIPA).replace(b'</td></tr></table>',('<a href="'+escape(file_url(NIPA,'second0001'))+'">공고문.hwpx</a></td></tr></table>').encode())
        with self.assertRaisesRegex(ValueError,'ambiguous_attachment_name'):E.parse_notice(raw,NIPA,TITLE)
    def test_malformed_encoding_rejected(self):
        with self.assertRaises(UnicodeDecodeError):E.parse_notice(page(MSS)+b'\xff',MSS,TITLE)
    def test_html_size_bound(self):
        with self.assertRaisesRegex(ValueError,'size_limit'):E.parse_notice(b'X'*2_000_001,MSS,TITLE)

class CollectionTests(unittest.TestCase):
    def test_scoped_run_success_and_no_model(self):
        d=collected();self.assertEqual(d['run']['status'],'ok_scoped');self.assertEqual(d['model_calls'],0);self.assertFalse(d['automatic_approval'])
    def test_round_robin_reads_both_agencies(self):
        d=collected();self.assertEqual({n['agency_id'] for n in d['notices'].values()},{'mss','nipa'})
    def test_existing_listing_not_mutated(self):
        d=listing();before=deepcopy(d);E.collect(d,E.empty_document(),NOW,Fake(d),extract);self.assertEqual(d,before)
    def test_prior_evidence_not_mutated(self):
        d=collected();before=deepcopy(d);E.collect(listing(),d,NOW+timedelta(minutes=5),Fake(),extract);self.assertEqual(d,before)
    def test_failed_notice_preserves_previous_success(self):
        previous=collected();f=Fake();f.fail_notice=True
        d=E.collect(listing(),previous,NOW+timedelta(minutes=5),f,extract)
        shared=set(d['notices'])&set(previous['notices'])
        self.assertTrue(any(d['notices'][k]['last_success_at']==previous['notices'][k]['last_success_at'] for k in shared));self.assertEqual(d['run']['status'],'partial')
        self.assertNotIn('private internal',json.dumps(d))
    def test_failed_download_preserves_prior_extract(self):
        p=collected(notice_limit=1);f=Fake();f.fail_file=True
        d=E.collect(listing(),p,NOW+timedelta(minutes=5),f,extract,notice_limit=1)
        doc=next(iter(d['documents'].values()));self.assertEqual(doc['status'],'download_failed');self.assertTrue(doc['extraction']);self.assertFalse(doc['retryable']);self.assertEqual(doc['http_status'],403)
    def test_file_change_is_sticky_review(self):
        p=collected(notice_limit=1);f=Fake(raw=hwpx('신청자격은 변경되었습니다. 지원규모 2000만원.'))
        d=E.collect(listing(),p,NOW+timedelta(minutes=5),f,extract,notice_limit=1)
        again=E.collect(listing(),d,NOW+timedelta(minutes=10),f,extract,notice_limit=1)
        self.assertTrue(next(iter(again['documents'].values()))['review_required'])
    def test_body_change_is_sticky_review(self):
        p=collected(notice_limit=1);f=Fake();f.body='변경된 본문입니다. 신청 조건을 별도 확인해야 합니다.'
        d=E.collect(listing(),p,NOW+timedelta(minutes=5),f,extract,notice_limit=1)
        self.assertTrue(next(iter(d['notices'].values()))['review_required'])
    def test_transport_change_alone_not_content_change(self):
        f=Fake();p=E.collect(listing(),E.empty_document(),NOW,f,extract);f.token='rotated0009'
        d=E.collect(listing(),p,NOW+timedelta(minutes=5),f,extract)
        self.assertFalse(any(n['review_required'] for n in d['notices'].values()));self.assertNotIn('rotated0009',json.dumps(d))
    def test_file_limit_zero_retains_queue(self):
        d=collected(file_limit=0);self.assertEqual(d['run']['files_attempted'],0);self.assertTrue(all(f['status']=='queued' for f in d['documents'].values()))
    def test_notice_budget_cannot_be_raised(self):
        with self.assertRaises(ValueError):collected(notice_limit=4)
    def test_file_budget_cannot_be_raised(self):
        with self.assertRaises(ValueError):collected(file_limit=5)
    def test_stale_listings_skip_not_no_change(self):
        d=E.collect(listing(),E.empty_document(),NOW+timedelta(days=3),Fake(),extract)
        self.assertEqual(d['run']['notices_attempted'],0);self.assertEqual(d['run']['status'],'partial')
    def test_failed_listing_skips_source(self):
        l=listing();s=l['sources']['mss'];s['status']='failed';s['error_codes']=['failure']
        d=E.collect(l,E.empty_document(),NOW,Fake(l),extract);self.assertIn('mss',d['run']['sources_skipped'])
    def test_unsupported_format_remains_partial(self):
        d=E.collect(listing(),E.empty_document(),NOW,Fake(raw=b'NOT DOCUMENT'),extract)
        self.assertEqual(d['run']['status'],'partial');self.assertGreater(d['run']['blocked'],0)
    def test_candidate_facts_not_approved(self):
        d=collected();facts=[c for f in d['documents'].values() for c in f['extraction']['candidate_facts']]
        self.assertTrue(facts);self.assertTrue(all(c['status']=='candidate_unverified' for c in facts))
    def test_operator_not_promoted(self):
        l=listing();E.collect(l,E.empty_document(),NOW,Fake(l),extract);self.assertEqual(l['records']['MSS-1072172']['kind'],'operator')

class ValidationTests(unittest.TestCase):
    def test_empty_schema_valid(self):E.validate_document(E.empty_document())
    def test_unknown_root_field_rejected(self):
        d=E.empty_document();d['company_profile']={}
        with self.assertRaises(ValueError):E.validate_document(d)
    def test_model_and_approval_cannot_change(self):
        for key,val in [('model_calls',1),('automatic_approval',True)]:
            d=E.empty_document();d[key]=val
            with self.subTest(key=key),self.assertRaises(ValueError):E.validate_document(d)
    def test_ephemeral_nipa_url_rejected(self):
        d=collected();n=next(n for n in d['notices'].values() if n['agency_id']=='nipa');n['documents'][0]['public_url']=file_url(NIPA)
        with self.assertRaises(ValueError):E.validate_document(d)
    def test_unbound_hash_rejected(self):
        d=collected();next(iter(d['documents'].values()))['sha256']='0'*64
        with self.assertRaises(ValueError):E.validate_document(d)
    def test_false_success_rejected(self):
        d=collected();d['run']['failed']=1
        with self.assertRaises(ValueError):E.validate_document(d)
    def test_overreported_run_rejected(self):
        d=collected();d['run']['notices_attempted']=10
        with self.assertRaises(ValueError):E.validate_document(d)
    def test_public_report_disclaims_approval(self):
        text=E.render_report(collected());self.assertIn('신청자격',text);self.assertIn('전체 완료 아님',text)

if __name__=='__main__':unittest.main()
