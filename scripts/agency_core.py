"""P0.16: deterministic official-board discovery. No HTTP or applicant data here.
Only source-specific notice identities are accepted. Listing text is NOT an
eligibility rule, an award amount, or a complete government notice inventory.
"""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import hashlib
import json
import re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, urljoin
from xml.etree import ElementTree as ET
from radar_core import relevance, parse_period

SCHEMA = 'public-funding-agency-discovery/v1'
KST = timezone(timedelta(hours=9))
MAX_RECORDS = 1200
SOURCES = {
    'mss': {'name': '중소벤처기업부 사업공고 RSS', 'url': 'https://mss.go.kr/rss/smba/board/310.do',
            'robots': 'https://mss.go.kr/robots.txt', 'pages': 1,
            'hosts': ('mss.go.kr', 'www.mss.go.kr'), 'format': 'rss'},
    'nipa': {'name': 'NIPA 사업공고 목록',
             'url': 'https://www.nipa.kr/home/bsnsAll/0/nttList?bbsNo=4&bsnsDtlsIemNo=&tab=2&curPage=1',
             'robots': 'https://www.nipa.kr/robots.txt', 'pages': 3,
             'hosts': ('nipa.kr', 'www.nipa.kr'), 'format': 'html'},
}
DEFERRED = [
    {'id': 'kocca', 'name': '한국콘텐츠진흥원', 'status': 'not_connected',
     'reason': '확인한 목록 경로가 robots.txt의 /kocca/*/list.do 제한에 해당. 별도 허용 피드 확인 전 자동 수집하지 않음.'},
    {'id': 'kstartup', 'name': 'K-Startup', 'status': 'not_connected',
     'reason': '독립 목록 수집기 미구현. 기존 기업마당에 제공되는 항목과는 구분.'},
]
KINDS = {'candidate', 'operator', 'procurement', 'policy', 'competition', 'result'}
STATUSES = {'not_run', 'ok_changed', 'ok_no_change', 'partial', 'failed', 'policy_blocked'}
ROW_FIELDS = {'id', 'agency_id', 'source', 'title', 'years', 'kind', 'relevance',
              'published_date', 'application_period_raw', 'opens', 'deadline', 'deadline_precision'}
RECORD_FIELDS = ROW_FIELDS | {'fingerprint', 'first_seen_at', 'last_seen_at', 'review_required',
    'history', 'matched_program_ids', 'possible_duplicate_ids', 'differences'}
SOURCE_FIELDS = {'id', 'name', 'listing_url', 'scope', 'coverage_complete', 'last_attempt_at',
    'last_success_at', 'status', 'pages_checked', 'rows_checked', 'candidate_rows', 'added',
    'changed', 'error_codes', 'robots_status', 'snapshot_sha256'}
TOP_FIELDS = {'schema', 'engine_version', 'generated_at', 'model_calls', 'automatic_approval',
    'scope', 'sources', 'records', 'deferred', 'run'}
RUN_FIELDS = {'at', 'status', 'sources_ok', 'sources_failed', 'rows_checked', 'added', 'changed'}
SCOPE = ('중기부 RSS 1회·NIPA 최근 최대 3페이지의 제한된 목록 수집. 전체 이력·모든 기관·원문 첨부 검증 아님. '
         '공고·조건 등록은 자동 승인하지 않고 별도 후보로 유지합니다.')


def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(compact(value).encode('utf-8')).hexdigest()


def clean(value, limit=400):
    if not isinstance(value, str):
        return ''
    return re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', value)).strip()[:limit]


def stamp(value):
    try:
        d = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return d if d.tzinfo else None
    except (ValueError, TypeError, AttributeError):
        return None


def day(value):
    try:
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            return None
        return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
    except ValueError:
        return None


def canonical_notice(url, agency=None):
    """Exact official notice paths and IDs; no auth, IP, generic .kr or lookalike hosts."""
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 32 for c in url):
        return None
    try:
        u = urlsplit(url)
        if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443):
            return None
        pairs = parse_qsl(u.query, keep_blank_values=True)
        if len(pairs) != len({k for k, _ in pairs}):
            return None
        if any(re.search(r'token|key|secret|password|signature', k, re.I) for k, _ in pairs):
            return None
        q = dict(pairs)
        host = (u.hostname or '').lower()
        if agency in (None, 'mss') and host in SOURCES['mss']['hosts']:
            if u.path == '/site/smba/ex/bbs/View.do' and q.get('cbIdx') == '310' and re.fullmatch(r'\d{5,12}', q.get('bcIdx', '')):
                return 'https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=' + q['bcIdx']
        if agency in (None, 'nipa') and host in SOURCES['nipa']['hosts']:
            if re.fullmatch(r'/home/bsnsAll/\d{1,2}/nttDetail', u.path) and q.get('bbsNo') == '4' and re.fullmatch(r'\d{3,12}', q.get('nttNo', '')):
                return 'https://www.nipa.kr/home/bsnsAll/0/nttDetail?bbsNo=4&nttNo=' + q['nttNo'] + '&tab=2'
    except (ValueError, TypeError):
        pass
    return None


def notice_id(source, agency):
    q = dict(parse_qsl(urlsplit(source).query))
    return agency.upper() + '-' + q['bcIdx' if agency == 'mss' else 'nttNo']


def title_kind(title):
    # Listing-only signals. '수행기관' can be a company: do NOT reject as an operator.
    if re.search(r'(?:주관|운영|전담)\s*(?:기관|사업자).*?(?:모집|선정)|창업도시\s*모집', title):
        return 'operator'
    if re.search(r'입찰|용역', title):
        return 'procurement'
    if re.search(r'선정\s*(?:결과|평가)|평가\s*결과', title):
        return 'result'
    if re.search(r'공모전|경진대회', title):
        return 'competition'
    if re.search(r'통합\s*공고|예산안|예산\s*편성|추진\s*계획', title):
        return 'policy'
    return 'candidate'


def relevant(title):
    return relevance(title) or ('digital_related' if re.search(r'스마트\s*(?:제조|공장)|디지털.*(?:지원|모집)', title) else None)


def make_row(agency, source, title, period='', published=None):
    source = canonical_notice(source, agency)
    title = clean(title)
    if not source or len(title) < 5:
        raise ValueError('invalid_notice_identity')
    start, end, precision = parse_period(period)
    # The existing helper keeps opening dates only. Preserve a listed opening time here.
    opening = re.match(r'\s*(20\d\d-\d\d-\d\d)\s+(\d\d:\d\d)\s*~', period)
    if opening:
        t = stamp(opening[1] + 'T' + opening[2] + ':00+09:00')
        if t:
            start = t.isoformat(timespec='seconds')
    # Invalid clocks or reversed same-day clocks must not become plausible dates.
    for date_part, clock_part in re.findall(r'(20\d\d-\d\d-\d\d)\s+(\d{1,2}:\d{2})(?!\d)', period):
        if stamp(date_part + 'T' + clock_part.zfill(5) + ':00+09:00') is None:
            start, end, precision = None, None, 'unknown'
    if stamp(start) and stamp(end) and stamp(end) < stamp(start):
        start, end, precision = None, None, 'unknown'
    return {'id': notice_id(source, agency), 'agency_id': agency, 'source': source, 'title': title,
            'years': sorted({int(x) for x in re.findall(r'(?<!\d)20\d{2}(?!\d)', title)}),
            'kind': title_kind(title), 'relevance': relevant(title), 'published_date': day(published),
            'application_period_raw': clean(period, 160), 'opens': start, 'deadline': end,
            'deadline_precision': precision}


class Rows(HTMLParser):
    """NIPA table rows only; never execute scripts or capture author/contact cells."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []; self.row = None; self.cell = None; self.anchor = None; self.hidden = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'template'):
            self.hidden.append(tag)
        if self.hidden:
            return
        if tag == 'tr':
            if self.row is not None:
                raise ValueError('nested_or_unclosed_row')
            self.row = {'cells': [], 'links': []}
        if tag == 'td' and self.row is not None:
            self.cell = []
        if tag == 'a' and self.row is not None:
            self.anchor = {'href': dict(attrs).get('href', ''), 'text': []}

    def handle_endtag(self, tag):
        if self.hidden:
            if tag == self.hidden[-1]:
                self.hidden.pop()
            return
        if tag == 'a' and self.anchor is not None and self.row is not None:
            self.row['links'].append((self.anchor['href'], clean(' '.join(self.anchor['text'])))); self.anchor = None
        if tag == 'td' and self.cell is not None and self.row is not None:
            self.row['cells'].append(clean(' '.join(self.cell), 1500)); self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row); self.row = None

    def handle_data(self, data):
        if not self.hidden:
            if self.cell is not None:
                self.cell.append(data)
            if self.anchor is not None:
                self.anchor['text'].append(data)


def parse_listing(agency, raw, page_url, charset='utf-8'):
    if not isinstance(raw, bytes) or len(raw) > 2_000_000:
        raise ValueError('listing_size_limit')
    rows = []
    if agency == 'mss':
        if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
            raise ValueError('unsafe_xml')
        root = ET.fromstring(raw)
        if root.tag != 'rss' or root.find('channel') is None:
            raise ValueError('rss_structure_changed')
        channel = root.find('channel')
        if '중소벤처기업부' not in ''.join(channel.find('title').itertext()):
            raise ValueError('rss_source_identity_failed')
        items = channel.findall('item')
        if len(items) > 200:
            raise ValueError('listing_row_limit')
        for item in items:
            fields = {x.tag: ''.join(x.itertext()).strip() for x in item}
            pub = fields.get('pubDate', '')
            published = pub[:4]+'-'+pub[4:6]+'-'+pub[6:8] if re.fullmatch(r'\d{14}', pub) else None
            rows.append(make_row('mss', fields.get('link'), fields.get('title'), published=published))
    elif agency == 'nipa':
        text = raw.decode(charset, errors='strict')
        if '정보통신산업진흥원' not in text or '사업공고' not in text:
            raise ValueError('html_source_identity_failed')
        parser = Rows(); parser.feed(text); parser.close()
        if parser.row is not None:
            raise ValueError('truncated_table')
        for record in parser.rows:
            links = [(canonical_notice(urljoin(page_url, href), agency), title) for href, title in record['links'] if 'nttDetail' in href]
            if not links:
                continue
            if len(links) != 1 or not links[0][0]:
                raise ValueError('invalid_notice_link')
            cells = record['cells']
            if len(cells) != 4 or '신청기간' not in cells[1]:
                raise ValueError('listing_columns_changed')
            period = cells[1].split('신청기간', 1)[1].lstrip(' :')
            rows.append(make_row('nipa', links[0][0], links[0][1], period, cells[3]))
        if len(rows) > 100:
            raise ValueError('listing_row_limit')
    else:
        raise ValueError('unknown_source')
    if not rows:
        raise ValueError('empty_or_changed_listing')
    ids = [x['id'] for x in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('duplicate_notice_identity')
    return rows


def empty_document():
    return {'schema': SCHEMA, 'engine_version': '0.16.0', 'generated_at': None,
            'model_calls': 0, 'automatic_approval': False, 'scope': SCOPE,
            'sources': {}, 'records': {}, 'deferred': deepcopy(DEFERRED),
            'run': {'at': None, 'status': 'not_run', 'sources_ok': 0, 'sources_failed': 0,
                    'rows_checked': 0, 'added': 0, 'changed': 0}}


def normalized_title(title):
    return re.sub(r'[^0-9a-z가-힣]', '', title.lower())


def crosscheck(row, programs):
    direct, probable, differences = [], [], []
    for p in programs:
        if canonical_notice(p.get('source')) == row['source']:
            direct.append(p['id'])
            for field in ('title', 'opens', 'deadline'):
                old, seen = p.get(field), row.get(field)
                if old and seen and old != seen:
                    if field != 'title' and len(seen) == 10 and seen == str(old)[:10]:
                        continue  # a date-only listing must not erase a reviewed clock time
                    differences.append({'program_id': p['id'], 'field': field,
                                        'registered': str(old)[:400], 'listed': str(seen)[:400]})
        elif normalized_title(p.get('title', '')) == normalized_title(row['title']):
            probable.append(p['id'])
    return direct[:10], probable[:10], differences[:20]


def merge_rows(doc, rows, at, programs):
    out = deepcopy(doc); added = changed = 0
    for row in rows:
        if not row['relevance']:
            continue
        old = out['records'].get(row['id'])
        if old is None and len(out['records']) >= MAX_RECORDS:
            raise ValueError('retained_record_capacity_reached')
        fp = digest(row)
        record = dict(row, fingerprint=fp, first_seen_at=(old or {}).get('first_seen_at', at),
                      last_seen_at=at, review_required=(old or {}).get('review_required', False),
                      history=deepcopy((old or {}).get('history', [])))
        if old is None:
            added += 1
        elif old['fingerprint'] != fp:
            changed += 1; record['review_required'] = True
            snapshot = {k: old[k] for k in ROW_FIELDS}
            record['history'] = [{'observed_at': old['last_seen_at'], 'snapshot': snapshot}] + record['history'][:4]
        direct, probable, differences = crosscheck(row, programs)
        record.update(matched_program_ids=direct, possible_duplicate_ids=probable, differences=differences)
        out['records'][row['id']] = record
    return out, added, changed


def validate_row(r):
    if set(r) != ROW_FIELDS or r['agency_id'] not in SOURCES:
        raise ValueError('row_fields')
    if r['source'] != canonical_notice(r['source'], r['agency_id']) or r['id'] != notice_id(r['source'], r['agency_id']):
        raise ValueError('row_identity')
    if not isinstance(r['title'], str) or not 5 <= len(r['title']) <= 400 or r['title'] != clean(r['title']):
        raise ValueError('row_title')
    if r['kind'] not in KINDS or r['relevance'] not in ('ai', 'startup_general', 'digital_related'):
        raise ValueError('row_classification')
    if not isinstance(r['years'], list) or len(r['years']) > 5 or any(type(x) is not int or not 2000 <= x <= 2100 for x in r['years']) or r['years'] != sorted(set(r['years'])):
        raise ValueError('row_years')
    if r['published_date'] is not None and day(r['published_date']) != r['published_date']:
        raise ValueError('row_published_date')
    if not isinstance(r['application_period_raw'], str) or len(r['application_period_raw']) > 160 or r['application_period_raw'] != clean(r['application_period_raw'], 160):
        raise ValueError('row_period')
    for key in ('opens', 'deadline'):
        if r[key] is not None and not (day(r[key]) or stamp(r[key])):
            raise ValueError('row_time')
    expected = 'unknown' if r['deadline'] is None else 'date' if day(r['deadline']) else 'datetime'
    if r['deadline_precision'] != expected:
        raise ValueError('row_precision')
    if r['opens'] and r['deadline']:
        if r['opens'][:10] > r['deadline'][:10]:
            raise ValueError('row_time_order')
        if stamp(r['opens']) and stamp(r['deadline']) and stamp(r['opens']) > stamp(r['deadline']):
            raise ValueError('row_time_order')


def validate_document(doc):
    if not isinstance(doc, dict) or set(doc) != TOP_FIELDS or doc.get('schema') != SCHEMA:
        raise ValueError('invalid_agency_document')
    if doc['model_calls'] != 0 or type(doc['model_calls']) is not int or doc['automatic_approval'] is not False:
        raise ValueError('execution_policy_changed')
    if doc['engine_version'] != '0.16.0' or doc['scope'] != SCOPE or doc['deferred'] != DEFERRED:
        raise ValueError('scope_changed')
    if doc['generated_at'] is not None and not stamp(doc['generated_at']):
        raise ValueError('invalid_timestamp')
    if not isinstance(doc['records'], dict) or len(doc['records']) > MAX_RECORDS:
        raise ValueError('record_limit')
    for key, r in doc['records'].items():
        if set(r) != RECORD_FIELDS or r['agency_id'] not in SOURCES:
            raise ValueError('unapproved_record_fields')
        if r['source'] != canonical_notice(r['source'], r['agency_id']) or key != r['id'] or key != notice_id(r['source'], r['agency_id']):
            raise ValueError('invalid_record_identity')
        if not isinstance(r['title'], str) or not 5 <= len(r['title']) <= 400 or r['kind'] not in KINDS:
            raise ValueError('invalid_record_title_or_kind')
        if r['relevance'] not in ('ai', 'startup_general', 'digital_related'):
            raise ValueError('invalid_relevance')
        if type(r['review_required']) is not bool or not stamp(r['last_seen_at']) or not stamp(r['first_seen_at']):
            raise ValueError('invalid_record_observation')
        validate_row({k: r[k] for k in ROW_FIELDS})
        if stamp(r['first_seen_at']) > stamp(r['last_seen_at']):
            raise ValueError('record_observation_order')
        if r['fingerprint'] != digest({k: r[k] for k in ROW_FIELDS}):
            raise ValueError('record_fingerprint_mismatch')
        if len(r['history']) > 5:
            raise ValueError('history_limit')
        for history in r['history']:
            if set(history) != {'observed_at', 'snapshot'} or not stamp(history['observed_at']) or set(history['snapshot']) != ROW_FIELDS:
                raise ValueError('history_fields')
            validate_row(history['snapshot'])
            if history['snapshot']['id'] != r['id']:
                raise ValueError('history_identity')
        for field in ('matched_program_ids', 'possible_duplicate_ids'):
            if not isinstance(r[field], list) or len(r[field]) > 10 or any(not isinstance(x, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', x) for x in r[field]):
                raise ValueError('invalid_match_references')
        if len(r['differences']) > 20:
            raise ValueError('difference_limit')
        for diff in r['differences']:
            if set(diff) != {'program_id', 'field', 'registered', 'listed'} or diff['field'] not in ('title', 'opens', 'deadline'):
                raise ValueError('invalid_difference')
            if any(not isinstance(x, str) or len(x) > 400 for x in diff.values()):
                raise ValueError('invalid_difference_value')
    if not isinstance(doc['sources'], dict) or set(doc['sources']) - set(SOURCES):
        raise ValueError('unknown_source_state')
    for key, s in doc['sources'].items():
        if set(s) != SOURCE_FIELDS or s['id'] != key or s['name'] != SOURCES[key]['name'] or s['listing_url'] != SOURCES[key]['url']:
            raise ValueError('source_state_fields')
        if s['status'] not in STATUSES or s['coverage_complete'] is not False:
            raise ValueError('source_status')
        for field in ('pages_checked', 'rows_checked', 'candidate_rows', 'added', 'changed'):
            if type(s[field]) is not int or not 0 <= s[field] <= 2000:
                raise ValueError('invalid_count')
        if s['last_success_at'] is not None and not stamp(s['last_success_at']):
            raise ValueError('invalid_source_timestamp')
        if not stamp(s['last_attempt_at']) or not isinstance(s['error_codes'], list) or any(not re.fullmatch(r'[a-zA-Z0-9_]{1,100}', x) for x in s['error_codes']):
            raise ValueError('invalid_error_codes')
        if s['robots_status'] not in ('unknown', 'allowed', 'disallowed') or s['scope'] != ('RSS 반환분' if key == 'mss' else '최근 최대 3페이지'):
            raise ValueError('source_scope')
        if s['status'] in ('ok_changed', 'ok_no_change') and (s['last_success_at'] != s['last_attempt_at'] or s['error_codes']):
            raise ValueError('false_source_success')
        if s['snapshot_sha256'] is not None and not re.fullmatch(r'[0-9a-f]{64}', s['snapshot_sha256']):
            raise ValueError('invalid_snapshot_hash')
    if set(doc['run']) != RUN_FIELDS or doc['run']['status'] not in ('not_run', 'ok_scoped', 'partial', 'failed'):
        raise ValueError('invalid_run')
    for field in ('sources_ok', 'sources_failed', 'rows_checked', 'added', 'changed'):
        if type(doc['run'][field]) is not int or not 0 <= doc['run'][field] <= 4000:
            raise ValueError('run_count')
    if doc['run']['at'] != doc['generated_at']:
        raise ValueError('run_timestamp')
    return doc
