"""Static public/private separation contracts for P0.7; no network or private fixtures."""
import ast
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CashflowContracts(unittest.TestCase):
    def test_public_asset_allowlist(self):
        tree = ast.parse((ROOT / 'scripts/build_public.py').read_text(encoding='utf-8'))
        files = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'FILES' for t in n.targets))
        for p in ['cashflow.html', 'assets/cashflow-core.js', 'assets/cashflow-ui.js', 'assets/cashflow.css']:
            self.assertIn(p, files)
        self.assertEqual(len(files), len(set(files)))
        self.assertFalse(any('Private_' in p or p.startswith('docs/') or p.startswith('scripts/') for p in files))

    def test_navigation(self):
        for p in ['index.html', 'eligibility.html', 'attachments.html', 'planning.html', 'startup.html']:
            self.assertIn('href="cashflow.html"', (ROOT / p).read_text(encoding='utf-8'), p)

    def test_scripts_are_local_and_exist(self):
        html = (ROOT / 'cashflow.html').read_text(encoding='utf-8')
        refs = re.findall(r'<script[^>]+src="([^"]+)"', html)
        self.assertEqual(len(refs), 5)
        for p in refs:
            self.assertTrue(p.startswith('assets/') and (ROOT / p).is_file())

    def test_csp(self):
        text = (ROOT / 'cashflow.html').read_text(encoding='utf-8')
        self.assertIn("form-action 'none'", text)
        self.assertIn("connect-src 'self'", text)
        self.assertNotIn('unsafe-inline', text)
        self.assertIn('autocomplete="off"', text)

    def test_static_inputs_have_labels(self):
        html = (ROOT / 'cashflow.html').read_text(encoding='utf-8')
        for i in re.findall(r'<(?:input|select)\b[^>]*id="([^"]+)"', html):
            self.assertIn('for="' + i + '"', html)

    def test_no_persistence_or_input_transport(self):
        text = (ROOT / 'assets/cashflow-ui.js').read_text(encoding='utf-8')
        for marker in ['localStorage', 'sessionStorage', 'indexedDB', 'sendBeacon', 'XMLHttpRequest', 'WebSocket', 'document.cookie', 'serviceWorker']:
            self.assertNotIn(marker, text)
        self.assertEqual(text.count('fetch('), 1)
        self.assertNotRegex(text, r'method\s*:\s*[\'"]POST')

    def test_core_has_no_network_or_dom_sideeffects(self):
        text = (ROOT / 'assets/cashflow-core.js').read_text(encoding='utf-8')
        for marker in ['fetch(', 'localStorage', 'document.', 'parseFloat(', 'eval(']:
            self.assertNotIn(marker, text)

    def test_source_gate_is_reused_not_bypassed(self):
        text = (ROOT / 'assets/cashflow-core.js').read_text(encoding='utf-8')
        self.assertIn('S.estimate(', text)
        self.assertIn("estimate.code!=='historical_assumption'", text)
        self.assertIn('S.gate(', (ROOT / 'assets/cashflow-ui.js').read_text(encoding='utf-8'))

    def test_export_is_explicit_private(self):
        text = (ROOT / 'assets/cashflow-ui.js').read_text(encoding='utf-8')
        self.assertIn('private-cashflow-plan-export/v1', text)
        self.assertIn('AI_Funding_Private_Cashflow_Assumption.json', text)
        self.assertIn('currentIsValid()', text)

    def test_workflow_runs_new_tests(self):
        text = (ROOT / '.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        for p in ['test_cashflow.cjs', 'test_cashflow_ui.cjs', 'test_cashflow_contract.py', 'assets/cashflow-core.js', 'assets/cashflow-ui.js']:
            self.assertIn(p, text)

    def test_readme_and_method_disclose_scope(self):
        self.assertIn('cashflow.html', (ROOT / 'README.md').read_text(encoding='utf-8'))
        text = (ROOT / 'docs/P07_CASHFLOW.md').read_text(encoding='utf-8')
        for marker in ['분석 모델의 가정', '월중', '제한 지원금', '자동 저장', '미구현']:
            self.assertIn(marker, text)

    def test_no_optimistic_cash_default(self):
        text = (ROOT / 'cashflow.html').read_text(encoding='utf-8')
        for i in ['cfOpening', 'cfSupport', 'cfOperating']:
            tag = re.search(r'<input\b[^>]*id="' + i + r'"[^>]*>', text).group()
            self.assertNotIn('value=', tag)
        self.assertIn('가상 예시', text)


if __name__ == '__main__':
    unittest.main()
