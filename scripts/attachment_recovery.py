"""P0.23 bounded deterministic attachment recovery queue: no HTTP, no AI.
A failed/downloaded document is NEVER promoted into verified eligibility.
"""
from __future__ import annotations
from datetime import datetime,timedelta,timezone
import json
from pathlib import Path
from attachment_core import validate_public

SCHEMA="public-funding-attachment-recovery/v1"
VERSION="0.23.0"
KST=timezone(timedelta(hours=9))
WAIT_MINUTES=(60,240,1440,2880)
RECHECK_DAYS=14
RETRY_HTTP={408,429,500,502,503,504}
SUCCEEDED={"text_extracted"}
NON_ACTIONABLE={"partial_text","no_text","protected_document","unsupported_format",
                "size_limit","unsafe_archive","unsafe_xml","malformed_document",
                "dependency_missing","resource_limit"}
FAILURES={"download_failed","parser_timeout","source_not_linked","source_unavailable",
          "failed","network_failed","timeout","parse_failed","parser_failed","extraction_failed"}
REASONS={
 "queued":"newly_queued",
 "retry_due":"bounded_retry_ready",
 "retry_wait":"bounded_backoff_not_elapsed",
 "manual":"manual_original_review_required",
 "revisit":"age_based_recheck_due",
 "current":"recently_observed",
 "inactive":"not_currently_linked",
}
def at_time(v):
    if not isinstance(v,str):return None
    try:
        out=datetime.fromisoformat(v.replace("Z","+00:00"))
        return out.astimezone(KST) if out.tzinfo is not None else None
    except ValueError:return None

def timestamp(v):
    d=at_time(v)
    return d.isoformat(timespec="seconds") if d else None

def active_ids(state):
    ids=set()
    for pid,manifest in state.get("programs",{}).items():
        if manifest.get("notice_status")=="links_available":
            for item in manifest.get("document_ids",[]):
                if item in state.get("records",{}):
                    ids.add(item)
    return ids

def failure_streak(record):
    # Newest to oldest; only consecutive failures count toward backoff.
    events=record.get("history",[])
    n=0
    for e in events:
        if e.get("status") in FAILURES:n+=1
        else:break
    return max(n,1)

def classify(record,now,is_active=True):
    if not is_active:return ("inactive",None)
    status=record.get("status")
    if status=="queued" and not record.get("last_attempt_at"):return ("queued",None)
    if status in FAILURES:
        http=record.get("http_status")
        kind=record.get("failure_kind")
        retryable=record.get("retryable") is True
        # Allow only transport failures (no policy bypass or unknown metadata).
        safe=retryable and (kind=="network_error" or kind=="http_error" and http in RETRY_HTTP)
        if not safe:return ("manual",None)
        prev=at_time(record.get("last_attempt_at"))
        if prev is None or now is None:return ("manual",None)
        minutes=WAIT_MINUTES[min(failure_streak(record)-1,len(WAIT_MINUTES)-1)]
        due=prev+timedelta(minutes=minutes)
        return ("retry_due" if now>=due else "retry_wait",due.isoformat(timespec="seconds"))
    if status in NON_ACTIONABLE:return ("manual",None)
    if status in SUCCEEDED:
        prev=at_time(record.get("last_attempt_at"))
        if prev is None or now is None:return ("manual",None)
        due=prev+timedelta(days=RECHECK_DAYS)
        return ("revisit" if now>=due else "current",due.isoformat(timespec="seconds"))
    return ("manual",None)

def plan(state,at,limit=4):
    """No mutations. Only the active manifest's official records may be scheduled."""
    validate_public(state)
    if type(limit) is not int or not 0<=limit<=4:raise ValueError("max 4 document downloads")
    now=at_time(at)
    if not now:raise ValueError("timezone-aware run date required")
    active=active_ids(state)
    records=[]
    counts={key:0 for key in REASONS}
    for rid in sorted(state["records"]):
        r=state["records"][rid]
        decision,due=classify(r,now,rid in active)
        counts[decision]+=1
        if decision=="inactive":continue
        records.append({"id":rid,"program_id":r["program_id"],"status":r.get("status"),
                        "decision":decision,"reason":REASONS[decision],
                        "retry_after":due,"last_attempt_at":timestamp(r.get("last_attempt_at")),
                        "last_success_at":timestamp(r.get("last_success_at")),
                        "previous_extraction_kept":bool(r.get("extraction")),
                        "review_required":r.get("review_required") is True})
    candidates={kind:sorted([x for x in records if x["decision"]==kind],
                             key=lambda x:(x["last_attempt_at"] or "",x["id"]))
                for kind in ("queued","retry_due","revisit")}
    # Give one retry a reserved slot without starving new attachments.
    selected=[]
    if limit and candidates["retry_due"] and (limit>=2 or not candidates["queued"]):
        selected.append(candidates["retry_due"].pop(0))
    for kind in ("queued","retry_due","revisit"):
        for item in candidates[kind]:
            if len(selected)>=limit:break
            selected.append(item)
    # No URL/token/content in public output. Keep a small bounded review list.
    issues=[x for x in records if x["decision"] in {"retry_due","retry_wait","manual"}]
    issues.sort(key=lambda x:({"retry_due":0,"retry_wait":1,"manual":2}[x["decision"]],
                              x["last_attempt_at"] or "",x["id"]))
    return {"schema":SCHEMA,"version":VERSION,"generated_at":now.isoformat(timespec="seconds"),
            "source_run_at":timestamp(state.get("run",{}).get("at")),
            "limits":{"notice_pages_per_run":3,"file_attempts_per_run":4,
                      "reserve_retry_slots":1,"success_recheck_days":RECHECK_DAYS},
            "counts":counts,"active_records":len(active),
            "selected":[dict(x) for x in selected],
            "issues":[dict(x) for x in issues[:25]],
            "issues_truncated":len(issues)>25,
            "scope":"현재 확인된 원문 첨부 링크만 재조회. 인식 실패·403·크기·보호 파일은 자동 우회하지 않음. 본문 추출은 적격성 검증 아님."}

ROOT=Path(__file__).resolve().parents[1]
def generate(root=ROOT):
    base=Path(root)
    src=json.loads((base/"data/attachments.json").read_text(encoding="utf-8"))
    generated=plan(src,src["run"]["at"],limit=4)
    dest=base/"data/attachment_recovery.json"
    dest.write_text(json.dumps(generated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return generated

def validate_output(root=ROOT):
    base=Path(root)
    src=json.loads((base/"data/attachments.json").read_text(encoding="utf-8"))
    stored=json.loads((base/"data/attachment_recovery.json").read_text(encoding="utf-8"))
    expected=plan(src,src["run"]["at"],4)
    if stored!=expected:raise ValueError("Attachment recovery audit is stale or altered")
    if len(stored["selected"])>4 or len(stored["issues"])>25:raise ValueError("recovery limits")
    return True
if __name__=="__main__":
    x=generate()
    print(json.dumps({"status":"recovery_queue_prepared","counts":x["counts"],
                      "next_attempts":len(x["selected"]),"model_calls":0},ensure_ascii=False))
