"""P0.2 public evidence/discovery contract. Pure functions, no credentials or I/O."""
from __future__ import annotations
import copy
import datetime as dt
import hashlib
import html
import json
import re
from urllib.parse import urlparse, parse_qsl
from xml.etree import ElementTree as ET

VERSION = "0.2.0"
KST = dt.timezone(dt.timedelta(hours=9))
OFFICIAL_HOSTS = ("bizinfo.go.kr", "mss.go.kr", "k-startup.go.kr", "nipa.kr", "kocca.kr", "iris.go.kr", "kosmes.or.kr", "kdata.or.kr", "culture.go.kr", "korea.kr", "work24.go.kr", "nts.go.kr", "rnd.or.kr", "koita.or.kr", "seoul.rnbd.kr")
SECRET_KEYS = {"crtfcKey", "serviceKey", "api_key", "token", "access_token", "password", "secret"}
AI = re.compile(r"인공지능|(?<![a-z])ai(?![a-z])|(?<![a-z])ax(?![a-z])|초격차|딥테크|saas|데이터바우처|gpu|llm|머신러닝|생성형|디지털\s*혁신", re.I)
STARTUP = re.compile(r"예비창업|초기창업|창업도약|창업패키지|창업사관|청년창업|창업중심대학|디딤돌|(?<![a-z])tips(?![a-z])|(?<![a-z])dips(?![a-z])|jump.?up|ibk.*창공|창업.*(?:지원|모집|투자|사업)", re.I)
OPERATOR = re.compile(r"(?:주관|운영|전담)\s*기관.*(?:모집|선정)|창업도시\s*모집")
BUDGET = re.compile(r"예산안|예산편성|예산\s*요구")
ID_RE = re.compile(r"PBLN_\d{9,22}")
DATE_RE = re.compile(r"(?<!\d)(20\d{2})(?:[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})일?|(\d{2})(\d{2}))(?!\d)")
AUTO_LEVEL = "official_api_index_not_full_application_verified"


def official_url(value):
    if not isinstance(value, str) or any(ord(c) < 32 for c in value):
        return False
    try:
        u = urlparse(value)
        host = (u.hostname or "").lower()
        return (u.scheme == "https" and u.port in (None, 443) and not u.username and not u.password
                and any(host == h or host.endswith("." + h) for h in OFFICIAL_HOSTS)
                and not any(k.casefold() in {s.casefold() for s in SECRET_KEYS} for k, _ in parse_qsl(u.query)))
    except (ValueError, TypeError):
        return False


def clean(value, limit=600):
    text = html.unescape(re.sub(r"<[^>]*>", " ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def dates_in(text):
    result = []
    for match in DATE_RE.finditer(str(text or "")):
        y, m, d, cm, cd = match.groups()
        try:
            day = dt.date(int(y), int(m or cm), int(d or cd))
            result.append((day, match.end()))
        except ValueError:
            continue
    return result


def parse_period(text):
    raw = str(text or "")
    dates = dates_in(raw)
    if not dates:
        return None, None, "unknown"
    if len(dates) < 2:
        # A lone date could be a deadline or a start; do not invent either.
        return None, None, "unknown"
    first, last = dates[0][0], dates[1][0]
    if last < first:
        return None, None, "unknown"
    suffix = raw[dates[1][1]:]
    clock = re.match(r"\s*(?:\([^)]{1,4}\))?\s*(\d{1,2})\s*[:시]\s*(\d{2})?", suffix)
    if clock:
        try:
            stamp = dt.datetime.combine(last, dt.time(int(clock[1]), int(clock[2] or 0)), KST)
            return first.isoformat(), stamp.isoformat(timespec="seconds"), "datetime"
        except ValueError:
            pass
    return first.isoformat(), last.isoformat(), "date"


def relevance(title):
    if AI.search(title):
        return "ai"
    if STARTUP.search(title):
        return "startup_general"
    return None


def fields_from_xml(raw):
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("unsafe_xml")
    root = ET.fromstring(raw)
    for element in root.iter():
        element.tag = element.tag.rsplit("}", 1)[-1]
    channel = root.find("channel")
    if root.tag != "rss" or channel is None:
        raise ValueError("not_official_rss")
    items = [{c.tag: "".join(c.itertext()) for c in item} for item in channel.findall("item")]
    totals = [int(v) for v in ([channel.findtext("totCnt", "")] + [i.get("totCnt", "") for i in items]) if str(v).isdigit()]
    total = max(totals) if totals else None
    if not items and total != 0:
        # Empty page is only trusted by the pager after a known total is reached.
        return [], total
    return items, total


def record_from_fields(f, today):
    title = clean(f.get("pblancNm") or f.get("title"))
    lane = relevance(title)
    ident = clean(f.get("pblancId") or f.get("seq"))
    if not lane or not ID_RE.fullmatch(ident):
        return None
    years = sorted({int(y) for y in re.findall(r"(?<!\d)(20\d{2})(?!\d)", title)})
    period = clean(f.get("reqstBeginEndDe") or f.get("reqstDt"))
    start, end, precision = parse_period(period)
    raw_url = f.get("pblancUrl") or f.get("link")
    source = raw_url if official_url(raw_url) else "https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=" + ident
    attachments = []
    for path_key, name_key in (("flpthNm", "fileNm"), ("printFlpthNm", "printFileNm")):
        url = f.get(path_key, "").strip()
        if official_url(url) and url not in [a["url"] for a in attachments]:
            attachments.append({"url": url, "name": clean(f.get(name_key), 160), "status": "link_only_not_read"})
    return {"id": "BIZINFO-" + ident, "title": title,
            "year": years[0] if years else today.year, "years": years,
            "year_basis": "title" if years else "collection_year_inferred",
            "kind": clean(f.get("pldirSportRealmLclasCodeNm") or f.get("lcategory")) or "공식 공고",
            "mode": "operator" if OPERATOR.search(title) else "budget" if BUDGET.search(title) else "discovery",
            "relevance": lane, "opens": start, "deadline": end, "deadline_precision": precision,
            "application_period_raw": period, "source": source, "verified_at": today.isoformat(),
            "amount": "지원금액 · 공고 원문 확인 필요",
            "eligibility": clean(f.get("trgetNm")) or "상세 공고 원문에서 신청자격 확인",
            "note": "공식 API 목록 발견. 신청자격·지원금·첨부 조건은 검증 전입니다.",
            "source_level": AUTO_LEVEL, "agency": clean(f.get("jrsdInsttNm") or f.get("author"), 160),
            "attachments": attachments}


def collect_pages(fetch_page, today, page_size=200, max_pages=10):
    """Bounded pagination with duplicate-page detection. Partial != unchanged."""
    seen = set()
    candidates = {}
    total = None
    failures = []
    complete = False
    pages = 0
    for index in range(1, max_pages + 1):
        try:
            raw = fetch_page(index, page_size)
            rows, count = fields_from_xml(raw)
            pages += 1
            if count is not None:
                total = max(total or 0, count)
            ids = {str(r.get("pblancId") or r.get("seq", "")) for r in rows}
            ids = {i for i in ids if ID_RE.fullmatch(i)}
            if not rows:
                if total == 0 or (total is not None and len(seen) >= total):
                    complete = True
                else:
                    failures.append("empty_page_without_total_proof")
                break
            if not ids or not (ids - seen):
                failures.append("repeated_or_invalid_page")
                break
            seen.update(ids)
            for row in rows:
                r = record_from_fields(row, today)
                if r:
                    candidates[r["id"]] = r
            if total is not None and len(seen) >= total:
                complete = True
                break
            if len(rows) < page_size and total is None:
                # No total means coverage is bounded, never declared exhaustive.
                break
        except Exception as exc:
            failures.append(type(exc).__name__)
            break
    if not complete and not failures:
        failures.append("bounded_window_not_exhaustive")
    return list(candidates.values()), {"pages": pages, "checked_count": len(seen), "reported_total": total,
            "coverage_complete": complete, "errors": failures, "candidate_count": len(candidates),
            "scope": "기업마당 API 제공 범위; 정부 전체 공고를 뜻하지 않음"}


def same_value(key, old, new):
    # A date-only API value must not erase manually verified cutoff time.
    if key in ("opens", "deadline") and old and new:
        if str(old)[:10] == str(new)[:10] and len(str(new)) == 10:
            return True
    return old == new


def merge(known, incoming, review_doc, at):
    result, review_doc = copy.deepcopy(known), copy.deepcopy(review_doc)
    by_id = {x["id"]: x for x in result["items"]}
    by_source = {}
    for r in result["items"]:
        m = ID_RE.search(r.get("source", ""))
        if m:
            by_source[m[0]] = r
    reviews = {r["id"]: r for r in review_doc.setdefault("items", [])}
    added = modified = suggested = 0
    for row in incoming:
        m = ID_RE.search(row["source"])
        old = by_id.get(row["id"]) or by_source.get(m[0] if m else "")
        if old is None:
            result["items"].append(row)
            by_id[row["id"]] = row
            if m:
                by_source[m[0]] = row
            added += 1
            continue
        is_auto = old.get("source_level") == AUTO_LEVEL and old.get("mode") == "discovery"
        changed = False
        keys = ("title", "opens", "deadline", "eligibility") if not is_auto else ("title", "year", "years", "year_basis", "kind", "mode", "relevance", "opens", "deadline", "deadline_precision", "application_period_raw", "agency", "attachments", "eligibility")
        for key in keys:
            value = row.get(key)
            if value is None or value == "" or same_value(key, old.get(key), value):
                continue
            if is_auto:
                old[key] = value
                changed = True
            else:
                # Never overwrite a human-verified condition with API metadata.
                fingerprint = hashlib.sha256(json.dumps([old["id"], key, old.get(key), value], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
                if fingerprint not in reviews:
                    reviews[fingerprint] = {"id": fingerprint, "program_id": old["id"], "field": key,
                        "previous": old.get(key), "observed": value, "source": row["source"],
                        "observed_at": at, "status": "pending", "kind": "api_difference_review_required"}
                    suggested += 1
        if changed:
            old["verified_at"] = at[:10]
            modified += 1
    review_doc["items"] = list(reviews.values())
    review_doc["generated_at"] = at
    if added or modified:
        result["generated_at"] = at
    return result, review_doc, {"added": added, "modified": modified, "suggested": suggested}
