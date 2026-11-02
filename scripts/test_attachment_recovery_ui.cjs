'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const M=require('../assets/attachment-recovery.js');
function fixture(){
 const counts={queued:46,retry_due:3,retry_wait:0,manual:12,revisit:0,current:59,inactive:0};
 const row={id:'abcdef1234567890abcdef12',program_id:'BIZINFO-PBLN_000000000120871',
   status:'download_failed',decision:'retry_due',reason:'bounded_retry_ready',
   retry_after:'2026-11-02T11:00:00+09:00',last_attempt_at:'2026-11-01T10:00:00+09:00',
   last_success_at:null,previous_extraction_kept:false,review_required:false};
 return {schema:'public-funding-attachment-recovery/v1',version:'0.23.0',
  generated_at:'2026-11-02T12:00:00+09:00',source_run_at:'2026-11-02T12:00:00+09:00',
  limits:{notice_pages_per_run:3,file_attempts_per_run:4,reserve_retry_slots:1,success_recheck_days:14},
  counts,active_records:120,selected:[row],issues:[row],issues_truncated:false,
  scope:'현재 확인된 원문만 재확인; 신청자격 미검증'};
}
test('valid recovery plan shows bounded classification and no legal eligibility claim',()=>{
 const r=M.render(fixture());
 assert.match(r,/네트워크 오류|전송 오류/);
 assert.match(r,/46/);assert.match(r,/3/);assert.match(r,/12/);
 assert.match(r,/신청 적격성|신청자격/);
});
test('reject wrong schema, malformed counts, excessive selected rows',()=>{
 for(const mutate of [
  x=>x.schema='private-funding',
  x=>x.version='0.24.0',
  x=>x.counts.retry_due=-1,
  x=>x.selected.push(...Array(5).fill(x.selected[0])),
  x=>x.selected[0].id='notvalid'
 ]){
  const v=structuredClone(fixture());mutate(v);assert.throws(()=>M.check(v));
 }
});
test('safe escaping of untrusted program identifiers',()=>{
 const x=fixture();
 x.selected[0].program_id='<img src=x onerror=alert(1)>';
 const s=M.render(x);assert.match(s,/&lt;img/);assert.doesNotMatch(s,/<img/);
});
test('public webpage loads recovery script from same origin and has no submit form',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/attachment-recovery\.js/);assert.match(html,/attachmentRecoveryBody/);
 assert.match(html,/data\/attachment_recovery\.json/);
 const code=fs.readFileSync(path.join(__dirname,'../assets/attachment-recovery.js'),'utf8');
 assert.doesNotMatch(code,/localStorage|sessionStorage|sendBeacon|XMLHttpRequest|WebSocket|FormData|POST|authorization/);
});
function ui(result=fixture()){
 const els=new Map(),req=[],listeners={};
 class E{
  constructor(id){this.id=id;this.textContent='';this.innerHTML='';this.listeners={};}
  addEventListener(name,f){(this.listeners[name]??=[]).push(f);}
  emit(name){for(const f of this.listeners[name]||[])f();}
 }
 const get=id=>{if(!els.has(id))els.set(id,new E(id));return els.get(id)};
 const ctx={document:{getElementById:get},Date,URL,fetch:async(url,opts)=>{req.push({url,opts});return {ok:true,json:async()=>result};}};
 ctx.globalThis=ctx;vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/attachment-recovery.js'),'utf8'),ctx);
 return {ctx,get,req};
}
test('one same-origin GET with no credentials and no private-body transmission',async()=>{
 const h=ui();for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(h.req.length,1);assert.match(h.req[0].url,/^data\/attachment_recovery.json\?v=/);
 assert.equal(h.req[0].opts.credentials,'omit');assert.equal(h.req[0].opts.body,undefined);
 assert.match(h.get('attachmentRecoveryBody').innerHTML,/재시도/);
});
test('invalid report produces failed-not-green visible status',async()=>{
 const v=fixture();v.schema='bad';
 const h=ui(v);for(let i=0;i<10;i++)await Promise.resolve();
 assert.match(h.get('attachmentRecoveryBody').textContent,/확인하지 못했습니다/);
});
test('manual protection and backoff remains shown even with latest collector success',()=>{
 const v=fixture();v.counts.retry_due=0;v.counts.manual=11;v.counts.retry_wait=4;v.selected=[];
 assert.match(M.render(v),/수동|직접 검토/);
 assert.match(M.render(v),/쿨다운 4/);
});
