"""Integration contracts: no silent AI fallback, no change to private application storage."""
import ast
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class BotContractTests(unittest.TestCase):
    def test_policy_enforces_bot_first(self):
        p=json.loads((ROOT/'config/automation_policy.json').read_text(encoding='utf-8'))
        self.assertFalse(p['scheduled_ai_calls']);self.assertFalse(p['ai_api_calls'])
        self.assertEqual(p['optional_ai_transport'],'manual_cli_only')
    def test_report_imports_do_not_have_model_network_or_subprocess(self):
        tree=ast.parse((ROOT/'scripts/bot_briefing.py').read_text(encoding='utf-8'))
        names=set()
        for n in ast.walk(tree):
            if isinstance(n,ast.Import):names.update(x.name.split('.')[0] for x in n.names)
            if isinstance(n,ast.ImportFrom):names.add(n.module or '')
        self.assertFalse(names & {'openai','anthropic','google','requests','httpx','socket','subprocess','urllib.request'})
    def test_cli_helper_does_not_execute_model(self):
        s=(ROOT/'scripts/prepare_cli_review.py').read_text(encoding='utf-8')
        self.assertNotIn('subprocess',s);self.assertNotIn('os.system',s)
        self.assertIn("'executes_ai': False",s)
    def test_workflow_keeps_daily_schedule(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        self.assertIn('"0 23 * * *"',s)
    def test_workflow_has_report_test_and_summary(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        for x in ['test_bot_briefing.py','test_bot_contract.py','test_bot_report.cjs','GITHUB_STEP_SUMMARY','bot_briefing.py']:
            self.assertIn(x,s)
    def test_workflow_does_not_add_ai_keys_or_cli_execution(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8').lower()
        for x in ['openai_api_key','anthropic_api_key','gemini_api_key','codex exec','claude -p','gemini -p']:
            self.assertNotIn(x,s)
    def test_failure_guard_retained(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        self.assertIn("steps.attachments.outcome == 'failure'",s)
        self.assertIn('exit 1',s)
    def test_report_is_explicit_public_allowlist(self):
        s=(ROOT/'scripts/build_public.py').read_text(encoding='utf-8')
        for x in ['data/bot_briefing.json','data/bot_briefing.md','data/bot_feed.xml','assets/bot-report.js']:
            self.assertIn(x,s)
        self.assertNotIn("'config/automation_policy.json'",s)
        self.assertNotIn("'scripts/prepare_cli_review.py'",s)
    def test_ui_has_single_embedded_report_not_private_forms(self):
        s=(ROOT/'index.html').read_text(encoding='utf-8')
        self.assertEqual(s.count('id="botReport"'),1)
        self.assertIn('assets/bot-report.js',s);self.assertIn('data/bot_feed.xml',s)
    def test_report_js_no_automatic_storage(self):
        s=(ROOT/'assets/bot-report.js').read_text(encoding='utf-8')
        for x in ['localStorage','sessionStorage','sendBeacon','XMLHttpRequest','document.cookie']:
            self.assertNotIn(x,s)
    def test_no_new_model_dependency(self):
        s=(ROOT/'requirements-attachments.txt').read_text(encoding='utf-8').lower()
        for x in ['openai','anthropic','google-genai','langchain']:
            self.assertNotIn(x,s)
    def test_manual_cli_packet_not_part_of_workflow(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        self.assertNotIn('run: python scripts/prepare_cli_review.py',s)

if __name__=='__main__':unittest.main()
