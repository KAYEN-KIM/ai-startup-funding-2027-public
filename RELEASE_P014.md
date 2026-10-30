# P0.14 — Evidence-linked business-plan drafting workbench

## Scope

Extend the existing `applications.html` preparation board. This is a local drafting and assembly tool, not an AI writer or an official form converter. It adds no model API, secret, subscription, backend, scheduled task or actual application submission.

Each existing application now has eight internal writing sections: customer/problem; product/AI technology; verification/pilots; market/revenue model; execution schedule; budget/self-funding; team; data/IP/risks. These are generic internal prompts, NOT the current call's official headings or evaluation criteria.

Within each section the user separately records self-reported observations/results, future plans/assumptions, and open questions. Actual official-form heading and location can be entered manually. The workbench never invents customers, revenue, performance measurements, market sizes or awards. Empty fields remain explicit gaps in a draft.

Existing requirement and evidence reference IDs can be linked to sections (at most five of each). Evidence statuses/expiry and requirements needing applicability review remain visible; linking a prepared document does not validate a statement or read the actual document. Deleting a ledger reference detaches it from draft sections. New entries reusing a freed reference ID are never silently linked to previous prose.

## User flow

Open the existing preparation board, add a notice, record relevant requirements and document references, then open **사업계획서 초안 작업대**. Enter the project description and section prose. Connect references, review missing information, and choose **현재 초안·누락 미리보기** or **사업계획서 작업 초안(.txt) 저장**.

Draft preview/export is generated from current in-memory inputs. Editing text invalidates an earlier visible preview. Input events update the model without replacing the focused textarea. Draft export does not mark the whole preparation file as saved.

The exported TXT includes self-report/plan labels, reference IDs, source-change warnings, missing fields and review questions. It is NOT ready-to-submit certified content. Users must rewrite it into the actual official form and independently check claims, costs, rights, format, signatures and receipt of submission.

## Persistence / privacy

- New preparation format: `private-funding-applications/v3`.
- Explicit imports of P0.12/v1 and P0.13/v2 preserve earlier tasks, stages and reference ledgers and add empty drafting sections.
- New v3 files are not readable by older v1/v2-only pages; unsupported schema fails instead of discarding prose.
- The existing 512 KiB total UTF-8 limit remains. Section observations and proposals each allow 3,000 UTF-16 code units; open questions allow 1,000. Optional internal character-limit comparisons use Unicode codepoints including whitespace/newlines; they do not emulate official HWP/PDF/portal length rules.
- Only in-memory edits and explicit local file import/export. No automatic save, analytics, private input POST, external model call or raw evidence document upload.
- JSON and TXT downloads are unencrypted private working files. Do not commit applicant data to this public repository.
- Existing calendar and preflight exports do not silently add draft prose.

## Boundaries

No new 2027 eligibility, grant amount or legal rule is introduced. Source failures and earlier attachment download failures are not fixed or reclassified by this UI feature. Source warnings stay attached to the working draft, which may still be edited while public source verification is unavailable. A filled draft is neither selection probability nor eligibility, submission, budget or evidence approval.

## Regression checks

Run existing tests plus:

```
node --test scripts/test_application_plan.cjs scripts/test_application_plan_ui.cjs
node --check assets/application-plan.js
node --check assets/application-plan-view.js
```

The existing UI regression harnesses load the new production module sequence and v3 parser; their original assertions for preparation, reference ledgers and privacy remain. Public build allowlist includes only the two new static JS modules in addition to existing public assets. Actual deployment/test results are reported separately after execution.
