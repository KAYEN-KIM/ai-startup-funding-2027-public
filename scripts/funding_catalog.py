#!/usr/bin/env python3
"""P0.5 public, source-bound budget/restriction catalog. Never accepts company input."""
from __future__ import annotations
import json, re
from pathlib import Path
from condition_catalog import BASIS, basis, digest, require
from radar_core import official_url
ROOT=Path(__file__).resolve().parents[1]
ENTRY={'id','program_id','label','status','coverage','reviewed_at','program_snapshot','reviewed_difference_ids','evidence','finance','restrictions','notes','open_questions'}
EV={'document_id','url','sha256','manifest_sha256','pages','review_method','reviewed_at'}
FIN={'model','amount_type','period','cap_scope','max_support_won','government_max_bps','cash_min_bps','inkind_max_bps','locator'}
FIELDS={'active_jumpup','active_dips','dips_final_year_2026','active_worldclass','same_cost','other_copayment','ibk_centres'}
def date_ok(x):
    from datetime import datetime
    try:return isinstance(x,str) and datetime.fromisoformat(x).tzinfo is not None
    except (ValueError,TypeError):return False

def validate_registry(x):
    require(set(x)=={'schema','version','reviewed_at','records'},'Funding registry keys')
    require(x['schema']=='reviewed-funding-rules/v1' and x['version']=='0.5.0','Funding registry version')
    require(date_ok(x['reviewed_at']),'Funding registry timestamp')
    require(isinstance(x['records'],list) and len(x['records'])<=300,'Funding records')
    ids=[]
    for r in x['records']:
        require(set(r)==ENTRY,'Funding entry keys')
        require(all(isinstance(r[k],str) and r[k] for k in ('id','program_id','label')),'Funding record identity')
        ids.append(r['id']);require(date_ok(r['reviewed_at']),'Record review time')
        require(r['status'] in ('reviewed_limited_scope','clarification_required'),'No automatic approval state')
        require(r['coverage']=='selected_clauses_only','No full eligibility claim')
        require(set(r['program_snapshot'])==set(BASIS),'Funding metadata binding')
        require(r['program_id']==r['program_snapshot']['id'],'Program binding identity')
        require(all(isinstance(r[k],list) and all(isinstance(v,str) and v for v in r[k]) for k in ('notes','open_questions','reviewed_difference_ids')),'Notes/questions/reviews')
        require(r['open_questions'],'Partial review must state remaining questions')
        e=r['evidence'];require(set(e)==EV,'Evidence keys')
        require(official_url(e['url']) and bool(e['document_id']),'Evidence source')
        for k in ('sha256','manifest_sha256'):require(isinstance(e[k],str) and re.fullmatch('[0-9a-f]{64}',e[k]),'Evidence hash')
        require(e['review_method']=='rendered_page_and_text_check' and date_ok(e['reviewed_at']),'Review method/time')
        require(isinstance(e['pages'],list) and e['pages'] and all(type(n) is int and 1<=n<=500 for n in e['pages']),'Page locators')
        f=r['finance']
        if f is not None:
            require(r['status']=='reviewed_limited_scope' and set(f)==FIN,'Formula state/keys')
            require(f['model']=='ratio_of_total' and f['amount_type']=='voucher_face_value' and f['period']=='one_year','Unsupported funding model')
            require(f['cap_scope']=='standard_not_regional_uplift','Unreviewed uplift')
            require(type(f['max_support_won']) is int and 0<f['max_support_won']<=10**12,'Annual cap')
            for k in ('government_max_bps','cash_min_bps','inkind_max_bps'):require(type(f[k]) is int and 0<=f[k]<=10000,'Ratio type/range')
            g,c,i=(f[k] for k in ('government_max_bps','cash_min_bps','inkind_max_bps'))
            require(0<g<10000 and c>0 and g+c+i==10000,'Unsupported table relationship')
            require(isinstance(f['locator'],str) and bool(f['locator']),'Formula locator')
        require(isinstance(r['restrictions'],list) and len(r['restrictions'])<=30,'Restrictions')
        require(len({q['id'] for q in r['restrictions']})==len(r['restrictions']),'Duplicate restrictions')
        for q in r['restrictions']:
            require(set(q)<={'id','type','field','label','locator','exception_field','limit'},'Restriction keys')
            require(all(isinstance(q.get(k),str) and q[k] for k in ('id','type','field','label','locator')),'Restriction fields')
            require(q['field'] in FIELDS,'Restriction input field')
            require(q['type'] in ('prohibit_true','conditional_exception','max_count'),'Restriction type')
            if q['type']=='conditional_exception':require(q.get('exception_field')=='dips_final_year_2026' and q['field']=='active_dips','Exception scope')
            if q['type']=='max_count':require(q['field']=='ibk_centres' and q.get('limit')==1,'Centre limit')
    require(len(ids)==len(set(ids)),'Duplicate funding record IDs')

def state_reasons(r,program,attachments,evidence,reviews):
    reasons=[];pid=r['program_id'];src=r['evidence']
    if program is None or basis(program)!=r['program_snapshot']:reasons.append('program_changed_or_missing')
    m=attachments.get('programs',{}).get(pid);d=attachments.get('records',{}).get(src['document_id'])
    if attachments.get('schema')!='public-funding-attachments/v1':reasons.append('attachment_schema')
    if not m or m.get('manifest_sha256')!=src['manifest_sha256'] or src['document_id'] not in m.get('document_ids',[]) or m.get('notice_source')!=r['program_snapshot']['source']:reasons.append('manifest_changed_or_missing')
    if m and (m.get('review_required') or m.get('last_error') or m.get('notice_status')=='source_unavailable'):reasons.append('notice_review_required')
    if not d or d.get('program_id')!=pid or d.get('url')!=src['url'] or d.get('sha256')!=src['sha256'] or d.get('observed_sha256')!=src['sha256'] or d.get('extraction',{}).get('sha256')!=src['sha256']:reasons.append('document_changed_or_missing')
    if d and (d.get('status')!='text_extracted' or d.get('review_required') or d.get('last_error')):reasons.append('document_not_current')
    if m:
        for ident in m.get('document_ids',[]):
            other=attachments.get('records',{}).get(ident,{})
            if other.get('review_required') or (other.get('last_error') and other.get('extraction')):reasons.append('related_attachment_review_required');break
    ev=evidence.get('records',{}).get(pid,{})
    if ev.get('review_required') or ev.get('status')=='fetch_failed':reasons.append('html_review_required')
    ack=set(r['reviewed_difference_ids'])
    if any(q.get('program_id')==pid and q.get('status')=='pending' and q.get('id') not in ack for q in reviews.get('items',[])):reasons.append('unreviewed_metadata_difference')
    if r['status']=='clarification_required':reasons.append('rule_scope_needs_clarification')
    return list(dict.fromkeys(reasons))

def build_catalog(programs,registry,attachments,evidence,reviews):
    validate_registry(registry)
    p={x['id']:x for x in programs['items']}; records=[]
    for r in registry['records']:
        row=json.loads(json.dumps(r));reasons=state_reasons(r,p.get(r['program_id']),attachments,evidence,reviews)
        row['source_state']='hold' if reasons else 'ready';row['hold_reasons']=reasons
        row['rule_fingerprint']=digest(r);records.append(row)
    return {'schema':'public-funding-planning/v1','version':'0.5.0','generated_at':max(programs.get('generated_at',''),registry['reviewed_at'],attachments.get('generated_at','') or ''),
    'registry_fingerprint':digest(registry),'records':records,
    'disclaimer':'검토한 일부 조항의 계산·충돌 점검입니다. 선정·교부·현물인정·전체 적격성·사업 병행 허용을 보장하지 않습니다.'}

def main():
    load=lambda path:json.loads((ROOT/path).read_text(encoding='utf-8'))
    out=build_catalog(load('data/programs.json'),load('config/funding_rules.json'),load('data/attachments.json'),load('data/evidence.json'),load('data/change_reviews.json'))
    path=ROOT/'data/funding_rules.json';text=json.dumps(out,ensure_ascii=False,indent=2)+'\n'
    if not path.exists() or path.read_text(encoding='utf-8')!=text:
        tmp=path.with_suffix('.tmp');tmp.write_text(text,encoding='utf-8');tmp.replace(path)
    print('Source-bound planning catalog:',len(out['records']),'records;',sum(r['source_state']=='ready' for r in out['records']),'source-ready')
    return out
if __name__=='__main__':main()
