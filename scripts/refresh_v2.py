#!/usr/bin/env python3
"""Paginated public discovery + bounded HTML evidence. Never submits applications."""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import time
from html.parser import HTMLParser
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from radar_core import VERSION, KST, official_url, collect_pages, merge, clean

ROOT = Path(__file__).resolve().parents[1]
API = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
HEADERS = {"User-Agent": "AI-Funding-Radar/0.2 (public announcement research; no application submission)", "Accept": "text/html,application/rss+xml,application/xml"}


def read(path, fallback=None):
    if not path.exists() and fallback is not None:
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


class GuardRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # API query credentials must never follow a redirect.
        if "crtfcKey=" in req.full_url or not official_url(newurl):
            raise ValueError("redirect_blocked")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, api_request=False):
    if api_request:
        if urlparse(url)._replace(query="").geturl() != API:
            raise ValueError("invalid_api_destination")
    elif not official_url(url):
        raise ValueError("unapproved_source")
    for attempt in range(2):
        try:
            with build_opener(GuardRedirect()).open(Request(url, headers=HEADERS), timeout=18) as resp:
                raw = resp.read(4_000_001)
                if len(raw) > 4_000_000:
                    raise ValueError("response_too_large")
                return raw, resp.headers.get_content_type(), resp.geturl(), resp.headers.get_content_charset() or "utf-8"
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt:
                raise
            time.sleep(1)
        except (TimeoutError, OSError):
            if attempt:
                raise
            time.sleep(1)
    raise RuntimeError("unreachable")


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignored = 0
        self.text = []
        self.links = []
        self.current_link = None
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "header", "footer", "noscript"):
            self.ignored += 1
        if tag == "title":
            self.in_title = True
        if tag == "a" and not self.ignored:
            self.current_link = [dict(attrs).get("href", ""), []]

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "header", "footer", "noscript"):
            self.ignored = max(0, self.ignored - 1)
        if tag == "title":
            self.in_title = False
        if tag == "a" and self.current_link:
            self.links.append((self.current_link[0], " ".join(self.current_link[1])))
            self.current_link = None

    def handle_data(self, text):
        if self.in_title:
            self.title.append(text)
        if not self.ignored:
            self.text.append(text)
            if self.current_link:
                self.current_link[1].append(text)


def inspect_page(raw, url, expected_title, charset="utf-8"):
    parser = PageText()
    parser.feed(raw.decode(charset, errors="replace"))
    text = clean(" ".join(parser.text), 600000)
    # Reject a portal/login/error page returning HTTP 200. Do not bypass access controls.
    tokens = [t for t in re.findall(r"[가-힣A-Za-z]{2,}", expected_title) if t not in ("지원사업", "참여기업", "모집공고", "공고", "모집", "지원", "기업", "추가")]
    # Two-character technical terms (AI, 기술, 창업) are meaningful in Korean titles.
    identity = sum(t.casefold() in text.casefold() for t in set(tokens))
    if len(text) < 120 or identity < min(2, len(set(tokens))) or not tokens:
        raise ValueError("notice_identity_not_confirmed")
    attachments = []
    for href, label in parser.links:
        target = urljoin(url, href)
        if official_url(target) and re.search(r"\.pdf|\.hwp|\.hwpx|getImageFile|FileDown|download|첨부|다운로드", href + " " + label, re.I):
            if target not in [a["url"] for a in attachments]:
                attachments.append({"url": target, "name": clean(label, 160) or "첨부 링크", "status": "link_only_not_read"})
    # No page body or personal contact details are copied into the public repository.
    return {"body_sha256": hashlib.sha256(text.encode()).hexdigest(), "characters": len(text),
            "page_title": clean(" ".join(parser.title), 160), "attachments": attachments[:10],
            "level": "html_retrieved_not_eligibility_verified"}


def update_evidence(programs, evidence, at, fetcher=fetch, limit=6):
    records = evidence.setdefault("records", {})
    candidates = [p for p in programs["items"] if p["mode"] in ("discovery", "beneficiary", "operator") and official_url(p["source"])]
    today = at[:10]
    # Rotate within active and recently expired notices. Old closed notices do not starve live ones.
    def order(p):
        expired = bool(p.get("deadline") and p["deadline"][:10] < today)
        return (expired, records.get(p["id"], {}).get("last_attempt_at", ""), p.get("deadline") or "9999")
    candidates.sort(key=order)
    success = failed = changed = 0
    for p in candidates[:limit]:
        old = records.get(p["id"], {})
        entry = dict(old, source=p["source"], last_attempt_at=at)
        try:
            raw, typ, final, charset = fetcher(p["source"])
            if typ not in ("text/html", "application/xhtml+xml"):
                raise ValueError("html_expected_attachment_not_read")
            info = inspect_page(raw, final, p["title"], charset)
            is_changed = bool(old.get("body_sha256") and old["body_sha256"] != info["body_sha256"])
            entry.update(info, status="content_changed_review_required" if is_changed else "html_available",
                         last_success_at=at, last_error=None)
            if is_changed:
                entry["previous_sha256"] = old["body_sha256"]
                entry["change_detected_at"] = at
                changed += 1
            # Change requires explicit review; a later unchanged fetch does not clear it.
            entry["review_required"] = bool(old.get("review_required") or is_changed)
            success += 1
        except Exception as exc:
            entry.update(status="fetch_failed", last_error=type(exc).__name__)
            failed += 1
        records[p["id"]] = entry
        time.sleep(0.15)
    evidence["generated_at"] = at
    evidence["run"] = {"attempted": success + failed, "success": success, "failed": failed, "content_changed": changed,
                       "eligible_records": len(candidates), "scope": "최대 6개 원문 HTML 순환 열람; 첨부 본문·자격 자동 검증 아님"}
    return evidence


def main():
    programs_path, monitor_path = ROOT / "data/programs.json", ROOT / "data/monitor.json"
    known = read(programs_path)
    monitor = read(monitor_path)
    reviews_path, evidence_path = ROOT / "data/change_reviews.json", ROOT / "data/evidence.json"
    reviews = read(reviews_path, {"schema": "public-funding-reviews/v1", "items": []})
    evidence = read(evidence_path, {"schema": "public-funding-evidence/v1", "records": {}})
    now = dt.datetime.now(KST)
    at = now.isoformat(timespec="seconds")
    key = os.getenv("BIZINFO_API_KEY", "").strip()
    sources = monitor.setdefault("sources", {})
    prior = sources.get("bizinfo_api", {})
    api = dict(prior, last_attempt_at=at)
    result = known
    # Compatibility: preserve the independent editorial review timestamp from legacy events.
    if "editorial" not in sources:
        editorial = next((e for e in monitor.get("events", []) if "상세 공고" in e.get("message", "")), None)
        if editorial:
            sources["editorial"] = {"last_attempt_at": editorial["at"], "status": "historical_editorial_record",
                                      "message": editorial["message"]}
    if not key:
        api.update(status="needs_api_key", checked_count=0, coverage_complete=False, changed_count=None,
                   errors=["credential_not_configured"])
    else:
        def get_page(index, size):
            params = {"crtfcKey": key, "dataType": "rss", "searchCnt": "0", "pageUnit": str(size), "pageIndex": str(index)}
            return fetch(API + "?" + urlencode(params), api_request=True)[0]
        incoming, scan = collect_pages(get_page, now.date())
        if scan["checked_count"] or scan["coverage_complete"]:
            result, reviews, counts = merge(known, incoming, reviews, at)
            changes = counts["added"] + counts["modified"] + counts["suggested"]
            status = ("ok_changed" if changes else "ok_no_change") if scan["coverage_complete"] else "partial"
            api.update(scan, **counts, status=status, changed_count=changes, last_partial_success_at=at)
            if scan["coverage_complete"]:
                api["last_success_at"] = at
            write(programs_path, result)
            write(reviews_path, reviews)
        else:
            api.update(scan, status="request_failed", changed_count=None)
    evidence = update_evidence(result, evidence, at)
    write(evidence_path, evidence)
    run = evidence["run"]
    sources["html_evidence"] = {"status": "partial" if run["failed"] else "ok", "last_attempt_at": at, **run}
    sources["bizinfo_api"] = api
    status = api["status"]
    message = (f"기업마당 {api.get('checked_count', 0)}건 / {api.get('pages', 0)}페이지 · 추가 {api.get('added', 0)} · 수정 {api.get('modified', 0)} · 변경 검토 {api.get('suggested', 0)}"
               f" · 수집범위 {'API 제공범위 완료' if api.get('coverage_complete') else '부분/실패'} · 원문 HTML {run['success']}성공/{run['failed']}실패 (첨부·적격성 미검증)")
    monitor.update(engine_version=VERSION, status=status, last_attempt_at=at,
                   checked_count=api.get("checked_count", 0), changed_count=api.get("changed_count"), message=message)
    if status in ("ok_changed", "ok_no_change"):
        monitor["last_success_at"] = at
    monitor.setdefault("events", []).insert(0, {"at": at, "status": status, "changed": api.get("changed_count"), "message": message, "source": "bizinfo_api_and_html"})
    monitor["events"] = monitor["events"][:60]
    write(monitor_path, monitor)
    print(json.dumps({"version": VERSION, "api_status": status, "checked": api.get("checked_count"), "html": run}, ensure_ascii=False))
    return 0 if status in ("ok_changed", "ok_no_change") else 2


if __name__ == "__main__":
    raise SystemExit(main())
