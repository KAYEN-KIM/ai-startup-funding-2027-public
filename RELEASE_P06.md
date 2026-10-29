# P0.6 — 예비·초기 창업 준비와 과거조건 기반 자부담 시나리오

## Implemented scope

New route: `startup.html`. It extends the existing dashboard; it is not a replacement application. The 153-record program baseline and prior eligibility/funding registries are unchanged by the feature.

Three source-reviewed **2026 historical** routes:

- Pre-startup package, second revised notice of 2026-03-24: first-stage 20 million KRW only; 40 million average is NOT a cap, guarantee or calculated stage-two entitlement. Government share 100%, formal own contribution zero, but operating/bridge/noneligible cash remains separate.
- Early startup general: historical cap 100 million KRW and four regional own-contribution scenarios.
- Early startup deeptech: historical cap 150 million KRW and four regional own-contribution scenarios. AI technology fit remains an evidence question, not an automatic pass because an API is used.

**Nine formula scenarios** are provided. The original initial-startup HWPX table states government/cash/in-kind percentages of total recognized project cost: special 90/0/flexible own contribution; preferred 80/10/10; ordinary noncapital 75/10/15; nonpreferential 70/10/20. Special-region own contribution is still required, but may be cash or recognized in-kind. No region is auto-selected for early-startup routes. HQ classification must be checked against the applicable attachment; the product does not infer eligibility from province or propose a nominal address move.

BigInt arithmetic preserves whole-won budget identities and rounds statutory minimum/maximum shares conservatively. Values are mathematical lower-bound scenarios, not the notice's thousand-won example formatting or an approved award. Excess in-kind is excluded; absent available cash keeps the shortfall unknown.

## Readiness and restriction boundaries

A seven-item internal checklist describes customer evidence, working demo, IP/data rights, business/award history, budget evidence, the new 2027 notice and official verification. Counts are preparation progress only, never selection probability or a score. Current registration does not automatically exclude the future pre-startup path: the reviewed 2026 notice had a reference-date and post-date-registration exception.

The reference route comparison distinguishes applying from executing. The general and deeptech maximums are alternatives, never a summed portfolio. Same-year commercialization limits must not be generalized to all local or R&D programs. No 2027 simultaneity rule is inferred from 2026. Title candidates for new 2027 pre/early notices are shown from the existing catalog, without automatic rule promotion.

## Public evidence and privacy

`config/startup_reference.json` binds reviewed rules to immutable original-file SHA256 values, exact source URLs, XML table or PDF logical/physical page locations, and snapshots of the protected reference records.

The two HWPX originals were reviewed using full nested text and table row/cell context. The pre-startup PDF was read from the issuing ministry; relevant finance and eligibility pages were visually cross-checked against the matching notice copy published by a participating institution. The catalog names these distinct review methods; it does not claim a complete document/legal eligibility review.

`data/startup_sources.json` records bounded official-source hash checks, last attempt/success, explicit failure and sticky review-required state. `scripts/refresh_startup_sources.py` uses the existing public-destination and redirect-guarded downloader. It checks three registered original URLs, not every later correction notice or all agency feeds. Hash changes/failures and source checks older than seven days hold calculations. A reversion to an older hash cannot silently clear a review flag.

`data/startup_routes.json` is deterministic and rebuilt before commits, after rebase, and in the allowlisted build. No original document bytes or full bodies are published.

Company status, checklist and money inputs stay in current-page memory. Only fixed public JSON paths are fetched. No storage, analytics, uploads, submission, paid model calls, investment or lending actions. Export is an explicit local JSON download, labeled private; editing inputs invalidates old results and prevents stale export.

## Acceptance boundary

Python registry/source-state tests, all prior regressions, Node arithmetic/source gates, and VM/DOM/privacy interaction tests are required in CI. VM/DOM tests do not establish a real-browser visual review. Build/package hashes and deployed responses are verified separately.

Not implemented here: full 2027 eligibility, full exception coverage, complete amendment discovery, authenticated private persistence, multi-program optimization, probabilistic awards, or monthly funding cashflow. Historical 2026 preparation is kept separate from P0.5 live-notice calculations.
