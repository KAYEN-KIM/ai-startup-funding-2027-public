"""P0.9 immutable public evidence / private-input integration contracts."""
import ast
import json
from pathlib import Path
import re
import unittest
R=Path(__file__).resolve().parents[1]
class EvidenceContracts(unittest.TestCase):
    def test_two_original_hashes_are_bound_to_existing_registry(self):
        src=(R/'assets/portfolio-evidence.js').read_text(encoding='utf-8')
        records=json.loads((R/'config/startup_reference.json').read_text(encoding='utf-8'))['records']
        for r in records:
            if r['id'] in ['early-general','early-deep']:
                self.assertIn(r['source']['url'],src)
                self.assertIn(r['source']['sha256'],src)
        self.assertIn('S.gate(route,ctx)',src)
        self.assertIn('reference_year:2026',src)
    def test_source_module_is_allowlisted_once(self):
        tree=ast.parse((R/'scripts/build_public.py').read_text(encoding='utf-8'))
        files=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='FILES' for x in n.targets))
        self.assertEqual(files.count('assets/portfolio-evidence.js'),1)
        self.assertFalse(any('private' in p.lower() for p in files))
    def test_source_module_loads_before_review_and_ui(self):
        text=(R/'portfolio.html').read_text(encoding='utf-8')
        refs=re.findall(r'<script[^>]+src="([^"]+)"',text)
        self.assertLess(refs.index('assets/portfolio-evidence.js'),refs.index('assets/portfolio-core.js'))
        self.assertLess(refs.index('assets/portfolio-core.js'),refs.index('assets/portfolio-ui.js'))
    def test_no_new_backend_or_persistence_in_evidence_module(self):
        text=(R/'assets/portfolio-evidence.js').read_text(encoding='utf-8')
        for forbidden in ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'document.', 'eval(', 'parseFloat(']:self.assertNotIn(forbidden,text)
    def test_review_never_claims_two_sided_permission_or_cost_verification(self):
        text=(R/'assets/portfolio-evidence.js').read_text(encoding='utf-8')
        for marker in ["permission:'not_determined'",'counterparty_identity:',"official_cost_eligibility:'not_determined'",'statutory_labor_rate_rules:false','self_report_only_no_documents_read']:self.assertIn(marker,text)
        self.assertNotIn("permission:'approved'",text)
    def test_source_mismatch_blocks_previous_result_and_export(self):
        text=(R/'assets/portfolio-core.js').read_text(encoding='utf-8')
        self.assertIn("if(evidence.holds.length)return response('source_hold'",text)
        self.assertIn('issues.push(...evidence.issues)',text)
        self.assertIn('can_export:false,can_simulate:false',text)
    def test_workflow_runs_added_tests(self):
        text=(R/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        for marker in ['test_portfolio_evidence.cjs','test_portfolio_evidence_contract.py','node --check assets/portfolio-evidence.js']:self.assertIn(marker,text)
        self.assertIn('0 23 * * *',text)
    def test_doc_explains_reference_and_arithmetic_limits(self):
        text=(R/'docs/P09_EVIDENCE_COSTS.md').read_text(encoding='utf-8')
        for marker in ['38','2026','현물','인건비계상률','반대 사업','사용자','증빙','미검증','자동 저장']:self.assertIn(marker,text)
    def test_no_new_form_request_or_upload_control(self):
        text=(R/'assets/portfolio-ui.js').read_text(encoding='utf-8')
        self.assertEqual(text.count('fetch('),1)
        self.assertNotIn('type="file"',(R/'portfolio.html').read_text(encoding='utf-8'))
        self.assertIn("names=['startup_routes','programs','startup_sources']",text)
if __name__=='__main__':unittest.main()
