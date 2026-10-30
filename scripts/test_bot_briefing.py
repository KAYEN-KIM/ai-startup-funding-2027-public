import copy
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from bot_briefing import (INPUTS, SCHEMA, KST, build_report, official_url, deadline_state,
                          require_now, read_inputs, render_markdown, render_feed, generate,
                          fingerprint, validate_report, workflow_outcomes)
from prepare_cli_review import make_packet, write_packet

NOW = '2026-10-30T13:00:00+09:00'
AT = '2026-10-30T08:00:00+09:00'
POLICY = {
    'schema': 'funding-automation-policy/v1', 'mode': 'deterministic_bot_first',
    'scheduled_ai_calls': False, 'ai_api_calls': False, 'optional_ai_transport': 'manual_cli_only',
    'automatic_rule_approval': False, 'automatic_application_submission': False,
    'private_application_inputs_in_public_report': False,
    'freshness_hours': 30, 'deadline_window_days': 7, 'queue_limit': 120, 'scope': '테스트 공개 범위',
}


def fixture():
    return {
        'programs': {'schema': INPUTS['programs'][1], 'items': [
            {'id':'a', 'title':'AI 지원', 'mode':'beneficiary', 'year':2026, 'deadline':'2026-10-30',
             'source':'https://www.bizinfo.go.kr/notice?id=1'},
            {'id':'b', 'title':'2027 후보', 'mode':'discovery', 'year':2027, 'deadline':'2026-11-02',
             'source':'https://www.mss.go.kr/notice?id=2'}]},
        'monitor': {'schema': INPUTS['monitor'][1], 'status':'ok_no_change', 'sources': {
            'bizinfo_api': {'status':'ok_no_change','last_attempt_at':AT,'last_success_at':AT,
                           'checked_count':250,'coverage_complete':True,'errors':[], 'pages':2},
            'html_evidence': {'status':'ok','last_attempt_at':AT,'attempted':6,'success':6,'failed':0}}},
        'evidence': {'schema':INPUTS['evidence'][1], 'records':{}},
        'reviews': {'schema':INPUTS['reviews'][1], 'items':[]},
        'attachments': {'schema':INPUTS['attachments'][1], 'run':{'at':AT,'attempted':4,'failed':0},'records':{}},
        'startup': {'schema':INPUTS['startup'][1], 'run':{'at':AT,'matched':3,'failed':0},'records':{}},
        'policy':copy.deepcopy(POLICY),
    }


class BotBriefingTests(unittest.TestCase):
    def setUp(self): self.d = fixture()
    def build(self, **kw): return build_report(self.d, kw.pop('now', NOW), **kw)
    def test_same_inputs_deterministic(self): self.assertEqual(self.build(), self.build())
    def test_does_not_mutate_inputs(self):
        old=copy.deepcopy(self.d); self.build(); self.assertEqual(old,self.d)
    def test_no_model_runtime(self):
        r=self.build(); self.assertEqual(r['report_model_calls'],0); self.assertFalse(r['automatic_submission'])
    def test_ok_is_scoped_not_full_verification(self):
        r=self.build(); self.assertEqual(r['run_status'],'ok_scoped'); self.assertTrue(r['attention_required'])
    def test_new_2027_candidate_never_promoted(self):
        r=self.build(); self.assertEqual(self.d['programs']['items'][1]['mode'],'discovery')
        self.assertIn('next_year_candidate',[x['category'] for x in r['queue']])
    def test_old_download_failure_kept_after_latest_success(self):
        self.d['attachments']['records']['x']={'program_id':'a','status':'download_failed','last_attempt_at':AT}
        r=self.build(); self.assertEqual(r['run_status'],'ok_scoped'); self.assertEqual(r['unresolved']['attachment_failures'],1)
        self.assertEqual(next(x for x in r['queue'] if x['reference_id']=='x')['action'],'retry_bot')
    def test_current_failure_not_no_change(self):
        self.d['attachments']['run']['failed']=1; self.assertEqual(self.build()['run_status'],'failed')
    def test_crashed_step_overrides_old_success(self):
        self.assertEqual(self.build(outcomes={'api':'failure'})['run_status'],'failed')
    def test_stale_source_not_renewed_by_report(self):
        self.d['monitor']['sources']['bizinfo_api']['last_attempt_at']='2026-10-20T08:00:00+09:00'
        r=self.build(); self.assertEqual(r['lanes'][0]['status'],'stale'); self.assertEqual(r['run_status'],'partial_or_stale')
    def test_future_source_clock_not_green(self):
        self.d['startup']['run']['at']='2026-11-01T00:00:00+09:00'; self.assertEqual(self.build()['lanes'][3]['status'],'clock_uncertain')
    def test_unknown_run_not_success(self):
        self.d['attachments']['run']={}; self.assertEqual(self.build()['lanes'][2]['status'],'unknown')
    def test_partial_coverage(self):
        self.d['monitor']['sources']['bizinfo_api']['coverage_complete']=False; self.assertEqual(self.build()['lanes'][0]['status'],'partial')
    def test_partial_extraction(self):
        self.d['attachments']['run']['partial_or_no_text']=1; self.assertEqual(self.build()['lanes'][2]['status'],'partial')
    def test_changed_origin_is_review_hold(self):
        self.d['startup']['records']['r']={'status':'changed','last_attempt_at':AT,'url':'https://www.mss.go.kr/file'}
        row=next(x for x in self.build()['queue'] if x['category']=='reviewed_original_hold')
        self.assertEqual(row['priority'],'P0'); self.assertEqual(row['source'],'https://www.mss.go.kr/file')
    def test_pending_difference_not_accepted(self):
        self.d['reviews']['items']=[{'id':'r','program_id':'a','field':'deadline','status':'pending','previous':'old','observed':'new'}]
        r=self.build(); self.assertEqual(r['unresolved']['pending_differences'],1); self.assertEqual(r['queue'][0]['priority'],'P0')
        self.assertEqual(self.d['reviews']['items'][0]['status'],'pending')
    def test_resolved_differences_not_queued(self):
        self.d['reviews']['items']=[{'id':'r','program_id':'a','field':'deadline','status':'accepted'}]
        self.assertEqual(self.build()['unresolved']['pending_differences'],0)
    def test_duplicate_queue_records_deduplicated(self):
        x={'id':'r','program_id':'a','field':'title','status':'pending'}; self.d['reviews']['items']=[x,x]
        rows=[r for r in self.build()['queue'] if r['category']=='source_difference']; self.assertEqual(len(rows),1)
    def test_queue_cap_is_explicit(self):
        self.d['policy']['queue_limit']=1
        self.d['reviews']['items']=[{'id':'r','program_id':'a','field':'title','status':'pending'}]
        r=self.build(); self.assertTrue(r['queue_truncated']); self.assertEqual(len(r['queue']),1)
    def test_date_only_today_has_unknown_time(self):
        r=self.build(); self.assertEqual(r['deadlines'][0]['status'],'today_time_unknown')
    def test_exact_time_already_closed_excluded(self):
        self.d['programs']['items'][0]['deadline']='2026-10-30T12:00:00+09:00'
        self.assertNotIn('a',[r['program_id'] for r in self.build()['deadlines']])
    def test_exact_time_due_today(self):
        self.d['programs']['items'][0]['deadline']='2026-10-30T15:00:00+09:00'
        self.assertEqual(self.build()['deadlines'][0]['status'],'due_today')
    def test_utc_time_converts_to_korea_date(self):
        r=deadline_state({'deadline':'2026-10-30T16:00:00Z'},require_now(NOW)); self.assertEqual(r['date'],'2026-10-31')
    def test_naive_timestamp_unknown(self):
        r=deadline_state({'deadline':'2026-10-30T15:00:00'},require_now(NOW)); self.assertEqual(r['status'],'unknown')
    def test_invalid_dates_unknown(self):
        for s in ['2026-02-30','2026-13-01','garbage']:
            self.assertEqual(deadline_state({'deadline':s},require_now(NOW))['status'],'unknown')
    def test_operator_budget_reference_not_deadline_opportunities(self):
        for mode in ['operator','budget','reference']:
            self.d['programs']['items'][0]['mode']=mode; self.assertNotIn('a',[r['program_id'] for r in self.build()['deadlines']])
    def test_opening_after_end_is_unknown(self):
        self.assertEqual(deadline_state({'deadline':'2026-10-30','opens':'2026-11-01'},require_now(NOW))['status'],'unknown')
    def test_future_open_is_not_started(self):
        r=deadline_state({'deadline':'2026-11-05','opens':'2026-11-01'},require_now(NOW)); self.assertEqual(r['status'],'not_started')
    def test_missing_date_not_invented(self):
        self.d['programs']['items'][0]['deadline']=None; self.assertEqual(self.build()['unresolved']['unknown_dates'],1)
    def test_output_private_fields_not_copied(self):
        self.d['programs']['items'][0]['company_profile']={'secret':'DO_NOT_COPY'}
        self.d['monitor']['unexpected']='DO_NOT_COPY'; self.assertNotIn('DO_NOT_COPY',json.dumps(self.build()))
    def test_only_expected_public_inputs(self):
        self.d['private']={}
        with self.assertRaises(ValueError):self.build()
    def test_duplicate_program_ids_rejected(self):
        self.d['programs']['items'].append(self.d['programs']['items'][0])
        with self.assertRaises(ValueError):self.build()
    def test_wrong_schema_rejected(self):
        self.d['attachments']['schema']='private/v1'
        with self.assertRaises(ValueError):self.build()
    def test_policy_refuses_auto_ai(self):
        for k in ['scheduled_ai_calls','ai_api_calls','automatic_rule_approval','automatic_application_submission']:
            d=fixture();d['policy'][k]=True
            with self.assertRaises(ValueError):build_report(d,NOW)
    def test_policy_does_not_accept_integer_false(self):
        self.d['policy']['ai_api_calls']=0
        with self.assertRaises(ValueError):self.build()
    def test_policy_bounds(self):
        self.d['policy']['queue_limit']=10000
        with self.assertRaises(ValueError):self.build()
    def test_urls_strip_secrets(self):
        self.assertEqual(official_url('https://www.bizinfo.go.kr/x?id=1&downloadToken=SECRET'),'https://www.bizinfo.go.kr/x?id=1')
    def test_urls_block_unsafe_destinations(self):
        for u in ['http://www.mss.go.kr','https://evil.kr','https://mss.go.kr.evil.com','https://u:p@www.mss.go.kr/x','https://www.mss.go.kr:444/x','javascript:alert(1)','https://www.mss.go.kr/\nX']:
            self.assertIsNone(official_url(u))
    def test_feed_is_wellformed_and_safe(self):
        r=self.build(); root=ET.fromstring(render_feed(r)); self.assertEqual(root.tag,'rss'); self.assertEqual(len(root.findall('./channel/item')),1)
    def test_markdown_escapes_hostile_title(self):
        self.d['programs']['items'][0]['title']='<script>alert(1)</script> [x](https://evil.com)'
        m=render_markdown(self.build()); self.assertNotIn('<script>',m); self.assertNotIn('[x](https://evil.com)',m)
    def test_report_identity_stable_with_same_day_same_state(self):
        self.assertEqual(self.build()['report_id'],self.build(now='2026-10-30T14:00:00+09:00')['report_id'])
    def test_report_identity_changes_next_day(self):
        self.assertNotEqual(self.build()['report_id'],self.build(now='2026-10-31T14:00:00+09:00')['report_id'])
    def test_output_validation_blocks_bad_source(self):
        r=self.build();r['queue'][0]['source']='https://evil.kr'
        with self.assertRaises(ValueError):validate_report(r)
    def test_timezone_required(self):
        with self.assertRaises(ValueError):self.build(now='2026-10-30T13:00:00')
    def test_cli_packet_no_execution_no_private_data(self):
        r=self.build(); packet=make_packet(r,self.d)
        self.assertFalse(packet['executes_ai']);self.assertFalse(packet['sends_data']);self.assertEqual(packet['transport'],'manual_cli_only')
    def test_cli_packet_stale_input_rejected(self):
        r=self.build();self.d['programs']['items'][0]['deadline']='2026-11-15'
        with self.assertRaises(ValueError):make_packet(r,self.d)
    def test_cli_packet_unknown_program_rejected(self):
        with self.assertRaises(ValueError):make_packet(self.build(),self.d,'missing')
    def test_cli_packet_filter(self):
        packet=make_packet(self.build(),self.d,'a'); self.assertEqual(packet['requests'],[])
    def test_cli_write_outside_repo_exclusive(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);repo=base/'repo';repo.mkdir();out=base/'request.json'; packet=make_packet(self.build(),self.d)
            write_packet(out,packet,repo);self.assertTrue(out.is_file())
            with self.assertRaises(FileExistsError):write_packet(out,packet,repo)
            with self.assertRaises(ValueError):write_packet(repo/'leak.json',packet,repo)
    def test_generate_does_not_write_collector_inputs(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            for key,(rel,_) in INPUTS.items():
                p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(self.d[key]),encoding='utf-8')
            before={rel:(root/rel).read_bytes() for rel,_ in INPUTS.values()}
            generate(root,NOW);self.assertEqual(before,{rel:(root/rel).read_bytes() for rel,_ in INPUTS.values()})
            self.assertEqual(len(list((root/'data').glob('bot_*'))),3)
    def test_workflow_outcomes_reads_only_fixed_keys(self):
        with patch.dict(os.environ,{'BOT_API_OUTCOME':'failure','BOT_ATTACHMENTS_OUTCOME':'success','OPENAI_API_KEY':'DO_NOT_COPY'}):
            self.assertEqual(workflow_outcomes()['api'],'failure');self.assertNotIn('DO_NOT_COPY',str(workflow_outcomes()))


class BotPublishedOutputTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for key, (rel, _) in INPUTS.items():
            p = self.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(fixture()[key]), encoding='utf-8')
        self.report = generate(self.root, NOW, {'api':'success','attachments':'success','startup':'success'})
    def validate(self):
        from bot_briefing import validate_outputs
        return validate_outputs(self.root)
    def test_exact_outputs_accepted(self):
        self.assertEqual(self.validate(), self.report)
    def test_altered_counts_rejected(self):
        self.report['counts']['registered'] = 999
        (self.root / 'data/bot_briefing.json').write_text(json.dumps(self.report), encoding='utf-8')
        with self.assertRaises(ValueError): self.validate()
    def test_added_private_field_rejected(self):
        self.report['unexpected_private'] = 'do-not-deploy'
        (self.root / 'data/bot_briefing.json').write_text(json.dumps(self.report), encoding='utf-8')
        with self.assertRaises(ValueError): self.validate()
    def test_updated_input_requires_regeneration(self):
        p = self.root / 'data/programs.json'
        d = json.loads(p.read_text(encoding='utf-8'))
        d['items'][0]['title'] = 'changed'
        p.write_text(json.dumps(d), encoding='utf-8')
        with self.assertRaises(ValueError): self.validate()
    def test_markdown_tamper_rejected(self):
        (self.root / 'data/bot_briefing.md').write_text('unapproved text', encoding='utf-8')
        with self.assertRaises(ValueError): self.validate()
    def test_rss_tamper_rejected(self):
        (self.root / 'data/bot_feed.xml').write_text('<rss/>', encoding='utf-8')
        with self.assertRaises(ValueError): self.validate()
    def test_missing_rendered_file_rejected(self):
        (self.root / 'data/bot_feed.xml').unlink()
        with self.assertRaises(ValueError): self.validate()


if __name__ == '__main__':unittest.main()
