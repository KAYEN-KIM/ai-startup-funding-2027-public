'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const F=require('../assets/form-mapping.js');
const B=require('../assets/applications-core.js');
const D=require('../assets/application-dossier.js').attach(B);
const C=require('../assets/application-plan.js').attach(D);
const NOW=new Date('2026-10-31T03:00:00Z');
const P={id:'TEST1',title:'가상 2027 AI 지원 공고',year:2027,mode:'beneficiary',opens:'2026-10-29',deadline:'2026-11-13',source:'https://www.bizinfo.go.kr/',amount:'확인 필요',eligibility:'별도 검토'};
function fixture(){
 let s=C.add(C.empty(NOW),P,NOW);
 s=C.editPlan(s,'TEST1',null,'project_title','가상 실증 프로젝트');
 s=C.editPlan(s,'TEST1','problem','facts','<인터뷰> 2명으로부터 의견 수집(미검증 자체기록)');
 s=C.editPlan(s,'TEST1','problem','proposal','향후 실증 10건을 검토할 계획');
 s=C.editPlan(s,'TEST1','budget','proposal','사업비 산정은 추후 근거 확보 예정');
 return s;
}
const fields=F.headings('1. 문제인식\n2. 실현가능성\n3. 사업비 구성');
const choices=[{section:'problem',scope:'both'},{section:'solution',scope:'proposal'},{section:'budget',scope:'proposal'}];
const form={title:'가상 양식',edition:'수정일 2026-10-30',source:'https://www.k-startup.go.kr/'};
test('outline strips numbered headings, preserves raw text and order',()=>{
 assert.deepEqual(fields.map(x=>x.title),['문제인식','실현가능성','사업비 구성']);
 assert.equal(fields[2].raw,'3. 사업비 구성');
 assert.equal(F.headings('제2장 시장진입')[0].title,'시장진입');
});
test('outline rejects prose overload, too many lines and invisible characters',()=>{
 assert.throws(()=>F.headings(''),/입력/);
 assert.throws(()=>F.headings('x\n'.repeat(41)),/40줄/);
 assert.throws(()=>F.headings('a'.repeat(141)),/길이/);
 assert.throws(()=>F.headings('1. 악성\u0000'),/제어/);
});
test('recommendations are only candidates, never applied to choices',()=>{
 assert.deepEqual(F.suggest('문제인식'),{code:'candidate',sections:['problem']});
 assert.deepEqual(F.suggest('일반 목적'),{code:'none',sections:[]});
 assert.equal(F.suggest('팀 구성 및 사업비').code,'ambiguous');
});
test('packet includes only selected facts/plans and preserves source limitations',()=>{
 const r=F.build({fields,choices,application:fixture().items[0],form});
 assert.match(r.text,/사용자가 붙여넣은 목차/);
 assert.match(r.text,/<인터뷰> 2명/);
 assert.match(r.text,/향후 실증 10건/);
 assert.match(r.text,/사업비 산정/);
 assert.match(r.text,/공식 검증 아님/);
 assert.equal(r.total,3);
});
test('unmapped item remains explicit and does not silently fill',()=>{
 const r=F.build({fields,choices:[{section:'',scope:'both'},...choices.slice(1)],application:fixture().items[0],form});
 assert.match(r.text,/대응: 미설정/);
 assert.ok(r.issues.some(s=>s.includes('F1 미연결')));
});
test('duplicate section mapping raises warning instead of aggregating grant',()=>{
 const r=F.build({fields,choices:[{section:'problem',scope:'both'},{section:'problem',scope:'facts'},choices[2]],application:fixture().items[0],form});
 assert.ok(r.issues.some(s=>s.includes('중복 대응')));
});
test('invalid mappings, URLs and section IDs are rejected',()=>{
 for(const bad of ['not-a-section','constructor','__proto__']){
  assert.throws(()=>F.build({fields,choices:[{section:bad,scope:'both'},...choices.slice(1)],application:fixture().items[0],form}),/존재하지/);
 }
 assert.throws(()=>F.build({fields,choices,application:fixture().items[0],form:{...form,source:'javascript:alert(1)'}}),/HTTPS/);
 assert.throws(()=>F.build({fields,choices:[{section:'problem',scope:'undefined'},...choices.slice(1)],application:fixture().items[0],form}),/형식/);
});
test('no invented business results: only user-provided text is emitted',()=>{
 const r=F.build({fields,choices,application:fixture().items[0],form});
 assert.doesNotMatch(r.text,/매출 증가율 50%|정확도 99%/);
 assert.match(r.text,/자체기록·미검증/);
});
function ui(){
 const els=new Map(),calls={requests:0,downloads:0,blobs:[]};
 class Element{
  constructor(id){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.disabled=id==='exportPacket';this.dataset={};this.listeners={};this.files=[];}
  addEventListener(t,f){(this.listeners[t]??=[]).push(f);}
  async emit(t,target=this){for(const f of this.listeners[t]||[])await f({target});}
  click(){calls.downloads++;}remove(){}
 }
 const get=id=>{if(!els.has(id))els.set(id,new Element(id));return els.get(id);};
 const document={getElementById:get,createElement:()=>new Element('a'),body:{append(){}}};
 const ctx={document,TextEncoder,Date,Blob,URL:{createObjectURL:b=>{calls.blobs.push(b);return 'blob:test';},revokeObjectURL(){}},fetch:()=>{calls.requests++;throw new Error('NETWORK FORBIDDEN');}};
 ctx.globalThis=ctx;
 vm.createContext(ctx);
 for(const name of ['applications-core.js','application-dossier.js','application-plan.js','form-mapping.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),ctx);
 const load=async()=>{
  const raw=C.serialize(fixture(),NOW);
  get('prepFile').files=[{size:Buffer.byteLength(raw),text:async()=>raw}];
  await get('prepFile').emit('change');
 };
 return {ctx,get,calls,load,emit:(id,type)=>get(id).emit(type)};
}
test('page forbids network transport, inline script and submission',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../form-mapping.html'),'utf8');
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/form-action 'none'/);
 assert.ok(html.indexOf('application-plan.js')<html.indexOf('form-mapping.js'));
 assert.doesNotMatch(html,/<form|type="submit"|http-equiv="refresh"/);
 const src=fs.readFileSync(path.join(__dirname,'../assets/form-mapping.js'),'utf8');
 assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|indexedDB|sessionStorage/);
});
test('UI loads local plan, parses headings, makes suggestions only, then previews',async()=>{
 const h=ui();await h.load();
 assert.match(h.get('formStatus').textContent,/준비파일 1개/);
 h.get('outlineInput').value='1. 문제인식\n2. 사업비';
 await h.emit('parseOutline','click');
 assert.match(h.get('mappedRows').innerHTML,/참고 후보: 고객·문제/);
 assert.match(h.get('mappingSummary').textContent,/수동 연결 0개/);
 assert.equal(h.calls.requests,0);
 await h.emit('previewPacket','click');
 assert.match(h.get('packetPreview').textContent,/미설정/);
 assert.equal(h.get('exportPacket').disabled,false);
 assert.equal(h.calls.blobs.length,0);
});
test('UI manually maps field and exports only on explicit action',async()=>{
 const h=ui();await h.load();h.get('outlineInput').value='1. 문제인식';await h.emit('parseOutline','click');
 const t={value:'problem',dataset:{index:'0',field:'section'}};
 await h.get('mappedRows').emit('change',t);
 await h.emit('previewPacket','click');
 assert.match(h.get('packetPreview').textContent,/<인터뷰>/);
 assert.equal(h.calls.downloads,0);
 await h.emit('exportPacket','click');
 assert.equal(h.calls.downloads,1);
 assert.equal(h.calls.requests,0);
});
test('UI edits invalidate preview and export',async()=>{
 const h=ui();await h.load();h.get('outlineInput').value='1. 문제인식';await h.emit('parseOutline','click');await h.emit('previewPacket','click');
 assert.equal(h.get('exportPacket').disabled,false);
 h.get('formEdition').value='수정';await h.emit('formEdition','input');
 assert.equal(h.get('exportPacket').disabled,true);
});
test('UI never uses innerHTML for raw pasted content without escaping',async()=>{
 const h=ui();await h.load();h.get('outlineInput').value='1. <img src=x onerror=alert(1)>';await h.emit('parseOutline','click');
 assert.doesNotMatch(h.get('mappedRows').innerHTML,/<img/);
 assert.match(h.get('mappedRows').innerHTML,/&lt;img/);
});
test('UI rejects malformed or oversized file before storing and leaves export disabled',async()=>{
 const h=ui();h.get('prepFile').files=[{size:524289,text:async()=>{throw new Error('Unexpected read')}}];await h.emit('prepFile','change');
 assert.match(h.get('formStatus').textContent,/512 KiB/);
 assert.equal(h.get('exportPacket').disabled,true);
});
