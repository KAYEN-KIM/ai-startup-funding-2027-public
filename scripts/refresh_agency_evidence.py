#!/usr/bin/env python3
"""Separate official-candidate evidence bot: no model, credentials or promotion."""
from datetime import datetime
import json
from pathlib import Path
from agency_evidence import (KST, DATA, REPORT, collect, empty_document,
                             render_report, validate_outputs)
from refresh_agencies import atomic
ROOT=Path(__file__).resolve().parents[1]

def main():
    target=ROOT/DATA
    previous=json.loads(target.read_text(encoding='utf-8')) if target.exists() else empty_document()
    discovery=json.loads((ROOT/'data/agency_discovery.json').read_text(encoding='utf-8'))
    result=collect(discovery,previous,datetime.now(KST))
    summary=render_report(result)
    atomic(target,json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    atomic(ROOT/REPORT,summary)
    validate_outputs(ROOT)
    print(json.dumps(result['run'],ensure_ascii=True))
    return 0 if result['run']['status'] in ('ok_scoped','idle') else 2
if __name__=='__main__':raise SystemExit(main())
