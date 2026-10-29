"""P0.5 registry, source binding, determinism and old-data preservation tests."""
import copy, json, unittest
from pathlib import Path
from funding_catalog import validate_registry, build_catalog, state_reasons
ROOT=Path(__file__).resolve().parents[1]
def fixture():
    reg=json.loads((ROOT/'config/funding_rules.json').read_text(encoding='utf-8'))
    reg['records']=reg['records'][:1]; r=reg['records'][0];pid=r['program_id'];e=r['evidence']
    p=copy.deepcopy(r['program_snapshot']);p['mode']='beneficiary'
    a={'schema':'public-funding-attachments/v1','generated_at':reg['reviewed_at'],'programs':{pid:{'notice_source':p['source'],'manifest_sha256':e['manifest_sha256'],'document_ids':[e['document_id']],'review_required':False,'notice_status':'links_available'}},
    'records':{e['document_id']:{'program_id':pid,'url':e['url'],'sha256':e['sha256'],'observed_sha256':e['sha256'],'extraction':{'sha256':e['sha256']},'status':'text_extracted','last_error':None,'review_required':False}}}
    return {'programs':{'items':[p],'generated_at':reg['reviewed_at']},'registry':reg,'attachments':a,'evidence':{'records':{}},'reviews':{'items':[]}}
class PlanningCatalogTests(unittest.TestCase):
    def test_registry_valid(self):validate_registry(fixture()['registry'])
    def test_production_registry_valid(self):validate_registry(json.loads((ROOT/'config/funding_rules.json').read_text(encoding='utf-8')))
    def test_deterministic_and_no_mutation(self):
        f=fixture();before=copy.deepcopy(f);one=build_catalog(**f);two=build_catalog(**f);self.assertEqual(one,two);self.assertEqual(f,before)
        self.assertEqual(one['records'][0]['source_state'],'ready')
    def test_no_full_eligibility_claim(self):
        f=fixture();f['registry']['records'][0]['coverage']='complete'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_bad_denom_model(self):
        f=fixture();f['registry']['records'][0]['finance']['model']='percent_of_grant'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_bad_ratio_sum(self):
        f=fixture();f['registry']['records'][0]['finance']['inkind_max_bps']=1500
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_ratio_bool_not_int(self):
        f=fixture();f['registry']['records'][0]['finance']['cash_min_bps']=True
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_negative_cap(self):
        f=fixture();f['registry']['records'][0]['finance']['max_support_won']=-1
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_regional_uplift_not_inferred(self):
        f=fixture();f['registry']['records'][0]['finance']['cap_scope']='any_location'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_multi_year_sum_not_supported(self):
        f=fixture();f['registry']['records'][0]['finance']['period']='three_years'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_private_record_key_rejected(self):
        f=fixture();f['registry']['records'][0]['company_name']='private'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_unapproved_evidence_url(self):
        f=fixture();f['registry']['records'][0]['evidence']['url']='https://evil.example/x'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_secret_bearing_evidence_url(self):
        f=fixture();f['registry']['records'][0]['evidence']['url']='https://www.bizinfo.go.kr/a?api_key=secret'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_missing_questions(self):
        f=fixture();f['registry']['records'][0]['open_questions']=[]
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_wrong_pages(self):
        f=fixture();f['registry']['records'][0]['evidence']['pages']=[0]
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_bad_hash(self):
        f=fixture();f['registry']['records'][0]['evidence']['sha256']='bad'
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_duplicate_rule_id(self):
        f=fixture();f['registry']['records'].append(copy.deepcopy(f['registry']['records'][0]))
        with self.assertRaises(ValueError):build_catalog(**f)
    def test_doc_latest_fetch_failed(self):
        f=fixture();r=f['registry']['records'][0];f['attachments']['records'][r['evidence']['document_id']]['last_error']='timeout'
        self.assertIn('document_not_current',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_doc_sha_mismatch(self):
        f=fixture();r=f['registry']['records'][0];f['attachments']['records'][r['evidence']['document_id']]['observed_sha256']='d'*64
        self.assertIn('document_changed_or_missing',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_manifest_mismatch(self):
        f=fixture();r=f['registry']['records'][0];f['attachments']['programs'][r['program_id']]['manifest_sha256']='d'*64
        self.assertIn('manifest_changed_or_missing',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_notice_fetch_failed(self):
        f=fixture();r=f['registry']['records'][0];f['attachments']['programs'][r['program_id']]['notice_status']='source_unavailable'
        self.assertIn('notice_review_required',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_program_changed(self):
        f=fixture();f['programs']['items'][0]['deadline']='2026-11-14'
        self.assertIn('program_changed_or_missing',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_missing_program(self):
        f=fixture();f['programs']['items']=[]
        self.assertIn('program_changed_or_missing',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_html_changed(self):
        f=fixture();r=f['registry']['records'][0];f['evidence']['records'][r['program_id']]={'review_required':True}
        self.assertIn('html_review_required',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_metadata_diff_pending(self):
        f=fixture();r=f['registry']['records'][0];f['reviews']['items']=[{'id':'new','program_id':r['program_id'],'status':'pending'}]
        self.assertIn('unreviewed_metadata_difference',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_previously_reviewed_diff_allowed(self):
        f=fixture();r=f['registry']['records'][0];r['reviewed_difference_ids']=['known'];f['reviews']['items']=[{'id':'known','program_id':r['program_id'],'status':'pending'}]
        self.assertEqual(build_catalog(**f)['records'][0]['source_state'],'ready')
    def test_ambiguous_denominator_preserved_not_guessed(self):
        f=fixture();r=f['registry']['records'][0];r['status']='clarification_required';r['finance']=None
        c=build_catalog(**f)['records'][0];self.assertEqual(c['source_state'],'hold');self.assertIsNone(c['finance'])
    def test_other_attachment_changes_suppresses(self):
        f=fixture();r=f['registry']['records'][0];f['attachments']['programs'][r['program_id']]['document_ids'].append('extra');f['attachments']['records']['extra']={'review_required':True}
        self.assertIn('related_attachment_review_required',build_catalog(**f)['records'][0]['hold_reasons'])
    def test_same_source_new_attempt_timestamp_does_not_change_rule(self):
        f=fixture();one=build_catalog(**f);r=f['registry']['records'][0];f['attachments']['records'][r['evidence']['document_id']]['last_attempt_at']='2026-10-30T08:00:00+09:00'
        self.assertEqual(one['records'],build_catalog(**f)['records'])
if __name__=='__main__':unittest.main()
