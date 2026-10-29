# P0.12 — 신청 준비 보드·일정 파일·명시적 로컬 이어하기

## Scope

`applications.html` turns up to 12 public notice references into an internal preparation board. Each card has a self-reported stage, an internal target date and up to 20 tasks. Six starter tasks are preparation examples, NOT a declaration of the official required-document list. Tasks may be added or removed. A complete checklist is not eligibility, selection probability, successful submission or an award.

Stages explicitly say “제출했다고 기록”, “선정됐다고 기록”. This release cannot submit an application, verify a receipt, execute funding, send email, create an online-calendar event or invite another person. Existing financial/eligibility source-bound modules remain unchanged and can be reached through navigation.

Public source comparison covers stored **display metadata** (title, year, classification, review level, period, amount and eligibility summary). It is not a full attachment hash gate or an authoritative re-review. On a difference, show old/current values until the user explicitly updates the comparison baseline. Acknowledgement never grants eligibility. A notice missing from the current registry does not delete the user's tasks.

## Privacy and safe resumption

Only the existing `data/programs.json` and `data/monitor.json` are fetched, using GET with credentials omitted. No backend, account, database, analytics, paid service, browser persistence or automatic storage is added. Private inputs remain in current page memory and disappear on refresh. Before navigation, a dirty-state warning is requested; browsers control whether to show it.

An explicit button downloads a plaintext **private** JSON snapshot. The file is not encrypted. The user should not enter identities, bank details, secrets or sensitive source documents in task titles, or publish the snapshot in this repository. A future session may resume only after the user selects that file, the app validates it, previews its count, and the user confirms replacing the current board. No remote fetching of imported URLs is permitted, and imported state is never treated as source authority.

The importer enforces schema version, exact field sets, enum/date/string limits, 256 KiB UTF-8 size, at most 12 notices and 20 tasks each, unique IDs and bounded nesting. Prototype-related keys are rejected. Unknown/newer fields or formats are not silently migrated. It accepts only this page's `private-funding-applications/v1`; it does NOT restore earlier portfolio/cashflow exports. A bad or late asynchronous file read cannot replace current work. File contents are escaped when rendered.

## Dates and calendar

Calendar generation is explicit and local. The result is an `.ics` file, not a subscribed feed or notification automation. Importing it into a calendar provider may upload its content to that provider; the user is warned before downloading. `CLASS:PRIVATE` is a calendar hint, not access control. Repeated import duplicate handling depends on the client.

- Internal target/task dates are user-entered all-day events. Completed/not-applicable tasks are skipped.
- Public stated deadlines are included only for a current beneficiary-classified notice, unchanged display snapshot, valid future/today date and successful monitor within 36 hours. This is still not full original-announcement validation. Discovery, reference, operator/budget, changed, missing, expired or stale records are not exported as official deadlines.
- Date-only deadlines become an all-day event explicitly labeled **시각 미확인**, never an assumed 23:59 cutoff. Exact offset-aware times are exported in UTC.
- Paused, selected and not-selected stages do not produce calendar entries. A submitted self-report omits the application deadline but permits subsequent user-entered tasks.
- No alarms, attendees, automatic invitations or API writes. Calendar files do not update when a notice changes.
- RFC 5545 escaping, CRLF, 75-octet UTF-8-safe folding, exclusive DATE end and stable UIDs are tested. No invented event duration for a precise deadline.

Primary technical references checked: https://www.w3.org/TR/FileAPI/ ; https://developer.mozilla.org/en-US/docs/Web/API/File_API ; https://www.rfc-editor.org/rfc/rfc5545.html . No new grant-law, eligibility or financial-rate claims were introduced.

## Verification

`node --test scripts/test_applications.cjs scripts/test_applications_ui.cjs`

52 deterministic module tests and 21 VM/DOM/privacy tests cover limits, dates, imports, corruption, source differences, fail/partial statuses, calendar exclusion/folding, explicit operations, in-memory behavior, private exports and deep links. These counts describe software checks, not reviewed government rules. Existing regression suites and the allowlisted static build remain mandatory. Actual browser verification, final commit and live data state must be recorded from execution, not inferred from these tests.

## Deferred

Authenticated shared workspace, cloud storage/sync, complete authoritative document requirements, official 2027 eligibility and financial combinations, automatic submission and live calendar sync are NOT delivered. This page is the practical manual preparation stage between finding a notice and personally applying on the official portal.
