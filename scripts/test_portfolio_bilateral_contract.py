"""P0.10 publication, source identity, and privacy contracts."""
import ast
import json
from pathlib import Path
import re
import unittest
R=Path(__file__).resolve().parents[1]
class BilateralContracts(unittest.TestCase):
    def test_pre_original_matches_preserved_registry(self):
        src=(R/'assets/portfolio-bilateral.js').read_text(encoding='utf-8')
        rec=next(r for r in json.loads((R/'config/startup_reference.json').read_text(encoding='utf-8'))['records'] if r['id']=='pre')
        self.assertIn(rec['source']['url'],src)
        self.assertIn(rec['source']['sha256'],src)
        self.assertIn('S.gate(route,ctx)',src)
    def test_direction_source_gate_uses_effective_notice(self):
        text=(R/'assets/portfolio-bilateral.js').read_text(encoding='utf-8')
        self.assertIn("p.route_id==='manual'?(p.notice_code||'unknown'):p.route_id",text)
        self.assertIn("if(KNOWN.includes(code))holds.push(...gate(code,ctx)",text)
    def test_pre_target_scope_is_explicitly_partial(self):
        text=(R/'assets/portfolio-bilateral.js').read_text(encoding='utf-8')
        self.assertIn("const PRE_TARGETS=['early-general','early-deep'];",text)
        self.assertIn("fromCode==='pre'?PRE_TARGETS.includes(toCode):E.CATALOG.some",text)
    def test_no_automatic_permission_even_with_two_directions(self):
        text=(R/'assets/portfolio-bilateral.js').read_text(encoding='utf-8')
        self.assertIn("permission:'not_determined'",text)
        self.assertIn('both_directions_partial',text)
        self.assertNotIn("permission:'approved'",text)
        self.assertNotIn("permission:'allowed'",text)
    def test_no_private_storage_or_network_in_rules(self):
        text=(R/'assets/portfolio-bilateral.js').read_text(encoding='utf-8')
        for value in ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'document.', 'eval(']:
            self.assertNotIn(value,text)
    def test_explicit_allowlist_once(self):
        tree=ast.parse((R/'scripts/build_public.py').read_text(encoding='utf-8'))
        files=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='FILES' for t in n.targets))
        self.assertEqual(files.count('assets/portfolio-bilateral.js'),1)
        self.assertEqual(len(files),len(set(files)))
    def test_browser_dependency_order(self):
        text=(R/'portfolio.html').read_text(encoding='utf-8')
        refs=re.findall(r'<script[^>]+src="([^"]+)"',text)
        for a,b in [('portfolio-evidence','portfolio-bilateral'),('portfolio-bilateral','portfolio-core'),('portfolio-core','portfolio-ui')]:
            self.assertLess(refs.index('assets/'+a+'.js'),refs.index('assets/'+b+'.js'))
    def test_same_public_gets_no_new_private_endpoint(self):
        text=(R/'assets/portfolio-ui.js').read_text(encoding='utf-8')
        self.assertEqual(text.count('fetch('),1)
        self.assertIn("names=['startup_routes','programs','startup_sources']",text)
        self.assertNotIn('type="file"',(R/'portfolio.html').read_text(encoding='utf-8'))
    def test_tests_gate_workflow_and_schedule_preserved(self):
        text=(R/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        for v in ['test_portfolio_bilateral.cjs','test_portfolio_bilateral_contract.py','node --check assets/portfolio-bilateral.js','0 23 * * *','needs: verify']: self.assertIn(v,text)
    def test_release_records_scope_and_no_private_copy(self):
        text=(R/'docs/P010_BILATERAL.md').read_text(encoding='utf-8')
        for v in ['2026','2027','2/2','SHA-256','직접 입력','메모리','부분','초기 일반형','딥테크']:self.assertIn(v,text)
if __name__=='__main__':unittest.main()
