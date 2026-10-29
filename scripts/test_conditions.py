import copy
import json
import unittest
from pathlib import Path
from condition_catalog import basis, build_catalog, candidates, validate_registry

ROOT=Path(__file__).resolve().parents[1]

def fixture():
    p={'id':'fixture-1','title':'Synthetic notice','source':'https://www.bizinfo.go.kr/notice','year':2027,'mode':'beneficiary','opens':'2026-10-01','deadline':'2026-11-13','eligibility':'업력 7년 이내 중소기업','amount':'최대 2억원 (테스트 문구)'}
    source={'url':p['source'],'locator':'Fixture only','excerpt':'Synthetic condition','checked_at':'2026-10-29T11:00:00+09:00','level':'official_summary_reviewed'}
    entry={'program_id':p['id'],'basis_snapshot':basis(p),'reviewed_at':source['checked_at'],'coverage':'partial','sources':{'s':source},'clauses':[{'id':'sme','label':'SME','status':'reviewed','field':'is_sme','op':'eq','value':True,'evidence_id':'s'}],'open_questions':['첨부 미검증'],'attachments_reviewed':False,'exceptions_reviewed':False,'reviewed_difference_ids':[]}
    programs={'schema':'public-funding-radar/v1','generated_at':source['checked_at'],'items':[p]}
    registry={'schema':'reviewed-public-conditions/v1','version':'0.3.0','reviewed_at':source['checked_at'],'records':{p['id']:entry}}
    return programs,registry

class ConditionTests(unittest.TestCase):
    def test_reviewed_registry_valid(self):
        p,r=fixture();validate_registry(r)
    def test_candidates_do_not_become_rules(self):
        p,r=fixture();r['records']={};c=build_catalog(p,r)['records']['fixture-1'];self.assertEqual(c['clauses'],[]);self.assertTrue(c['candidate_facts']);self.assertEqual(c['coverage'],'unreviewed')
    def test_all_extractions_marked_unverified(self):
        p,r=fixture();facts=candidates(p['items'][0]);self.assertTrue(all(x['status']=='candidate_unverified' for x in facts))
    def test_amount_is_not_computed_or_promised(self):
        p,r=fixture();facts=candidates(p['items'][0]);self.assertTrue(all('value' not in x and 'approved_amount' not in x for x in facts))
    def test_current_basis_binding(self):
        p,r=fixture();c=build_catalog(p,r)['records']['fixture-1'];self.assertEqual(c['metadata_state'],'current');self.assertEqual(c['bound_fields'],basis(p['items'][0]))
    def test_changed_eligibility_requires_rereview(self):
        p,r=fixture();p['items'][0]['eligibility']='업력 3년 이내';c=build_catalog(p,r)['records']['fixture-1'];self.assertEqual(c['metadata_state'],'changed_since_review')
    def test_changed_deadline_requires_rereview(self):
        p,r=fixture();p['items'][0]['deadline']='2026-11-20';self.assertEqual(build_catalog(p,r)['records']['fixture-1']['metadata_state'],'changed_since_review')
    def test_summary_not_full_coverage(self):
        p,r=fixture();e=r['records']['fixture-1'];e.update(coverage='complete',attachments_reviewed=True,exceptions_reviewed=True,open_questions=[])
        with self.assertRaises(ValueError):validate_registry(r)
    def test_complete_requires_exception_review(self):
        p,r=fixture();e=r['records']['fixture-1'];e.update(coverage='complete',attachments_reviewed=True,open_questions=[]);e['sources']['s']['level']='full_notice_reviewed'
        with self.assertRaises(ValueError):validate_registry(r)
    def test_complete_fixture_allowed_only_with_full_review(self):
        p,r=fixture();e=r['records']['fixture-1'];e.update(coverage='complete',attachments_reviewed=True,exceptions_reviewed=True,open_questions=[]);e['sources']['s']['level']='full_notice_reviewed';validate_registry(r)
    def test_bad_host_rejected(self):
        p,r=fixture();r['records']['fixture-1']['sources']['s']['url']='https://evil.example/notice'
        with self.assertRaises(ValueError):validate_registry(r)
    def test_secret_in_source_rejected(self):
        p,r=fixture();r['records']['fixture-1']['sources']['s']['url']='https://www.bizinfo.go.kr/notice?api_key=x'
        with self.assertRaises(ValueError):validate_registry(r)
    def test_private_registry_field_rejected(self):
        p,r=fixture();r['company_profile']={}
        with self.assertRaises(ValueError):validate_registry(r)
    def test_unsupported_field_rejected(self):
        p,r=fixture();r['records']['fixture-1']['clauses'][0]['field']='resident_number'
        with self.assertRaises(ValueError):validate_registry(r)
    def test_unsupported_operator_rejected(self):
        p,r=fixture();r['records']['fixture-1']['clauses'][0]['op']='estimate'
        with self.assertRaises(ValueError):validate_registry(r)
    def test_missing_evidence_rejected(self):
        p,r=fixture();r['records']['fixture-1']['clauses'][0]['evidence_id']='absent'
        with self.assertRaises(ValueError):validate_registry(r)
    def test_no_input_mutation(self):
        p,r=fixture();before=copy.deepcopy([p,r]);build_catalog(p,r);self.assertEqual(before,[p,r])
    def test_deterministic_catalog(self):
        p,r=fixture();self.assertEqual(build_catalog(p,r),build_catalog(p,r))
    def test_changed_input_fingerprint(self):
        p,r=fixture();a=build_catalog(p,r)['input_fingerprint'];p['items'][0]['note']='changed';self.assertNotEqual(a,build_catalog(p,r)['input_fingerprint'])
    def test_actual_registry_never_claims_complete(self):
        r=json.loads((ROOT/'config/eligibility_rules.json').read_text(encoding='utf-8'));validate_registry(r);self.assertEqual(len(r['records']),3);self.assertTrue(all(x['coverage']=='partial' for x in r['records'].values()))
    def test_jumpup_reference_date_not_invented(self):
        r=json.loads((ROOT/'config/eligibility_rules.json').read_text(encoding='utf-8'));rules=r['records']['JUMPUP-2027']['clauses'];self.assertIsNone(next(x for x in rules if x['op']=='tenure_gte')['as_of'])
    def test_no_private_storage_or_outbound_writes_in_ui(self):
        s=(ROOT/'assets/eligibility-ui.js').read_text(encoding='utf-8');self.assertNotRegex(s,r'localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|WebSocket');self.assertNotIn("method:'POST'",s)

if __name__=='__main__':unittest.main()
