#!/usr/bin/env python3
"""Fail closed if private data accidentally leaks into the public records."""
import json
from pathlib import Path
from urllib.parse import urlparse
ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "data/programs.json").read_text(encoding="utf-8"))
monitor = json.loads((ROOT / "data/monitor.json").read_text(encoding="utf-8"))
assert data.get("schema") == "public-funding-radar/v1"
assert monitor.get("schema") == "public-funding-monitor/v1"
items = data["items"]
assert isinstance(items, list) and items
ids = [p["id"] for p in items]
assert len(ids) == len(set(ids)), "Duplicate program IDs"
for p in items:
    for required in ("id", "title", "year", "mode", "kind", "source"):
        assert p.get(required), "Missing %s in %s" % (required, p.get("id"))
    assert p["year"] in (2026, 2027, 2028)
    assert p["mode"] in ("beneficiary", "discovery", "reference", "operator", "budget")
    src = urlparse(p["source"])
    assert src.scheme == "https" and src.hostname and (src.hostname.endswith(".go.kr") or src.hostname.endswith(".or.kr") or src.hostname.endswith(".kr")), p["source"]
    if p["mode"] == "reference":
        assert p["year"] == 2026, "Historical conditions must not become confirmed 2027 grants"
private_patterns = ("resident_number", "taxpayer_id", "company_profile", "applicant_memo", "access_token", "secret_key", "bank_account", "jumin", "jwt")
blob = json.dumps({"items": items, "monitor": monitor}, ensure_ascii=False).lower()
for pattern in private_patterns:
    assert pattern not in blob, "Private field marker: " + pattern
print("Public data validation OK:", len(items), "records")
