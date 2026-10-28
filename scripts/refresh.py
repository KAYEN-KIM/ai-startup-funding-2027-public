#!/usr/bin/env python3
"""Update ONLY public government funding metadata using the official Bizinfo API.

No personal/company/application information is requested, loaded, or committed.
A missing key, malformed response, or network failure NEVER deletes known records.
"""
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PROGRAMS = ROOT / "data" / "programs.json"
MONITOR = ROOT / "data" / "monitor.json"
KST = dt.timezone(dt.timedelta(hours=9))
API_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
AI_TITLE = re.compile(r"인공지능|(?<![a-z])ai(?![a-z])|(?<![a-z])ax(?![a-z])|초격차|딥테크|saas|데이터바우처|gpu|llm|머신러닝|생성형|피지컬\s*ai|디지털\s*혁신", re.I)
# Generic 'startup'/'R&D' in a long description is NOT sufficient for AI relevance.
OPERATOR = re.compile(r"주관기관\s*모집|운영기관\s*모집|전담기관\s*모집|수행기관\s*모집")
BUDGET = re.compile(r"예산안|예산편성|예산\s*요구")
ALLOWED_ROOT = "bizinfo.go.kr"

def read_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)

def atomic_write(path, data):
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temp.replace(path)

def clean_text(v):
    s = html.unescape(re.sub(r"<[^>]+>", " ", str(v or "")))
    return re.sub(r"\s+", " ", s).strip()[:600]

def safe_official_url(raw, seq):
    try:
        parsed = urlparse(str(raw or ""))
        if parsed.scheme == "https" and (parsed.hostname == ALLOWED_ROOT or (parsed.hostname or "").endswith("." + ALLOWED_ROOT)):
            return parsed.geturl()
    except ValueError:
        pass
    return "https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=" + seq

def parse_range(v):
    # The API can return 20261028, 2026-10-28, 2026.10.28 or 2026년 10월 28일.
    # Never invent a closing date when only one date is present.
    values = re.findall(r"(?<!\d)20\d{2}(?:[-./년\s]*\d{1,2}[-./월\s]*\d{1,2}일?|\d{4})(?!\d)", str(v or ""))
    dates = []
    for raw in values:
        nums = re.findall(r"\d+", raw)
        try:
            if len(nums) == 1 and len(nums[0]) == 8:
                dates.append(dt.datetime.strptime(nums[0], "%Y%m%d").date())
            elif len(nums) == 3:
                dates.append(dt.date(int(nums[0]), int(nums[1]), int(nums[2])))
        except ValueError:
            continue
    if len(dates) == 1:
        return dates[0].isoformat(), None
    if len(dates) < 2 or dates[1] < dates[0]:
        return None, None
    return dates[0].isoformat(), dates[1].isoformat()

def convert_xml(xml_data, today):
    root = ET.fromstring(xml_data)
    elems = root.findall(".//channel/item")
    if not elems:
        raise ValueError("공식 API에 item이 없어 정상 결과로 처리하지 않음")
    records = []
    for item in elems:
        fields = {c.tag.rsplit("}", 1)[-1]: (c.text or "") for c in item}
        title = clean_text(fields.get("pblancNm") or fields.get("title"))
        desc = clean_text(fields.get("bsnsSumryCn") or fields.get("description"))
        if not title or not AI_TITLE.search(title):
            continue
        seq = clean_text(fields.get("pblancId") or fields.get("seq"))
        if not re.fullmatch(r"PBLN_[0-9]{9,22}", seq):
            continue
        open_at, close_at = parse_range(fields.get("reqstBeginEndDe") or fields.get("reqstDt"))
        year_candidates = re.findall(r"20(?:26|27)", title)
        year = int(year_candidates[0]) if year_candidates else today.year
        if OPERATOR.search(title):
            mode = "operator"
        elif BUDGET.search(title):
            mode = "budget"
        else:
            mode = "discovery"  # API index alone is not a verified applicant-side opportunity.
        url = safe_official_url(fields.get("pblancUrl") or fields.get("link"), seq)
        records.append({
            "id": "BIZINFO-" + seq,
            "title": title,
            "year": year,
            "kind": clean_text(fields.get("pldirSportRealmLclasCodeNm") or fields.get("lcategory")) or "공식 공고",
            "mode": mode,
            "opens": open_at,
            "deadline": close_at,
            "source": url,
            "verified_at": today.isoformat(),
            "amount": "지원금액 · 공고 원문 확인 필요",
            "eligibility": clean_text(fields.get("trgetNm")) or "상세 공고 원문에서 신청자격 확인",
            "note": "기업마당 API 목록에서 자동 발견. 실제 신청대상·지원금·마감시각·중복수혜는 공고 원문 확인 전까지 미확정.",
            "source_level": "official_api_index_not_full_application_verified",
        })
    return records, len(elems)

def prune_api_false_positives(known):
    """Keep curator-verified entries; remove unrelated auto-discovered titles only.

    Never called on an API failure. These were provisional index leads,
    not confirmed awards or user data.
    """
    before = len(known["items"])
    known["items"] = [
        p for p in known["items"]
        if p.get("source_level") != "official_api_index_not_full_application_verified"
        or AI_TITLE.search(p["title"])
    ]
    return before - len(known["items"])

def merge_records(known, updates):
    items = known["items"]
    by_id = {p["id"]: p for p in items}
    by_official_id = {}
    for p in items:
        m = re.search(r"PBLN_\d{9,22}", p.get("source", ""))
        if m: by_official_id[m.group(0)] = p
    new_count, changed_count = 0, 0
    for incoming in updates:
        official = incoming["id"].removeprefix("BIZINFO-")
        old = by_id.get(incoming["id"]) or by_official_id.get(official)
        if old:
            # Preserve curator-verified manual copy. Update only if it was first API-imported.
            if old.get("source_level") == "official_api_index_not_full_application_verified":
                modified = False
                for key in ("title","year","kind","mode","opens","deadline","source","eligibility"):
                    if incoming.get(key) != old.get(key):
                        old[key] = incoming[key]
                        modified = True
                if modified:
                    old["verified_at"] = incoming["verified_at"]
                    changed_count += 1
        else:
            items.append(incoming)
            by_id[incoming["id"]] = incoming
            by_official_id[official] = incoming
            new_count += 1
    return new_count, changed_count

def main():
    known = read_json(PROGRAMS)
    monitor = read_json(MONITOR)
    now = dt.datetime.now(KST)
    today = now.date()
    monitor["last_attempt_at"] = now.isoformat(timespec="seconds")
    key = os.getenv("BIZINFO_API_KEY", "").strip()
    try:
        if not key:
            monitor["status"] = "needs_api_key"
            monitor["message"] = "정기 확인은 실행됐으나 기업마당 공식 API 인증키가 설정되지 않아 신규 공고를 조회하지 못했습니다."
            monitor["changed_count"] = None
            monitor["checked_count"] = 0
        else:
            params = {"crtfcKey": key, "dataType": "rss", "searchCnt": "250"}
            req = Request(API_URL + "?" + urlencode(params), headers={"User-Agent": "PublicFundingRadar/1.0 (+official funding discovery)", "Accept": "application/xml, text/xml, application/rss+xml"})
            with urlopen(req, timeout=40) as resp:
                if resp.status != 200:
                    raise ValueError("공식 API HTTP 상태 " + str(resp.status))
                raw = resp.read(3_000_001)
                if len(raw) > 3_000_000:
                    raise ValueError("API 응답 크기 초과")
            updates, fetched = convert_xml(raw, today)
            removed_count = prune_api_false_positives(known)
            new_count, changed_count = merge_records(known, updates)
            changed = new_count + changed_count + removed_count
            monitor["status"] = "ok_changed" if changed else "ok_no_change"
            monitor["message"] = (
                "공식 API "+str(fetched)+"건 확인 · AI 관련 제목 후보 "+str(len(updates))
                +"건 · 추가 "+str(new_count)+"건 · 수정 "+str(changed_count)
                +"건 · 비관련 자동후보 정리 "+str(removed_count)+"건"
                +" (신규 후보는 원문 적격성 검토 필요)"
            )
            monitor["last_success_at"] = now.isoformat(timespec="seconds")
            monitor["checked_count"] = fetched
            monitor["changed_count"] = changed
            if changed:
                known["generated_at"] = now.isoformat(timespec="seconds")
                atomic_write(PROGRAMS, known)
    except Exception as exc:
        monitor["status"] = "request_failed"
        monitor["message"] = "공식 API 조회·해석 실패: " + type(exc).__name__ + ". 기존 검증 기록은 보존했습니다."
        monitor["changed_count"] = None
        monitor["checked_count"] = 0
        print(monitor["message"], file=sys.stderr)
    monitor.setdefault("events", [])
    monitor["events"].insert(0, {
        "at": now.isoformat(timespec="seconds"),
        "status": monitor["status"],
        "changed": monitor.get("changed_count"),
        "message": monitor["message"]
    })
    monitor["events"] = monitor["events"][:21]
    atomic_write(MONITOR, monitor)
    print(json.dumps({"status": monitor["status"], "checked": monitor["checked_count"], "changed": monitor["changed_count"]}, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
