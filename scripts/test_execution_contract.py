"""Publication and independently pinned execution-source contract, not legal validation."""
import json
from pathlib import Path
import re
import unittest
ROOT=Path(__file__).resolve().parents[1]

class ExecutionContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js=(ROOT/'assets/portfolio-execution.js').read_text(encoding='utf-8')
        cls.ui=(ROOT/'assets/portfolio-ui.js').read_text(encoding='utf-8')
        cls.html=(ROOT/'portfolio.html').read_text(encoding='utf-8')
        cls.registry=json.loads((ROOT/'config/startup_reference.json').read_text(encoding='utf-8'))
    def test_pins_two_reviewed_originals_only(self):
        pins=json.loads(re.search(r'const REVIEWED=(\{.*\});',self.js)[1])
        expected={r['id']:{'url':r['source']['url'],'sha256':r['source']['sha256']} for r in self.registry['records'] if r['id'] in ('early-general','early-deep')}
        self.assertEqual(pins,expected)
    def test_source_independent_of_other_module_updates(self):
        self.assertIn('sourceDef=REVIEWED[identity]',self.js)
        self.assertNotIn('sourceDef=E.SOURCES[identity]',self.js)
    def test_locators_are_not_invented_page_numbers(self):
        self.assertIn('0-based paragraph indices',self.js)
        self.assertIn('payment:803,bank:812,contribution:832,monitoring:805',self.js)
        self.assertIn('payment:656,bank:665,contribution:685,monitoring:658',self.js)
    def test_reviewed_year_is_2026_not_automatic_2027(self):
        self.assertIn("input.review_year===2026&&p.award_year==='2026'",self.js)
        self.assertIn('historical_reference_not_current_rule',self.js)
    def test_module_has_no_io_or_persistence(self):
        for bad in ('fetch(', 'XMLHttpRequest','sendBeacon','localStorage','sessionStorage','indexedDB','document.cookie','WebSocket'):
            self.assertNotIn(bad,self.js)
    def test_ui_still_reads_three_public_datasets_only(self):
        self.assertIn("names=['startup_routes','programs','startup_sources']",self.ui)
        self.assertEqual(self.ui.count('fetch('),1)
        self.assertNotIn('localStorage',self.ui)
    def test_new_script_before_core_and_ui(self):
        self.assertLess(self.html.index('assets/portfolio-execution.js'),self.html.index('assets/portfolio-core.js'))
        self.assertLess(self.html.index('assets/portfolio-core.js'),self.html.index('assets/portfolio-ui.js'))
    def test_explicit_public_build_allowlist(self):
        s=(ROOT/'scripts/build_public.py').read_text(encoding='utf-8')
        self.assertEqual(s.count("'assets/portfolio-execution.js'"),1)
    def test_execution_never_claims_approval(self):
        self.assertIn('actual_settlement_approved:false',self.js)
        self.assertIn("official_cost_eligibility:'not_determined'",self.js)
        self.assertIn('settlement_model_verified:false',self.js)
    def test_deposit_has_zero_cashflow_mutation(self):
        self.assertIn("cashflow_adjustment_won:'0'",self.js)
        self.assertNotIn('simulate(',self.js)
    def test_workflow_runs_new_tests(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        for name in ('test_portfolio_execution.cjs','test_execution_contract.py','test_attachment_transport.py'):
            self.assertIn(name,s)
    def test_existing_failure_gate_retained(self):
        s=(ROOT/'.github/workflows/daily-check-and-deploy.yml').read_text(encoding='utf-8')
        self.assertIn("steps.attachments.outcome == 'failure'",s)
        self.assertIn('Collection incomplete/failed',s)

if __name__=='__main__':unittest.main()
