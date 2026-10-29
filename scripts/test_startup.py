import copy,datetime as dt,hashlib,json,unittest
from pathlib import Path
from startup_catalog import validate_registry,validate_sources,build_catalog
from refresh_startup_sources import collect
R=Path(__file__).resolve().parents[1]
def load(p):return json.loads((R/p).read_text(encoding='utf-8'))
class StartupTests(unittest.TestCase):
 def setUp(self):
  self.reg=load('config/startup_reference.json');self.state=load('data/startup_sources.json');self.progs=load('data/programs.json')
 def build(self):return build_catalog(self.progs,self.reg,self.state)
 def test_valid(self):validate_registry(self.reg);validate_sources(self.state,self.reg)
 def test_count(self):
  self.assertEqual(len(self.build()['records']),3);self.assertEqual(sum(len(r['scenarios']) for r in self.build()['records']),9)
 def test_deterministic(self):self.assertEqual(self.build(),self.build())
 def test_no_mutation(self):
  before=copy.deepcopy((self.progs,self.reg,self.state));self.build();self.assertEqual(before,(self.progs,self.reg,self.state))
 def test_reference_year(self):
  self.reg['records'][0]['reference_year']=2027
  with self.assertRaises(ValueError):self.build()
 def test_target_year(self):
  self.reg['records'][0]['target_year']=2028
  with self.assertRaises(ValueError):self.build()
 def test_live_scope_rejected(self):
  self.reg['records'][0]['scope']='confirmed_eligibility'
  with self.assertRaises(ValueError):self.build()
 def test_bad_source(self):
  self.reg['records'][0]['source']['url']='https://example.com/private'
  with self.assertRaises(ValueError):self.build()
 def test_secret_url(self):
  self.reg['records'][0]['source']['url']+='&token=do-not-log'
  with self.assertRaises(ValueError):self.build()
 def test_bad_hash(self):
  self.reg['records'][0]['source']['sha256']='invalid'
  with self.assertRaises(ValueError):self.build()
 def test_no_duplicate(self):
  self.reg['records'].append(copy.deepcopy(self.reg['records'][0]))
  with self.assertRaises(ValueError):self.build()
 def test_private_field(self):
  self.reg['records'][0]['company_profile']={}
  with self.assertRaises(ValueError):self.build()
 def test_formula_invalid(self):
  self.reg['records'][1]['scenarios'][0]['government_bps']=9500
  with self.assertRaises(ValueError):self.build()
 def test_bool_ratio(self):
  self.reg['records'][0]['scenarios'][0]['cash_min_bps']=False
  with self.assertRaises(ValueError):self.build()
 def test_average_not_stage1_cap(self):
  r=self.reg['records'][0];self.assertEqual(r['average_support_won'],40000000);self.assertEqual(r['scenarios'][0]['max_support_won'],20000000)
 def test_original_table_parameters(self):
  for r in self.reg['records'][1:]:
   self.assertEqual([(s['government_bps'],s['cash_min_bps'],s['inkind_max_bps']) for s in r['scenarios']],[(9000,0,1000),(8000,1000,1000),(7500,1000,1500),(7000,1000,2000)])
 def test_special_not_zero_own(self):
  for r in self.reg['records'][1:]:self.assertEqual(r['scenarios'][0]['own_model'],'cash_or_inkind')
 def test_missing_source_hold(self):
  self.state['records'].pop('pre');self.assertEqual(self.build()['records'][0]['source_state'],'hold')
 def test_failed_source_hold(self):
  self.state['records']['pre']['status']='fetch_failed';self.assertEqual(self.build()['records'][0]['source_state'],'hold')
 def test_hash_change_hold(self):
  self.state['records']['pre']['observed_sha256']='0'*64;self.assertEqual(self.build()['records'][0]['source_state'],'hold')
 def test_program_change_hold(self):
  p=next(p for p in self.progs['items'] if p['id']=='PRE-STARTUP-2026');p['mode']='beneficiary';self.assertEqual(self.build()['records'][0]['source_state'],'hold')
 def test_candidates_no_promotion(self):
  self.progs['items'].append({'id':'test-new','title':'2027 초기창업패키지 일반형','year':2027,'mode':'discovery','source':'https://www.mss.go.kr/','deadline':None})
  out=self.build();self.assertEqual(out['new_notice_candidates'][-1]['mode'],'discovery');self.assertEqual(out['records'][1]['reference_year'],2026)
 def test_operator_not_candidate(self):
  self.progs['items'].append({'id':'test-op','title':'2027 초기창업 주관기관','year':2027,'mode':'operator'})
  self.assertFalse(any(p['id']=='test-op' for p in self.build()['new_notice_candidates']))
 def fixture_collect(self,changed=False,fail=False,sticky=False):
  raw=b'historical-fixture';h=hashlib.sha256(raw).hexdigest()
  for r in self.reg['records']:
   r['source']['sha256']=h;s=self.state['records'][r['id']];s.update(expected_sha256=h,observed_sha256=h,review_required=sticky)
  def fetch(url):
   if fail:raise RuntimeError('must not leak internal error')
   return b'different' if changed else raw
  at='2026-10-29T16:00:00+09:00';before=copy.deepcopy(self.state)
  return collect(self.reg,self.state,at,fetch),before
 def test_refresh_match(self):
  out,before=self.fixture_collect();self.assertEqual(out['run']['matched'],3);self.assertEqual(self.state,before)
 def test_refresh_changed(self):
  out,before=self.fixture_collect(changed=True);self.assertEqual(out['run']['changed'],3);self.assertTrue(out['records']['pre']['review_required']);self.assertEqual(out['records']['pre']['last_success_at'],before['records']['pre']['last_success_at'])
 def test_refresh_failure_preserves(self):
  out,before=self.fixture_collect(fail=True);self.assertEqual(out['run']['failed'],3);self.assertEqual(out['records']['pre']['observed_sha256'],before['records']['pre']['observed_sha256']);self.assertNotIn('internal',json.dumps(out))
 def test_sticky_review(self):
  out,_=self.fixture_collect(sticky=True);self.assertTrue(out['records']['pre']['review_required'])
 def test_originals_not_published(self):
  from build_public import FILES
  self.assertFalse(any(x.endswith(('.pdf','.hwpx','.hwp')) for x in FILES));self.assertIn('startup.html',FILES)
if __name__=='__main__':unittest.main()
