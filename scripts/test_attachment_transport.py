"""Bounded transport diagnostics. No real network requests or secrets in tests."""
import copy
import json
import unittest
from urllib.error import HTTPError, URLError
from attachment_core import extract, ExtractError, validate_public, validate_transport_fields
from refresh_attachments import update_document, collect
from test_attachments import record, hwpx, state, item, AT, URL

def raises(exc):
    def fetch(_):raise exc
    return fetch

def observed(error):return update_document(record(),AT,raises(error),extract)

class TransportTests(unittest.TestCase):
    def test_403_diagnostic_no_retry_or_auth_bypass(self):
        r=observed(HTTPError(URL,403,'SECRET MSG',{},None))
        self.assertEqual((r['status'],r['http_status'],r['failure_kind'],r['retryable']),('download_failed',403,'http_error',False))
        self.assertNotIn('SECRET MSG',json.dumps(r))
    def test_401_not_retried(self):self.assertFalse(observed(HTTPError(URL,401,'',{},None))['retryable'])
    def test_404_not_assumed_temporary(self):self.assertFalse(observed(HTTPError(URL,404,'',{},None))['retryable'])
    def test_410_not_assumed_temporary(self):self.assertFalse(observed(HTTPError(URL,410,'',{},None))['retryable'])
    def test_429_can_be_rechecked_not_claimed_success(self):
        r=observed(HTTPError(URL,429,'',{},None));self.assertTrue(r['retryable']);self.assertIsNone(r['last_success_at'])
    def test_503_can_be_rechecked(self):self.assertTrue(observed(HTTPError(URL,503,'',{},None))['retryable'])
    def test_url_error_no_reason_leak(self):
        r=observed(URLError('token=DO_NOT_PUBLISH'))
        self.assertEqual(r['failure_kind'],'network_error');self.assertTrue(r['retryable']);self.assertNotIn('DO_NOT_PUBLISH',json.dumps(r))
    def test_timeout_is_network(self):self.assertEqual(observed(TimeoutError())['failure_kind'],'network_error')
    def test_policy_error_preserves_specific_code(self):
        r=observed(ExtractError('protected_document'));self.assertEqual(r['status'],'protected_document');self.assertFalse(r['retryable'])
    def test_unknown_exception_sanitized(self):
        r=observed(RuntimeError('PRIVATE_RESPONSE'));self.assertEqual(r['failure_kind'],'unclassified');self.assertNotIn('PRIVATE_RESPONSE',json.dumps(r))
    def test_prior_success_kept_after_denial(self):
        old=update_document(record(),AT,lambda _:hwpx(),extract)
        new=update_document(old,'later',raises(HTTPError(URL,403,'',{},None)),extract)
        self.assertEqual(new['last_success_at'],old['last_success_at']);self.assertEqual(new['extraction'],old['extraction']);self.assertEqual(new['http_status'],403)
    def test_recovery_clears_current_diagnostic_preserves_history(self):
        old=observed(HTTPError(URL,403,'',{},None));new=update_document(old,'later',lambda _:hwpx(),extract)
        self.assertIsNone(new['http_status']);self.assertIsNone(new['failure_kind']);self.assertIsNone(new['last_error']);self.assertEqual(new['history'][1]['http_status'],403)
    def test_collect_keeps_failure_run_and_valid_public_schema(self):
        r=collect({'items':[item()]},state(),AT,discover=lambda _:[{'url':URL}],fetcher=raises(HTTPError(URL,403,'',{},None)),parser=extract)
        self.assertEqual(r['run']['failed'],1);self.assertEqual(r['run']['text_extracted'],0);validate_public(r)
    def test_legacy_history_still_valid(self):
        r=record();r['history']=[{'at':AT,'status':'download_failed','observed_sha256':None}]
        s=state();s['records'][r['id']]=r;validate_public(s)
    def test_status_string_rejected(self):
        with self.assertRaises(ValueError):validate_transport_fields({'http_status':'403','failure_kind':'http_error'})
    def test_status_boolean_rejected(self):
        with self.assertRaises(ValueError):validate_transport_fields({'http_status':True,'failure_kind':'http_error'})
    def test_non_http_status_rejected(self):
        with self.assertRaises(ValueError):validate_transport_fields({'http_status':999,'failure_kind':'http_error'})
    def test_wrong_kind_rejected(self):
        with self.assertRaises(ValueError):validate_transport_fields({'http_status':403,'failure_kind':'network_error'})
    def test_arbitrary_failure_text_rejected(self):
        with self.assertRaises(ValueError):validate_transport_fields({'failure_kind':'body contains cookies'})
    def test_retry_not_boolean_rejected(self):
        with self.assertRaises(ValueError):validate_transport_fields({'retryable':'yes'})
    def test_access_denial_cannot_be_retryable(self):
        with self.assertRaises(ValueError):validate_transport_fields({'http_status':403,'failure_kind':'http_error','retryable':True})
    def test_history_unknown_private_field_rejected(self):
        s=state();r=record();r['history']=[{'at':AT,'status':'download_failed','observed_sha256':None,'response_body':'private'}];s['records'][r['id']]=r
        with self.assertRaises(ValueError):validate_public(s)
    def test_failure_does_not_mutate_input(self):
        r=record();old=copy.deepcopy(r);update_document(r,AT,raises(HTTPError(URL,403,'',{},None)),extract);self.assertEqual(r,old)
    def test_retryable_is_advice_not_multiple_network_attempts(self):
        calls=[]
        def denied(url):calls.append(url);raise HTTPError(url,503,'',{},None)
        update_document(record(),AT,denied,extract);self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
