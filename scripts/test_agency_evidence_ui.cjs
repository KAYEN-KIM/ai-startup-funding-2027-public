'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../assets/agency-evidence.js');
const script=fs.readFileSync(path.join(__dirname,'../assets/agency-evidence.js'),'utf8');
const NOW=new Date('2026-10-30T20:00:00+09:00'),AT='2026-10-30T19:00:00+09:00';
const source='https://www.nipa.kr/home/bsnsAll/0/nttDetail?bbsNo=4&nttNo=16976&tab=2';
function data(){return {schema:'public-funding-agency-evidence/v1',version:'0.17.0',model_calls:0,automatic_approval:false,scope:'제한된 원문·첨부 처리. 조건 검증 아님.',
 run:{status:'ok_scoped',at:AT,notices_success:1,notices_failed:0,files_attempted:1,text_extracted:1,partial_or_no_text:0,blocked:0,failed:0},
 notices:{'NIPA-16976':{id:'NIPA-16976',agency_id:'nipa',source,title:'2026 AI 기업 모집',status:'html_available',last_attempt_at:AT,last_success_at:AT,listing_fingerprint:'abc',review_required:false,last_error:null,unhandled_links:0,documents:[{id:'d1',name:'공고.hwpx',public_url:source,locator:'공고 첨부'}],history:[]}},
 documents:{d1:{id:'d1',program_id:'NIPA-16976',notice_source:source,url:source,name:'공고.hwpx',status:'text_extracted',last_success_at:AT,sha256:'123',review_required:false,extraction:{format:'hwpx',bytes:2000,sha256:'123',coverage:'body_text_only_unreviewed',attachments_reviewed:false,limitations:['표·예외조항 미검토'],candidate_facts:[{category:'cofunding',excerpt:'민간부담 20% 문구',locator:'section0 / paragraph 1',status:'candidate_unverified',context_warning:true}]}}}};}
function listing(){return {schema:'public-funding-agency-discovery/v1',automatic_approval:false,model_calls:0,records:{'NIPA-16976':{fingerprint:'abc',kind:'candidate',review_required:false}},sources:{nipa:{status:'ok_no_change',last_success_at:AT}}};}

test('evidence never claims applicant eligibility',()=>{const s=E.view(data(),listing(),{},NOW);assert.match(s,/신청 가능으로 승격하지/);assert.match(s,/조건 미검증/);});
test('candidate locators visible',()=>assert.match(E.view(data(),listing(),{},NOW),/section0 \/ paragraph 1/));
test('NIPA link leads to official notice not opaque file',()=>{const s=E.view(data(),listing(),{},NOW);assert.match(s,/원문에서 현재 첨부/);assert.doesNotMatch(s,/comm\/getFile|upperNo/);});
test('model count and approval policy rejected',()=>{for(const [k,v] of [['model_calls',1],['automatic_approval',true]]){const d=data();d[k]=v;assert.throws(()=>E.checked(d));}});
test('unsupported schema rejected',()=>{const d=data();d.schema='private';assert.throws(()=>E.checked(d));});
test('provenance mismatch rejected',()=>{const d=data();d.documents.d1.program_id='OTHER';assert.throws(()=>E.checked(d));});
test('verified-attachment promotion rejected',()=>{const d=data();d.documents.d1.extraction.attachments_reviewed=true;assert.throws(()=>E.checked(d));});
test('candidate false approval rejected',()=>{const d=data();d.documents.d1.extraction.candidate_facts[0].status='approved';assert.throws(()=>E.checked(d));});
test('unknown status or prototype label rejected',()=>{const d=data();d.documents.d1.status='constructor';assert.throws(()=>E.checked(d));});
test('changed listing invalidates freshness',()=>{const l=listing();l.records['NIPA-16976'].fingerprint='new';assert.match(E.view(data(),l,{},NOW),/이전 성공 기록일 수/);});
test('missing listing invalidates freshness',()=>assert.match(E.view(data(),{sources:{},records:{}},{},NOW),/이전 성공 기록일 수/));
test('failed source shown despite historical success',()=>{const l=listing();l.sources.nipa.status='failed';assert.match(E.view(data(),l,{},NOW),/현재 목록·원문 상태 재확인/);});
test('stale or future observations are not fresh',()=>{assert.equal(E.oldTime('2026-10-01T08:00:00+09:00',NOW),true);assert.equal(E.oldTime('2026-11-01T08:00:00+09:00',NOW),true);assert.equal(E.oldTime('bad',NOW),true);});
test('doc failure retains old evidence warning',()=>{const d=data();d.documents.d1.status='download_failed';assert.match(E.view(d,listing(),{},NOW),/과거 기록/);});
test('sticky change visibly requires review',()=>{const d=data();d.documents.d1.review_required=true;assert.match(E.view(d,listing(),{},NOW),/파일 내용 변경·재검토/);});
test('no attachment does not imply no requirements',()=>{const d=data();d.notices['NIPA-16976'].documents=[];assert.match(E.view(d,listing(),{},NOW),/모든 제출요건이 확인됐다는 뜻은 아닙니다/);});
test('unsupported links not concealed',()=>{const d=data();d.notices['NIPA-16976'].unhandled_links=2;assert.match(E.view(d,listing(),{},NOW),/미지원·차단된 첨부 링크 2건/);});
test('search and agency filters local',()=>{assert.match(E.view(data(),listing(),{query:'missing'},NOW),/아직 열람 기록/);assert.match(E.view(data(),listing(),{agency:'mss'},NOW),/아직 열람 기록/);});
test('HTML from notices and excerpts escaped',()=>{const d=data();d.notices['NIPA-16976'].title='<img src=x onerror=1>';d.documents.d1.extraction.candidate_facts[0].excerpt='<script>bad</script>';const s=E.view(d,listing(),{},NOW);assert.doesNotMatch(s,/<img|<script/);assert.match(s,/&lt;script/);});
test('unsafe attachment or notice URL blocked',()=>{for(const u of ['javascript:alert(1)','https://www.nipa.kr.evil.kr/',source+'&token=123','https://user:pwd@www.nipa.kr/'+source.split('.kr/')[1],source.replace('16976','16977')])assert.equal(E.link(u,source,'open'),'');});
test('opaque NIPA download URL never rendered',()=>assert.equal(E.link('https://www.nipa.kr/comm/getFile?fileNo=secret',source,'open'),''));
test('official links use safe new tab',()=>assert.match(E.link(source,source,'open'),/noopener noreferrer/));
test('no applicant persistence or external writes',()=>{for(const s of ['localStorage','sessionStorage','sendBeacon','document.cookie','XMLHttpRequest','method:','body:','eval('])assert.ok(!script.includes(s),s);});
function harness(failure=false){
 const elements={agencyEvidenceBody:{innerHTML:'',textContent:''}};
 for(const id of ['agencyEvidenceFilter','agencyEvidenceQuery','refreshBtn'])elements[id]={value:id==='agencyEvidenceFilter'?'all':'',events:{},addEventListener(n,f){this.events[n]=f;}};
 const calls=[];vm.runInNewContext(script,{URL,Date,console,document:{getElementById:k=>elements[k]||null},fetch:async(url,options)=>{calls.push([url,options]);return {ok:!failure,json:async()=>url.includes('agency_evidence')?data():listing()};}});
 return {elements,calls};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('UI reads exactly two relative public datasets',async()=>{const h=harness();await tick();assert.equal(h.calls.length,2);for(const [url,o] of h.calls){assert.match(url,/^data\/agency_(evidence|discovery)\.json\?v=/);assert.equal(o.cache,'no-store');}assert.match(h.elements.agencyEvidenceBody.innerHTML,/공고.hwpx/);});
test('filter typing transmits no data',async()=>{const h=harness();await tick();h.elements.agencyEvidenceQuery.value='private typed search';h.elements.agencyEvidenceQuery.events.input();assert.equal(h.calls.length,2);});
test('failed load not interpreted no change',async()=>{const h=harness(true);await tick();assert.match(h.elements.agencyEvidenceBody.textContent,/읽지 못했습니다/);});
test('refresh rereads public state only',async()=>{const h=harness();await tick();await h.elements.refreshBtn.events.click();assert.equal(h.calls.length,4);});
test('absent section does not fetch',()=>{let count=0;vm.runInNewContext(script,{URL,Date,document:{getElementById:()=>null},fetch:()=>count++});assert.equal(count,0);});
