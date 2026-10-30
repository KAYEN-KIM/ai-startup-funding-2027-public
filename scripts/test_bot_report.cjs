'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('../assets/bot-report.js');
const script=fs.readFileSync(path.join(__dirname,'../assets/bot-report.js'),'utf8');
const now=new Date('2026-10-30T13:00:00+09:00');
function data(){return {
 schema:'public-funding-bot-briefing/v1',generation:'deterministic_no_model',report_model_calls:0,
 ai_transport:'manual_cli_only',automatic_submission:false,automatic_rule_approval:false,
 generated_at:'2026-10-30T12:00:00+09:00',run_status:'ok_scoped',attention_required:true,
 lanes:['api','html','attachments','startup'].map(id=>({id,name:id,status:'ok_scoped',last_attempt_at:'2026-10-30T08:00:00+09:00'})),
 queue:[{id:'q',priority:'P1',title:'AI 공고',reason:'원문 확인 필요',action:'review_original',source:'https://www.mss.go.kr/file'}],
 deadlines:[{program_id:'a',title:'AI 지원',deadline:'2026-10-30',mode:'discovery',status:'today_time_unknown',source:'https://www.bizinfo.go.kr/notice'}],
 counts:{queue_total:1,upcoming_deadlines:1},unresolved:{attachment_failures:3,pending_differences:1,unverified_programs:2,queued_attachments:5},
 deadline_window_days:7,notice:'개별 적격성 미판정',scope:'제한된 공식 자료',queue_truncated:false,deadline_rows_truncated:false};}
test('valid public report renders scoped status',()=>assert.match(B.view(data(),now),/이번 범위 확인/));
test('no model auto submission statement validated',()=>{const d=data();d.automatic_submission=true;assert.throws(()=>B.view(d,now));});
test('bad schema rejected',()=>{const d=data();d.schema='private/v1';assert.throws(()=>B.checked(d));});
test('model-call report rejected',()=>{const d=data();d.report_model_calls=1;assert.throws(()=>B.checked(d));});
test('automatic rule approval rejected',()=>{const d=data();d.automatic_rule_approval=true;assert.throws(()=>B.checked(d));});
test('API mode rejected',()=>{const d=data();d.ai_transport='api';assert.throws(()=>B.checked(d));});
test('missing four lanes rejected',()=>{const d=data();d.lanes=[];assert.throws(()=>B.checked(d));});
test('oversized queue rejected',()=>{const d=data();d.queue=Array(201).fill({});assert.throws(()=>B.checked(d));});
test('oversized deadlines rejected',()=>{const d=data();d.deadlines=Array(31).fill({});assert.throws(()=>B.checked(d));});
test('broken generation time rejected',()=>{const d=data();d.generated_at='bad';assert.throws(()=>B.checked(d));});
test('old report shows warning',()=>{const d=data();d.generated_at='2026-10-20T08:00:00+09:00';assert.match(B.view(d,now),/시간이 경과/);});
test('future report shows clock warning',()=>{const d=data();d.generated_at='2026-11-02T08:00:00+09:00';assert.match(B.view(d,now),/시각 확인/);});
test('historical failed files remain visible on new successful run',()=>assert.match(B.view(data(),now),/미해결 첨부 실패 <b>3/));
test('unverified candidate shown distinct',()=>assert.match(B.view(data(),now),/발견 후보·원문 미검증/));
test('date-only today not 2359',()=>{const v=B.view(data(),now);assert.match(v,/시각 미확인/);assert.doesNotMatch(v,/23:59/);});
test('precise elapsed deadline recomputed at viewing time',()=>{const d=data();d.deadlines[0].deadline='2026-10-30T12:30:00+09:00';d.deadlines[0].status='due_today';assert.match(B.view(d,now),/마감 경과/);});
test('next day date-only no longer says today',()=>assert.equal(B.liveDeadline({deadline:'2026-10-29',status:'today_time_unknown'},now),'closed'));
test('unsafe source URL not rendered',()=>{for(const u of ['javascript:alert(1)','https://evil.kr','https://www.mss.go.kr.evil.com/','https://u:p@www.mss.go.kr','https://www.mss.go.kr/?secret=x'])assert.equal(B.sourceLink(u),'');});
test('official source uses noopener',()=>assert.match(B.sourceLink('https://www.mss.go.kr/x'),/noopener noreferrer/));
test('hostile titles reasons escaped',()=>{const d=data();d.queue[0].title='<img src=x onerror="fetch(1)">';d.queue[0].reason='<script>x</script>';const v=B.view(d,now);assert.doesNotMatch(v,/<img|<script/);assert.match(v,/&lt;img/);});
test('no automatic storage or input extraction',()=>{for(const x of ['localStorage','sessionStorage','sendBeacon','document.cookie','XMLHttpRequest','.value','eval(','exec('])assert.ok(!script.includes(x),x);});
test('empty queue no false completeness',()=>{const d=data();d.queue=[];const v=B.view(d,now);assert.match(v,/전체 검증 완료가 아닙니다/);});
test('truncation explicitly shown',()=>{const d=data();d.queue_truncated=true;assert.match(B.view(d,now),/일부 대기가 생략/);});
function harness(response){
 const host={innerHTML:'',textContent:''},btn={events:{},addEventListener(n,f){this.events[n]=f;}};const calls=[];
 const context={URL,Date,Intl,console,document:{getElementById:id=>id==='botReportBody'?host:id==='refreshBtn'?btn:null},fetch:async (...args)=>{calls.push(args);return response();}};
 vm.runInNewContext(script,context);return {host,btn,calls};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('UI requests only relative public report with no-store',async()=>{const h=harness(()=>({ok:true,json:async()=>data()}));await tick();assert.equal(h.calls.length,1);assert.match(h.calls[0][0],/^data\/bot_briefing\.json\?v=/);assert.equal(h.calls[0][1].cache,'no-store');assert.match(h.host.innerHTML,/AI 공고/);});
test('refresh button reloads only public report',async()=>{const h=harness(()=>({ok:true,json:async()=>data()}));await tick();await h.btn.events.click();assert.equal(h.calls.length,2);});
test('HTTP failure not called unchanged',async()=>{const h=harness(()=>({ok:false}));await tick();assert.match(h.host.textContent,/불러오지 못했습니다/);assert.match(h.host.textContent,/변경 없음이나 수집 성공으로 판단하지/);});
test('parse failure honest',async()=>{const h=harness(()=>({ok:true,json:async()=>{throw Error('bad');}}));await tick();assert.match(h.host.textContent,/불러오지 못했습니다/);});
test('absent section does not start request',()=>{let calls=0;vm.runInNewContext(script,{URL,Date,Intl,document:{getElementById:()=>null},fetch:()=>{calls++;}});assert.equal(calls,0);});
