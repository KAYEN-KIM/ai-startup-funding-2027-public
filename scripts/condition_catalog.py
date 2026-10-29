#!/usr/bin/env python3
"""P0.3 public conditions: reviewed rules and unverified candidates stay separate.

This module never accepts or writes applicant input. No raw attachment contents or
personal company records are included in the public catalog.
"""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path
from radar_core import official_url

ROOT=Path(__file__).resolve().parents[1]
FIELDS={'entity','founded_on','is_sme','headquarters_region','innovation','digital_capability'}
BASIS=('id','title','source','year','eligibility','amount','opens','deadline')
OPS={'eq','in','tenure_lte','tenure_gte','all','any'}
REGIONS={'서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'}

def require(test,msg):
    if not test:raise ValueError(msg)

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def basis(row):return {key:row.get(key) for key in BASIS}

def candidates(row):
    """Extraction candidates, NEVER rules. Retain source field and exact snippet."""
    out=[]
    for field in ('eligibility','amount','note'):
        text=row.get(field,'')
        if not isinstance(text,str):continue
        patterns=[('tenure',r'(?:업력|창업)\s*\d+\s*년\s*(?:이내|이하|미만|이상|초과)'),
                  ('representative_age',r'(?:대표[^.·\n]{0,30})?\d+\s*세\s*(?:이하|미만|이상)'),
                  ('location',r'[^.\n]{0,55}(?:본사|소재)[^.\n]{0,55}'),
                  ('cofunding',r'[^.\n]{0,40}(?:자부담|자기부담|민간부담|중복)[^.\n]{0,70}'),
                  ('funding_amount',r'[^.\n]{0,35}(?:억원|천만원|백만원|%)[^.\n]{0,45}')]
        for category,pattern in patterns:
            for match in re.finditer(pattern,text):
                snippet=match.group(0).strip()[:180]
                if not snippet:continue
                ident=digest([field,category,snippet])[:16]
                if ident not in {x['id'] for x in out}:
                    out.append({'id':ident,'category':category,'origin_field':field,'excerpt':snippet,
                                'status':'candidate_unverified','source':row['source']})
    return out[:12]

def validate_rule(rule,sources,depth=0):
    require(isinstance(rule,dict) and depth<=8,'Invalid or overdeep rule')
    require(set(rule)<= {'id','label','status','op','field','value','values','years','as_of','children','evidence_id'},'Unknown rule key')
    require(isinstance(rule.get('id'),str) and bool(rule['id']),'Rule id')
    require(isinstance(rule.get('label'),str) and bool(rule['label']),'Rule label')
    require(rule.get('status') in ('reviewed','draft'),'Rule status')
    require(rule.get('op') in OPS,'Rule operator')
    require(rule.get('evidence_id') in sources,'Missing rule evidence')
    op=rule['op']
    if op in ('all','any'):
        require(isinstance(rule.get('children'),list) and 0<len(rule['children'])<=30,'Rule children')
        for child in rule['children']:validate_rule(child,sources,depth+1)
    else:
        field=rule.get('field');require(field in FIELDS,'Unsupported field')
        if op=='eq':require(isinstance(rule.get('value'),(str,bool)),'Rule eq value')
        if op=='in':require(isinstance(rule.get('values'),list) and 0<len(rule['values'])<=30 and all(isinstance(x,str) for x in rule['values']),'Rule in values')
        if op.startswith('tenure_'):
            require(field=='founded_on' and type(rule.get('years')) is int and 0<=rule['years']<=100,'Tenure field/years')
            require(rule.get('as_of') is None or re.fullmatch(r'\d{4}-\d{2}-\d{2}',rule['as_of']),'Tenure reference day')
        if field=='headquarters_region' and op=='eq':require(rule['value'] in REGIONS,'Region')

def validate_registry(registry):
    require(set(registry)<= {'schema','version','reviewed_at','records'},'Registry fields')
    require(registry.get('schema')=='reviewed-public-conditions/v1','Registry schema')
    require(isinstance(registry.get('records'),dict),'Registry records')
    for ident,entry in registry['records'].items():
        require(set(entry)<= {'program_id','basis_snapshot','reviewed_at','coverage','sources','clauses','open_questions','attachments_reviewed','exceptions_reviewed','reviewed_difference_ids'},'Registry entry fields')
        require(ident==entry.get('program_id'),'Registry ID mismatch')
        require(set(entry.get('basis_snapshot',{}))==set(BASIS),'Basis snapshot fields')
        require(entry.get('coverage') in ('partial','complete'),'Coverage')
        require(type(entry.get('attachments_reviewed')) is bool and type(entry.get('exceptions_reviewed')) is bool,'Completeness flags')
        require(isinstance(entry.get('open_questions'),list) and all(isinstance(x,str) for x in entry['open_questions']),'Questions')
        sources=entry.get('sources',{})
        require(isinstance(sources,dict) and bool(sources),'Sources')
        for source in sources.values():
            require(set(source)== {'url','locator','excerpt','checked_at','level'},'Source fields')
            require(official_url(source['url']),'Unofficial evidence URL')
            require(source['level'] in ('official_summary_reviewed','full_notice_reviewed'),'Source level')
            require(isinstance(source['excerpt'],str) and 0<len(source['excerpt'])<=500,'Source excerpt')
            require(isinstance(source['locator'],str) and bool(source['locator']),'Source locator')
            require(isinstance(source['checked_at'],str),'Source timestamp')
        require(isinstance(entry.get('clauses'),list) and 0<len(entry['clauses'])<=30,'Clauses')
        require(len({c['id'] for c in entry['clauses']})==len(entry['clauses']),'Duplicate clause IDs')
        for rule in entry['clauses']:validate_rule(rule,sources)
        require(isinstance(entry.get('reviewed_difference_ids',[]),list),'Difference acknowledgments')
        if entry['coverage']=='complete':
            require(entry['attachments_reviewed'] and entry['exceptions_reviewed'] and not entry['open_questions'],'Incomplete evidence cannot claim complete coverage')
            require(all(s['level']=='full_notice_reviewed' for s in sources.values()),'Summary cannot support complete eligibility')

def build_catalog(programs,registry):
    validate_registry(registry)
    records={}
    for p in programs['items']:
        entry=registry['records'].get(p['id'])
        current=basis(p)
        record={'schema':'program-conditions/v1','program_id':p['id'],
                'basis_fingerprint':digest(current),'bound_fields':current,'coverage':'unreviewed','metadata_state':'current',
                'reviewed_at':None,'sources':{},'clauses':[],'candidate_facts':candidates(p),
                'attachments_reviewed':False,'exceptions_reviewed':False,'reviewed_difference_ids':[],
                'open_questions':['첨부 본문·예외조건·중복수혜·사업비 부담을 검토하지 않았습니다.']}
        if entry:
            record.update({k:entry[k] for k in ('coverage','reviewed_at','sources','clauses','open_questions','attachments_reviewed','exceptions_reviewed','reviewed_difference_ids')})
            record['metadata_state']='current' if current==entry['basis_snapshot'] else 'changed_since_review'
        records[p['id']]=record
    return {'schema':'public-funding-conditions/v1','version':'0.3.0',
            'generated_at':max(programs.get('generated_at',''),registry.get('reviewed_at','')),
            'input_fingerprint':digest({'items':programs['items'],'registry':registry}),
            'disclaimer':'요약에서 확인한 조건만 판정합니다. 자동 추출은 미검증 후보이며 기관의 최종 심사를 대체하지 않습니다.',
            'records':records}

def main():
    programs=json.loads((ROOT/'data/programs.json').read_text(encoding='utf-8'))
    registry=json.loads((ROOT/'config/eligibility_rules.json').read_text(encoding='utf-8'))
    catalog=build_catalog(programs,registry)
    path=ROOT/'data/conditions.json'
    text=json.dumps(catalog,ensure_ascii=False,indent=2)+'\n'
    if not path.exists() or path.read_text(encoding='utf-8')!=text:
        temp=path.with_suffix('.tmp');temp.write_text(text,encoding='utf-8');temp.replace(path)
    rules=sum(bool(r['clauses']) for r in catalog['records'].values())
    print('Public condition catalog:',len(catalog['records']),'programs;',rules,'partially reviewed rule sets')
    return catalog
if __name__=='__main__':main()
