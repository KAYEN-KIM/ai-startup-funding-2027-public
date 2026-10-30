# P0.15 — AI-free daily briefing and review queue

## Runtime boundary

The existing scheduled Python collectors and browser calculators already use deterministic code.
This release replaces the routine summarization need with `scripts/bot_briefing.py`, not a new AI service.
The bot reads six explicit PUBLIC collector JSONs and `config/automation_policy.json`. It does not
read application-board files, profiles, private drafts, CLI credentials or environment API keys.
No network request, model call, subprocess or automatic rule approval occurs in report generation.
Existing official-source HTTP requests and `BIZINFO_API_KEY` are retained; this key is not an AI key.

## Outputs and observations

- `data/bot_briefing.json`: scoped current-attempt results, input fingerprints, retained unresolved
  items, next-seven-day stated deadlines and bounded review queue (120 rows; explicit truncation).
- `data/bot_briefing.md`: deterministic Korean report, also added to the GitHub Actions job summary.
- `data/bot_feed.xml`: current-report RSS entry. A reader must poll it; no mobile/ChatGPT push is sent.
- The existing index page has a bot report section. Original UI/eligibility/planning/application inputs
  remain unchanged. The new UI only fetches the public report and sends no user-entered data.

A recent successful collector run NEVER clears old failed attachment records. API completeness,
rotating HTML fetches, bounded attachment extraction, and the three historical original hashes are
separate lanes. Stale (>30h), missing or future timestamps are not called successful. A workflow
failure overrides retained success records when a process crashed before updating its audit file.
Date-only deadlines remain time-unknown on their day. Operator recruitment, policy budgets and
reference-year programs are not upcoming beneficiary opportunities. All new-year discovery items
remain unverified. Priority P0/P1/P2 is a review ordering, not a funding/eligibility score.

Reports do not add new agencies or independently verify every official notice/attachment.
Ending a separate model-driven search removes its broad ad-hoc editorial search; the bot's current
coverage remains the explicitly recorded official API and bounded original/attachment paths.
Do not represent this as equivalent to complete multi-agency research.

## AI only when genuinely needed, via manual CLI

`python scripts/prepare_cli_review.py --program-id <existing-public-id> --out <new-local-json>`

The output must be outside this public repository. Omit the program filter for the bounded queue.
The helper validates current public input fingerprints, creates the file exclusively and NEVER
executes a model. The packet contains public review issues and official links only, with no applicant
or draft data. Use an installed CLI manually for an actual judgment task. No API fallback, unattended
CLI launch, automated rule acceptance or deployment is provided. CLI output remains an unverified
proposal requiring original-source review. A downloaded packet is not encrypted.

## Scheduled operation and failure handling

The existing 23:00 UTC (08:00 KST) schedule remains. GitHub may delay scheduled runs.
The report is built before the allowlisted data commit, after any rebase and in the public-only build.
Identical same-day input/outcome snapshots reuse report time briefly to prevent build/commit skew.
Report generation never overwrites collector state or editorial rules. Existing fail-after-publish
collector handling remains intact. The report can show honest partial/failure data on a published site.
GitHub Actions job summaries and RSS are not automatic ChatGPT messages. Any change to the separate
ChatGPT automation is an account operation, not performed by repository code.

## Tests

```
python -m unittest discover -s scripts -p test_bot_briefing.py -v
python -m unittest discover -s scripts -p test_bot_contract.py -v
node --test scripts/test_bot_report.cjs
python scripts/bot_briefing.py
python scripts/build_public.py
```

All previous regression suites remain required. Real-browser visual testing, new official source
coverage, full rule verification and live AI CLI execution are separate work; this release does not
claim them. No new external paid dependency, API key or applicant/cloud data store is introduced.
