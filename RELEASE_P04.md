# P0.4 — Source-bound attachment evidence

Development date: 2026-10-29 (Asia/Seoul)
Parent code: f186b9f; integrated public-data baseline: 97d71d4.

## Delivered scope

- Public attachment evidence route: attachments.html.
- Official notice identity and linked attachment discovery; no user uploads.
- Bounded PDF, HWPX body-section and HWP v5 BodyText extraction.
- Exact bounded excerpts with PDF page/text-line or HWP/HWPX section/paragraph/record locations.
- Eligibility, exclusion, overlap, contribution, amount, documents and deadline candidates remain unverified.
- File SHA-256, text SHA-256, parse status, last success, failures and bounded attempt history.
- File or manifest changes cause review holds in the existing browser-local eligibility screen.
- Failure retains prior successful extraction without treating it as current verified evidence.
- No new eligibility rules or attachment-completeness flags are generated.
- Scheduled workflow now includes bounded attachment collection and public-data validation.

## Local acceptance completed

At 2026-10-29T12:12:24+09:00, the final targeted attachment refresh succeeded.
Six distinct linked documents across three real notices were successfully read:
PDF: 3; HWPX: 2; HWP: 1. There were no unresolved parsing failures among these six.
The three notices were IBK Changgong 2027 H1, Gyeongbuk 2027 regional digital innovation, and Jump-Up 2027.
Ninety candidate excerpts were retained. This is NOT 90 verified conditions; paired PDF/HWPX versions can repeat information.

214 local regression checks passed: 107 Python unit tests, 4 legacy compatibility checks, 103 Node/VM/DOM tests.
The Windows ZIP filename-normalization case and HWP raw-DEFLATE CRC32/ISIZE trailer case were reproduced and covered by regression tests.
The prior HWP failure remains visible in attempt history; it was not rewritten as a past success.
Public build validation passed: 153 program records, 6 allowlisted JSON files, 21 explicitly allowlisted deployed files.
The three partial eligibility rulesets remain partial. Existing programs.json, eligibility_rules.json, evidence.json, change_reviews.json and conditions.json were unchanged by this feature implementation.

## Safety and limits

- Runs inspect at most 3 official notice pages and 4 linked files; this is rotating partial coverage, not a complete crawl.
- File limit 8 MB, decompression bounds, official-host and public-IP restrictions, guarded redirects, isolated parser wall timeout 30 seconds.
- Linux parser subprocess additionally has memory and CPU bounds. This is not a full OS security sandbox.
- Original bytes and complete extracted bodies are temporary; only bounded candidate excerpts and provenance are public.
- Contact-shaped data is redacted from snippets. Source text is rendered escaped, never executed.
- Encrypted/DRM/distribution-protected files are not bypassed. No OCR, paid models or new credentials.
- PDF table layout, images, footnotes, legal exceptions and rule completeness are not certified by extraction.
- HWP/HWPX section locators are not invented printed-page numbers.
- Company inputs remain in browser memory; no private company or application data is added to this repository.

GitHub verification/deployment results should be checked in the workflow run; local acceptance alone does not prove public deployment.
