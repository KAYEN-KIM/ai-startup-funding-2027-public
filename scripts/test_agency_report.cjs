'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const A=require('../assets/agency-report.js');
const script=fs.readFileSync(path.join(__dirname,'../assets/agency-report.js'),'utf8');
const now=new Date('2026-10-30T19:00:00+09:00');
function data(){return {
 schema:'public-funding-agency-discovery/v1',model_calls:0,automatic_approval:false,scope:'제한된 목록 확인·개인 자격 미판정',
 run:{status:'ok_scoped'},deferred:[{name:'KOCCA',reason:'robots 제한·미연결'}],
 sources:{mss:{status:'ok_changed',pages_checked:1,rows_checked:20,candidate_rows:1,last_attempt_at:'2026-10-30T18:00:00+09:00',last_success_at:'2026-10-30T18:00:00+09:00',error_codes:[]}},
 records:{'MSS-1072172':{id:'MSS-1072172',agency_id:'mss',title:'2027년 초기창업 주관기관 모집',kind:'operator',source:'https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172',deadline:'2026-10-30',opens:null,published_date:'2026-10-30',last_seen_at:'2026-10-30T18:00:00+09:00',review_required:false,matched_program_ids:[],possible_duplicate_ids:[],differences:[],history:[]}}
};}
test('limited collection and operator classification visible',()=>{const v=A.view(data(),{},now);assert.match(v,/운영·주관기관/);assert.match(v,/기존 지원사업 숫자와 합산하지/);});
test('AI calls cannot be nonzero',()=>{const d=data();d.model_calls=1;assert.throws(()=>A.checked(d));});
test('cannot claim automatic approval',()=>{const d=data();d.automatic_approval=true;assert.throws(()=>A.checked(d));});
test('bad schema rejected',()=>{const d=data();d.schema='private';assert.throws(()=>A.checked(d));});
test('unknown collection source rejected',()=>{const d=data();d.sources.evil={};assert.throws(()=>A.checked(d));});
test('oversized record collection rejected',()=>{const d=data();d.records=Object.fromEntries(Array.from({length:1201},(_,i)=>[i,{}]));assert.throws(()=>A.checked(d));});
test('prototype property is not a valid kind',()=>{const d=data();d.records['MSS-1072172'].kind='constructor';assert.throws(()=>A.checked(d));});
test('date only cutoff not invented',()=>{const v=A.view(data(),{},now);assert.match(v,/오늘 마감일·시각 미확인/);assert.doesNotMatch(v,/23:59/);});
test('precise cutoff recomputed at viewing',()=>assert.equal(A.reception({deadline:'2026-10-30T15:00:00+09:00'},now),'마감 경과'));
test('opening timestamp not discarded',()=>assert.equal(A.reception({opens:'2026-11-01T15:00:00+09:00',deadline:'2026-11-04T15:00:00+09:00'},now),'기재 접수 시작 전'));
test('unknown deadline remains unknown',()=>assert.equal(A.reception({deadline:null},now),'마감 미확인'));
test('naive deadline not treated as exact time',()=>assert.equal(A.reception({deadline:'2026-11-01T15:00:00'},now),'마감 미확인'));
test('stale and future observation flagged',()=>{assert.match(A.freshness('2026-10-01T08:00:00+09:00',now),/오래됨/);assert.match(A.freshness('2026-11-01T08:00:00+09:00',now),/재확인/);});
test('failed source preserves visible older records with warning',()=>{const d=data();d.sources.mss.status='failed';assert.match(A.view(d,{},now),/이전 관측값을 보존/);});
test('not seen in bounded window not treated withdrawn',()=>{const d=data();d.records['MSS-1072172'].last_seen_at='2026-10-29T18:00:00+09:00';assert.match(A.view(d,{},now),/삭제·종료로 단정하지/);});
test('exact match is not automatic merge',()=>{const d=data();d.records['MSS-1072172'].matched_program_ids=['OLD'];assert.match(A.view(d,{},now),/자동 병합하지/);});
test('title match is not confirmed same notice',()=>{const d=data();d.records['MSS-1072172'].possible_duplicate_ids=['OLD'];assert.match(A.view(d,{},now),/동일 사업 확정 아님/);});
test('old/new values and sticky review are visible',()=>{const d=data(),r=d.records['MSS-1072172'];r.review_required=true;r.differences=[{field:'deadline',registered:'2026-11-01',listed:'2026-11-02'}];const v=A.view(d,{},now);assert.match(v,/원문 재검토/);assert.match(v,/2026-11-02/);});
test('search and agency filters are local',()=>{assert.match(A.view(data(),{agency:'nipa'},now),/관측 후보 없음/);assert.match(A.view(data(),{query:'not-found'},now),/관측 후보 없음/);assert.match(A.view(data(),{kind:'candidate'},now),/관측 후보 없음/);});
test('untrusted titles and reasons are escaped',()=>{const d=data();d.records['MSS-1072172'].title='<img src=x onerror=alert(1)> AI';d.deferred[0].reason='<script>x</script>';const v=A.view(d,{},now);assert.doesNotMatch(v,/<img|<script/);assert.match(v,/&lt;img/);});
test('unsafe URLs never rendered',()=>{for(const u of ['javascript:alert(1)','https://www.mss.go.kr.evil.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172','https://u:p@www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172','https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1072172&token=x','https://www.nipa.kr/login'])assert.equal(A.sourceLink(u),'');});
test('official links use noopener noreferrer',()=>assert.match(A.sourceLink(data().records['MSS-1072172'].source),/noopener noreferrer/));
test('no private persistence or transport primitives',()=>{for(const x of ['localStorage','sessionStorage','sendBeacon','document.cookie','XMLHttpRequest','method:','body:','eval('])assert.ok(!script.includes(x),x);});
function harness(response){
 const elements={agencyReportBody:{innerHTML:'',textContent:''}};
 for(const id of ['refreshBtn','agencySourceFilter','agencyKindFilter','agencyQuery'])elements[id]={value:id==='agencyQuery'?'':'all',events:{},addEventListener(n,f){this.events[n]=f;}};
 const calls=[];vm.runInNewContext(script,{URL,Date,Intl,console,document:{getElementById:id=>elements[id]||null},fetch:async(...args)=>{calls.push(args);return response();}});return {elements,calls};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('UI fetches only relative public JSON',async()=>{const h=harness(()=>({ok:true,json:async()=>data()}));await tick();assert.equal(h.calls.length,1);assert.match(h.calls[0][0],/^data\/agency_discovery\.json\?v=/);assert.equal(h.calls[0][1].cache,'no-store');assert.match(h.elements.agencyReportBody.innerHTML,/주관기관/);});
test('query filter sends no network requests',async()=>{const h=harness(()=>({ok:true,json:async()=>data()}));await tick();h.elements.agencyQuery.value='no-hit';h.elements.agencyQuery.events.input();assert.equal(h.calls.length,1);assert.match(h.elements.agencyReportBody.innerHTML,/관측 후보 없음/);});
test('refresh requests public JSON only',async()=>{const h=harness(()=>({ok:true,json:async()=>data()}));await tick();await h.elements.refreshBtn.events.click();assert.equal(h.calls.length,2);});
test('failed load never called no change',async()=>{const h=harness(()=>({ok:false}));await tick();assert.match(h.elements.agencyReportBody.textContent,/읽지 못했습니다/);assert.match(h.elements.agencyReportBody.textContent,/변경 없음·수집 성공으로 판단하지/);});
test('JSON parse failure shown honestly',async()=>{const h=harness(()=>({ok:true,json:async()=>{throw Error('bad');}}));await tick();assert.match(h.elements.agencyReportBody.textContent,/읽지 못했습니다/);});
test('missing section means no requests',()=>{let n=0;vm.runInNewContext(script,{URL,Date,Intl,document:{getElementById:()=>null},fetch:()=>{n++;}});assert.equal(n,0);});
