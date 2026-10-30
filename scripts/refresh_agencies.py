#!/usr/bin/env python3
"""P0.16 bounded public RSS/HTML bot. No credentials, model calls or private input.
Two enabled sources only. Failed pages retain prior observations. Does not modify
programs.json, reviewed rules, application files or existing collector timestamps.
"""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime
import html
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit, parse_qsl, urlunsplit, urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from agency_core import (SOURCES, SCHEMA, KST, SCOPE, empty_document, parse_listing,
                         merge_rows, validate_document, digest)

ROOT = Path(__file__).resolve().parents[1]
UA = 'FundingRadarBot/0.16 (+public-read-only)'
DATA = 'data/agency_discovery.json'
REPORT = 'data/agency_report.md'


def page_url(agency, page):
    spec = SOURCES[agency]
    if type(page) is not int or not 1 <= page <= spec['pages']:
        raise ValueError('page_bound')
    u = urlsplit(spec['url'])
    if agency == 'nipa':
        q = dict(parse_qsl(u.query, keep_blank_values=True)); q['curPage'] = str(page)
        return urlunsplit((u.scheme, u.netloc, u.path, urlencode(q), ''))
    return spec['url']


def allowed_target(url, agency):
    try:
        if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 32 for c in url):
            return False
        u = urlsplit(url); spec = SOURCES[agency]
        if u.scheme != 'https' or u.hostname not in spec['hosts'] or u.port not in (None, 443) or u.username or u.password or u.fragment:
            return False
        # Only predefined list pages or that site's robots policy, never arbitrary URLs.
        if u.path == '/robots.txt' and not u.query:
            return True
        pairs = parse_qsl(u.query, keep_blank_values=True)
        if len(pairs) != len({k for k, _ in pairs}):
            return False
        for p in range(1, spec['pages'] + 1):
            expected = urlsplit(page_url(agency, p))
            if u.path == expected.path and dict(pairs) == dict(parse_qsl(expected.query, keep_blank_values=True)):
                return True
        return False
    except (ValueError, KeyError, TypeError):
        return False


class Guard(HTTPRedirectHandler):
    def __init__(self, agency):
        self.agency = agency
        super().__init__()

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_target(newurl, self.agency):
            raise ValueError('redirect_blocked')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, agency):
    if not allowed_target(url, agency):
        raise ValueError('unapproved_target')
    maximum = 64_000 if urlsplit(url).path == '/robots.txt' else 2_000_000
    req = Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/rss+xml,application/xml,text/xml,text/plain', 'Accept-Encoding': 'identity'})
    with build_opener(Guard(agency)).open(req, timeout=18) as response:
        if response.status != 200 or not allowed_target(response.url, agency):
            raise ValueError('bad_http_response')
        raw = response.read(maximum + 1)
        if len(raw) > maximum:
            raise ValueError('response_too_large')
        charset = response.headers.get_content_charset() or 'utf-8'
        if charset.lower() not in ('utf-8', 'utf8', 'euc-kr', 'cp949'):
            raise ValueError('unsupported_charset')
        return raw, response.headers.get_content_type(), response.url, charset


def robots_permission(raw, url):
    """Longest matching allow/disallow with wildcard/$ support and agent specificity.

    Unknown transport or HTML challenge is handled by the caller as a failure.
    We intentionally do not fetch a path denied by robots, even if publicly visible.
    """
    text = raw.decode('utf-8-sig', errors='strict')
    if '<html' in text.lower() or len(raw) > 64000:
        raise ValueError('robots_response_invalid')
    groups = []; agents = []; rules = []; delay = 0.0
    has_directive = False
    for line in text.splitlines() + ['User-agent: __end__']:
        line = line.split('#', 1)[0].strip()
        if ':' not in line:
            continue
        key, value = [s.strip() for s in line.split(':', 1)]; key = key.lower()
        if key == 'user-agent':
            if has_directive:
                groups.append((agents, rules, delay)); agents = []; rules = []; delay = 0.0; has_directive = False
            agents.append(value.lower())
        elif agents and key in ('allow', 'disallow', 'crawl-delay'):
            has_directive = True
            if key == 'crawl-delay':
                try:
                    delay = max(delay, float(value))
                except ValueError:
                    raise ValueError('robots_delay_invalid')
            elif value:
                if not value.startswith('/'):
                    raise ValueError('robots_rule_unsupported')
                rules.append((key, value))
    if agents and has_directive:
        groups.append((agents, rules, delay))
    # Most specific matching user-agent group, combining equally specific groups.
    matches = []
    for agent_list, rules, delay in groups:
        scores = [0 if a == '*' else len(a) for a in agent_list if a == '*' or a in UA.lower()]
        if scores:
            matches.append((max(scores), rules, delay))
    if not matches:
        return True, 0.3
    best = max(m[0] for m in matches)
    path = urlsplit(url).path + ('?' + urlsplit(url).query if urlsplit(url).query else '')
    matched = []; delays = [0.3]
    for score, rules, delay in matches:
        if score != best:
            continue
        delays.append(delay)
        for kind, pattern in rules:
            anchored = pattern.endswith('$'); body = pattern[:-1] if anchored else pattern
            expression = '^' + re.escape(body).replace(r'\*', '.*') + ('$' if anchored else '')
            if re.search(expression, path):
                matched.append((len(body.replace('*', '')), kind == 'allow'))
    wait = max(delays)
    if not 0 <= wait <= 5:
        raise ValueError('robots_delay_exceeds_run_budget')
    return (max(matched)[1] if matched else True), wait


def error_code(exc):
    if isinstance(exc, HTTPError):
        return 'http_' + str(exc.code)
    # Do not persist exception messages (may contain transport or proxy details).
    if isinstance(exc, ValueError) and re.fullmatch('[a-z_]{1,80}', str(exc)):
        return str(exc)
    return type(exc).__name__[:80]


def collect(previous, programs, now, transport=fetch, pause=time.sleep):
    validate_document(previous)
    if now.tzinfo is None:
        raise ValueError('aware_time_required')
    at = now.astimezone(KST).isoformat(timespec='seconds')
    doc = deepcopy(previous)
    for agency, spec in SOURCES.items():
        prior = previous['sources'].get(agency, {})
        state = {'id': agency, 'name': spec['name'], 'listing_url': spec['url'],
                 'scope': 'RSS 반환분' if agency == 'mss' else '최근 최대 3페이지',
                 'coverage_complete': False, 'last_attempt_at': at,
                 'last_success_at': prior.get('last_success_at'), 'status': 'failed',
                 'pages_checked': 0, 'rows_checked': 0, 'candidate_rows': 0,
                 'added': 0, 'changed': 0, 'error_codes': [], 'robots_status': 'unknown',
                 'snapshot_sha256': prior.get('snapshot_sha256')}
        observed = []; seen = set()
        try:
            try:
                raw, typ, final, charset = transport(spec['robots'], agency)
                if typ not in ('text/plain', 'text/html'):
                    raise ValueError('robots_content_type')
                rules = raw
            except HTTPError as exc:
                if exc.code != 404:
                    raise
                rules = b''  # robots absent, not an access-control bypass
            for number in range(1, spec['pages'] + 1):
                target = page_url(agency, number)
                permission, wait = robots_permission(rules, target)
                if not permission:
                    state['robots_status'] = 'disallowed'; state['status'] = 'policy_blocked'
                    raise ValueError('robots_disallowed')
                state['robots_status'] = 'allowed'
                if number > 1:
                    pause(wait)
                raw, typ, final, charset = transport(target, agency)
                if not allowed_target(final, agency):
                    raise ValueError('unexpected_final_target')
                allowed_types = ('text/xml', 'application/xml', 'application/rss+xml') if agency == 'mss' else ('text/html', 'application/xhtml+xml')
                if typ not in allowed_types:
                    raise ValueError('listing_content_type')
                rows = parse_listing(agency, raw, final, charset)
                ids = {r['id'] for r in rows}
                if not ids - seen:
                    raise ValueError('repeated_page_window')
                # If a pinned item appears on multiple pages, retain first/latest row.
                observed.extend(r for r in rows if r['id'] not in seen)
                seen.update(ids)
                state['pages_checked'] += 1
            snapshot = digest(sorted(observed, key=lambda x: x['id']))
            state['snapshot_sha256'] = snapshot
            state['last_success_at'] = at
            state['status'] = 'ok_changed' if prior.get('snapshot_sha256') != snapshot else 'ok_no_change'
        except Exception as exc:
            state['error_codes'].append(error_code(exc))
            if state['status'] != 'policy_blocked':
                state['status'] = 'partial' if observed else 'failed'
        state['rows_checked'] = len(observed)
        state['candidate_rows'] = sum(bool(r['relevance']) for r in observed)
        try:
            doc, state['added'], state['changed'] = merge_rows(doc, observed, at, programs)
        except ValueError as exc:
            state['status'] = 'partial'; state['error_codes'].append(error_code(exc))
            state['last_success_at'] = prior.get('last_success_at')
            state['snapshot_sha256'] = prior.get('snapshot_sha256')
        doc['sources'][agency] = state
    states = list(doc['sources'].values())
    ok = sum(s['status'] in ('ok_changed', 'ok_no_change') for s in states)
    doc.update(generated_at=at, run={'at': at, 'status': 'ok_scoped' if ok == len(SOURCES) else 'partial' if ok else 'failed',
        'sources_ok': ok, 'sources_failed': len(SOURCES)-ok,
        'rows_checked': sum(s['rows_checked'] for s in states),
        'added': sum(s['added'] for s in states), 'changed': sum(s['changed'] for s in states)})
    validate_document(doc)
    return doc


def render_markdown(doc):
    validate_document(doc)
    def text(value):
        return re.sub(r'([\\`*_{}\[\]()#+.!|>\-])', r'\\\1', html.escape(str(value), quote=True))
    lines = ['# 공식기관 직접 수집 봇', '', '수집 시도: ' + text(doc['generated_at']),
             '상태: ' + text(doc['run']['status']) + ' / AI 호출 0회', '', SCOPE, '']
    for s in doc['sources'].values():
        lines.append('- ' + text(s['name']) + ': ' + text(s['status']) + ' · ' + str(s['rows_checked']) + '행 · ' + str(s['candidate_rows']) + '개 관련 목록 항목 · 마지막 성공 ' + text(s['last_success_at'] or '없음'))
        if s['error_codes']:
            lines.append('  - 확인 실패: ' + text(', '.join(s['error_codes'])))
    lines += ['', '## 미연결 경로']
    for d in doc['deferred']:
        lines.append('- ' + text(d['name']) + ': ' + text(d['reason']))
    lines += ['', '## 보존된 최근 관측 후보 — 원문·자격 미검증']
    records = sorted(doc['records'].values(), key=lambda r: (r['last_seen_at'], r['id']), reverse=True)
    for r in records[:100]:
        lines.append('- ' + text(r['title']) + ' · ' + text(r['kind']) + ' · 기재 마감 ' + text(r['deadline'] or '미확인') + (' · 변경 재검토 필요' if r['review_required'] else ''))
    lines += ['', '표시 최대 100건. 기존 검증 공고·금액·신청자격을 자동 수정하거나 승인하지 않습니다.', '']
    return '\n'.join(lines)


def atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp'); temp.write_text(text, encoding='utf-8', newline='\n'); temp.replace(path)


def validate_outputs(root=ROOT):
    root = Path(root)
    path = root / DATA
    if path.stat().st_size > 6_000_000:
        raise ValueError('agency_document_size')
    doc = validate_document(json.loads(path.read_text(encoding='utf-8')))
    if (root / REPORT).read_text(encoding='utf-8') != render_markdown(doc):
        raise ValueError('agency_summary_mismatch')
    return doc


def main():
    path = ROOT / DATA
    previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else empty_document()
    public = json.loads((ROOT / 'data/programs.json').read_text(encoding='utf-8'))
    if public.get('schema') != 'public-funding-radar/v1':
        raise ValueError('public_program_schema')
    doc = collect(previous, public['items'], datetime.now(KST))
    summary = render_markdown(doc)
    atomic(path, json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    atomic(ROOT / REPORT, summary)
    validate_outputs()
    print(json.dumps({'run': doc['run'], 'retained_candidates': len(doc['records']), 'model_calls': 0}, ensure_ascii=True))
    return 0 if doc['run']['status'] == 'ok_scoped' else 2


if __name__ == '__main__':
    raise SystemExit(main())
