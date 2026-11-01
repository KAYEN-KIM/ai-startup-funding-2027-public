'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const V=require('../assets/form-version.js');
const B=require('../assets/applications-core.js');
const D=require('../assets/application-dossier.js').attach(B);
const C=require('../assets/application-plan.js').attach(D);
const NOW=new Date('2026-11-01T03:00:00Z');
const P={id:'TEST2027',title:'가상 AI 지원사업',year:2027,mode:'beneficiary',opens:'2026-10-31',deadline:'2026-11-10',source:'https://www.bizinfo.go.kr/a',amount:'미확인',eligibility:'별도 확인'};
const f=(headings=['1. 문제인식','2. 실현가능성'],sha='a',opts={})=>({
 schema:'local-form-outline-candidates/v1',created_at:'2026-11-01T00:00:00Z',
 document:{sha256:sha.repeat(64),format:'hwpx',file_label:'form.hwpx',
  source_url:'https://www.bizinfo.go.kr/a',source_status:'self_supplied_unverified',
  parser:'hwp-body/0.4.0',partial_text:false,...opts.document},
 candidates:headings.map((heading,i)=>({id:'H'+(i+1),heading,
  locator:'Contents/section0.xml / paragraph '+(i+1),reason:'numbered',status:'candidate_unverified'})),
 scanned_units:headings.length,truncated_candidates:false,note:'모든 항목은 미검증 후보입니다.',...opts.root
});
test('identical document SHA and candidate list yields only scoped nonapproval',()=>{
 const a=f();const r=V.compare(a,a);
 assert.equal(r.sha_unchanged,true);
 assert.equal(r.requires_review,false);
 assert.equal(r.counts.unchanged,2);
 assert.match(V.report(r),/공식 원문 변경/);
});
test('different file SHA requires review even when all detected headings match',()=>{
 const r=V.compare(f(),f(undefined,'b'));
 assert.equal(r.sha_unchanged,false);
 assert.equal(r.counts.unchanged,2);
 assert.equal(r.requires_review,true);
 assert.match(r.warnings.join(''),/본문·조건/);
});
test('added and removed headings never auto-merge as renames',()=>{
 const r=V.compare(f(['1. 문제인식','2. 시장진입']),f(['1. 문제인식','2. 사업비'],'b'));
 assert.equal(r.counts.added,1);
 assert.equal(r.counts.removed,1);
 assert.equal(r.counts.unchanged,1);
 assert.equal(r.requires_review,true);
});
test('number changes with preserved unique title are distinguishable from content changes',()=>{
 const a=f(['1. 문제인식']),b=f(['3. 문제인식'],'b');
 const r=V.compare(a,b);
 assert.equal(r.counts.recheck,1);
 assert.ok(r.rows[0].flags.includes('heading_notation_changed'));
});
test('reordered headings and position shifts trigger review',()=>{
 const r=V.compare(f(['1. 문제인식','2. 실현가능성']),f(['2. 실현가능성','1. 문제인식'],'b'));
 assert.equal(r.counts.recheck,2);
 assert.ok(r.rows.every(row=>row.flags.includes('order_changed')));
});
test('same-title duplicate cannot silently map one old row to several new rows',()=>{
 const a=f(['1. 문제인식','2. 문제인식']),b=f(['1. 문제인식'],'b');
 const r=V.compare(a,b);
 assert.equal(r.counts.ambiguous_duplicate,1);
 assert.equal(r.requires_review,true);
 assert.match(V.report(r),/중복 제목/);
});
test('same SHA with different extract output is a metadata conflict, never a no-change assertion',()=>{
 const a=f(),b=f(['1. 문제인식','2. 사업비']);
 const r=V.compare(a,b);
 assert.equal(r.metadata_conflict,true);
 assert.equal(r.requires_review,true);
 assert.match(r.warnings.join('\n'),/생성기/);
});
test('differing or missing source and partial/truncated extraction still require review',()=>{
 const a=f(),b=f(undefined,'a',{document:{source_url:'',partial_text:true},root:{truncated_candidates:true}});
 const r=V.compare(a,b);
 assert.equal(r.requires_review,true);
 assert.ok(r.warnings.some(x=>x.includes('출처')));
 assert.ok(r.warnings.some(x=>x.includes('부분 추출')));
 assert.ok(r.warnings.some(x=>x.includes('40개')));
});
test('invalid unverified status or document fingerprint rejected',()=>{
 const x=f();x.candidates[0].status='officially_verified';
 assert.throws(()=>V.compare(x,f()));
 const y=f();y.document.sha256='abc';
 assert.throws(()=>V.compare(f(),y));
});
test('reports include both source hashes and line locators, no invented legal clearance',()=>{
 const r=V.compare(f(),f(undefined,'b'));
 const txt=V.report(r);
 assert.match(txt,/SHA-256/);assert.match(txt,/paragraph 1/);
 assert.match(txt,/미검증/);assert.doesNotMatch(txt,/최종 자격 통과|지원 확정/);
});
function setup(){
 const els=new Map(),calls={requests:0,downloads:0,blobs:[]};
 class E{
  constructor(id){
   this.id=id;this.value='';this.textContent='';this.innerHTML='';this.dataset={};
   this.checked=false;this.disabled=['exportPacket','completeVersionReview','downloadVersionReport'].includes(id);
   this.listeners={};this.files=[];
  }
  addEventListener(n,fn){(this.listeners[n]??=[]).push(fn);}
  async emit(n,target=this){for(const fn of this.listeners[n]||[])await fn({target});}
  click(){calls.downloads++;}
  remove(){}
 }
 const get=id=>{if(!els.has(id))els.set(id,new E(id));return els.get(id);};
 const ctx={
  document:{getElementById:get,createElement:()=>new E('a'),body:{append(){}}},
  TextEncoder,Blob,Date,URL:{createObjectURL:b=>{calls.blobs.push(b);return 'blob:p022'},revokeObjectURL(){}},
  fetch:()=>{calls.requests++;throw Error('UNEXPECTED NETWORK')}
 };
 ctx.globalThis=ctx;vm.createContext(ctx);
 for(const name of ['applications-core.js','application-dossier.js','application-plan.js','form-mapping.js','form-outline-import.js','form-version.js']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),ctx);
 }
 const loadPlan=async()=>{
  const s=C.add(C.empty(NOW),P,NOW);
  const raw=C.serialize(s,NOW);
  get('prepFile').files=[{size:Buffer.byteLength(raw),text:async()=>raw}];
  await get('prepFile').emit('change');
 };
 const load=async(id,value)=>{
  const raw=JSON.stringify(value);
  get(id).files=[{size:Buffer.byteLength(raw),text:async()=>raw}];
  await get(id).emit('change');
  for(let i=0;i<8;i++)await Promise.resolve();
 };
 const click=async(id)=>get(id).emit('click');
 const manuallyMap=async()=>{
  get('outlineInput').value='1. 문제인식';
  await click('parseOutline');
  await get('mappedRows').emit('change',{dataset:{index:'0',field:'section'},value:'problem'});
 };
 return {get,calls,load,click,loadPlan,manuallyMap};
}
test('UI keeps current draft but blocks preview when any version input changes',async()=>{
 const h=setup();await h.loadPlan();await h.manuallyMap();await h.click('previewPacket');
 assert.equal(h.get('exportPacket').disabled,false);
 await h.load('oldFormCandidate',f());
 assert.equal(h.get('exportPacket').disabled,true);
 await h.click('previewPacket');
 assert.match(h.get('formStatus').textContent,/재검토/);
 assert.equal(h.calls.requests,0);
});
test('UI requires new manual heading parsing and explicit acknowledgement to release hold',async()=>{
 const h=setup();await h.loadPlan();await h.manuallyMap();
 await h.load('oldFormCandidate',f());await h.load('newFormCandidate',f(undefined,'b'));
 await h.click('compareVersionFiles');
 assert.match(h.get('versionSummary').textContent,/SHA-256 변경/);
 assert.equal(h.get('downloadVersionReport').disabled,false);
 h.get('versionAck').checked=true;await h.get('versionAck').emit('change');
 await h.click('completeVersionReview');
 assert.match(h.get('versionStatus').textContent,/미완료/);
 await h.manuallyMap();
 await h.click('completeVersionReview');
 assert.match(h.get('versionStatus').textContent,/자체기록/);
 await h.click('previewPacket');
 assert.equal(h.get('exportPacket').disabled,false);
 assert.equal(h.calls.requests,0);
});
test('report download only after deliberate click, no auto export',async()=>{
 const h=setup();await h.load('oldFormCandidate',f());await h.load('newFormCandidate',f(undefined,'b'));
 await h.click('compareVersionFiles');
 assert.equal(h.calls.blobs.length,0);
 await h.click('downloadVersionReport');
 assert.equal(h.calls.downloads,1);
 assert.match(await h.calls.blobs[0].text(),/비공개 양식 후보 변경 대조표/);
});
test('malicious candidate headings escaped in version result display',async()=>{
 const h=setup(),a=f(['1. <img src=x onerror=alert(1)>']);
 await h.load('oldFormCandidate',a);await h.load('newFormCandidate',f(['1. 문제인식'],'b'));
 await h.click('compareVersionFiles');
 assert.doesNotMatch(h.get('versionRows').innerHTML,/<img/);
 assert.match(h.get('versionRows').innerHTML,/&lt;img/);
});
test('new invalid JSON disables stale comparison export and leaves source hold',async()=>{
 const h=setup();await h.load('oldFormCandidate',f());await h.load('newFormCandidate',f(undefined,'b'));
 await h.click('compareVersionFiles');
 assert.equal(h.get('downloadVersionReport').disabled,false);
 const raw='{bad json';
 h.get('newFormCandidate').files=[{size:raw.length,text:async()=>raw}];
 await h.get('newFormCandidate').emit('change');
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(h.get('downloadVersionReport').disabled,true);
 assert.equal(h.get('exportPacket').disabled,true);
});
test('production page wires comparison after mapping and forbids network and form submission',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../form-mapping.html'),'utf8');
 assert.ok(page.indexOf('form-mapping.js')<page.indexOf('form-version.js'));
 assert.match(page,/connect-src 'none'/);assert.match(page,/formDiffTitle/);
 assert.doesNotMatch(page,/<form|type="submit"/);
 const src=fs.readFileSync(path.join(__dirname,'../assets/form-version.js'),'utf8');
 assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|WebSocket/);
});

test('same SHA with conflicting extracted list cannot release review hold',async()=>{
 const h=setup();await h.loadPlan();await h.manuallyMap();
 await h.load('oldFormCandidate',f());
 await h.load('newFormCandidate',f(['1. 문제인식','2. 사업비']));
 await h.click('compareVersionFiles');
 assert.match(h.get('versionStatus').textContent,/추출목록 불일치/);
 await h.manuallyMap();
 h.get('versionAck').checked=true;await h.get('versionAck').emit('change');
 await h.click('completeVersionReview');
 assert.match(h.get('versionStatus').textContent,/재대조 미완료/);
 await h.click('previewPacket');
 assert.equal(h.get('exportPacket').disabled,true);
});
test('manual reparse without explicit release does not clear source-change hold',async()=>{
 const h=setup();await h.loadPlan();await h.load('oldFormCandidate',f());
 await h.load('newFormCandidate',f(undefined,'b'));await h.click('compareVersionFiles');
 await h.manuallyMap();
 await h.click('previewPacket');
 assert.equal(h.get('exportPacket').disabled,true);
 assert.match(h.get('formStatus').textContent,/재검토 확인/);
});

test('duplicate headings identical in both extracts are ambiguous, but not hash-metadata conflict',()=>{
 const a=f(['1. 문제인식','2. 문제인식']);
 const r=V.compare(a,a);
 assert.equal(r.counts.ambiguous_duplicate,1);
 assert.equal(r.metadata_conflict,false);
 assert.equal(r.requires_review,true);
});
test('control-character injection in source labels and locators is rejected',()=>{
 for(const mut of [
  x=>x.document.file_label='form.hwpx\nFAKE VERIFIED',
  x=>x.document.source_url='https://www.bizinfo.go.kr/\r\nPASS',
  x=>x.candidates[0].locator='PDF p.1\nAPPROVED'
 ]){
  const x=f();mut(x);
  assert.throws(()=>V.compare(x,f()),/제어문자/);
 }
});
