'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('../assets/applications-core.js');
const D=require('../assets/application-dossier.js').attach(B);
const C=require('../assets/application-plan.js').attach(D);
const NOW=new Date('2026-10-31T00:05:00Z');
const P={id:'ABC',title:'테스트 지원 공고',year:2027,mode:'beneficiary',opens:'2026-10-20',deadline:'2026-11-13',source:'https://www.bizinfo.go.kr/a',amount:'별도 확인',eligibility:'확인 필요'};
const fixture=(version='v3',title=P.title)=>{
 const p={...P,title};
 const s=B.add(B.empty(NOW),p,NOW);
 if(version==='v1')return B.serialize(s,NOW);
 const d=D.validate(s);
 if(version==='v2')return D.serialize(d,NOW);
 return C.serialize(C.validate(d),NOW);
};
function setup({modules=true}={}){
 const nodes=new Map(),calls={requests:0,downloads:0,blobs:[],handlers:{}};
 class Element{
  constructor(id){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.disabled=id==='saveChecklist';this.files=[];this.listeners={};}
  addEventListener(name,cb){(this.listeners[name]??=[]).push(cb);}
  async emit(name){for(const f of this.listeners[name]||[])await f({target:this});}
  click(){calls.downloads++;}remove(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 class Clock extends Date{constructor(...xs){super(...(xs.length?xs:[NOW]));}static now(){return +NOW;}}
 const ctx={document:{getElementById:get,createElement:t=>new Element(t),body:{append(){}}},Blob,TextEncoder,Date:Clock,URL:{createObjectURL:b=>{calls.blobs.push(b);return 'blob:local';},revokeObjectURL(){}},fetch:()=>{calls.requests++;throw new Error('NETWORK DISALLOWED');}};
 ctx.globalThis=ctx;
 vm.createContext(ctx);
 if(modules)for(const f of ['applications-core.js','application-dossier.js','application-plan.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',f),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/preflight.js'),'utf8'),ctx);
 const open=async raw=>{get('checkFile').files=[{size:Buffer.byteLength(raw),text:async()=>raw}];await get('checkFile').emit('change');return get('checkStatus').textContent;};
 const download=async()=>{await get('saveChecklist').emit('click');return calls.blobs.length?calls.blobs.at(-1).text():null;};
 return {ctx,get,calls,open,download};
}
test('production page blocks all network and file upload',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../preflight.html'),'utf8');
 assert.match(s,/connect-src 'none'/);assert.match(s,/form-action 'none'/);
 assert.ok(s.indexOf('application-plan.js')<s.indexOf('preflight.js'));
 assert.doesNotMatch(s,/<form|type="submit"|localStorage|sessionStorage/);
});
test('valid v1, v2, v3 preparation files are accepted and migrated safely',async()=>{
 for(const version of ['v1','v2','v3']){
  const h=setup(),msg=await h.open(fixture(version));
  assert.match(msg,/로컬 점검 완료/);
  assert.match(h.get('checkResults').innerHTML,/테스트 지원 공고/);
  assert.equal(h.get('saveChecklist').disabled,false);
  assert.equal(h.calls.requests,0);
 }
});
test('empty file and unsupported schema reject',async()=>{
 const h=setup();assert.match(await h.open('{"schema":"other","items":[]}'),/실패/);
 assert.equal(h.get('saveChecklist').disabled,true);
});
test('malformed task, impossible date, invalid stage are rejected by original schema gate',async()=>{
 for(const mut of [
  s=>s.items[0].tasks[0].status='invented',
  s=>s.items[0].internal_due='2026-02-30',
  s=>s.items[0].stage='approved_by_government'
 ]){
  const h=setup(),s=JSON.parse(fixture());mut(s);
  assert.match(await h.open(JSON.stringify(s)),/실패/);
  assert.equal(h.get('saveChecklist').disabled,true);
 }
});
test('dangling evidence references and extra keys are rejected, not silently treated as ready',async()=>{
 for(const mut of [
  s=>s.items[0].plan.sections[0].evidence_ids=['D99'],
  s=>s.items[0].unexpected_secret='xx',
  s=>s.items[0].plan.sections[0].char_limit=-1
 ]){
  const h=setup(),s=JSON.parse(fixture());mut(s);assert.match(await h.open(JSON.stringify(s)),/실패/);
 }
});
test('prototype pollution and broken JSON are not imported',async()=>{
 const h=setup();
 for(const raw of ['{','{"__proto__":{"polluted":true},"schema":"private-funding-applications/v3","saved_at":"2026-10-30T00:00:00Z","items":[]}']){
  assert.match(await h.open(raw),/실패/);
 }
 assert.equal(Object.prototype.polluted,undefined);
});
test('oversized file refuses loading before reading',async()=>{
 const h=setup(),raw='x'.repeat(524289);
 h.get('checkFile').files=[{size:Buffer.byteLength(raw),text:async()=>{throw new Error('Should not read');}}];
 await h.get('checkFile').emit('change');
 assert.match(h.get('checkStatus').textContent,/512 KiB/);
 assert.equal(h.get('saveChecklist').disabled,true);
});
test('XSS payload remains escaped in HTML results',async()=>{
 const h=setup(),msg=await h.open(fixture('v3','<img src=x onerror=alert(1)>'));
 assert.match(msg,/로컬 점검 완료/);
 assert.doesNotMatch(h.get('checkResults').innerHTML,/<img /);
 assert.match(h.get('checkResults').innerHTML,/&lt;img/);
});
test('local report is generated only after explicit click and never transmitted',async()=>{
 const h=setup();await h.open(fixture());
 assert.equal(h.calls.downloads,0);assert.equal(h.calls.blobs.length,0);
 const output=await h.download();
 assert.match(output,/테스트 지원 공고/);
 assert.match(output,/공식.*별도 확인/);
 assert.equal(h.calls.downloads,1);assert.equal(h.calls.requests,0);
});
test('invalid second file clears previous report and disables download',async()=>{
 const h=setup();await h.open(fixture());assert.equal(h.get('saveChecklist').disabled,false);
 await h.open('broken');assert.equal(h.get('saveChecklist').disabled,true);
 assert.equal(h.get('checkResults').innerHTML,'');
});
test('missing validation modules fail closed before binding file handlers',()=>{
 const h=setup({modules:false});
 assert.match(h.get('checkStatus').textContent,/검증 모듈/);
 assert.equal((h.get('checkFile').listeners.change||[]).length,0);
});
test('report never claims final legal eligibility or official acceptance',async()=>{
 const h=setup();await h.open(fixture());assert.match(h.get('checkResults').innerHTML,/아닙니다/);
 const output=await h.download();assert.match(output,/최신 공고는 별도 확인 필요/);
});

test('date-only deadline never assumes a time, and expired dates require reconfirmation',async()=>{
 for(const [date,pattern] of [
 ['2026-10-30',/마감일 경과/],
 ['2026-10-31',/오늘 기재 마감 · 정확한 마감시각 미확인/],
 ['2026-11-01',/날짜만 기록됨/]
 ]){
  const s=JSON.parse(fixture());s.items[0].reference.deadline=date;
  const h=setup();await h.open(JSON.stringify(s));
  assert.match(h.get('checkResults').innerHTML,pattern);
 }
});
test('self-recorded ready document with past validity must be flagged',async()=>{
 const s=JSON.parse(fixture());
 s.items[0].dossier.documents.push({id:'D1',title:'사용자 입력 확인서',file_label:'D1.pdf',status:'ready_self',issued_on:'2026-10-01',valid_until:'2026-10-30'});
 const h=setup();await h.open(JSON.stringify(s));
 assert.match(h.get('checkResults').innerHTML,/자료 유효기간 경과/);
});
test('known candidate remains unverified even after being saved in preparation board',async()=>{
 const s=JSON.parse(fixture());s.items[0].reference.mode='discovery';
 const h=setup();await h.open(JSON.stringify(s));
 assert.match(h.get('checkResults').innerHTML,/실제 수혜기업 신청 공고로 확정되지 않음/);
 assert.equal(h.calls.requests,0);
});
test('completed tasks do not suppress the official-source verification caveat',async()=>{
 const s=JSON.parse(fixture());for(const task of s.items[0].tasks)task.status='done';
 const h=setup();await h.open(JSON.stringify(s));
 assert.doesNotMatch(h.get('checkResults').innerHTML,/미완료 준비:/);
 assert.match(h.get('checkResults').innerHTML,/최신 공고·첨부의 전체 변경/);
});
test('allowlisted public build contains preflight page and no private state',()=>{
 const py=fs.readFileSync(path.join(__dirname,'./build_public.py'),'utf8');
 assert.match(py,/preflight\.html/);assert.match(py,/assets\/preflight\.js/);
 assert.doesNotMatch(py,/private[-_ ]funding|company_profile|\\.env/);
});
