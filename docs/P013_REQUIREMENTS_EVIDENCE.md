# P0.13 — 신청 요구사항·자료 참조 연결·제출 전 누락 점검

## Delivered scope

The existing `applications.html` is extended, not replaced. Each of up to 12
application cards may have 30 manually recorded requirements and 30 document
references. A requirement links to up to 5 references. A single reference may
support several requirements without pretending to represent multiple documents.

Nothing is prepopulated as an official required-document list. Origins distinguish
internal preparation from a user transcription of a notice, and the latter needs
a user-entered locator. Applicability is unknown, self-assessed needed, conditional,
or self-assessed not applicable. The last needs a reason; an all-excluded or empty
list is not complete. Unresolved conditions, missing links, unfinished references,
future issue dates and expiry before today/internal target are reported separately.

Document references are labels/status/dates only. This feature does not open,
upload, hash, render or validate the user's source documents. No signing,
authentication, official application submission, automated outbound email/calendar
write, grant-law interpretation, new eligibility rate or 2027 grant assumption is
introduced. A self-reported possession state does not establish authenticity,
correct official form, completeness, document validity policy or agency acceptance.

## Source comparison and computed results

A separate explicit self-review records the current public display snapshot.
Editing requirements or document references revokes that record. The ordinary
P0.12 board metadata acknowledgement cannot silently acknowledge this separate
review. Changed/missing notice metadata, candidate/historical/non-applicant mode,
unknown/expired/today-time-unknown reception, a future self-review timestamp,
missing review or a stale/failed/partial monitor holds the preflight review.

The strongest result is `internal_gaps_not_detected` in the entered scope only.
`official_requirements_complete` and `submission_verified` always remain false;
eligibility remains `not_determined`. There is no score or probability.
Display-snapshot comparison is NOT full-attachment evidence checking. Same-URL
attachment changes or omitted official requirements may not be detected here.
The existing source-bound eligibility/portfolio modules remain separate.

A TXT preflight report is generated anew for the selected card on explicit click.
It includes unresolved items, requirement-to-reference links, self-entered dates,
remaining tasks and official-submission questions. It contains NO document bytes
and is not an official application or a successful submission receipt.

## Compatibility, privacy and boundaries

`assets/applications-core.js` (P0.12 v1 engine) is unchanged. The new pure facade in
`application-dossier.js` provides `private-funding-applications/v2`. Importing a
valid v1 file preserves all previous tasks, dates, snapshots and stages and adds
empty ledgers. Existing board/calendar functions are reused through a stripped
v1 view; dossiers are not included in ICS. v2 files are not readable by old v1
screens; the UI explains this. No current data is replaced before file preview
and confirmation. Unknown fields, versions, invalid dates/enums, duplicate IDs,
dangling/duplicate links, prototype keys, excessive depth and >512 KiB UTF-8 are
rejected. The legacy v1 subset must still fit the existing 256 KiB validation.

Only the existing two public JSON GETs remain. There is no new dependency,
network API, secret, database, login, browser persistence or automatic upload.
Private input remains in page memory, disappears on refresh and is written only
through explicit plaintext local downloads. Private JSON/TXT is not encrypted and
must not be committed to this public repository. Public allowlisting adds only
two static JS files. Existing official data/config registries are not edited.

Technical references checked: https://www.w3.org/TR/FileAPI/ and
https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file).

## Validation

`node --test scripts/test_application_dossier.cjs scripts/test_application_dossier_ui.cjs`

New tests: 47 engine/validation/migration tests and 24 VM/DOM/privacy tests.
Existing P0.12 UI tests load the new facade; original P0.12 core tests remain
unchanged. Full prior regression suites, public-data validation and the explicit
public build remain required. Real-browser visual results, actual CI counts,
commit/deployment IDs and live file hashes must be recorded from execution.

## Deferred

Full authoritative required-document extraction, manual rule-review coverage,
real evidence-file analysis, official form filling, proposal generation, shared
private workspace, encrypted cloud sync and actual application submission are
not delivered. This release adds the manual evidence-linked preparation step.
