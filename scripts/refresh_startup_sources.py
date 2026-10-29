#!/usr/bin/env python3
"""Recheck reviewed historical originals only; never infer a new year's conditions."""
from __future__ import annotations
import copy,datetime as dt,hashlib,json
from pathlib import Path
from startup_catalog import validate_registry,validate_sources
from refresh_attachments import download,write
ROOT=Path(__file__).resolve().parents[1]
KST=dt.timezone(dt.timedelta(hours=9))
def collect(registry,state,at,fetcher=download):
    validate_registry(registry);validate_sources(state,registry)
    out=copy.deepcopy(state);counts={'matched':0,'changed':0,'failed':0}
    for r in registry['records']:
        e=r['source'];old=out['records'].get(r['id'],{})
        row={'id':r['id'],'url':e['url'],'expected_sha256':e['sha256'],'observed_sha256':old.get('observed_sha256'),'status':'fetch_failed','last_attempt_at':at,'last_success_at':old.get('last_success_at'),'review_required':bool(old.get('review_required')),'error':'download_failed'}
        try:
            raw=fetcher(e['url']);observed=hashlib.sha256(raw).hexdigest()
            row['observed_sha256']=observed
            if observed!=e['sha256']:
                row.update(status='changed',review_required=True,error='hash_changed');counts['changed']+=1
            else:
                row.update(status='matched',last_success_at=at,error=None);counts['matched']+=1
        except Exception:
            counts['failed']+=1
        out['records'][r['id']]=row
    out['run']={'at':at,'scope':'검토된 2026 원본 3개 URL의 파일 지문 재확인입니다. 새로운 수정공고·2027 공고 전체 탐색이 아닙니다.',**counts}
    validate_sources(out,registry)
    return out

def main():
    load=lambda path:json.loads((ROOT/path).read_text(encoding='utf-8'))
    reg=load('config/startup_reference.json');state=load('data/startup_sources.json')
    result=collect(reg,state,dt.datetime.now(KST).isoformat(timespec='seconds'))
    write(ROOT/'data/startup_sources.json',result)
    print(json.dumps(result['run'],ensure_ascii=False))
    return 2 if result['run']['changed'] or result['run']['failed'] else 0
if __name__=='__main__':raise SystemExit(main())
