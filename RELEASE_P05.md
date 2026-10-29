# P0.5 — Source-bound contribution and overlap pre-screening

## Implemented scope

New route: `planning.html` (linked from dashboard, eligibility, attachments).

- Three Jump-Up standard annual voucher calculations: 100, 500, 1000. Government share, minimum cash and maximum in-kind contribution all use TOTAL project cost as denominator.
- Requested support is an input assumption, not an award. Amounts are integer KRW; BigInt arithmetic rounds conservatively. Insufficient assumed in-kind contribution increases own cash. Excess in-kind is not credited. Blank available cash stays unknown. Additional operating/advance cash is a separate user assumption.
- Single year, standard cap only. Regional uplifts, multi-year sums, award likelihood, full cash-flow and portfolio optimization are not implemented. Mandatory consulting/excluded costs are explicitly displayed as unresolved expenditure constraints; this is not a complete eligible-spend plan.
- Six distinct scoped restriction checks: active Jump-Up, active DIPS/deep-tech TIPS with the 2026 final-year exception kept pending documentary review, active World Class 300 Plus, duplicated cost items, paying another program's contribution from a voucher, and applying to multiple IBK centres. All-false inputs mean only `limited_no_conflict`, never global concurrent-funding permission.
- Gyeongbuk consortium: the support/private-contribution figures and location were read, but the cash 10% denominator and intra-consortium allocation were not resolved; calculation is held rather than invented.

## Evidence and classification

`config/funding_rules.json` is the curated public registry. Five records cover three notices; only three records contain arithmetic rules. Each record is `selected_clauses_only`, with actual PDF byte SHA-256, attachment ID, notice/manifest binding, reviewed page positions, review time and open questions.

The Jump-Up PDF pages 1, 2, 6, 9, 12, 15; IBK PDF p.2; Gyeongbuk PDF p.3 were checked using local PDF renders and extracted text from the officially linked files. Bytes matched the P0.4 extraction hashes. This is document-context checking, not an agency/human approval or full legal eligibility certification. The web fetch service could not retrieve the PDF endpoints; the authorized device fetched them directly. No OCR was used.

Only a few clauses are reviewed. The existing `config/eligibility_rules.json`, its partial completeness flags, and all P0.4 source/candidate records are unchanged by this feature. The Jump-Up age exception and other track qualifications remain open questions; it is not promoted as a new AI startup's default funding route.

`data/funding_rules.json` is derived deterministically. Program metadata change, pending unacknowledged differences, attachment removal/change/failure, wrong document ownership, changed manifest or stale review suppress use. Review age limit is an internal 14-day safety policy, not a government deadline.

## Privacy and execution boundary

Inputs stay in page memory. No cookies, local/session storage, credentials, server writes, analytics, application submission, loans or investments. Only five public static JSON GETs are performed. Explicit local export contains private user-entered amounts/answers and is labelled PRIVATE; it must not be uploaded to this repository. Reset/edit/reload invalidates cached reports.

## Local acceptance

- Python unittest suites: 136 passed (29 added).
- JavaScript/VM/DOM suites: 185 passed (82 added).
- Legacy compatibility assertions: 4 passed.
- Total: 325 checks (214 previous + 111 new); additional integer arithmetic invariant loop tests 3,000 support-amount/rate combinations inside one test.
- Public schema/build: 153 program records; 7 allowlisted JSON datasets; 26 public build files.
- All seven protected JSON datasets/registry were structurally equal to base `20dbde5f1f5309c648ab63d404ddb8444682d1e2` after development. Byte hashes can differ due to Windows line endings; JSON comparison was used for content preservation.

Hosted CI, deployment, live readback and visual acceptance are recorded separately after execution. Do not infer their completion merely from this file.

## Next boundaries

Broaden authoritative rule coverage for early-stage/AI startup programs, regional and track qualifications, cost-item eligibility and actual schedules. Add evidence-supported cross-program constraints and only then funding-combination and monthly liquidity analysis. Do not derive feasibility by summing caps or treating ambiguous clauses as zero cost.
