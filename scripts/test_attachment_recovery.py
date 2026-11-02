"""P0.23 bounded recovery scheduling, provenance and no-silent-clear tests."""
import copy
import json
from datetime import datetime,timedelta,timezone
from pathlib import Path
import tempfile
import unittest
from attachment_core import validate_public
from attachment_recovery import classify,plan,generate,validate_output,KST
from refresh_attachments import collect
NOW=datetime(2026,11,2,12,0,tzinfo=KST)
AT=NOW.isoformat(timespec='seconds')
URL="https://www.bizinfo.go.kr/cmm/fms/fileDown.do?atchFileId=FILE_001&fileSn=0"
SOURCE="https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000001"
def rec(id,status='queued',minutes=None,**kw):
 result={'id':id,'program_id':'P','notice_source':SOURCE,'url':URL,'name':'공식 첨부',
  'status':status,'last_attempt_at':(NOW-timedelta(minutes=minutes)).isoformat() if minutes is not None else None,
  'last_success_at':None,'last_error':None,'review_required':False,'history':[]}
 result.update(kw);return result
def state(*records):
 s={'schema':'public-funding-attachments/v1','records':{r['id']:r for r in records},
   'programs':{'P':{'notice_source':SOURCE,'last_notice_attempt_at':AT,
    'last_notice_success_at':AT,'notice_status':'links_available',
    'manifest_sha256':'a'*64,'document_ids':[r['id'] for r in records],
    'review_required':False,'last_error':None}},
   'run':{'at':AT,'attempted':0,'failed':0}}
 validate_public(s);return s
def outcome(**x):
 return x
class RecoveryTests(unittest.TestCase):
 def test_three_old_network_failures_are_due(self):
  rows=[rec('a'+str(i),'download_failed',minutes=3000,last_error='download_failed',
   failure_kind='network_error',retryable=True,history=[
     {'at':AT,'status':'download_failed','observed_sha256':None,'failure_kind':'network_error'}
   ]) for i in range(3)]
  p=plan(state(*rows),AT)
  self.assertEqual(p['counts']['retry_due'],3)
  self.assertEqual(len(p['selected']),3)
  self.assertTrue(all(x['decision']=='retry_due' for x in p['selected']))
 def test_reserved_retry_slot_does_not_starve_new(self):
  due=rec('fail','download_failed',minutes=180,last_error='download_failed',retryable=True,
   failure_kind='network_error')
  queued=[rec('queued'+str(i)) for i in range(12)]
  p=plan(state(*queued,due),AT)
  self.assertEqual(len(p['selected']),4)
  self.assertEqual(sum(x['decision']=='retry_due' for x in p['selected']),1)
  self.assertEqual(sum(x['decision']=='queued' for x in p['selected']),3)
 def test_backoff_and_history_are_bounded(self):
  first=rec('first','download_failed',minutes=30,last_error='download_failed',
    failure_kind='network_error',retryable=True)
  self.assertEqual(classify(first,NOW)[0],'retry_wait')
  self.assertEqual(classify({**first,'last_attempt_at':(NOW-timedelta(minutes=65)).isoformat()},NOW)[0],'retry_due')
  triple={**first,'last_attempt_at':(NOW-timedelta(minutes=245)).isoformat(),
    'history':[{'status':'download_failed'}]*2}
  self.assertEqual(classify(triple,NOW)[0],'retry_due')
  triple['last_attempt_at']=(NOW-timedelta(minutes=120)).isoformat()
  self.assertEqual(classify(triple,NOW)[0],'retry_wait')
 def test_access_denied_is_manual_even_if_retryable_flag_is_corrupt(self):
  for code in (401,403,404):
   r=rec('x','download_failed',minutes=20000,last_error='download_failed',retryable=True,
         http_status=code,failure_kind='http_error')
   self.assertEqual(classify(r,NOW)[0],'manual')
 def test_retryable_rate_limit_is_backoff_gated(self):
  r=rec('x','download_failed',minutes=90,last_error='download_failed',retryable=True,
        http_status=429,failure_kind='http_error')
  self.assertEqual(classify(r,NOW)[0],'retry_due')
  r['retryable']=False
  self.assertEqual(classify(r,NOW)[0],'manual')
 def test_parser_errors_and_missing_metadata_never_auto_retry(self):
  for status in ('size_limit','unsupported_format','protected_document','unsafe_archive','partial_text','no_text'):
   self.assertEqual(classify(rec('x',status,minutes=40000),NOW)[0],'manual')
  old=rec('old','download_failed',minutes=4000)
  self.assertEqual(classify(old,NOW)[0],'manual')
 def test_inactive_manifest_is_not_retried(self):
  r=rec('xx','download_failed',minutes=900,last_error='download_failed',
         retryable=True,failure_kind='network_error')
  s=state(r);s['programs']['P']['notice_status']='source_unavailable'
  p=plan(s,AT)
  self.assertEqual(p['counts']['inactive'],1)
  self.assertEqual(len(p['selected']),0)
 def test_success_only_rotates_after_fourteen_days(self):
  r=rec('x','text_extracted',minutes=60,last_success_at=AT)
  self.assertEqual(plan(state(r),AT)['counts']['current'],1)
  r['last_attempt_at']=(NOW-timedelta(days=15)).isoformat()
  p=plan(state(r),AT)
  self.assertEqual(p['counts']['revisit'],1)
  self.assertEqual(p['selected'][0]['decision'],'revisit')
 def test_selected_plan_never_reveals_urls_or_source_bodies(self):
  from attachment_core import extract
  from test_attachments import hwpx
  ex=extract(hwpx())
  r=rec('x','download_failed',minutes=1000,last_error='download_failed',
        retryable=True,failure_kind='network_error',
        sha256=ex['sha256'],extraction=ex)
  old=state(r);before=copy.deepcopy(old)
  result=plan(old,AT)
  self.assertEqual(before,old)
  txt=json.dumps(result)
  self.assertNotIn('bizinfo.go.kr',txt)
  self.assertNotIn('atchFileId',txt)
  self.assertTrue(result['selected'][0]['previous_extraction_kept'])
 def test_invalid_time_file_limit_and_document_schema_fail_closed(self):
  s=state(rec('x'))
  with self.assertRaises(ValueError):plan(s,'not-a-timestamp')
  with self.assertRaises(ValueError):plan(s,AT,5)
  s['company_profile']={}
  with self.assertRaises(ValueError):plan(s,AT)
 def test_deterministic_and_read_only_summary(self):
  s=state(rec('q'),rec('f','download_failed',minutes=180,retryable=True,
        failure_kind='network_error',last_error='download_failed'))
  self.assertEqual(plan(s,AT),plan(s,AT))
  self.assertEqual(plan(s,AT,limit=0)['selected'],[])

 def test_collector_reserves_one_slot_for_retry_and_three_new(self):
  import hashlib
  from attachment_core import extract
  from test_attachments import hwpx
  records=[rec('q'+str(i)) for i in range(5)]
  records.append(rec('fail','download_failed',minutes=200,last_error='download_failed',
    retryable=True,failure_kind='network_error'))
  records.append(rec('blocked','unsupported_format',minutes=300))
  s=state(*records)
  s['programs']['P']['notice_status']='links_available'
  p={'id':'P','source':SOURCE,'title':'AI 가상 공고','mode':'beneficiary'}
  result=collect({'items':[p]},s,AT,notice_limit=0,file_limit=4,
     discover=lambda p:[],fetcher=lambda u:hwpx(),parser=extract)
  self.assertEqual(result['run']['attempted'],4)
  self.assertEqual(result['run']['retry_attempted'],1)
  self.assertEqual(result['run']['new_attempted'],3)
  self.assertEqual(result['records']['blocked']['status'],'unsupported_format')
  self.assertEqual(result['records']['fail']['status'],'text_extracted')
  self.assertTrue(all(r['status'] in ('text_extracted','queued','unsupported_format')
     for r in result['records'].values()))
 def test_generated_audit_rejects_tampering(self):
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory);(base/'data').mkdir()
   s=state(rec('q'))
   (base/'data/attachments.json').write_text(json.dumps(s),encoding='utf-8')
   result=generate(base)
   self.assertEqual(result['counts']['queued'],1)
   self.assertTrue(validate_output(base))
   target=base/'data/attachment_recovery.json'
   data=json.loads(target.read_text(encoding='utf-8'))
   data['counts']['queued']=0
   target.write_text(json.dumps(data),encoding='utf-8')
   with self.assertRaises(ValueError):validate_output(base)
if __name__=="__main__":unittest.main()
