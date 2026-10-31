"""P0.21: bounded form-heading extraction candidates from local official-form copies.
No AI. No network. Never verifies the authority, form edition or applicant eligibility.
"""
from __future__ import annotations
import hashlib
import re
from datetime import datetime, timezone
from attachment_core import (
    MAX_FILE, ExtractError, detect_format, parse_pdf, parse_hwpx, parse_hwp,
    sha, normalized, mask_contacts, approved_url
)

SCHEMA = "local-form-outline-candidates/v1"
MAX_HEADINGS = 40
MAX_UNIT = 6000
MAX_OUTLINE_LINE = 140
NUMBERED = re.compile(
    r"^(?:(?:제\s*\d{1,2}\s*[장절항])|(?:\d{1,3}(?:[.-]\d{1,3}){0,3}\s*[.)．]?)|"
    r"(?:[가-하]\s*[.)])|(?:\([0-9]{1,2}\))|(?:[①-⑳]))\s*"
    r"(?P<title>[^\n]{2,100})$", re.UNICODE
)
UNNUMBERED = re.compile(
    r"^(?:문제인식|창업아이템(?:의)?\s*실현가능성|기술(?:개발)?\s*계획|"
    r"사업화\s*계획|시장\s*(?:분석|진입|확대)|성장\s*전략|비즈니스\s*모델|"
    r"팀\s*(?:구성|역량)|추진\s*(?:계획|일정)|"
    r"소요\s*예산|사업비\s*(?:구성|집행|산출)|예산\s*계획|"
    r"자기\s*부담|제출\s*서류|유의\s*사항|"
    r"지식재산권|보안\s*계획|기술\s*차별성|실증\s*계획)$",
    re.IGNORECASE
)
TERMINAL = re.compile(r"[.!?。]\s*$")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")
CONTACT = re.compile(r"\[연락처 생략\]|\[식별번호 생략\]")
GENERATED_NOTE = (
    "모든 항목은 미검증 후보입니다. 공식 양식·표·페이지·수정일을 직접 비교해야 하며 "
    "자동 승인 또는 제출 가능 판정에 사용하지 않습니다."
)

def heading_from_unit(text: str):
    """Return (title, reason) only for short plausible title-only lines."""
    text = normalized(text)
    if not text or len(text) > MAX_OUTLINE_LINE or CONTROL.search(text):
        return None
    if len(text.split()) > 14 or TERMINAL.search(text):
        # A line ending in a full stop is probably narrative, not a form heading.
        return None
    sanitized, redacted = mask_contacts(text)
    if redacted or CONTACT.search(sanitized) or "@" in text:
        return None
    matched = NUMBERED.fullmatch(text)
    if matched:
        title = matched.group("title").strip()
        if len(title) < 2 or len(title) > 100:
            return None
        return (text, "numbered")
    if UNNUMBERED.fullmatch(text):
        return (text, "known_heading")
    return None

def infer_lines(units, original_sha, fmt, parser, source_url="", file_label="", partial=False):
    if not re.fullmatch(r"[a-f0-9]{64}",original_sha):
        raise ValueError("file sha256 required")
    if fmt not in ("pdf","hwp","hwpx"):
        raise ValueError("unknown file type")
    if source_url and not approved_url(source_url):
        raise ValueError("source URL must be an allowlisted official HTTPS URL, without access tokens")
    if len(file_label) > 160 or "\n" in file_label or "\r" in file_label:
        raise ValueError("file label too long")
    unique=set()
    records=[]
    scanned=0
    for unit in units:
        scanned+=1
        if scanned > MAX_UNIT:
            raise ExtractError("size_limit")
        locator=str(unit.get("locator",""))
        for n,raw in enumerate(str(unit.get("text","")).splitlines(),1):
            hit=heading_from_unit(raw)
            if hit is None:
                continue
            title,reason=hit
            # Do not conflate distinct repeated headings; location is material.
            key=(title,locator,n)
            if key in unique:
                continue
            unique.add(key)
            records.append({
                "id":"H"+str(len(records)+1),
                "heading":title,
                "locator":locator if len(str(unit.get("text","")).splitlines())<=1 else locator+" / subline "+str(n),
                "reason":reason,
                "status":"candidate_unverified"
            })
            if len(records)>=MAX_HEADINGS:
                break
        if len(records)>=MAX_HEADINGS:
            break
    return {
        "schema":SCHEMA,
        "created_at":datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "document":{
            "sha256":original_sha,"format":fmt,"file_label":file_label,
            "source_url":source_url,"source_status":"self_supplied_unverified",
            "parser":parser,"partial_text":bool(partial)
        },
        "candidates":records,
        "scanned_units":scanned,
        "truncated_candidates":len(records)>=MAX_HEADINGS,
        "note":GENERATED_NOTE
    }

def extract_outline(raw, source_url="", file_label=""):
    if len(raw)>MAX_FILE:
        raise ExtractError("size_limit")
    fmt=detect_format(raw)
    units, info = {"pdf":parse_pdf,"hwpx":parse_hwpx,"hwp":parse_hwp}[fmt](raw)
    return infer_lines(
        units,sha(raw),fmt,info["parser"],source_url,file_label,
        partial=bool(info["partial"])
    )
