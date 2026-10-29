# P0.11 — 집행 준비·협약 후 지급·자부담 납입 대조

## Delivered scope

The existing `portfolio.html` screen now has an optional per-project **집행 준비·협약 후 지급·자부담 납입 대조** section. It connects independently pinned public-source clauses to the project identity, including manual budgets with a known notice identity. It does not create a new page, backend, login, application-submission flow or paid API.

Inputs are agreement date, ability to use the designated account and management system, own-cash due/paid dates and amount, in-kind proof preparation, and self-reported payment/settlement basis. No bank account number, contract body, company name, contact details or source document upload is accepted. Inputs remain in current page memory. Only an explicit download exports a private local report; it must not be uploaded to the public repository.

The result remains `permission=not_determined`, `actual_settlement_approved=false`, and `official_cost_eligibility=not_determined`. Checking a box or selecting “확인했다고 입력” does not become documentary or agency verification.

## Original evidence reviewed

The official 2026 early-startup general and deeptech HWPX originals were downloaded and matched against their existing SHA-256 pins on 2026-10-29. Full paragraph text and surrounding context were read from `Contents/section0.xml` without OCR. Locators below are **zero-based XML paragraph indices**, enumerating all `p` elements in document order, not invented printed page numbers.

| Source | SHA-256 | Payment | Account / system | Own cash / in-kind proof | Monitoring / recovery |
|---|---|---:|---:|---:|---:|
| early-general | e34bdaf1618c03d37e48c4aa0836f9e03aa7b3d8b3f2b9c8a14af098a163341f | 803 | 812 | 832 | 805 |
| early-deep | 6bdb1a0a28bc4903361b8525c0e8988e7bfdd45d4f014cc55b4e49cbe409e658 | 656 | 665 | 685 | 658 |

Official general original:
https://www.mss.go.kr/common/board/Download.do?bcIdx=1065015&cbIdx=310&streFileNm=6d1ee9de-ebd4-4a28-b361-f3b43db0b3a1.hwpx

Official deeptech original:
https://www.mss.go.kr/common/board/Download.do?bcIdx=1064566&cbIdx=310&streFileNm=af3acf02-931b-4f29-945a-5f9d792c6b42.hwpx

Four partial topics are connected for each original: support may be paid in installments after agreement; designated account and management-system expense processing; own-cash contribution by the agency deadline and submission of in-kind evidence; possible stopping/recovery after monitoring. No fixed installment percentage, individual payment date, detailed allowable-cost schedule, VAT treatment or recovery formula was established from these clauses.

## Decision limits

- Active historical constraints require BOTH review year 2026 and the project's declared award year 2026. Missing year or 2027+ is not auto-filled from a performance date; historical clauses stay advisory.
- The user must explicitly enable execution review. Existing saved-style inputs without the new object retain the earlier hypothetical cash results and visibly show execution review not requested.
- For an enabled 2026 matched project, missing account/system/agreement/deposit/proof information holds the combined cash calculation. A positive payment month earlier than the declared agreement month or a deposit after its declared deadline is a conflict within this partial historical scope.
- Same-month payment does not establish chronological order. The program does not invent an exact payment day.
- Cash contribution is funding movement, not an extra economic expense. The amount is NOT added twice to the cost ledger. This module does not model actual designated-account transfers, bank balance restrictions or settlement releases; the earlier hypothetical cashflow model is unchanged.
- Deposited and verified are different states. The remaining contribution is an arithmetic comparison against the entered budget scenario, not a payment instruction.
- The source URL/hash pins are independent of other modules. Mismatched, failed or stale source checks prevent use and export; a manual budget does not bypass them.
- Pre-startup and other R&D execution rules are not silently copied from the two early-startup notices.

## Attachment transport diagnosis

Initial direct-link rechecks of the Ulsan IP Didimdol attachment `6b5a25ea10cb785d4ff3d991` and an Incheon youth-startup guarantee attachment returned HTTP 403. During the end-to-end run, public Bizinfo links were observed to carry temporary download signatures, which also caused false metadata churn. The final implementation resolves the same stable file identifier against the link currently published on its verified official notice page, uses that link only in request memory, and never synthesizes credentials or changes access controls. At 2026-10-30 00:21 KST, both previously failed attachments were successfully extracted as HWP, retaining their prior failure history. Other inaccessible documents are not assumed repaired.

Attachment records may now contain only bounded HTTP status, a failure-kind enum and a retryability advisory boolean. Response bodies, cookies, exception text and arbitrary headers are not persisted. An HTTP 401/403 is never marked retryable. The collector does not add hidden repeated download attempts: its existing bounded document rotation is unchanged. A per-run cache resolves currently public attachment links by notice; a missing or different file identity fails closed. A subsequent successful extraction clears the current failure diagnostic but retains history. Legacy records and history without optional diagnostic fields remain valid.

## Stable public attachment identity

The public API and HTML collectors now store stable official file identifiers without Bizinfo's temporary `downloadToken`. File number and file identity remain intact. Canonical URLs are matched against links currently published by the same official notice before a download. Only two observed Bizinfo file/image endpoints receive this treatment; arbitrary secret query parameters and nonofficial destinations stay blocked.

Current public JSON was normalized without changing existing attachment record IDs or deleting histories. Manifest identity was recomputed for canonical links without clearing existing review-required flags. Existing rule configuration and reviewed original source hashes were not changed. Public browsers open the official notice for a fresh attachment link instead of embedding a temporary signature. Such transport signatures are not applicant account credentials; no user API key was exposed or read.

The first full run reported 115 modified records; comparison showed those differences were `verified_at` and temporary attachment URLs, not 115 confirmed substantive notice amendments. The new canonicalization prevents signature rotation alone from changing attachment identity. The public notice text, eligibility and grant amounts are still separate verification concerns.

## Test / deployment contract

Final local regression at 2026-10-30 00:21 KST: Python 267, Node 680, legacy 4: **951 passed** (128 more than the 823-test P0.10 baseline). Build and `git diff --check` also passed. These are software tests, not 951 verified legal rules.

The local test environment is isolated under ignored `.venv/` with the repository's existing pinned `pypdf==6.15.0` and `olefile==0.47`. The initial default-interpreter run failed because those parsers were absent and an old exact script-count assertion had not yet included the new module; both were corrected before acceptance. No production-source validation gate was removed.

New suites: `scripts/test_portfolio_execution.cjs`, `scripts/test_execution_contract.py`, `scripts/test_attachment_transport.py`, `scripts/test_public_urls.py`, plus expanded existing portfolio and attachment UI tests. They cover chronology, missing data, future-year limits, no mutation/double counting, manual-path source gates, untrusted fields, explicit exports, privacy, and transport failure retention.

GitHub verification runs the new suites before publication. The existing workflow still publishes an honest failure record and then fails when a collector reports failure. Code deployment success is not evidence that all attachments were retrieved. Real-browser visual acceptance was not performed in this release; VM/DOM interactions and public-file checks are distinct.

## Remaining scope

Detailed eligible-cost and invoice review, VAT and repayment/settlement formulas, actual bank timing, complete two-sided exceptions for other projects, and confirmed 2027 announcement rules remain unverified. This release is not an optimum-grant calculator or permission to execute spending, borrowing, investment or applications.
