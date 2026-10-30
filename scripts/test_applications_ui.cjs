'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const C=require('../assets/application-plan.js').attach(require('../assets/application-dossier.js').attach(require('../assets/applications-core.js')));
const NOW=new Date('2026-10-30T01:00:00Z');
const P={id:'P1',title:'AI <검토> 공고',year:2027,mode:'beneficiary',opens:'2026-10-20',deadline:'2026-11-13T14:00:00+09:00',source:'https://www.bizinfo.go.kr/a',amount:'한도 미정',eligibility:'원문 확인'};
const M={schema:'public-funding-monitor/v1',status:'ok_changed',last_success_at:'2026-10-30T00:40:00Z'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup({failure=false,hash=''}={}){
  const els=new Map(),requests=[],blobs=[],downloads=[],handlers={},pendingReads=[];
  class El{
    constructor(id){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.disabled=false;this.hidden=true;this.files=[];this.dataset={};this.listeners={};this.className='';}
    addEventListener(ev,fn){(this.listeners[ev]??=[]).push(fn);}
    async emit(ev,target=this){for(const fn of this.listeners[ev]||[])await fn({target});}
    closest(){return this.dataset.act?this:null;}
    click(){downloads.push(this);}
    remove(){}
  }
  const get=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id);};
  let cat={schema:'public-funding-radar/v1',items:[P]},mon={...M},fail=failure;
  class Clock extends Date{constructor(...x){super(...(x.length?x:[NOW]));}static now(){return +NOW;}}
  const ctx={console,TextEncoder,URLSearchParams,location:{hash},Date:Clock,Blob,URL:{createObjectURL:b=>{blobs.push(b);return 'blob:test';},revokeObjectURL:()=>{}},setTimeout:fn=>fn(),confirm:()=>true,
    RadarCore:{esc,sourceURL:v=>/^https:\/\/www\.bizinfo\.go\.kr\//.test(v)?v:null},
    addEventListener:(n,f)=>{handlers[n]=f;},
    document:{getElementById:get,body:{appendChild(){}},createElement:tag=>new El(tag)},
    fetch:async(url,opts)=>{requests.push({url,opts});return {ok:!fail,json:async()=>url.includes('programs.json')?cat:mon};}
  };
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/applications-core.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/application-dossier.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/application-dossier-view.js'),'utf8'),ctx);
  for(const f of ['application-plan.js','application-plan-view.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/'+f),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/applications-ui.js'),'utf8'),ctx);
  const ready=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  const add=async()=>{await ready();get('noticeSelect').value='P1';await get('noticeSelect').emit('change');await get('addNotice').emit('click');};
  const change=async(field,value,task)=>{const e=new El('x');e.dataset={app:'P1',field,task};e.value=value;await get('board').emit('change',e);};
  const action=async(act,task)=>{const e=new El('b');e.dataset={app:'P1',act,task};await get('board').emit('click',e);};
  const importRaw=async raw=>{get('importFile').files=[{size:Buffer.byteLength(raw),text:async()=>raw}];await get('importFile').emit('change');};
  return {ctx,get,requests,blobs,downloads,handlers,ready,add,change,action,importRaw,setCatalog:x=>{cat=x;},setFailure:x=>{fail=x;}};
}
test('initial reads limited to two public GET files with omitted credentials',async()=>{const h=setup();await h.ready();assert.equal(h.requests.length,2);for(const r of h.requests){assert.match(r.url,/^data\/(programs|monitor)\.json\?v=\d+$/);assert.equal(r.opts.credentials,'omit');assert.equal(r.opts.body,undefined);}assert.equal(h.blobs.length,0);});
test('search and add show one notice and six internal task examples',async()=>{const h=setup();await h.add();assert.ok(h.get('board').innerHTML.includes('AI &lt;검토&gt; 공고'));assert.equal((h.get('board').innerHTML.match(/class="task-row"/g)||[]).length,6);assert.ok(h.get('summary').innerHTML.includes('내부 미완료'));});
test('duplicate add fails without erasing edits',async()=>{const h=setup();await h.add();await h.change('task_status','done','source');await h.add();assert.ok(h.get('message').textContent.includes('이미'));assert.ok(h.get('board').innerHTML.includes('1개 준비 완료'));});
test('updates use only memory and export on click only',async()=>{const h=setup();await h.add();await h.change('internal_due','2026-11-01');await h.change('stage','preparing');assert.equal(h.requests.length,2);assert.equal(h.blobs.length,0);await h.get('saveBoard').emit('click');assert.equal(h.blobs.length,1);const saved=C.parseFile(await h.blobs[0].text());assert.equal(saved.items[0].stage,'preparing');assert.equal(saved.items[0].internal_due,'2026-11-01');});
test('invalid edit is refused and earlier valid state preserved',async()=>{const h=setup();await h.add();await h.change('stage','legal_approval');await h.get('saveBoard').emit('click');assert.equal(C.parseFile(await h.blobs[0].text()).items[0].stage,'watch');});
test('reload public records does not discard private work',async()=>{const h=setup();await h.add();await h.change('task_status','done','source');await h.get('reloadPublic').emit('click');assert.ok(h.get('board').innerHTML.includes('1개 준비 완료'));assert.equal(h.requests.length,4);});
test('failed reload preserves work and warns rather than reporting no changes',async()=>{const h=setup();await h.add();h.setFailure(true);await h.get('reloadPublic').emit('click');assert.ok(h.get('board').innerHTML.includes('AI &lt;검토&gt;'));assert.ok(h.get('sourceStatus').textContent.includes('실패'));});
test('changed deadline shows old and current values until explicit acknowledge',async()=>{const h=setup();await h.add();h.setCatalog({schema:'public-funding-radar/v1',items:[{...P,deadline:'2026-11-20'}]});await h.get('reloadPublic').emit('click');assert.ok(h.get('board').innerHTML.includes('2026-11-20'));assert.ok(h.get('board').innerHTML.includes('저장 당시'));await h.action('sync');assert.ok(!h.get('board').innerHTML.includes('저장 당시와 현재'));});
test('valid file import has preview and requires explicit replacement',async()=>{const h=setup();await h.ready();const s=C.add(C.empty(NOW),P,NOW);s.items[0].stage='preparing';await h.importRaw(C.serialize(s,NOW));assert.equal(h.get('importPreview').hidden,false);assert.ok(!h.get('board').innerHTML.includes('application-card'));await h.get('applyImport').emit('click');assert.ok(h.get('board').innerHTML.includes('application-card'));assert.equal(h.requests.length,2);});
test('cancel import keeps prior state',async()=>{const h=setup();await h.add();await h.importRaw(C.serialize(C.empty(NOW),NOW));await h.get('cancelImport').emit('click');assert.ok(h.get('board').innerHTML.includes('application-card'));});
test('invalid file cannot replace good state',async()=>{const h=setup();await h.add();await h.importRaw('{"schema":"wrong"}');assert.equal(h.get('importPreview').hidden,true);await h.get('applyImport').emit('click');assert.ok(h.get('board').innerHTML.includes('application-card'));});
test('file byte limit checked before reading content',async()=>{const h=setup();await h.ready();let reads=0;h.get('importFile').files=[{size:C.LIMITS.bytes+1,text:async()=>{reads++;return '{}';}}];await h.get('importFile').emit('change');assert.equal(reads,0);assert.ok(h.get('message').textContent.includes('512'));});
test('import with unknown public ID retains records with missing-source warning',async()=>{const h=setup();await h.ready();const s=C.add(C.empty(NOW),{...P,id:'old'},NOW);await h.importRaw(C.serialize(s,NOW));await h.get('applyImport').emit('click');assert.ok(h.get('board').innerHTML.includes('목록에서 찾을 수 없음'));assert.equal((h.get('board').innerHTML.match(/class="task-row"/g)||[]).length,6);});
test('custom HTML remains escaped in card, calendar and export contain no script execution',async()=>{const h=setup();await h.add();h.get('task-P1').value='<img src=x onerror=alert(1)>';await h.action('add_task');assert.ok(h.get('board').innerHTML.includes('&lt;img'));assert.ok(!h.get('board').innerHTML.includes('<img'));assert.equal(h.requests.length,2);});
test('removal requires confirmation and affects only current state',async()=>{const h=setup();await h.add();h.ctx.confirm=()=>false;await h.action('remove');assert.ok(h.get('board').innerHTML.includes('application-card'));h.ctx.confirm=()=>true;await h.action('remove');assert.ok(h.get('board').innerHTML.includes('empty'));});
test('calendar explicit click, only eligible public date and local task entries',async()=>{const h=setup();await h.add();await h.change('task_due','2026-11-01','source');await h.get('calendarExport').emit('click');assert.equal(h.blobs.length,1);const txt=await h.blobs[0].text();assert.ok(txt.includes('BEGIN:VCALENDAR'));assert.equal((txt.match(/BEGIN:VEVENT/g)||[]).length,2);assert.equal(h.requests.length,2);});
test('stale monitor blocks official calendar but permits clearly internal dates',async()=>{const h=setup();await h.add();h.setFailure(true);await h.get('reloadPublic').emit('click');await h.get('calendarExport').emit('click');assert.equal(h.blobs.length,0);await h.change('internal_due','2026-11-01');await h.get('calendarExport').emit('click');const txt=await h.blobs[0].text();assert.ok(!txt.includes('DTSTART:20261113'));assert.ok(txt.includes('VALUE=DATE:20261101'));});
test('dirty navigation prompt and explicit download marks current work saved',async()=>{const h=setup();await h.add();let prevents=0;h.handlers.beforeunload({preventDefault(){prevents++;}});assert.equal(prevents,1);await h.get('saveBoard').emit('click');h.handlers.beforeunload({preventDefault(){prevents++;}});assert.equal(prevents,1);});
test('newer import cancels late result from prior file',async()=>{const h=setup();await h.ready();let resolve;h.get('importFile').files=[{size:10,text:()=>new Promise(r=>{resolve=r;})}];const first=h.get('importFile').emit('change');await h.importRaw(C.serialize(C.empty(NOW),NOW));resolve(C.serialize(C.add(C.empty(NOW),P,NOW),NOW));await first;await h.get('applyImport').emit('click');assert.ok(!h.get('board').innerHTML.includes('application-card'));});
test('contract: no automatic persistence, uploads, credentials or external third-party requests',()=>{const s=fs.readFileSync(path.join(__dirname,'../assets/applications-ui.js'),'utf8');assert.doesNotMatch(s,/localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|WebSocket|FormData|eval\(|new Function/);assert.equal((s.match(/fetch\(/g)||[]).length,1);const html=fs.readFileSync(path.join(__dirname,'../applications.html'),'utf8');assert.match(html,/type="file"/);assert.match(html,/form-action 'none'/);assert.doesNotMatch(html,/<form|https:\/\/.+<script/);});

test('public notice deep link selects without automatic private-state write',async()=>{const h=setup({hash:'#notice=P1'});await h.ready();assert.equal(h.get('noticeSelect').value,'P1');assert.ok(!h.get('board').innerHTML.includes('application-card'));assert.equal(h.blobs.length,0);});
