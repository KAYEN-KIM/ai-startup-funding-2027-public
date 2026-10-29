#!/usr/bin/env python3
"""Fail-closed public-only schema validation. No applicant records are deployable."""
import json
import re
from pathlib import Path
from radar_core import official_url
ROOT=Path(__file__).resolve().parents[1]
FILES={'programs.json','monitor.json','evidence.json','change_reviews.json'}
PROGRAM_FIELDS={'id','title','year','years','year_basis','kind','mode','relevance','opens','deadline','deadline_precision','application_period_raw','source','verified_at','amount','eligibility','note','priority','source_level','agency','attachments'}
PRIVATE={'company_profile','applicant_profile','applicant_memo','resident_number','taxpayer_id','bank_account','access_token','secret_key','password','api_key','crtfcKey','serviceKey','budget_private','application_documents'}
MODES={'beneficiary','discovery','reference','operator','budget'}

def require(condition,message):
    if not condition:raise ValueError(message)

def scan(value):
    if isinstance(value,dict):
        for k,v in value.items():
            require(k.casefold() not in {s.casefold() for s in PRIVATE},'Private key forbidden: '+k)
            if k in ('url','source') and isinstance(v,str) and v.startswith(('https:','http:')):
                require(official_url(v),'Unapproved or secret-bearing URL')
            scan(v)
    elif isinstance(value,list):
        for v in value:scan(v)
    elif isinstance(value,str):
        require(not re.search(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,})',value),'Credential-shaped value forbidden')

def main():
    found={p.name for p in (ROOT/'data').glob('*.json')}
    require(found<=FILES,'Unapproved data filename; do not publish extra state')
    loaded={name:json.loads((ROOT/'data'/name).read_text(encoding='utf-8')) for name in found}
    for value in loaded.values():scan(value)
    p=loaded['programs.json'];m=loaded['monitor.json']
    require(p.get('schema')=='public-funding-radar/v1','Programs schema')
    require(m.get('schema')=='public-funding-monitor/v1','Monitor schema')
    require(set(p)<= {'schema','generated_at','provenance','disclaimer','items'},'Unknown public top-level field')
    items=p['items'];require(isinstance(items,list) and bool(items),'Empty public baseline forbidden')
    require(len({x['id'] for x in items})==len(items),'Duplicate IDs')
    for x in items:
        require(set(x)<=PROGRAM_FIELDS,'Unknown program fields: '+str(set(x)-PROGRAM_FIELDS))
        for f in ('id','title','year','mode','kind','source'):require(bool(x.get(f)),'Missing '+f)
        require(isinstance(x['year'],int) and 2020<=x['year']<=2040,'Invalid year')
        require(x['mode'] in MODES,'Invalid classification')
        require(official_url(x['source']),'Nonofficial source')
        if x['mode']=='reference':require(x['year']==2026,'Historical reference must not be promoted to 2027')
        if 'attachments' in x:
            require(isinstance(x['attachments'],list),'Attachments list')
            for a in x['attachments']:
                require(set(a)<= {'url','name','status'},'Attachment extra field')
                require(a['status']=='link_only_not_read','Attachment verification unsupported')
    if 'evidence.json' in loaded:
        require(loaded['evidence.json'].get('schema')=='public-funding-evidence/v1','Evidence schema')
        for r in loaded['evidence.json']['records'].values():
            require(r.get('level') in (None,'html_retrieved_not_eligibility_verified'),'Unsupported evidence promotion')
    if 'change_reviews.json' in loaded:
        require(loaded['change_reviews.json'].get('schema')=='public-funding-reviews/v1','Review schema')
        for r in loaded['change_reviews.json']['items']:
            require(r['field'] in ('title','opens','deadline','eligibility'),'Unsupported review field')
            require(r['status'] in ('pending','accepted','dismissed'),'Unknown review status')
    print('Public schema validation OK:',len(items),'records;',len(found),'allowlisted JSON files')

if __name__=='__main__':main()
