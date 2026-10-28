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
