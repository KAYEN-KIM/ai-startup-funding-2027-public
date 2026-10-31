'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Import=require('../assets/form-outline-import.js');
function sample(overrides={}){
 return {
  schema:'local-form-outline-candidates/v1',created_at:'2026-10-31T12:00:00+00:00',
  document:{sha256:'a'.repeat(64),format:'hwpx',file_label:'test.hwpx',source_url:'',
   source_status:'self_supplied_unverified',parser:'hwp-body/0.4.0',partial_text:false},
  candidates:[
   {id:'H1',heading:'1. 문제인식',locator:'Contents/section0.xml / paragraph 1',reason:'numbered',status:'candidate_unverified'},
   {id:'H2',heading:'2. 실현가능성',locator:'Contents/section0.xml / paragraph 2',reason:'numbered',status:'candidate_unverified'}
  ],
  scanned_units:3,truncated_candidates:false,note:'모든 항목은 미검증 후보입니다.',
  ...overrides
 };
}
test('schema validates bounded local candidate with provenance',()=>{
 const r=Import.validate(JSON.stringify(sample()));
 assert.equal(r.candidates.length,2);
 assert.equal(r.document.source_status,'self_supplied_unverified');
});
test('schema forbids fabricated verification, prototype pollution and unknown locators',()=>{
 const base=sample();
 for(const mutation of [
  x=>x.document.source_status='verified_by_government',
  x=>x.document.sha256='bogus',
  x=>x.candidates[0].status='approved',
  x=>x.candidates[0].locator='',
  x=>x.candidates[0].reason='llm_suggestion',
  x=>x.candidates[0].heading='x'.repeat(141)
 ]){
  const obj=structuredClone(base);mutation(obj);
  assert.throws(()=>Import.validate(JSON.stringify(obj)));
 }
 assert.throws(()=>Import.validate('{"__proto__":{"pwned":true},"schema":"local-form-outline-candidates/v1"}'));
 assert.equal(Object.prototype.pwned,undefined);
});
test('UI is no-network, no-storage and only local JSON file intake',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../form-mapping.html'),'utf8');
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/form-outline-import\.js/);
 assert.match(html,/outlineCandidateFile/);
 assert.doesNotMatch(html,/<form|type="submit"/);
 const src=fs.readFileSync(path.join(__dirname,'../assets/form-outline-import.js'),'utf8');
 assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|WebSocket/);
});
function setup(){
 const nodes=new Map(),calls={requests:0,downloads:0};
 class E{
  constructor(id){this.id=id;this.value='';this.checked=false;this.disabled=true;this.innerHTML='';this.textContent='';this.dataset={};this.listeners={};this.files=[];}
  addEventListener(name,cb){(this.listeners[name]??=[]).push(cb);}
  async emit(name,target=this){for(const f of this.listeners[name]||[])await f({target});}
  click(){calls.downloads++}
  remove(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new E(id));return nodes.get(id)};
 const ctx={document:{getElementById:get,createElement:()=>new E('a'),body:{append(){}}},TextEncoder,Blob,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},Date,fetch:()=>{calls.requests++;throw Error('NO NETWORK')}};
 ctx.globalThis=ctx;vm.createContext(ctx);
 for(const f of ['applications-core.js','application-dossier.js','application-plan.js','form-mapping.js','form-outline-import.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',f),'utf8'),ctx);
 const load=async(raw,size)=>{get('outlineCandidateFile').files=[{size:size??Buffer.byteLength(raw),text:async()=>raw}];await get('outlineCandidateFile').emit('change')};
 const change=async(i,checked)=>{const input={dataset:{index:String(i)},checked};await get('outlineCandidateRows').emit('change',input);};
 return {get,calls,load,change,emit:async(id,name)=>get(id).emit(name)};
}
test('loading candidates neither overwrites prior manually entered outline nor auto-approves',async()=>{
 const h=setup();h.get('outlineInput').value='내가 작성한 원래 목차';
 await h.load(JSON.stringify(sample()));
 assert.equal(h.get('outlineInput').value,'내가 작성한 원래 목차');
 assert.match(h.get('outlineCandidateRows').innerHTML,/미검증 후보/);
 assert.equal(h.get('applyOutlineCandidates').disabled,true);
 assert.equal(h.calls.requests,0);
});
test('user selection and acknowledgement are required before copying candidate headings',async()=>{
 const h=setup();await h.load(JSON.stringify(sample()));
 await h.change(1,true);
 assert.equal(h.get('applyOutlineCandidates').disabled,true);
 h.get('approveCandidateCopy').checked=true;
 await h.emit('approveCandidateCopy','change');
 assert.equal(h.get('applyOutlineCandidates').disabled,false);
 await h.emit('applyOutlineCandidates','click');
 assert.equal(h.get('outlineInput').value,'2. 실현가능성');
 assert.equal(h.get('exportPacket').disabled,true);
 assert.equal(h.get('approveCandidateCopy').checked,false);
 assert.equal(h.calls.requests,0);
});
test('importing candidates invalidates previous preview and mapping selection',async()=>{
 const h=setup();
 h.get('outlineInput').value='1. 문제인식';
 await h.emit('parseOutline','click');
 assert.match(h.get('mappedRows').innerHTML,/문제인식/);
 await h.load(JSON.stringify(sample()));await h.change(0,true);
 h.get('approveCandidateCopy').checked=true;await h.emit('approveCandidateCopy','change');
 await h.emit('applyOutlineCandidates','click');
 assert.equal(h.get('mappedRows').innerHTML,'');
 assert.equal(h.get('exportPacket').disabled,true);
});
test('malicious candidate headings are escaped in preview and never executed',async()=>{
 const h=setup(),data=sample();
 data.candidates[0].heading='1. <img src=x onerror=alert(1)>';
 await h.load(JSON.stringify(data));
 assert.doesNotMatch(h.get('outlineCandidateRows').innerHTML,/<img/);
 assert.match(h.get('outlineCandidateRows').innerHTML,/&lt;img/);
});
test('subsequent invalid file resets old candidate and action state',async()=>{
 const h=setup();await h.load(JSON.stringify(sample()));await h.change(0,true);
 h.get('approveCandidateCopy').checked=true;await h.emit('approveCandidateCopy','change');
 assert.equal(h.get('applyOutlineCandidates').disabled,false);
 await h.load('{oops');
 assert.equal(h.get('applyOutlineCandidates').disabled,true);
 assert.equal(h.get('outlineCandidateRows').innerHTML,'');
});
test('oversized file rejected before reading bytes',async()=>{
 const h=setup();h.get('outlineCandidateFile').files=[{size:100001,text:async()=>{throw Error('SHOULD NOT READ')}}];
 await h.emit('outlineCandidateFile','change');
 assert.match(h.get('outlineCandidateStatus').textContent,/100KB/);
 assert.equal(h.get('applyOutlineCandidates').disabled,true);
});
