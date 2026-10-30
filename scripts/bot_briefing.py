#!/usr/bin/env python3
"""P0.15: bounded, deterministic public briefing. No HTTP, subprocess or model calls.

Reads only six explicit public collector records and a reviewed automation policy.
It NEVER rewrites collectors, applicant data, approval rules, or collection timestamps.
A successful latest run does not clear historical unresolved failures.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
SCHEMA = 'public-funding-bot-briefing/v1'
INPUTS = {
    'programs': ('data/programs.json', 'public-funding-radar/v1'),
    'monitor': ('data/monitor.json', 'public-funding-monitor/v1'),
    'evidence': ('data/evidence.json', 'public-funding-evidence/v1'),
    'reviews': ('data/change_reviews.json', 'public-funding-reviews/v1'),
    'attachments': ('data/attachments.json', 'public-funding-attachments/v1'),
    'startup': ('data/startup_sources.json', 'public-startup-source-checks/v1'),
    'policy': ('config/automation_policy.json', 'funding-automation-policy/v1'),
}
MAX_INPUT_BYTES = 12 * 1024 * 1024
BASE_URL = 'https://kayen-kim.github.io/ai-startup-funding-2027-public/'
FAIL = {'download_failed', 'parse_failed', 'parser_failed', 'extraction_failed', 'network_failed',
        'timeout', 'parser_timeout', 'identity_failed', 'fetch_failed', 'failed'}
LIMIT = {'size_limit', 'unsupported_format', 'blocked', 'encrypted', 'protected',
         'partial_text', 'no_text', 'limit_exceeded'}
OK = {'ok', 'ok_changed', 'ok_no_change', 'matched'}
SOURCE_LABELS = {'api': '기업마당 API', 'html': '공식 원문 HTML 순환',
                 'attachments': '첨부파일 순환', 'startup': '검토된 과거 원본'}
NOTICE = ('이 보고서는 공개 저장자료의 규칙 기반 집계입니다. 후보·마감·우선순위는 신청 적격성, '
          '선정 확률 또는 지원금 확정이 아닙니다. 자료 변경은 정책 변경 확정이 아니며 원문 대조가 필요합니다.')


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def fingerprint(value) -> str:
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def text(value, limit=240) -> str:
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        return ''
    return re.sub(r'[\x00-\x1f\x7f]', ' ', str(value))[:limit].strip()


def count(value) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 1000000 else 0


def official_url(value) -> str | None:
    """Never carry public temporary signatures, arbitrary domains or credentials onward."""
    if not isinstance(value, str) or len(value) > 2048 or any(ord(c) < 32 for c in value):
        return None
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        allowed = (host.endswith('.go.kr') or host.endswith('.or.kr') or host.endswith('.ac.kr')
                   or host in {'nipa.kr', 'www.nipa.kr', 'k-startup.go.kr', 'www.k-startup.go.kr'})
        if u.scheme != 'https' or not allowed or u.username or u.password or u.port not in (None, 443):
            return None
        pairs = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                 if not any(s in k.lower() for s in ('token', 'key', 'signature', 'password', 'secret'))]
        return urlunsplit(('https', u.netloc, u.path, urlencode(pairs), ''))
    except (ValueError, TypeError):
        return None


def timestamp(raw) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        v = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return v.astimezone(KST) if v.tzinfo is not None else None
    except ValueError:
        return None


def require_now(now) -> datetime:
    result = timestamp(now) if isinstance(now, str) else now
    if not isinstance(result, datetime) or result.tzinfo is None:
        raise ValueError('An explicit timezone-aware time is required')
    return result.astimezone(KST).replace(microsecond=0)


def age_state(raw, now, hours) -> str:
    t = timestamp(raw)
    if t is None:
        return 'unknown'
    if t - now > timedelta(minutes=5):
        return 'clock_uncertain'
    return 'stale' if now - t > timedelta(hours=hours) else 'recent'


def deadline_state(program, now) -> dict:
    """Date-only due day is not an assumed 23:59 deadline. Naive times are unknown."""
    raw = program.get('deadline')
    if not isinstance(raw, str):
        return {'status': 'unknown', 'date': None, 'days': None, 'precision': 'unknown'}
    try:
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
            day = date.fromisoformat(raw)
            days = (day - now.date()).days
            status = 'closed' if days < 0 else 'today_time_unknown' if days == 0 else 'upcoming'
            precision = 'date_only'
        else:
            end = timestamp(raw)
            if end is None:
                raise ValueError('No timezone')
            day = end.date()
            days = (day - now.date()).days
            status = 'closed' if end <= now else 'due_today' if days == 0 else 'upcoming'
            precision = 'timestamp'
        opens = program.get('opens')
        if isinstance(opens, str):
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', opens):
                start_day = date.fromisoformat(opens)
                future = start_day > now.date()
            else:
                start = timestamp(opens)
                if not start:
                    raise ValueError('Unknown opening time')
                start_day, future = start.date(), start > now
            if start_day > day:
                raise ValueError('Invalid date order')
            if future and status != 'closed':
                status = 'not_started'
        return {'status': status, 'date': day.isoformat(), 'days': days, 'precision': precision}
    except (ValueError, TypeError):
        return {'status': 'unknown', 'date': None, 'days': None, 'precision': 'unknown'}


def check_policy(policy):
    required = {
        'schema': 'funding-automation-policy/v1',
        'mode': 'deterministic_bot_first', 'scheduled_ai_calls': False,
        'ai_api_calls': False, 'optional_ai_transport': 'manual_cli_only',
        'automatic_rule_approval': False, 'automatic_application_submission': False,
        'private_application_inputs_in_public_report': False,
    }
    for k, v in required.items():
        if k not in policy or policy[k] != v or type(policy[k]) is not type(v):
            raise ValueError('Bot policy mismatch: ' + k)
    for key, low, high in [('freshness_hours', 1, 72), ('deadline_window_days', 1, 14), ('queue_limit', 1, 200)]:
        value = policy.get(key)
        if type(value) is not int or not low <= value <= high:
            raise ValueError('Bot policy bound: ' + key)


def check_inputs(inputs):
    if set(inputs) != set(INPUTS):
        raise ValueError('Only the allowlisted public input set is accepted')
    for key, (_, schema) in INPUTS.items():
        if not isinstance(inputs[key], dict) or inputs[key].get('schema') != schema:
            raise ValueError('Invalid public schema: ' + key)
    check_policy(inputs['policy'])
    items = inputs['programs'].get('items')
    if not isinstance(items, list) or len(items) > 10000:
        raise ValueError('Invalid program list')
    ids = [p.get('id') for p in items if isinstance(p, dict)]
    if len(ids) != len(items) or any(not isinstance(x, str) or not x or len(x) > 160 for x in ids) or len(ids) != len(set(ids)):
        raise ValueError('Invalid or duplicate program identifiers')
    for k in ('evidence', 'attachments', 'startup'):
        records = inputs[k].get('records')
        if not isinstance(records, dict) or len(records) > 20000 or any(not isinstance(r, dict) for r in records.values()):
            raise ValueError('Invalid records: ' + k)
    if not isinstance(inputs['reviews'].get('items'), list):
        raise ValueError('Invalid review list')


def lane(key, raw, now, policy, outcome=None):
    if not isinstance(raw, dict):
        raw = {}
    at = raw.get('last_attempt_at', raw.get('at'))
    state = age_state(at, now, policy['freshness_hours'])
    current = text(raw.get('status'), 60) or 'unknown'
    failed = count(raw.get('failed')) + count(raw.get('notice_failed'))
    if outcome == 'failure' or failed or current in FAIL or current in {'request_failed', 'needs_api_key', 'bad_response'}:
        status = 'failed'
    elif state != 'recent':
        status = state
    elif current in {'changed', 'review_required'} or count(raw.get('changed')):
        status = 'review_required'
    elif key == 'api' and (raw.get('coverage_complete') is not True or raw.get('errors')):
        status = 'partial'
    elif key == 'attachments' and (count(raw.get('partial_or_no_text')) or count(raw.get('blocked_or_unsupported'))):
        status = 'partial'
    elif key in {'attachments', 'startup'}:
        status = 'ok_scoped' if raw and (count(raw.get('attempted')) or count(raw.get('matched'))) else 'unknown'
    elif current in OK:
        status = 'ok_scoped'
    else:
        status = 'unknown'
    # Do not claim that a code-only push just collected anything.
    return {
        'id': key, 'name': SOURCE_LABELS[key], 'status': status,
        'last_attempt_at': at if timestamp(at) else None,
        'last_success_at': raw.get('last_success_at') if timestamp(raw.get('last_success_at')) else None,
        'freshness': state, 'workflow_outcome': outcome if outcome in {'success', 'failure', 'skipped'} else 'not_observed',
        'checked': count(raw.get('checked_count', raw.get('attempted', raw.get('matched')))),
        'failed': failed,
        'detail': {k: count(raw.get(k)) for k in ('pages', 'reported_total', 'added', 'modified', 'suggested',
                   'success', 'text_extracted', 'partial_or_no_text', 'blocked_or_unsupported', 'matched', 'changed')},
    }


def build_report(inputs, now, outcomes=None):
    """Pure function: same inputs, aware time and outcomes => byte-equivalent report."""
    check_inputs(inputs)
    now = require_now(now)
    policy = inputs['policy']
    outcomes = outcomes or {}
    programs = {p['id']: p for p in inputs['programs']['items']}
    sources = inputs['monitor'].get('sources', {})
    lanes = [
        lane('api', sources.get('bizinfo_api', {}), now, policy, outcomes.get('api')),
        lane('html', sources.get('html_evidence', {}), now, policy, outcomes.get('api')),
        lane('attachments', inputs['attachments'].get('run', {}), now, policy, outcomes.get('attachments')),
        lane('startup', inputs['startup'].get('run', {}), now, policy, outcomes.get('startup')),
    ]
    queue = {}

    def enqueue(category, pid, ref, priority, action, reason, at=None, source=None):
        p = programs.get(pid, {})
        stable = fingerprint([category, pid, str(ref)])[:24]
        queue[stable] = {
            'id': stable, 'category': category, 'priority': priority,
            'program_id': pid if pid in programs else None,
            'title': text(p.get('title')) or text(pid) or '검토 원본',
            'source': official_url(p.get('source') or source),
            'action': action, 'reason': reason, 'reference_id': text(ref, 160),
            'observed_at': at if timestamp(at) else None,
        }

    pending = [x for x in inputs['reviews']['items'] if isinstance(x, dict) and x.get('status') == 'pending']
    for r in pending:
        field = text(r.get('field'), 80)
        high = field in {'deadline', 'opens', 'eligibility', 'amount'}
        enqueue('source_difference', r.get('program_id'), r.get('id'), 'P0' if high else 'P1',
                'review_original', '기존 값과 새 관측값 차이: ' + field + ' — 자동 덮어쓰기·승인 없음', r.get('observed_at'))
    failed_records, limited_records, queued, changes = 0, 0, 0, 0
    for aid, r in inputs['attachments']['records'].items():
        status = r.get('status')
        if status == 'queued':
            queued += 1
        elif status in FAIL or (isinstance(status, str) and status.endswith('_failed')):
            failed_records += 1
            enqueue('attachment_failure', r.get('program_id'), aid, 'P1', 'retry_bot',
                    '미해결 첨부 다운로드·처리 실패. 다음 제한된 순환 수집에서 재시도', r.get('last_attempt_at'))
        elif status in LIMIT:
            limited_records += 1
            enqueue('attachment_limit', r.get('program_id'), aid, 'P2', 'review_original',
                    '형식·크기·본문 추출 한계: ' + text(status, 50) + ' — 원본 직접 확인 필요', r.get('last_attempt_at'))
        if r.get('review_required'):
            changes += 1
            enqueue('attachment_changed', r.get('program_id'), aid, 'P0', 'review_original',
                    '첨부 변경 재검토 필요. 새 파일을 자동 승인하지 않음', r.get('last_attempt_at'))
    html_failed = 0
    for pid, r in inputs['evidence']['records'].items():
        if r.get('review_required'):
            changes += 1
            enqueue('notice_changed', pid, pid, 'P0', 'review_original',
                    '원문 내용 변경 신호. 실제 정책 변경인지는 미검증', r.get('last_attempt_at'))
        if r.get('status') in FAIL or (isinstance(r.get('status'), str) and r['status'].endswith('_failed')):
            html_failed += 1
            enqueue('notice_failure', pid, pid, 'P1', 'retry_bot', '미해결 원문 열람 실패', r.get('last_attempt_at'))
    for sid, r in inputs['startup']['records'].items():
        state = age_state(r.get('last_attempt_at'), now, policy['freshness_hours'])
        if r.get('status') != 'matched' or r.get('review_required') or state != 'recent':
            enqueue('reviewed_original_hold', sid, sid, 'P0', 'review_original',
                    '검토 원본 지문 불일치·확인 실패·오래된 확인: 기존 계산 규칙은 보류 대상', r.get('last_attempt_at'), r.get('url'))
    deadlines = []
    unknown_dates = 0
    unverified = 0
    new_year = 0
    for pid, p in programs.items():
        mode = p.get('mode')
        if mode == 'discovery':
            unverified += 1
            if p.get('year') == 2027:
                new_year += 1
                enqueue('next_year_candidate', pid, pid, 'P1', 'review_original',
                        '2027 자동 발견 후보: 수혜기업·운영기관·예산안 구분 및 실제 자격 확인 필요')
        if mode not in {'beneficiary', 'discovery'}:
            continue
        d = deadline_state(p, now)
        if d['status'] == 'unknown':
            unknown_dates += 1
        if d['days'] is not None and 0 <= d['days'] <= policy['deadline_window_days'] and d['status'] != 'closed':
            deadlines.append({
                'program_id': pid, 'title': text(p.get('title')), 'source': official_url(p.get('source')),
                'mode': mode, 'deadline': text(p.get('deadline'), 40), **d,
                'qualification': '개별 신청자격 미판정',
            })
    deadlines.sort(key=lambda d: (d['date'], d['deadline'], d['program_id']))
    queue_items = sorted(queue.values(), key=lambda r: (r['priority'], r['category'], r['program_id'] or '', r['id']))
    unresolved = {
        'pending_differences': len(pending), 'attachment_failures': failed_records,
        'notice_failures': html_failed, 'attachment_limits': limited_records,
        'queued_attachments': queued, 'changed_evidence': changes,
        'unverified_programs': unverified, 'unverified_2027': new_year,
        'unknown_dates': unknown_dates,
    }
    run_status = 'failed' if any(x['status'] == 'failed' for x in lanes) else (
        'partial_or_stale' if any(x['status'] != 'ok_scoped' for x in lanes) else 'ok_scoped')
    attention = bool(queue_items) or run_status != 'ok_scoped'
    hashes = {INPUTS[k][0]: fingerprint(inputs[k]) for k in INPUTS}
    report = {
        'schema': SCHEMA, 'engine_version': '0.15.0', 'generated_at': now.isoformat(),
        'generation': 'deterministic_no_model', 'report_model_calls': 0,
        'ai_transport': 'manual_cli_only', 'automatic_rule_approval': False,
        'automatic_submission': False, 'input_fingerprints': hashes,
        'run_status': run_status, 'attention_required': attention, 'deadline_window_days': policy['deadline_window_days'],
        'lanes': lanes, 'unresolved': unresolved,
        'counts': {'registered': len(programs), 'upcoming_deadlines': len(deadlines),
                   'queue_total': len(queue_items), 'queue_shown': min(policy['queue_limit'], len(queue_items)),
                   'queue_by_action': dict(sorted(Counter(x['action'] for x in queue_items).items()))},
        'deadlines': deadlines[:30], 'deadline_rows_truncated': len(deadlines) > 30,
        'queue': queue_items[:policy['queue_limit']], 'queue_truncated': len(queue_items) > policy['queue_limit'],
        'scope': text(policy['scope'], 500), 'notice': NOTICE,
        'ai_handoff': '공개 근거 검토요청 파일만 생성 가능. AI CLI 자동 실행·API 호출·결과 자동 반영 없음.',
    }
    identity = {k: v for k, v in report.items() if k != 'generated_at'}
    identity['report_day'] = now.date().isoformat()
    report['report_id'] = fingerprint(identity)[:24]
    validate_report(report)
    return report


def validate_report(report):
    if report.get('schema') != SCHEMA or report.get('report_model_calls') != 0:
        raise ValueError('Invalid bot report')
    if report.get('generation') != 'deterministic_no_model' or report.get('automatic_rule_approval') is not False:
        raise ValueError('Invalid execution policy')
    if report.get('automatic_submission') is not False or report.get('ai_transport') != 'manual_cli_only':
        raise ValueError('Invalid output permissions')
    if set(report.get('input_fingerprints', {})) != {p for p, _ in INPUTS.values()}:
        raise ValueError('Missing public source fingerprint')
    if any(not re.fullmatch('[0-9a-f]{64}', v) for v in report['input_fingerprints'].values()):
        raise ValueError('Invalid source fingerprint')
    if len(report.get('queue', [])) > 200 or len(report.get('deadlines', [])) > 30:
        raise ValueError('Output bounds exceeded')
    for row in report.get('queue', []) + report.get('deadlines', []):
        url = row.get('source')
        if url and official_url(url) != url:
            raise ValueError('Unapproved public source URL')
    return report


def md(value) -> str:
    # Escape untrusted notice titles as text, including Markdown link/image syntax.
    s = html.escape(text(value, 1000), quote=True)
    return re.sub(r'([\\`*_{}\[\]()#+.!|>\-])', r'\\\1', s)


def render_markdown(report) -> str:
    validate_report(report)
    labels = {'ok_scoped': '해당 회차 범위 확인', 'failed': '실패 있음', 'partial_or_stale': '부분 확인·재확인 필요'}
    lines = ['# AI 창업 지원 — AI 없이 생성한 봇 보고서', '',
             '보고서 생성: ' + md(report['generated_at']),
             '이번 범위의 수집 상태: **' + labels.get(report['run_status'], '미확인') + '**',
             '미해결 항목은 이번 실행 성공과 별도로 유지됩니다. 모델 호출: 0회(보고서 생성 경로).', '',
             '## 수집 경로별 상태']
    for x in report['lanes']:
        lines.append('- ' + md(x['name']) + ': ' + md(x['status']) + ' / 최근 시도 ' + md(x['last_attempt_at'] or '미확인'))
    lines.extend(['', '## 누적 미해결', ' / '.join(md(k) + ': ' + str(v) for k, v in report['unresolved'].items()),
                  '', '## 다음 ' + str(report['deadline_window_days']) + '일 내 기재 마감 — 개인 자격 미판정'])
    for row in report['deadlines']:
        lines.append('- ' + md(row['deadline']) + ' · ' + md(row['title']) + ' · ' + md(row['status']) + ' · ' + md(row['mode']))
    if not report['deadlines']:
        lines.append('기재 마감 조건에 맞는 항목 없음. 공고 누락·수집 실패가 없다는 의미는 아닙니다.')
    lines.extend(['', '## 검토 대기 — 검토 순서이지 선정 점수가 아님'])
    for row in report['queue']:
        lines.append('- ' + md(row['priority']) + ' · ' + md(row['title']) + ': ' + md(row['reason']))
    lines.extend(['', md(report['scope']), '', md(report['notice']), '', md(report['ai_handoff']), ''])
    return '\n'.join(lines)


def render_feed(report) -> str:
    validate_report(report)
    root = ET.Element('rss', {'version': '2.0'})
    c = ET.SubElement(root, 'channel')
    for tag, val in [('title', 'AI Funding Radar — 규칙 기반 봇 보고'), ('link', BASE_URL + '#botReport'),
                     ('description', '공개 상태 집계. 개인 신청 적격성·전체 기관 검증 아님.')]:
        ET.SubElement(c, tag).text = val
    item = ET.SubElement(c, 'item')
    ET.SubElement(item, 'title').text = 'AI 창업 봇 보고 ' + report['generated_at'][:10] + ' / ' + report['run_status']
    ET.SubElement(item, 'link').text = BASE_URL + '#botReport'
    ET.SubElement(item, 'guid', {'isPermaLink': 'false'}).text = report['report_id']
    t = require_now(report['generated_at'])
    ET.SubElement(item, 'pubDate').text = t.strftime('%a, %d %b %Y %H:%M:%S +0900')
    ET.SubElement(item, 'description').text = ('검토 대기 ' + str(report['counts']['queue_total']) + '건; 미해결 첨부 실패 '
        + str(report['unresolved']['attachment_failures']) + '건. 이번 실행 상태와 누적 미해결을 구분합니다. ' + NOTICE)
    return ET.tostring(root, encoding='unicode', xml_declaration=True)


def read_inputs(root=ROOT):
    inputs = {}
    for key, (name, _) in INPUTS.items():
        p = Path(root) / name
        if not p.is_file() or p.stat().st_size > MAX_INPUT_BYTES:
            raise ValueError('Missing or oversized public input: ' + name)
        inputs[key] = json.loads(p.read_text(encoding='utf-8'))
    check_inputs(inputs)
    return inputs


def validate_outputs(root=ROOT):
    """Bind all three published outputs to current public inputs, not arbitrary edits."""
    root = Path(root)
    report = json.loads((root / 'data/bot_briefing.json').read_text(encoding='utf-8'))
    validate_report(report)
    observed = {x['id']: x.get('workflow_outcome') for x in report['lanes']}
    outcomes = {key: observed.get(key) if observed.get(key) in {'success', 'failure', 'skipped'} else None
                for key in ('api', 'attachments', 'startup')}
    expected = build_report(read_inputs(root), require_now(report['generated_at']), outcomes)
    if report != expected:
        raise ValueError('Bot report is stale or altered; regenerate from current public inputs')
    for name, content in [('bot_briefing.md', render_markdown(report)), ('bot_feed.xml', render_feed(report))]:
        path = root / 'data' / name
        if not path.is_file() or path.read_text(encoding='utf-8') != content:
            raise ValueError('Bot rendered artifact is stale or altered: ' + name)
    return report


def write_atomic(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(payload, encoding='utf-8', newline='\n')
    temporary.replace(path)


def workflow_outcomes():
    return {k: os.environ.get('BOT_' + k.upper() + '_OUTCOME') for k in ('api', 'attachments', 'startup')}


def generate(root=ROOT, now=None, outcomes=None):
    inputs = read_inputs(root)
    actual = require_now(now or datetime.now(KST))
    outcomes = outcomes or {}
    at = actual
    old_path = Path(root) / 'data/bot_briefing.json'
    # Build/rebase must not manufacture a new observation or publish bytes different
    # from the committed report. Reuse an identical same-day generation snapshot.
    if now is None and old_path.is_file() and old_path.stat().st_size <= MAX_INPUT_BYTES:
        try:
            old = json.loads(old_path.read_text(encoding='utf-8'))
            validate_report(old)
            prior = require_now(old['generated_at'])
            expected = {INPUTS[k][0]: fingerprint(inputs[k]) for k in INPUTS}
            old_outcomes = {x['id']: x['workflow_outcome'] for x in old['lanes']}
            same_outcomes = all(old_outcomes.get(k) == (outcomes.get(k) or 'not_observed') for k in ('api', 'attachments', 'startup'))
            if (old['input_fingerprints'] == expected and same_outcomes
                    and old.get('engine_version') == '0.15.0'
                    and prior.date() == actual.date() and timedelta(0) <= actual-prior < timedelta(minutes=10)):
                at = prior
        except (ValueError, KeyError, TypeError):
            pass
    report = build_report(inputs, at, outcomes)
    out = Path(root) / 'data'
    # Fully render/validate before writing; no collector inputs are modified.
    values = {'bot_briefing.json': json.dumps(report, ensure_ascii=False, indent=2) + '\n',
              'bot_briefing.md': render_markdown(report), 'bot_feed.xml': render_feed(report)}
    for name, payload in values.items():
        write_atomic(out / name, payload)
    return report


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--now', help='ISO timestamp with timezone; normally current KST')
    for key in ('api', 'attachments', 'startup'):
        p.add_argument('--' + key + '-outcome', choices=['success', 'failure', 'skipped'])
    args = p.parse_args(argv)
    outcomes = {key: getattr(args, key + '_outcome') or workflow_outcomes().get(key) for key in ('api', 'attachments', 'startup')}
    report = generate(now=args.now, outcomes=outcomes)
    print(json.dumps({'report_id': report['report_id'], 'run_status': report['run_status'],
                      'queue': report['counts']['queue_total'], 'report_model_calls': 0}, ensure_ascii=True))
    return 0  # The workflow retains its independent fail-after-publish collector guard.


if __name__ == '__main__':
    raise SystemExit(main())
