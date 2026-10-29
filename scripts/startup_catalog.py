#!/usr/bin/env python3
"""P0.6 source-bound historical preparation, not live grant eligibility."""
from __future__ import annotations
import copy, datetime as dt, hashlib, json, re
from pathlib import Path
from radar_core import official_url
ROOT=Path(__file__).resolve().parents[1]
BASIS=['id','title','source','year','mode','eligibility','amount','opens','deadline']
ENTRY={'id','program_id','label','reference_year','target_year','scope','stage','reviewed_at','program_snapshot','source','average_support_won','scenarios','conditions','notes','restrictions','tasks'}
SOURCE={'id','url','sha256','format','review_method','locator'}
SCENARIO={'id','label','government_bps','cash_min_bps','inkind_max_bps','own_model','max_support_won'}
CHECK={'id','url','expected_sha256','observed_sha256','status','last_attempt_at','last_success_at','review_required','error'}
def require(ok,msg):
    if not ok:raise ValueError(msg)
def stamp(value):
    try:return isinstance(value,str) and dt.datetime.fromisoformat(value).tzinfo is not None
    except (TypeError,ValueError):return False
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def texts(values):return isinstance(values,list) and bool(values) and all(isinstance(x,str) and 0<len(x)<=1000 for x in values)
def validate_registry(reg):
    require(set(reg)=={'schema','version','records'} and reg['schema']=='reviewed-startup-preparation/v1' and reg['version']=='0.6.0','Reference registry/version')
    require(isinstance(reg['records'],list) and 1<=len(reg['records'])<=30,'Reference records')
    ids=[]
    for r in reg['records']:
        require(set(r)==ENTRY,'Reference entry fields');ids.append(r['id'])
        require(r['scope']=='historical_preparation_only' and r['reference_year']==2026 and r['target_year']==2027,'Historical year lock')
        require(r['stage'] in ('pre','early','early_ai') and stamp(r['reviewed_at']),'Stage/review timestamp')
        require(set(r['program_snapshot'])==set(BASIS) and r['program_snapshot']['id']==r['program_id'] and r['program_snapshot']['mode']=='reference' and r['program_snapshot']['year']==2026,'Reference-only program binding')
        e=r['source'];require(set(e)==SOURCE and e['id']==r['id'] and official_url(e['url']),'Reference source')
        require(bool(re.fullmatch('[a-f0-9]{64}',e['sha256'])) and e['format'] in ('pdf','hwpx'),'Source format/hash')
        require(e['review_method'] in ('hwpx_structured_cells_and_context','official_pdf_text_and_parallel_copy_visual_check') and bool(e['locator']),'Review method/locator')
        for name in ('conditions','notes','restrictions'):require(texts(r[name]),'Missing reference caveats')
        require(type(r['average_support_won']) is int and 0<r['average_support_won']<=10**12,'Average only, not cap')
        require(isinstance(r['scenarios'],list) and r['scenarios'],'Scenarios')
        require(len({s['id'] for s in r['scenarios']})==len(r['scenarios']),'Duplicate scenarios')
        for s in r['scenarios']:
            require(set(s)==SCENARIO,'Scenario fields')
            g,c,i=(s[k] for k in ('government_bps','cash_min_bps','inkind_max_bps'))
            require(all(type(x) is int and 0<=x<=10000 for x in (g,c,i)) and g>0 and g+c+i==10000,'Ratio relationship')
            require(type(s['max_support_won']) is int and 0<s['max_support_won']<=10**12,'Scenario cap')
            model=s['own_model']
            require((model=='none' and g==10000 and c==i==0 and r['stage']=='pre') or (model=='cash_or_inkind' and 0<g<10000 and c==0) or (model=='ratio_of_total' and 0<g<10000 and c>0),'Own contribution model')
        require(isinstance(r['tasks'],list) and 1<=len(r['tasks'])<=30,'Tasks')
        require(len({t['id'] for t in r['tasks']})==len(r['tasks']),'Duplicate tasks')
        for task in r['tasks']:require(set(task)=={'id','label','basis'} and all(isinstance(v,str) and v for v in task.values()),'Task fields')
    require(len(ids)==len(set(ids)),'Duplicate reference IDs')
def validate_sources(state,reg):
    require(set(state)=={'schema','records','run'} and state['schema']=='public-startup-source-checks/v1','Source check schema')
    require(set(state['records'])<= {r['id'] for r in reg['records']},'Unregistered source')
    for ident,s in state['records'].items():
        require(set(s)==CHECK and s['id']==ident and official_url(s['url']),'Source check fields')
        require(s['status'] in ('matched','changed','fetch_failed') and type(s['review_required']) is bool,'Source check status')
        require(stamp(s['last_attempt_at']) and (s['last_success_at'] is None or stamp(s['last_success_at'])),'Source check timestamps')
        for k in ('expected_sha256','observed_sha256'):require(s[k] is None or bool(re.fullmatch('[a-f0-9]{64}',s[k])),'Source check hash')
        require(s['error'] in (None,'download_failed','hash_changed'),'Source check error')
    require(isinstance(state['run'],dict) and set(state['run'])<= {'at','scope','matched','changed','failed'} and stamp(state['run'].get('at')),'Source run metadata')
def build_catalog(programs,reg,state):
    validate_registry(reg);validate_sources(state,reg)
    pmap={p['id']:p for p in programs['items']};out=[]
    for r in reg['records']:
        row=copy.deepcopy(r);p=pmap.get(r['program_id']);s=state['records'].get(r['id']);holds=[]
        if not p or {k:p.get(k) for k in BASIS}!=r['program_snapshot']:holds.append('historical_program_changed')
        if not s or any(s.get(k)!=v for k,v in {'id':r['id'],'url':r['source']['url'],'expected_sha256':r['source']['sha256'],'observed_sha256':r['source']['sha256'],'status':'matched','error':None,'review_required':False}.items()):holds.append('source_not_matched')
        row['source_state']='hold' if holds else 'reference_ready';row['hold_reasons']=holds;row['rule_fingerprint']=digest(r);out.append(row)
    candidates=[]
    for p in programs['items']:
        if p.get('year')==2027 and p.get('mode') in ('beneficiary','discovery') and any(term in p.get('title','') for term in ('예비창업','초기창업')):
            candidates.append({k:p.get(k) for k in ('id','title','source','mode','deadline')})
    return {'schema':'public-startup-preparation/v1','version':'0.6.0','scope':'historical_preparation_only','registry_fingerprint':digest(reg),'records':out,'new_notice_candidates':candidates,'disclaimer':'2026 종료 공고의 준비용 시나리오입니다. 2027 금액·일정·적격성 또는 병행 허용을 확정하지 않습니다.'}
def main():
    load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
    result=build_catalog(load('data/programs.json'),load('config/startup_reference.json'),load('data/startup_sources.json'))
    dest=ROOT/'data/startup_routes.json';text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if not dest.exists() or dest.read_text(encoding='utf-8')!=text:
        tmp=dest.with_suffix('.tmp');tmp.write_text(text,encoding='utf-8');tmp.replace(dest)
    print('Historical preparation catalog:',len(result['records']),'routes;',sum(len(r['scenarios']) for r in result['records']),'scenarios; no 2027 confirmation')
    return result
if __name__=='__main__':main()
