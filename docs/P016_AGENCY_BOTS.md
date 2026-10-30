# P0.16 — 공식기관 직접 목록 봇

## Scope

Extends the existing project, not a replacement or a private backend. Enabled
adapters: MSS business-announcement RSS (one returned feed, currently 20 rows)
and NIPA business-announcement HTML (latest three pages, currently 10 rows/page).
These are bounded discovery windows, NEVER all historical notices or all government
funding. No applicant/company data is read, no application is submitted, and no AI
API/CLI/model is invoked. AI review remains an optional, separately requested manual
CLI operation; this module does not require it.

Entry point: `python scripts/refresh_agencies.py`.
New public files: `data/agency_discovery.json`, `data/agency_report.md`.
Existing source records and reviewed conditions are NOT rewritten. Homepage section:
`#agencyReport` (공식기관 직접 수집), using `assets/agency-report.js`.

## Independently checked official surfaces (2026-10-30)

- MSS publishes its RSS service at https://www.mss.go.kr/site/smba/contents/view.do?menuCd=20905000000002024122902&siteCd=smba
- RSS: https://mss.go.kr/rss/smba/board/310.do
- NIPA: https://www.nipa.kr/home/bsnsAll/0/nttList?bbsNo=4&bsnsDtlsIemNo=&tab=2&curPage=1
- Enabled-source robots policies are read before their list requests. The bot has a
  specific user agent, exact-host/path allowlists, MIME/size/time limits and delayed
  page reads. It does not send credentials, use login sessions, execute downloaded
  scripts, bypass CAPTCHAs, follow arbitrary redirects or download attachments.
- KOCCA is explicitly NOT connected: the inspected public list route matches its
  robots.txt `Disallow:/kocca/*/list.do` policy. Do not fetch that list from this bot.
  An authorized feed/API route must be verified separately.
- K-Startup has no independent adapter in this release. Records already available
  through Bizinfo are not presented as an independently validated K-Startup stream.

## Semantics and safety

1. Accept only source-specific official notice IDs. Keep local title/period/date
   metadata; never persist list-author names, contact cells or full page bodies.
2. Separate listing candidates, operator recruitment, procurement, policy plans,
   competitions and result notices. These are deterministic title-based signals,
   not authoritative legal classifications. `수행기관` alone is not assumed to
   exclude companies. Listing candidates never become verified beneficiaries.
3. Keep title years only. Never infer 2027 from collection time. RSS posting times
   never become deadlines. Date-only deadlines remain date-only. Missing, invalid
   or reversed times are not invented. NIPA opening times are retained when given.
4. Partial/repeated/malformed pages, HTTP/robots failures and content-type changes
   are explicit failures. Keep successful observations from earlier pages and
   prior runs; retain the previous full-window success timestamp on a partial run.
5. A later failure does not clear records. Absence from the latest bounded window
   is not deletion, withdrawal, closure or proof of an amendment.
6. A changed listing snapshot retains up to five prior public snapshots and a
   sticky review-required flag. A later unchanged read never clears that flag.
7. Canonical URL matches are source cross-checks only; normalized-title matches
   are merely possible duplicates. Differences from existing reviewed metadata
   remain suggestions; no merge, source replacement, approval or grant sum occurs.
8. At most 1,200 retained records. Reaching the bound fails visibly and preserves
   the previous archive rather than silently deleting records.
9. Strict nested public schema validation and exact-source links gate publication.
   Arbitrary fields, invalid identities, forged hashes, unsupported status claims
   and unknown AI/approval policy are rejected. Markdown/HTML escape notice text.
10. Homepage filters operate locally. The page reads one relative public JSON file
    only and does not persist or transmit search inputs, company data or drafts.

## Daily integration

The existing 23:00 UTC / 08:00 Asia/Seoul GitHub schedule stays unchanged. The new
source step runs on schedule/manual full collection, not a code-only push. The
public-only build allowlist includes the three new files. Validation occurs before
committing. Both agency JSON and rendered Markdown are staged explicitly.

The existing P0.15 main report/RSS retains its own collection scope. The independent
agency report is displayed beside it on the homepage and appended separately to
GitHub's job summary. Do not interpret either report's success as every other
collector succeeding. The fail-after-publish guard now includes agency failures.
An honest failure record can still be published, then the workflow fails.

## Validation and known limits

New regression suites: `python -m unittest discover -s scripts -p test_agencies.py -v`
and `node --test scripts/test_agency_report.cjs`. Tests cover parsing, source identity,
robots policies, repeat pages, independent-source failures, sticky changes, matching,
invalid time values, nested schema rejection, escaping, filters and outbound requests.
All prior Python, JavaScript and legacy suites remain deployment gates.

First actual local run: 2026-10-30 19:30:54 KST. Two enabled sources succeeded;
MSS 20 rows / 7 related entries, NIPA 30 rows / 13 related entries. Total 20 stored
observations: 13 ordinary candidates, 3 operator recruitments, 2 procurements,
1 policy and 1 competition. Two canonical-URL matches with the existing catalog.
This does NOT represent 20 new eligible grants. Results can change on later runs.

Not implemented: every agency, full history/backfill, attachment extraction for
these separately retained candidates, automatic discovery-to-reviewed promotion,
complete exceptions/eligibility, push notifications, new AI review automation, or
private multi-user persistence. VM/DOM tests are not real-browser visual acceptance.

## Queue-baseline correction found during the real cloud run

The first full P0.16 run collected every enabled source successfully, but could
not commit because an earlier serialized push run had already advanced derived
report files. A queued event can retain an older checkout SHA. Before collecting,
the publisher now fetches main, rejects any change outside public data (which
would need a new code-verification run), and fast-forwards a data-only baseline.
No force push or automatic conflict resolution is used. Concurrent source changes
still stop safely rather than deploying unverified code. The pre-collection order
and source-change guard are covered by an additional regression.
