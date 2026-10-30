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

## P0.6 early/pre-startup historical preparation (2026-10-29)

See RELEASE_P06.md. New route: startup.html. Three reviewed 2026 reference routes (pre-startup second revision, early general, early deeptech), nine historical funding scenarios, and a seven-item internal preparation checklist. This does not promote reference entries to confirmed 2027 grants or provide a portfolio total. New 2027 title candidates are flagged for separate review.

Regional selection is explicit, special-region cash-or-in-kind is distinct from zero own contribution, and pre-startup calculations cover stage one only. Average support is never a cap or a predicted award. Inputs remain page-memory-only, with explicit private local export and stale-result invalidation.

A daily bounded check verifies the three reviewed original-file hashes, preserving last success on failure and holding changed/stale sources. This is not complete amendment discovery. Registry: config/startup_reference.json; audit: data/startup_sources.json; derived output: data/startup_routes.json. All existing program entries and earlier registries are preserved by this feature.

Tests: python -m unittest discover -s scripts -p test_startup.py -v; node --test scripts/test_startup.cjs scripts/test_startup_ui.cjs. Both generated catalogs and the startup reference catalog are rebuilt after updates/rebase before publication.


## P0.7 월별 현금흐름·독립 대안 비교

`cashflow.html`은 P0.6의 2026 참고조건에 월별 사용자 가정을 연결합니다.
지원금 없음(동일 지출), 가정 일정, 지급 지연을 비교하고 제한된 지원금 잔액은 운영현금에서 분리합니다.
투자·차입·원금·이자는 별도이며 대안 3개를 독립적으로 비교합니다. 2027 확정액·병행 허용·선정 확률을 계산하지 않습니다.
입력은 페이지 메모리에만 남고 명시적 저장 때만 비공개 JSON을 로컬로 내보냅니다.
분석 방법·원문 변경 보류·한계는 `docs/P07_CASHFLOW.md`를 확인하십시오.


## P0.8 — 사업 조합·비용 배분 검토

Open `portfolio.html` from the public dashboard or the P0.7 cashflow screen.
One company may examine up to 3 hypothetical projects and 60 unique cost rows.
Known 2026 startup budgets reuse P0.6/P0.7 source gates; manual project budgets
are explicitly user assumptions. No new 2027 eligibility or combination permission
is inferred. Known startup alternatives are not aggregated, even with disjoint dates.

The ledger flags duplicate cost identifiers, allocation exceeding the actual cost,
missing recognition assumptions, dates outside stated performance periods and
project budget mismatches. Overlap alone is not a legal violation; non-overlap
is not legal clearance. The engine never emits an approved/optimal portfolio.

For arithmetically consistent plans only, a clearly hypothetical combined cashflow
counts corporate operating cost and each unique expense once, and maintains
per-project restricted grant balances. Same economic costs under different IDs,
actual cost recognition, salary participation caps, taxes and settlement are not
automatically verified. Explicit questions are provided for agency review.

All input stays in page memory. No automatic persistence or input transport.
Only explicit buttons export a private JSON report or an agency-question TXT.
Changing inputs or stale reviewed sources revokes the previous result/export.
See `docs/P08_PORTFOLIO.md` for the exact scope and regression commands.


## P0.9 — 원문 제한·비용 증빙·급여 원금 대조

기존 `portfolio.html`에서 사업연도·진행단계·2026 제한목록 대응을 입력합니다. 두 초기창업 HWPX 원문의 단방향 제한과 38개 사업명 대응, 익명 경제적 비용 중복·증빙 준비·같은 인력/월 급여 원금 대조를 연결했습니다. 신청과 수행을 구분하고 TIPS R&D를 TIPS 창업사업화로 간주하지 않습니다. 2027 확정 규칙이나 비용 인정·법정 인건비계상률 판정은 아닙니다. 입력의 자동 저장·전송은 없으며 공개 데이터 3개만 읽습니다. 자세한 범위는 `docs/P09_EVIDENCE_COSTS.md`를 따릅니다.


## P0.10 — 양방향 원문 범위·직접 입력 우회 방지

기존 `portfolio.html`에 양방향 원문 검토표를 연결했습니다. 예비창업 2026 2차 수정 원본의 초기 일반형·딥테크 두 상대를 추가 대조하며, 초기창업의 기존 제한목록 검사는 보존합니다. 알려진 공고를 선택한 직접 입력 금액도 원본 게이트·제한 검사를 건너뛰지 않습니다. 2/2는 양쪽 일부 조항을 대조했다는 뜻이지 병행 허용·전체 적격성 검토 완료가 아닙니다. 새 2027 규칙·공식 비용 인정·최적 지원액은 미확정입니다. 입력은 페이지 메모리만 사용하고 기존 공개 JSON 3개 외의 요청은 추가하지 않습니다. 범위·원문 위치·시험은 `docs/P010_BILATERAL.md`를 참조하십시오.


## P0.11 — 집행 준비·협약 후 지급·자부담 납입 대조

기존 `portfolio.html`의 사업별 입력에 선택형 집행 준비 검토를 추가했습니다. 2026 초기 일반형·딥테크의 협약 후 분할 지급, 지정 계좌·관리시스템, 자부담 납입·현물 증빙, 점검 후 중단·환수 가능성에 관한 일부 원문 조항을 독립된 파일 지문과 연결합니다. 협약 전 지급월, 납입기한, 부족한 자체 납입 입력을 점검하되 자기부담 납입을 비용에 다시 합산하지 않습니다. 2027 조건·실제 비용 인정·정산·환수 산식·은행 계좌 검증은 미완료입니다.

첨부 실패는 HTTP 코드·분류를 제한된 값으로 저장해 403 접근 거부와 네트워크 오류를 구분합니다. 인증·접근 제한을 우회하지 않으며, 실패를 성공이나 변경 없음으로 바꾸지 않습니다. 기존 이력과 마지막 성공을 유지합니다. 입력은 현재 페이지 메모리만 사용하며 새 사용자 데이터 전송·자동 저장은 없습니다. 근거 위치·검토 범위·검증 결과는 `docs/P011_EXECUTION.md`를 참조하십시오.

P0.11 수집 보완: 기업마당 임시 다운로드 값은 저장하지 않고 고정 파일 식별자를 현재 공식 공고의 첨부 링크와 대조해 요청 시점에만 사용합니다. 울산·인천의 이전 실패 첨부 2건은 정상 본문 추출로 복구했고 실패 이력은 보존했습니다. 공개 화면에서는 최신 링크를 얻을 수 있는 공식 공고로 안내합니다. 최종 로컬 시험 951개 통과.


## P0.12 — 신청 준비 보드·일정·명시적 로컬 이어하기

`applications.html`에서 최대 12개 공고, 공고당 20개 준비 작업과 내부 목표일·자체 진행상태를 관리합니다. 공개 목록의 표시 정보 변경을 비교하며, 공통 준비 예시는 공식 필수서류나 신청 적격성으로 처리하지 않습니다. 자동 저장·서버 전송 없이 명시적 비공개 JSON 저장·확인 후 복원과 `.ics` 일정 파일을 제공합니다. 실제 신청·선정 확인·캘린더 동기화·로그인 공동 관리는 하지 않습니다. 범위와 검증은 `docs/P012_APPLICATIONS.md`를 따릅니다.


## P0.13 — 요구사항·자료 참조 연결·제출 전 누락 점검

기존 `applications.html`에 공고별 요구사항 30개와 자료 참조 30개(요구사항당 연결 5개)를 추가했습니다. 요구사항 출처·원문 위치·적용 여부, 자료 상태·발급일·사용자 입력 유효기한을 대조하고 명시적 버튼으로 비공개 TXT 점검표를 저장합니다. 자료 원본을 읽거나 올리지 않으며 ‘입력 범위에서 누락 미발견’은 공식 서류 완비·신청 적격성·제출 승인과 다릅니다.

P0.12 `private-funding-applications/v1` 파일을 미리보기·확인 후 복원하며, 기존 작업·날짜·상태를 보존하고 빈 문서 준비 영역만 추가합니다. 새 저장 형식은 v2, UTF-8 최대 512 KiB입니다. 새 파일은 이전 v1 화면에서 읽을 수 없습니다. 공고 기준값 확인과 문서 자체 대조 기록은 별도로 관리하며, 입력 변경·공고 표시 변경·오래된 수집 상태는 재확인으로 남깁니다. 입력은 페이지 메모리에만 존재하고 같은 공개 JSON 2개 외의 요청은 없습니다. 공식 제출요구 자동 추출, 원본 증빙 검증, 공동관리·자동 제출은 포함하지 않습니다.

범위와 제한은 `docs/P013_REQUIREMENTS_EVIDENCE.md`, 새 시험은 `node --test scripts/test_application_dossier.cjs scripts/test_application_dossier_ui.cjs`를 참조하십시오.

## P0.14: evidence-linked business-plan drafting

The existing **신청 준비 보드** (`applications.html`) now includes **사업계획서 초안 작업대**. Write eight internal sections, separate self-reported observations from future plans, map actual form headings manually, and link the existing requirement/document reference IDs. Missing prose, missing evidence links, draft/expired references and user-entered length assumptions remain visible. Preview and explicit TXT export always assemble current inputs; they do not generate unsupported claims or call an AI model.

The preparation file format is now `private-funding-applications/v3`. Explicit v1/v2 imports preserve previous tasks and ledgers and add blank plan sections. The 512 KiB limit and memory-only/no-auto-save privacy model remain. Save the preparation JSON before refreshing. Raw evidence documents are not uploaded/read. New v3 files require the new page; old parsers reject them instead of losing prose. TXT output is an internal working draft, not a verified official form or a submitted application.

See `RELEASE_P014.md` for limits and boundaries. New regression command:
`node --test scripts/test_application_plan.cjs scripts/test_application_plan_ui.cjs`.


## P0.15 — AI 없이 도는 일일 보고·검토 대기 봇

공개 현황판의 `매일 봇 보고`에서 경로별 이번 실행 결과, 누적 첨부 실패,
변경 검토, 기재 마감을 확인합니다. `scripts/bot_briefing.py`가 기존 공개 자료만
정해진 규칙으로 집계하며 모델·외부 AI API·자동 CLI 호출은 없습니다.
필요한 해석 작업은 `scripts/prepare_cli_review.py`로 공개 근거 요청 파일만
생성하여 수동 CLI로 인계합니다. 자동 승인·개인정보 업로드·신청 실행은 하지 않습니다.
보고서·RSS·GitHub 작업 요약은 ChatGPT 메시지나 자동 휴대전화 푸시가 아닙니다.
전체 기관 탐색·새 원문 자격 검증은 자동 대체 완료로 주장하지 않습니다.
범위·검증·운영 경계: `docs/P015_BOT_FIRST.md`.


## P0.16 — 공식기관 직접 수집 봇

기존 현황판 홈의 `#agencyReport`에서 중기부 사업공고 RSS와 NIPA 최근 3페이지의
독립 관측을 확인합니다. 정기 AI 호출·새 인증키 없이 동작하며, 기존 공고·검증 조건을
덮어쓰거나 후보를 신청 가능으로 자동 승인하지 않습니다. 운영기관·입찰·정책·공모전은
별도 분류합니다. 출처 실패·반복 페이지·형식 변경은 이전 관측을 보존하고 실패로 남깁니다.
정확한 URL 일치와 제목 일치는 대조 단서일 뿐 자동 병합·지원금 합산의 근거가 아닙니다.

KOCCA의 확인된 목록은 robots 정책에 따라 수집하지 않으며, K-Startup 독립 수집도
아직 미연결입니다. 기존 기업마당 수집과 혼동하지 않도록 화면에 표시합니다.
`data/agency_discovery.json`·`data/agency_report.md`는 공개 목록 관측만 포함합니다.
범위·보안·실패 처리·시험은 `docs/P016_AGENCY_BOTS.md`를 참조하십시오.
