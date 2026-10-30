"""P0.17: evidence for separate agency candidates. No promotion or model calls.
NIPA's per-request opaque download arguments never enter persistent data.
"""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import re
import socket
import time
from urllib.parse import urlsplit, parse_qsl, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from agency_core import (SOURCES, KST, MAX_RECORDS, canonical_notice, notice_id,
                         normalized_title, clean, digest, stamp, validate_document as validate_listing)
from refresh_agencies import robots_permission, error_code, atomic, UA
from refresh_v2 import PageText
from attachment_core import (MAX_FILE, ERRORS, ExtractError, validate_public,
                             normalized, sha, mask_contacts)
from refresh_attachments import update_document, isolated_parse

SCHEMA = 'public-funding-agency-evidence/v1'
VERSION = '0.17.0'
DATA = 'data/agency_evidence.json'
REPORT = 'data/agency_evidence_report.md'
SCOPE = ('기관 직접 목록의 원문 최대 3건·첨부 최대 4건 순환 확인. 본문 추출은 조건 후보이며 '
         '신청자격·금액·중복지원·문서 완전성 검증이 아닙니다. 기존 공고와 검토 규칙은 수정하지 않습니다.')
NOTICE_FIELDS = {'id','agency_id','source','title','listing_fingerprint','listing_seen_at',
    'last_attempt_at','last_success_at','status','last_error','review_required','body_sha256',
    'manifest_sha256','documents','history','unhandled_links'}
REF_FIELDS = {'id','name','public_url','locator'}
RUN_FIELDS = {'at','status','notices_attempted','notices_success','notices_failed',
    'files_attempted','text_extracted','partial_or_no_text','blocked','failed',
    'changed','sources_skipped','eligible_candidates'}
POLICY = {'protected_document','unsupported_format','size_limit','unsafe_archive','unsafe_xml',
          'source_not_linked'}
TOP_FIELDS = {'schema','version','generated_at','model_calls','automatic_approval','scope',
              'notices','documents','run'}


def empty_document():
    return {'schema':SCHEMA,'version':VERSION,'generated_at':None,'model_calls':0,
            'automatic_approval':False,'scope':SCOPE,'notices':{},'documents':{},
            'run':dict(at=None,status='not_run',notices_attempted=0,notices_success=0,
                       notices_failed=0,files_attempted=0,text_extracted=0,partial_or_no_text=0,
                       blocked=0,failed=0,changed=0,sources_skipped=[],eligible_candidates=0)}


def parts(value):
    if not isinstance(value,str) or len(value)>2500 or any(ord(c)<32 for c in value):
        raise ValueError('unsafe_url')
    u=urlsplit(value)
    if u.scheme!='https' or u.username or u.password or u.port not in (None,443) or u.fragment:
        raise ValueError('unsafe_url')
    pairs=parse_qsl(u.query,keep_blank_values=True)
    if len(pairs)!=len({k for k,v in pairs}):raise ValueError('duplicate_query')
    return u,dict(pairs)


def allowed_file(url,source):
    """Exact observed download routes only. Opaque NIPA parameters are transport-only."""
    try:
        expected=canonical_notice(source)
        if expected!=source:return False
        s,q=parts(source);u,f=parts(url)
        agency='mss' if s.hostname in SOURCES['mss']['hosts'] else 'nipa'
        if u.hostname not in SOURCES[agency]['hosts']:return False
        if agency=='mss':
            return (u.path=='/common/board/Download.do' and set(f)=={'bcIdx','cbIdx','streFileNm'}
                    and f['bcIdx']==q['bcIdx'] and f['cbIdx']=='310'
                    and bool(re.fullmatch(r'[A-Za-z0-9_-]{8,120}\.(?:pdf|hwp|hwpx)',f['streFileNm'],re.I)))
        return (u.path=='/comm/getFile' and set(f)=={'srvcId','upperNo','fileTy','fileNo'}
                and f['srvcId']=='BBSTY1' and f['fileTy']=='ATTACH'
                and all(re.fullmatch(r'[A-Za-z0-9*^+/=_ .-]{8,180}',f[k]) for k in ('upperNo','fileNo')))
    except (ValueError,KeyError,TypeError):return False


def allowed_notice(url,source):
    try:
        return canonical_notice(source)==source and canonical_notice(url)==source and parts(url)[1]==parts(source)[1]
    except ValueError:return False


def same_transport(a,b,source,kind):
    try:
        ua,qa=parts(a);ub,qb=parts(b)
        if kind=='notice':return allowed_notice(a,source) and allowed_notice(b,source)
        if kind=='robots':return ua.hostname==ub.hostname and ua.path==ub.path=='/robots.txt' and not qa and not qb
        return allowed_file(a,source) and allowed_file(b,source) and ua.path==ub.path and qa==qb
    except ValueError:return False


class BoundRedirect(HTTPRedirectHandler):
    def __init__(self,client,source,kind,original):
        super().__init__();self.client=client;self.source=source;self.kind=kind;self.original=original
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not same_transport(self.original,newurl,self.source,self.kind):raise ValueError('redirect_blocked')
        self.client.public_host(newurl)
        if self.kind!='robots':self.client.permission(newurl,self.source)
        return super().redirect_request(req,fp,code,msg,headers,newurl)


class Client:
    """No cookies, authentication, arbitrary destinations, or access-control retries."""
    def __init__(self,pause=time.sleep,resolver=socket.getaddrinfo):
        self.policies={};self.pause=pause;self.resolver=resolver
    def public_host(self,url):
        host=urlsplit(url).hostname
        addresses=self.resolver(host,443,type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(r[4][0]).is_global for r in addresses):
            raise ValueError('nonpublic_destination')
    def raw(self,url,source,kind):
        u,q=parts(url);s=urlsplit(source)
        agency='mss' if s.hostname in SOURCES['mss']['hosts'] else 'nipa'
        valid=(kind=='robots' and u.hostname in SOURCES[agency]['hosts'] and u.path=='/robots.txt' and not q)
        valid=valid or (kind=='notice' and allowed_notice(url,source))
        valid=valid or (kind=='file' and allowed_file(url,source))
        if not valid:raise ValueError('unapproved_target')
        self.public_host(url)
        maximum=64000 if kind=='robots' else 2_000_000 if kind=='notice' else MAX_FILE
        req=Request(url,headers={'User-Agent':UA,'Accept':'*/*','Accept-Encoding':'identity'})
        guard=BoundRedirect(self,source,kind,url)
        with build_opener(guard).open(req,timeout=18) as response:
            if response.status!=200 or not same_transport(url,response.url,source,kind):raise ValueError('unexpected_response')
            try:size=int(response.headers.get('Content-Length') or '0')
            except ValueError:size=0
            if size>maximum:raise ExtractError('size_limit')
            raw=response.read(maximum+1)
            if len(raw)>maximum:raise ExtractError('size_limit')
            typ=response.headers.get_content_type();charset=response.headers.get_content_charset() or 'utf-8'
            if kind=='notice' and (typ not in ('text/html','application/xhtml+xml') or charset.lower() not in ('utf-8','utf8','euc-kr','cp949')):
                raise ValueError('unexpected_content_type')
            if kind=='robots' and typ not in ('text/plain','text/html'):raise ValueError('robots_content_type')
            return raw,typ,response.url,charset
    def permission(self,url,source):
        host=urlsplit(url).hostname
        if host not in self.policies:
            try:self.policies[host]=self.raw('https://'+host+'/robots.txt',source,'robots')[0]
            except HTTPError as exc:
                if exc.code!=404:raise
                exc.close();self.policies[host]=b''
        allowed,wait=robots_permission(self.policies[host],url)
        if not allowed:raise ValueError('robots_disallowed')
        self.pause(wait)
    def notice(self,source):
        self.permission(source,source)
        return self.raw(source,source,'notice')
    def file(self,url,source):
        if not allowed_file(url,source):raise ExtractError('source_not_linked')
        try:self.permission(url,source)
        except ValueError as exc:raise ExtractError('source_not_linked') from exc
        return self.raw(url,source,'file')[0]


class Sections(HTMLParser):
    """Only the current notice title, content cell and attachment anchors.
    This extracts bounded text, not rendered tables or application conditions.
    """
    def __init__(self,agency):
        super().__init__(convert_charrefs=True)
        self.agency=agency;self.title=[];self.titles=[];self.title_tag=None
        self.body=[];self.textarea=False;self.cells=[];self.previous_cell='';self.links=[]
        self.anchor=None;self.hidden=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style','noscript','template'):self.hidden+=1
        if self.hidden:return
        is_title=(self.agency=='mss' and tag=='h4' and a.get('id')=='sj') or (self.agency=='nipa' and tag=='td' and 'tbTit' in a.get('class','').split())
        if is_title:self.title=[];self.title_tag=tag
        if self.agency=='mss' and tag=='textarea' and a.get('id')=='editContents':self.textarea=True
        if self.agency=='nipa' and tag=='td':
            self.cells.append({'text':[],'body':not self.cells and self.previous_cell=='내용',
                               'files':not self.cells and self.previous_cell=='첨부파일'})
        in_files=self.agency=='mss' or any(c['files'] for c in self.cells)
        if tag=='a' and in_files:self.anchor=[a.get('href',''),[]]
    def handle_data(self,data):
        if self.hidden:return
        if self.title_tag:self.title.append(data)
        if self.textarea:self.body.append(data)
        for c in self.cells:c['text'].append(data)
        if self.anchor is not None:self.anchor[1].append(data)
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript','template'):self.hidden=max(0,self.hidden-1);return
        if self.hidden:return
        if tag==self.title_tag:self.titles.append(clean(''.join(self.title)));self.title_tag=None
        if tag=='textarea':self.textarea=False
        if tag=='a' and self.anchor is not None:
            self.links.append((self.anchor[0],clean(''.join(self.anchor[1]),600)));self.anchor=None
        if tag=='td' and self.cells:
            c=self.cells.pop()
            if c['body']:self.body.append(' '.join(c['text']))
            if not self.cells:self.previous_cell=clean(' '.join(c['text']))


def parse_notice(raw,source,expected_title,charset='utf-8'):
    if len(raw)>2_000_000:raise ValueError('page_size_limit')
    if source!=canonical_notice(source):raise ValueError('notice_identity')
    agency='mss' if urlsplit(source).hostname in SOURCES['mss']['hosts'] else 'nipa'
    p=Sections(agency);p.feed(raw.decode(charset,errors='strict'));p.close()
    if len(p.titles)!=1 or normalized_title(p.titles[0])!=normalized_title(expected_title):
        raise ValueError('notice_title_mismatch')
    # MSS contains entity-escaped rich text in a hidden textarea. No scripts are executed.
    text=' '.join(p.body)
    if agency=='mss':
        plain=PageText();plain.feed(unescape(text));text=' '.join(plain.text)
    text=normalized(text)
    if len(text)<10:raise ValueError('notice_body_missing')
    if len(text)>600000:raise ValueError('page_body_limit')
    public=[];transport={};seen=set();unhandled=0
    for href,label in p.links:
        target=urljoin(source,href)
        if not allowed_file(target,source):
            if re.search(r'getFile|Download\.do|\.(?:pdf|hwpx?)(?:\W|$)',href,re.I):unhandled+=1
            continue
        if target in seen:continue
        seen.add(target)
        if agency=='mss':
            name=dict(parse_qsl(urlsplit(target).query))['streFileNm']
            identity=target.replace('https://mss.go.kr/','https://www.mss.go.kr/')
            public_url=identity
        else:
            name=clean(re.sub(r'\s*\(파일크기:.*$', '',label),160)
            if not re.search(r'\.(?:pdf|hwp|hwpx)$',name,re.I):unhandled+=1;continue
            identity=name;public_url=source
        name=mask_contacts(name)[0]
        key=sha((source+'\n'+identity).encode('utf-8'))[:24]
        if key in transport:raise ValueError('ambiguous_attachment_name')
        transport[key]=target
        public.append({'id':key,'name':name,'public_url':public_url,
                       'locator':'공고 첨부파일 목록 / '+name})
    if len(public)>10:raise ValueError('attachment_link_limit')
    public.sort(key=lambda x:x['id'])
    return {'body_sha256':sha(text.encode()),'documents':public,
            'manifest_sha256':digest(public),'unhandled_links':unhandled},transport


def choose(discovery,previous,now,limit):
    if type(limit) is not int or not 0<=limit<=3:raise ValueError('notice_budget')
    eligible=[];skipped=[]
    for agency in SOURCES:
        source=discovery['sources'].get(agency,{})
        ts=stamp(source.get('last_success_at'))
        age=(now-ts).total_seconds() if ts else None
        if source.get('status') not in ('ok_changed','ok_no_change') or age is None or not -300<=age<=30*3600:
            skipped.append(agency);continue
        rows=[r for r in discovery['records'].values() if r['agency_id']==agency and r['last_seen_at']==source['last_attempt_at']]
        def order(r):
            prev=previous['notices'].get(r['id'],{})
            return (prev.get('last_attempt_at') or '',r['kind']!='candidate',
                    bool(r['deadline'] and r['deadline'][:10]<now.date().isoformat()),
                    -(int((r['published_date'] or '2000-01-01').replace('-',''))),r['id'])
        rows.sort(key=order);eligible.append(rows)
    picked=[]
    while len(picked)<limit and any(eligible):
        for lane in eligible:
            if lane and len(picked)<limit:picked.append(lane.pop(0))
    return picked,skipped,len(picked)+sum(len(lane) for lane in eligible)


def collect(discovery,previous,now,client=None,parser=isolated_parse,notice_limit=3,file_limit=4):
    validate_listing(discovery);validate_document(previous)
    if now.tzinfo is None:raise ValueError('aware_time_required')
    if type(file_limit) is not int or not 0<=file_limit<=4:raise ValueError('file_budget')
    client=client or Client();at=now.astimezone(KST).isoformat(timespec='seconds')
    result=deepcopy(previous);picked,skipped,total=choose(discovery,previous,now,notice_limit)
    run=dict(at=at,status='idle',notices_attempted=len(picked),notices_success=0,notices_failed=0,
             files_attempted=0,text_extracted=0,partial_or_no_text=0,blocked=0,failed=0,changed=0,
             sources_skipped=skipped,eligible_candidates=total)
    current={};queue=[]
    for row in picked:
        key=row['id'];old=result['notices'].get(key)
        r=deepcopy(old) if old else dict(id=key,agency_id=row['agency_id'],source=row['source'],title=row['title'],
            listing_fingerprint=None,listing_seen_at=None,last_attempt_at=None,last_success_at=None,status='not_run',
            last_error=None,review_required=False,body_sha256=None,manifest_sha256=None,documents=[],history=[],unhandled_links=0)
        r['last_attempt_at']=at
        try:
            raw,typ,final,charset=client.notice(row['source'])
            if canonical_notice(final)!=row['source'] or typ not in ('text/html','application/xhtml+xml'):
                raise ValueError('notice_response_identity')
            info,transport=parse_notice(raw,row['source'],row['title'],charset)
            is_changed=bool(old and old['last_success_at'] and any(old.get(k)!=info[k] for k in ('body_sha256','manifest_sha256')))
            if len(result['documents'])+sum(ref['id'] not in result['documents'] for ref in info['documents'])>6000:
                raise ValueError('document_capacity')
            r.update(info,title=row['title'],listing_fingerprint=row['fingerprint'],listing_seen_at=row['last_seen_at'],
                last_success_at=at,status='html_available',last_error=None,
                review_required=bool(r['review_required'] or row['review_required'] or is_changed))
            if is_changed:run['changed']+=1
            current[key]=(row,transport);run['notices_success']+=1
            for ref in info['documents']:
                doc=result['documents'].get(ref['id'])
                if doc is None:
                    if len(result['documents'])>=6000:raise ValueError('document_capacity')
                    doc=dict(id=ref['id'],program_id=key,notice_source=row['source'],url=ref['public_url'],
                             name=ref['name'],status='queued',last_attempt_at=None,last_success_at=None,
                             last_error=None,review_required=False,history=[])
                    result['documents'][ref['id']]=doc
                queue.append(doc)
        except Exception as exc:
            r.update(status='fetch_failed',last_error=error_code(exc));run['notices_failed']+=1
            current.pop(key,None)
            if isinstance(exc,HTTPError):exc.close()
        r['history']=[{'at':at,'status':r['status'],'body_sha256':r['body_sha256'],
                       'manifest_sha256':r['manifest_sha256'],'error':r['last_error']}] + r['history'][:4]
        result['notices'][key]=r
    queue=[q for q in queue if q['program_id'] in current]
    queue.sort(key=lambda q:(q.get('last_attempt_at') or '',q['program_id'],q['id']))
    for doc in queue[:file_limit]:
        row,transport=current[doc['program_id']]
        def linked(_url,doc=doc,row=row,transport=transport):
            target=transport.get(doc['id'])
            if not target or not allowed_file(target,row['source']):raise ExtractError('source_not_linked')
            return client.file(target,row['source'])
        new=update_document(doc,at,fetcher=linked,parser=parser)
        result['documents'][doc['id']]=new;run['files_attempted']+=1
        status=new['status']
        if status=='text_extracted':run['text_extracted']+=1
        elif status in ('partial_text','no_text'):run['partial_or_no_text']+=1
        elif status in POLICY:run['blocked']+=1
        else:run['failed']+=1
        if new.get('content_changed_at')==at:run['changed']+=1
    unhandled=any(result['notices'][r['id']]['unhandled_links'] for r in picked)
    run['status']='partial' if skipped or unhandled or run['notices_failed'] or run['failed'] or run['blocked'] or run['partial_or_no_text'] else 'ok_scoped' if picked else 'idle'
    result.update(generated_at=at,run=run)
    validate_document(result)
    return result


def validate_document(doc):
    if not isinstance(doc,dict) or set(doc)!=TOP_FIELDS or doc['schema']!=SCHEMA or doc['version']!=VERSION:
        raise ValueError('agency_evidence_schema')
    if type(doc['model_calls']) is not int or doc['model_calls']!=0 or doc['automatic_approval'] is not False or doc['scope']!=SCOPE:
        raise ValueError('agency_evidence_policy')
    if doc['generated_at'] is not None and not stamp(doc['generated_at']):raise ValueError('evidence_timestamp')
    if not isinstance(doc['notices'],dict) or len(doc['notices'])>MAX_RECORDS or not isinstance(doc['documents'],dict) or len(doc['documents'])>6000:
        raise ValueError('evidence_limits')
    manifests={}
    for key,r in doc['notices'].items():
        if set(r)!=NOTICE_FIELDS or key!=r['id'] or r['agency_id'] not in SOURCES or canonical_notice(r['source'],r['agency_id'])!=r['source'] or notice_id(r['source'],r['agency_id'])!=key:
            raise ValueError('notice_fields')
        if not isinstance(r['title'],str) or not 5<=len(r['title'])<=400 or type(r['review_required']) is not bool:raise ValueError('notice_metadata')
        if r['status'] not in ('not_run','html_available','fetch_failed'):raise ValueError('notice_status')
        for f in ('last_attempt_at','last_success_at','listing_seen_at'):
            if r[f] is not None and not stamp(r[f]):raise ValueError('notice_time')
        for f in ('body_sha256','manifest_sha256','listing_fingerprint'):
            if r[f] is not None and not re.fullmatch(r'[a-f0-9]{64}',r[f]):raise ValueError('notice_hash')
        if r['status']=='html_available' and (r['last_success_at']!=r['last_attempt_at'] or r['last_error'] or not r['body_sha256']):raise ValueError('false_notice_success')
        if r['last_error'] is not None and not re.fullmatch(r'[A-Za-z0-9_]{1,100}',r['last_error']):raise ValueError('notice_error')
        if not isinstance(r['documents'],list) or len(r['documents'])>10 or len({x['id'] for x in r['documents']})!=len(r['documents']):raise ValueError('notice_documents')
        for ref in r['documents']:
            if set(ref)!=REF_FIELDS or not re.fullmatch(r'[a-f0-9]{24}',ref['id']) or not isinstance(ref['name'],str) or not 1<=len(ref['name'])<=160 or not isinstance(ref['locator'],str) or len(ref['locator'])>200:raise ValueError('document_ref')
            if r['agency_id']=='nipa' and ref['public_url']!=r['source']:raise ValueError('ephemeral_link_persisted')
            if r['agency_id']=='mss' and not allowed_file(ref['public_url'],r['source']):raise ValueError('document_link')
            d=doc['documents'].get(ref['id'],{})
            if d.get('program_id')!=key or d.get('name')!=ref['name'] or d.get('url')!=ref['public_url'] or d.get('notice_source')!=r['source']:raise ValueError('unbound_document')
        if r['manifest_sha256'] is not None and digest(r['documents'])!=r['manifest_sha256']:raise ValueError('manifest_hash')
        if type(r['unhandled_links']) is not int or not 0<=r['unhandled_links']<=200:raise ValueError('unhandled_links')
        if len(r['history'])>5:raise ValueError('notice_history_limit')
        for h in r['history']:
            if set(h)!={'at','status','body_sha256','manifest_sha256','error'} or not stamp(h['at']) or h['status'] not in ('html_available','fetch_failed'):raise ValueError('notice_history')
            for f in ('body_sha256','manifest_sha256'):
                if h[f] is not None and not re.fullmatch(r'[a-f0-9]{64}',h[f]):raise ValueError('history_hash')
            if h['error'] is not None and not re.fullmatch(r'[A-Za-z0-9_]{1,100}',h['error']):raise ValueError('history_error')
        manifests[key]={'notice_source':r['source'],'document_ids':[x['id'] for x in r['documents']]}
    for key,d in doc['documents'].items():
        if not re.fullmatch(r'[a-f0-9]{24}',key) or d.get('program_id') not in doc['notices']:raise ValueError('orphan_document')
        r=doc['notices'][d['program_id']]
        if d.get('notice_source')!=r['source']:raise ValueError('document_source')
        if r['agency_id']=='nipa' and d.get('url')!=r['source']:raise ValueError('ephemeral_document_link')
        if r['agency_id']=='mss' and not allowed_file(d.get('url'),r['source']):raise ValueError('document_source_link')
        if d.get('status') not in ERRORS|{'queued','text_extracted','partial_text','no_text'}:raise ValueError('unsupported_document_status')
    validate_public({'schema':'public-funding-attachments/v1','records':doc['documents'],'programs':manifests})
    run=doc['run']
    if set(run)!=RUN_FIELDS or run['status'] not in ('not_run','idle','ok_scoped','partial') or run['at']!=doc['generated_at']:raise ValueError('evidence_run')
    for f in RUN_FIELDS-{'at','status','sources_skipped'}:
        if type(run[f]) is not int or not 0<=run[f]<=6000:raise ValueError('evidence_count')
    if run['notices_attempted']>3 or run['files_attempted']>4 or run['notices_attempted']!=run['notices_success']+run['notices_failed']:raise ValueError('evidence_run_count')
    if run['files_attempted']!=sum(run[f] for f in ('text_extracted','partial_or_no_text','blocked','failed')):raise ValueError('file_run_count')
    if not isinstance(run['sources_skipped'],list) or any(s not in SOURCES for s in run['sources_skipped']):raise ValueError('source_skip')
    if run['status']=='ok_scoped' and (run['notices_failed'] or run['failed'] or run['blocked'] or run['partial_or_no_text'] or run['sources_skipped']):raise ValueError('false_run_success')
    return doc


def render_report(doc):
    validate_document(doc);r=doc['run']
    return ('# 기관 후보 원문·첨부 근거 봇\n\n'+SCOPE+'\n\n'
        +'실행: '+str(r['at'])+' / '+r['status']+' / AI 호출 0회\n\n'
        +f"원문 {r['notices_success']} 성공 / {r['notices_failed']} 실패 · 첨부 {r['files_attempted']} 시도\n\n"
        +f"본문 추출 {r['text_extracted']} · 부분/본문 없음 {r['partial_or_no_text']} · 제한 {r['blocked']} · 실패 {r['failed']}\n\n"
        +f"보존 원문 {len(doc['notices'])}건 · 파일 {len(doc['documents'])}건. 전체 완료 아님.\n\n"
        +'NIPA 다운로드 매개변수는 보관하지 않습니다. 원문에서 현재 첨부를 여십시오. '
        +'파일명이 같아도 내용은 지문으로 다시 확인합니다. 파일명 변경은 다른 후보로 남으며 자동 병합하지 않습니다.\n')


def validate_outputs(root):
    root=Path(root);path=root/DATA
    if path.stat().st_size>16_000_000:raise ValueError('evidence_size')
    doc=validate_document(json.loads(path.read_text(encoding='utf-8')))
    if (root/REPORT).read_text(encoding='utf-8')!=render_report(doc):raise ValueError('evidence_report_mismatch')
    return doc
