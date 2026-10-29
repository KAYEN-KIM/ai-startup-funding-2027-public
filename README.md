# AI FUNDING RADAR 2027 — PUBLIC EDITION

External-read-only dashboard containing official government announcement pointers.

## Information disclosure

- Independent public frontend, NOT an export of private ChatGPT Sites backend.
- NO company information, applicant identity, internal checklists, budgets or keys.
- Reference-year limits (2026) are NOT advertised as confirmed 2027 grant amounts.
- Operator recruitments, policy budgets and loans are separated from startup grants.
- Query failure must never be treated as "no changes".
- There are no external ad/analytics libraries.

## Live GitHub Pages

Public URL: https://kayen-kim.github.io/ai-startup-funding-2027-public/

Deploy: Settings > Pages > Build and deployment > Source: GitHub Actions.
Then run Actions > Public Funding Radar - Daily Check and Deploy > Run workflow.

## Enable actual daily new-announcement collection

(1) Obtain an official Bizinfo policy-announcements API key:
https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi

(2) In GitHub open Settings > Secrets and variables > Actions > New repository secret.
Name: BIZINFO_API_KEY. Value: the issued secret key.
NEVER commit a key to public source files or send it through chat.

(3) Re-run the workflow from the GitHub Actions tab.
(4) Read the public site's update/audit section or data/monitor.json.
Success is ok_changed or ok_no_change plus a nonempty last_success_at.

Default scheduled run: 23:00 UTC = 08:00 KST. GitHub's scheduler may run late.
Without BIZINFO_API_KEY, daily attempts report needs_api_key, preserve prior data,
and DO NOT count as successful official notice verification.

Incoming official-API records are index-level discovery only. Exact grant
amounts, eligibility, double-funding conditions and application deadlines
must be checked on the individual official announcement and its attachments.

## Tests

Run from project root:

python -m py_compile scripts/refresh.py scripts/validate.py
python scripts/validate.py
python -m http.server 8788

Open http://localhost:8788/ . Opening index.html directly via file://
may fail due to browsers blocking relative fetch from local files.

## Optional Cloudflare Pages (same GitHub source)

Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
Authorize GitHub, select this single repository, production branch main.
Choose no framework and output directory "." (project root).
Changes pushed to main redeploy automatically.
GitHub Pages can remain available in parallel.

## Existing private ChatGPT site

The private workspace remains at:
https://ai-startup-funding-2027.vegetalcat.chatgpt.site/

Its /api/update-instructions returned HTTP 401 in the last monitor run. This
public edition DOES NOT claim private-to-public backend synchronization.

## P0.2 evidence and collection (2026-10-29)

- Runtime entrypoint: scripts/refresh_v2.py. Legacy refresh.py remains for compatibility only.
- Official Bizinfo pageIndex/pageUnit pagination, 200/page, max 10 pages; total and actual coverage are recorded. Repeated/failed/capped pages are PARTIAL, never silently complete.
- AI and general-startup discovery lanes; neither implies applicant eligibility. No automatic deletion of retained notices.
- Manual conditions are preserved. API differences are recorded in data/change_reviews.json for review, not automatically accepted.
- Up to six official notice HTML pages are fetched per run, with identity checks, body hashes and attachment link discovery. PDF/HWP attachment bodies are NOT read. Hash changes do NOT prove a material policy change.
- data/evidence.json keeps last successful evidence after failures. HTML fetch and independent editorial checks have separate source timestamps.
- Date-only deadlines are not converted to 23:59. Verification and reception status have independent badges.
- No applicant information, company profile, private funding plan or credentials may enter this public repository.
- Tests gate deployment; only explicit files are copied by scripts/build_public.py. A failed collector can publish its failure record, then fail the workflow rather than presenting success.

Validation: python scripts/test_refresh.py; python -m unittest discover -s scripts -p test_radar_v2.py; node --test scripts/test_frontend.cjs; python scripts/build_public.py

Official API contract: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi
This release does not implement personal eligibility, funding-combination optimization, automatic application submission or full multi-agency/attachment ingestion.

## P0.3 condition catalog and browser-local pre-screening (2026-10-29)

- New route: `eligibility.html`, linked from the public dashboard. No account, backend writes, cookies, localStorage or sessionStorage are used for company inputs. Inputs live in page memory, reset on reload, and are exported only through an explicit local JSON download. This is NOT a private authenticated multi-user workspace.
- Six optional aggregate inputs: business status, incorporation/startup date, SME status, headquarters region, innovative technology/idea, digital development/demonstration capability. No name, contact, business registration ID, bank account, revenue or representative birth date is requested.
- `config/eligibility_rules.json` holds editorially reviewed public rules, short exact evidence excerpts, source URLs, source locators, reference dates, incomplete-scope questions and reviewed metadata-difference IDs. These IDs acknowledge already observed API labeling differences for this rule review only; original pending-review records are NOT deleted or auto-accepted.
- `scripts/condition_catalog.py` creates public `data/conditions.json` from every current program. Regex-extracted tenure/location/amount/copayment snippets remain `candidate_unverified`; they never grant or deny eligibility.
- Three initial PARTIAL rule sets: IBK Changgong 2027 H1, Gyeongbuk 2027 regional digital innovation consortium, Jump-Up 2027. Only the official notice summaries were rechecked. PDF/HWP/HWPX bodies, exceptions, application documents and full overlap restrictions are NOT verified.
- IBK tenure uses its stated closing date. Jump-Up uses the announcement date, which is NOT inferred from the portal posting date; its age test remains unknown until the original announcement date is verified. Exact seven-year boundary dates and leap-day interpretation require original-notice review.
- Missing input, missing/draft/stale evidence (14 days), changed program metadata, an unreviewed source difference or an HTML fetch failure hold the decision. Unknown never becomes a pass. A summary-only rule set cannot produce complete eligibility.
- Results distinguish insufficient information, conditional review, a confirmed mandatory-condition mismatch, expired application windows and non-applicant notices. Full condition satisfaction requires an explicitly complete/full-notice-reviewed ruleset, reviewed attachments and exceptions; none of the three initial production rulesets claims that completeness.
- Public catalog generation is deterministic and is integrated before daily data commits. Existing program records, manual conditions, evidence history and private legacy workspace data are not rewritten by this feature.
- Unit tests: `python -m unittest discover -s scripts -p test_conditions.py -v`; `node --test scripts/test_eligibility.cjs scripts/test_eligibility_ui.cjs`. These include VM/DOM interaction and outbound-request checks, not a real-browser visual acceptance test.

### Editorial sources checked for P0.3

- IBK: https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000127358
- Gyeongbuk: https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000127330
- Jump-Up: https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000127267

Next scope remains attachment-body extraction with source locations, additional reviewed rule coverage, authoritative eligibility exceptions, private application/project management and funding-combination/cash-flow analysis. No submission, loan or investment execution is implemented.

## P0.4 located attachment candidates (2026-10-29)

- New route `attachments.html`; data `data/attachments.json`. Official linked sources only. No user uploads, paid APIs or company data.
- PDF uses pypdf; HWPX body sections use bounded ZIP/XML parsing; HWP v5 body streams use olefile and bounded record decoding. Protected/DRM/distribution documents are not bypassed. No OCR, preview-only fallback, macros, embedded programs or remote XML references.
- Candidates include eligibility, exclusions, overlap restrictions, own contribution, funding amounts, documents and dates. They are exact bounded text snippets with source locations and hashes, NOT validated rules or complete eligibility. PDF layout and HWP/HWPX tables need manual review. HWP/HWPX locators are section/paragraph or section/record, not invented page numbers.
- Daily workflow rotates at most 3 notice pages and 4 linked files, 8 MB/file, with a 30-second isolated parser timeout. Linux workers also have memory/CPU limits; Windows uses the parent wall timeout and size bounds. Original bytes and whole bodies are temporary and never committed.
- On failure preserve the last successful extraction with an explicit failure status. File/list changes require review and suppress previously usable eligibility decisions. A successful later unchanged fetch does not silently clear the review flag.
- Browser-local eligibility loads the public attachment state before enabling checks; no company input is transmitted. No new rules or attachment-completeness claims are automatically created.
- Validation: `python -m unittest discover -s scripts -p test_attachments.py -v`; `node --test scripts/test_attachments.cjs`; all earlier regression suites remain required.
- Formats follow Hancom's published HWP 5.0 document structure and HWPX XML format; PDF extraction limitations follow pypdf's official documentation. This is bounded text extraction, not complete rendering or a legal eligibility opinion.
- Next: review actual attachment conditions against original page/table context, add source-bound reviewed rules and authoritative exceptions, then funding-combination/cash-flow models.

## P0.5 source-bound funding scenarios (2026-10-29)

See RELEASE_P05.md. New route: planning.html. Three reviewed standard annual voucher formulae, six scoped restriction checks across two programs, and one consortium ambiguity held for clarification. Five rule bundles cover three notices; no full eligibility, regional uplift, multiyear sum or funding portfolio optimizer is claimed. Inputs remain memory-only with explicit private local export.

Build order: condition_catalog.py, funding_catalog.py, validate.py, allowlisted build. Both derived catalogs are regenerated after collector updates and after rebase. Tests: python -m unittest discover -s scripts -p test_planning.py -v; node --test scripts/test_planning.cjs scripts/test_planning_ui.cjs. Existing registry and public source records are preserved.
