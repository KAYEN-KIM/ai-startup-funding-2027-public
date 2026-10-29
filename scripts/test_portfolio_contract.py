"""P0.8 static deployment and private-input contracts; no live company fixtures."""
import ast
from pathlib import Path
import re
import unittest
R=Path(__file__).resolve().parents[1]

class PortfolioContracts(unittest.TestCase):
    def test_public_allowlist(self):
        t=ast.parse((R/'scripts/build_public.py').read_text(encoding='utf-8'))
        files=next(ast.literal_eval(n.value) for n in t.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='FILES' for x in n.targets))
        for p in ['portfolio.html','assets/portfolio-core.js','assets/portfolio-ui.js','assets/portfolio.css']:self.assertIn(p,files)
        self.assertEqual(len(files),len(set(files)))
        self.assertFalse(any(p.startswith(('scripts/','docs/','config/')) or 'Private_' in p for p in files))
    def test_existing_pages_link_new_screen(self):
        for p in ['index.html','eligibility.html','attachments.html','planning.html','startup.html','cashflow.html']:
            self.assertIn('href="portfolio.html"',(R/p).read_text(encoding='utf-8'),p)
    def test_all_scripts_are_local_files(self):
        h=(R/'portfolio.html').read_text(encoding='utf-8');refs=re.findall(r'<script[^>]+src="([^"]+)"',h)
        self.assertEqual(len(refs),8)
        for p in refs:self.assertTrue(p.startswith('assets/') and (R/p).is_file())
    def test_csp_blocks_form_submission_and_external_script(self):
        h=(R/'portfolio.html').read_text(encoding='utf-8')
        for s in ["form-action 'none'","connect-src 'self'","script-src 'self'",'autocomplete="off"']:self.assertIn(s,h)
        self.assertNotIn('unsafe-inline',h)
    def test_static_controls_have_explicit_labels(self):
        h=(R/'portfolio.html').read_text(encoding='utf-8')
        for s in re.findall(r'<(?:input|select)\b[^>]*id="([^"]+)"',h):self.assertIn('for="'+s+'"',h)
    def test_no_persistence_or_form_transport(self):
        s=(R/'assets/portfolio-ui.js').read_text(encoding='utf-8')
        for m in ['localStorage','sessionStorage','indexedDB','sendBeacon','XMLHttpRequest','WebSocket','document.cookie','serviceWorker']:self.assertNotIn(m,s)
        self.assertEqual(s.count('fetch('),1)
        self.assertNotRegex(s,r'method\s*:\s*[\'"]POST')
    def test_core_is_pure_and_exact_money(self):
        s=(R/'assets/portfolio-core.js').read_text(encoding='utf-8')
        for m in ['fetch(','document.','parseFloat(','eval(','localStorage']:self.assertNotIn(m,s)
        self.assertIn('P.won(',s);self.assertIn('BigInt(',s)
    def test_reuses_previous_evidence_gate_and_budget_math(self):
        s=(R/'assets/portfolio-core.js').read_text(encoding='utf-8')
        self.assertIn('F.financeEstimate(',s)
        self.assertIn("estimate.code!=='historical_assumption'",s)
        self.assertIn("'source_hold'",s)
    def test_export_is_explicit_and_revalidated(self):
        s=(R/'assets/portfolio-ui.js').read_text(encoding='utf-8')
        for m in ['private-portfolio-plan-export/v1','Private_Portfolio_Review.json','function current()','JSON.stringify(input)!==state.stamp','C.review(input,ctx())']:self.assertIn(m,s)
    def test_workflow_runs_all_new_suites(self):
        s=(R/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        for p in ['test_portfolio.cjs','test_portfolio_ui.cjs','test_portfolio_contract.py','assets/portfolio-core.js','assets/portfolio-ui.js']:self.assertIn(p,s)
    def test_no_optimistic_starting_cash_defaults(self):
        s=(R/'portfolio.html').read_text(encoding='utf-8')
        for i in ['pfOpening','pfOperating']:
            self.assertNotIn('value=',re.search(r'<input\b[^>]*id="'+i+r'"[^>]*>',s).group())
        self.assertIn('가상 예시',s);self.assertIn('기관 승인이나 원문 검증이 아닙니다',s)
    def test_scope_explicit_not_an_optimizer(self):
        s=(R/'docs/P08_PORTFOLIO.md').read_text(encoding='utf-8')
        for m in ['분석 모델의 가정','permission은 not_determined','월중','자동 저장','미구현','같은 비용을 다른 ID']:self.assertIn(m,s)
        self.assertIn('portfolio.html',(R/'README.md').read_text(encoding='utf-8'))

if __name__=='__main__':unittest.main()
