#!/usr/bin/env python3
"""Rotate official attachments. Temporary originals; bounded public candidates only."""
from __future__ import annotations
import argparse
import copy
import datetime as dt
import ipaddress
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from urllib.parse import urlparse
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
from attachment_core import VERSION,MAX_FILE,ExtractError,sha,approved_url,validate_public,ERRORS
ROOT=Path(__file__).resolve().parents[1]
KST=dt.timezone(dt.timedelta(hours=9))

def read(path,default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else copy.deepcopy(default)
def write(path,value):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(path)

def require_public_destination(url):
    if not approved_url(url):raise ExtractError('source_not_linked')
    records=socket.getaddrinfo(urlparse(url).hostname,443,type=socket.SOCK_STREAM)
    if not records or any(not ipaddress.ip_address(x[4][0]).is_global for x in records):raise ExtractError('source_not_linked')

class RedirectGuard(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        require_public_destination(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def download(url):
    require_public_destination(url)
    req=Request(url,headers={'User-Agent':'AI-Funding-Radar/0.4 (bounded public document research)','Accept':'application/pdf,application/octet-stream,application/hwp+zip,*/*;q=0.1'})
    with build_opener(RedirectGuard()).open(req,timeout=15) as resp:
        if resp.status!=200:raise ExtractError('download_failed')
        try:size=int(resp.headers.get('Content-Length') or '0')
        except ValueError:size=0
        if size>MAX_FILE:raise ExtractError('size_limit')
        raw=resp.read(MAX_FILE+1)
        if len(raw)>MAX_FILE:raise ExtractError('size_limit')
        return raw

def isolated_parse(raw):
    with tempfile.TemporaryDirectory(prefix='funding-attachment-') as temp:
        source=Path(temp)/'input.bin';source.write_bytes(raw)
        env={k:v for k,v in os.environ.items() if k in {'PATH','SYSTEMROOT','WINDIR','HOME','TMP','TEMP','LANG'}}
        env['PYTHONIOENCODING']='utf-8'
        try:
            result=subprocess.run([sys.executable,str(ROOT/'scripts/attachment_worker.py'),str(source)],capture_output=True,timeout=30,env=env)
        except subprocess.TimeoutExpired as exc:raise ExtractError('parser_timeout') from exc
        if result.returncode!=0:raise ExtractError('resource_limit')
        if len(result.stdout)>80_000:raise ExtractError('size_limit')
        try:value=json.loads(result.stdout)
        except (ValueError,UnicodeError) as exc:raise ExtractError('malformed_document') from exc
        if not value.get('ok'):raise ExtractError(value.get('error') if value.get('error') in ERRORS else 'malformed_document')
        return value['extraction']

def discover_notice(p):
    from refresh_v2 import fetch,inspect_page
    raw,typ,final,charset=fetch(p['source'])
    if typ not in ('text/html','application/xhtml+xml'):raise ExtractError('source_unavailable')
    return inspect_page(raw,final,p['title'],charset)['attachments']

def doc_id(pid,url):return sha((pid+'\n'+url).encode())[:24]

def update_manifest(state,p,links,at):
    old=state['programs'].get(p['id'],{})
    urls=sorted({x['url'] for x in links if approved_url(x.get('url'))})[:10]
    digest=sha('\n'.join(urls).encode())
    changed=bool(old.get('manifest_sha256') and old['manifest_sha256']!=digest)
    rec=dict(old,notice_source=p['source'],last_notice_attempt_at=at,last_notice_success_at=at,
             notice_status='links_available' if urls else 'no_attachment_links',manifest_sha256=digest,
             document_ids=[doc_id(p['id'],url) for url in urls],review_required=bool(old.get('review_required') or changed),last_error=None)
    if changed:rec['previous_manifest_sha256']=old['manifest_sha256']
    state['programs'][p['id']]=rec
    for url in urls:
        key=doc_id(p['id'],url)
        if key not in state['records']:
            state['records'][key]={'id':key,'program_id':p['id'],'notice_source':p['source'],'url':url,
                'name':next((x.get('name','첨부파일') for x in links if x['url']==url),'첨부파일')[:160],
                'status':'queued','last_attempt_at':None,'last_success_at':None,'last_error':None,'review_required':False,'history':[]}
    return changed

def update_document(old,at,fetcher=download,parser=isolated_parse):
    result=copy.deepcopy(old);result['last_attempt_at']=at
    try:
        raw=fetcher(old['url'])
        if len(raw)>MAX_FILE:raise ExtractError('size_limit')
        observed=sha(raw);result['observed_sha256']=observed
        changed=bool(old.get('sha256') and old['sha256']!=observed)
        if changed:
            result['previous_sha256']=old['sha256'];result['content_changed_at']=at;result['review_required']=True
        ex=parser(raw)
        if ex.get('sha256')!=observed:raise ExtractError('malformed_document')
        result.update(status=ex['status'],last_success_at=at,last_error=None,sha256=observed,extraction=ex,http_status=None,failure_kind=None,retryable=False)
    except Exception as exc:
        code=str(exc) if isinstance(exc,ExtractError) and str(exc) in ERRORS else 'download_failed'
        # Persist only bounded codes; never response bodies, cookies, exception URLs or credentials.
        http_status=exc.code if isinstance(exc,HTTPError) and 400<=exc.code<=599 else None
        kind='http_error' if http_status else 'network_error' if isinstance(exc,(URLError,TimeoutError,ConnectionError)) else 'document_or_policy' if isinstance(exc,ExtractError) else 'unclassified'
        retryable=(http_status in {408,429,500,502,503,504}) if http_status else kind=='network_error'
        result.update(status=code,last_error=code,http_status=http_status,failure_kind=kind,retryable=retryable)
        if isinstance(exc,HTTPError):exc.close()
    result.setdefault('history',[]).insert(0,{'at':at,'status':result['status'],'observed_sha256':result.get('observed_sha256'),'http_status':result.get('http_status'),'failure_kind':result.get('failure_kind')})
    result['history']=result['history'][:8]
    return result

def collect(programs,state,at,priority=(),notice_limit=3,file_limit=4,discover=discover_notice,fetcher=download,parser=isolated_parse):
    state=copy.deepcopy(state)
    plist={p['id']:p for p in programs['items']}
    eligible=[p for p in plist.values() if p['mode'] in ('beneficiary','discovery') and approved_url(p['source'])]
    eligible.sort(key=lambda p:(state['programs'].get(p['id'],{}).get('last_notice_attempt_at',''),p['id'] not in priority,p['id']))
    notice_ok=notice_failed=manifest_changed=0
    for p in eligible[:notice_limit]:
        try:
            links=discover(p);manifest_changed+=int(update_manifest(state,p,links,at));notice_ok+=1
        except Exception:
            prior=state['programs'].get(p['id'],{})
            state['programs'][p['id']]=dict(prior,notice_source=p['source'],last_notice_attempt_at=at,notice_status='source_unavailable',last_error='source_unavailable')
            notice_failed+=1
    active=set()
    for pid,manifest in state['programs'].items():
        p=plist.get(pid)
        if p and manifest.get('notice_source')==p['source'] and manifest.get('notice_status')=='links_available':
            active.update(manifest.get('document_ids',[]))
    queue=[state['records'][i] for i in active if i in state['records']]
    queue.sort(key=lambda r:(r.get('last_attempt_at') or '',r['program_id'] not in priority,r['id']))
    succeeded=partial=blocked=failed=changed=0
    for old in queue[:file_limit]:
        new=update_document(old,at,fetcher,parser);state['records'][old['id']]=new
        status=new['status'];succeeded+=int(status=='text_extracted');partial+=int(status in ('partial_text','no_text'))
        blocked+=int(status in ('protected_document','unsupported_format','size_limit','unsafe_archive','unsafe_xml'))
        failed+=int(status not in ('text_extracted','partial_text','no_text','protected_document','unsupported_format','size_limit','unsafe_archive','unsafe_xml'))
        changed+=int(new.get('content_changed_at')==at)
    state['version']=VERSION;state['generated_at']=at
    state['run']={'at':at,'notice_success':notice_ok,'notice_failed':notice_failed,'attempted':min(len(queue),file_limit),
                  'text_extracted':succeeded,'partial_or_no_text':partial,'blocked_or_unsupported':blocked,'failed':failed,
                  'changed':changed,'manifest_changed':manifest_changed,'queued_total':len(queue),
                  'scope':'회차당 원문 최대 3건·첨부 최대 4건. 본문 추출은 자격 검증이 아니며 전체 기관 수집을 뜻하지 않습니다.'}
    validate_public(state)
    return state

def main():
    args=argparse.ArgumentParser();args.add_argument('--notice-limit',type=int,default=3);args.add_argument('--file-limit',type=int,default=4)
    a=args.parse_args()
    programs=read(ROOT/'data/programs.json');registry=read(ROOT/'config/eligibility_rules.json',{'records':{}})
    target=ROOT/'data/attachments.json';state=read(target,{'schema':'public-funding-attachments/v1','records':{},'programs':{}})
    result=collect(programs,state,dt.datetime.now(KST).isoformat(timespec='seconds'),tuple(registry['records']),max(0,min(a.notice_limit,3)),max(0,min(a.file_limit,4)))
    write(target,result);print(json.dumps(result['run'],ensure_ascii=False))
    return 2 if result['run']['notice_failed'] or result['run']['failed'] else 0
if __name__=='__main__':raise SystemExit(main())
