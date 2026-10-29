'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..'),load=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
async function setup({failure=false,mutate=null}={}){
 const html=fs.readFileSync(path.join(ROOT,'startup.html'),'utf8'),elements={},calls=[],downloads=[];
 class Element{
  constructor(id){this.id=id;this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.innerHTML='';this.listeners={};}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}
  click(){downloads.push(this);}
  remove(){}
 }
 for(const id of [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]))elements[id]=new Element(id);
 elements.businessState.value='unknown';elements.startupInkind.value='0';elements.startupExtra.value='0';
 const payload={'data/startup_routes.json':load('data/startup_routes.json'),'data/programs.json':load('data/programs.json'),'data/startup_sources.json':load('data/startup_sources.json')};
 for(const r of payload['data/startup_routes.json'].records){r.source_state='reference_ready';const s=payload['data/startup_sources.json'].records[r.id];s.status='matched';s.error=null;s.review_required=false;s.observed_sha256=r.source.sha256;s.expected_sha256=r.source.sha256;for(const t of r.tasks)elements['task_'+t.id]=new Element('task_'+t.id);}
 if(mutate)mutate(payload);
 const epoch=Math.max(...Object.values(payload['data/startup_sources.json'].records).map(s=>Date.parse(s.last_success_at)))+60000;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
 const document={getElementById:id=>{assert.ok(elements[id],'DOM id '+id+' exists');return elements[id];},createElement:()=>new Element('download'),body:{appendChild(){}}};
 const window={RadarCore:require('../assets/radar-core.js'),StartupCore:require('../assets/startup-core.js')};
 // Rebind the core in this context so fresh-source checks use the fixture clock.
 const ctx={window,document,console,Date:Clock,URL:Object.assign(class U extends URL {},{createObjectURL:()=> 'blob:local-only',revokeObjectURL(){}}),Blob,BigInt,setTimeout:fn=>fn(),fetch:async(url,opts)=>{calls.push({url,opts});assert.match(url,/^data\/(startup_routes|programs|startup_sources)\.json\?v=\d+$/);assert.equal(opts.cache,'no-store');if(failure)throw new Error('fixture network failure');const p=url.split('?')[0];return {ok:true,json:async()=>structuredClone(payload[p])};}};
 for(const prop of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(ctx,prop,{get(){throw new Error('Forbidden persistence '+prop);}});
 ctx.XMLHttpRequest=()=>{throw new Error('Forbidden input transport');};ctx.navigator={sendBeacon(){throw new Error('Forbidden beacon');}};
 ctx.globalThis=ctx;ctx.RadarCore=window.RadarCore;ctx.PlanningCore=require('../assets/planning-core.js');
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/startup-core.js'),'utf8'),ctx);window.StartupCore=ctx.StartupCore;
 vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/startup-ui.js'),'utf8'),ctx);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();await settle();
 async function fire(id,type='click'){for(const fn of elements[id].listeners[type]||[])await fn({preventDefault(){}});if(id!=='startupForm'&&['input','change'].includes(type))for(const fn of elements.startupForm.listeners[type]||[])await fn({preventDefault(){}});await settle();}
 async function validRun(){elements.startupRoute.value='early-general';await fire('startupRoute','change');elements.startupScenario.value='nonpreferred';elements.startupSupport.value='70000000';elements.startupInkind.value='20000000';elements.startupExtra.value='5000000';elements.startupAvailable.value='12000000';elements.referenceAck.checked=true;elements.regionAck.checked=true;await fire('startupRun');}
 return {elements,calls,downloads,payload,fire,validRun,html};
}
test('page loads three public datasets only',async()=>{const x=await setup();assert.equal(x.calls.length,3);assert.equal(x.elements.startupRun.disabled,false);assert.match(x.elements.startupStatus.textContent,/2027 확정 조건은 아닙니다/);});
test('9 historical scenarios across3 routes',async()=>{const x=await setup();assert.match(x.elements.startupStatus.textContent,/계산식 9개/);});
test('failed load fails closed',async()=>{const x=await setup({failure:true});assert.equal(x.elements.startupRun.disabled,true);assert.match(x.elements.startupStatus.textContent,/실패/);});
test('historical banner always explicit',async()=>{const x=await setup();assert.match(x.elements.startupSummary.innerHTML,/2026 종료 공고/);assert.match(x.elements.startupSummary.innerHTML,/2027 미확정/);});
test('pre does not ask for meaningless region',async()=>{const x=await setup();assert.equal(x.elements.regionAckRow.hidden,true);});
test('early reveals region requirement',async()=>{const x=await setup();x.elements.startupRoute.value='early-general';await x.fire('startupRoute','change');assert.equal(x.elements.regionAckRow.hidden,false);});
test('all readiness checkboxes not required to calculate',async()=>{const x=await setup();await x.validRun();assert.match(x.elements.startupResult.innerHTML,/3,000,000원/);assert.match(x.elements.startupResult.innerHTML,/내부 준비 체크 0 \/ 7/);});
test('run does not transmit applicant inputs',async()=>{const x=await setup();await x.validRun();assert.equal(x.calls.length,3);});
test('input change invalidates previous report',async()=>{const x=await setup();await x.validRun();assert.equal(x.elements.startupExport.hidden,false);x.elements.startupSupport.value='60000000';await x.fire('startupSupport','input');assert.equal(x.elements.startupExport.hidden,true);assert.match(x.elements.startupResult.innerHTML,/다시 계산/);});
test('export only explicit local action',async()=>{const x=await setup();await x.validRun();assert.equal(x.downloads.length,0);await x.fire('startupExport');assert.equal(x.downloads.length,1);assert.match(x.downloads[0].download,/Private_Preparation/);assert.equal(x.calls.length,3);});
test('silent input mutation prevents stale export',async()=>{const x=await setup();await x.validRun();x.elements.startupSupport.value='1';await x.fire('startupExport');assert.equal(x.downloads.length,0);assert.equal(x.elements.startupExport.hidden,true);});
test('explicit clear removes amounts and export',async()=>{const x=await setup();await x.validRun();await x.fire('startupClear');assert.equal(x.elements.startupSupport.value,'');assert.equal(x.elements.startupAvailable.value,'');assert.equal(x.elements.referenceAck.checked,false);assert.equal(x.elements.startupExport.hidden,true);});
test('reload is public reads, not posting inputs',async()=>{const x=await setup();await x.validRun();await x.fire('startupReload');assert.equal(x.calls.length,6);assert.ok(x.calls.every(c=>!c.opts.method&&!c.opts.body));assert.equal(x.elements.startupExport.hidden,true);});
test('malicious source text is escaped',async()=>{const x=await setup({mutate:p=>{p['data/startup_routes.json'].records[0].label='<img src=x onerror=alert(1)>';}});assert.match(x.elements.startupSummary.innerHTML,/&lt;img/);assert.doesNotMatch(x.elements.startupSummary.innerHTML,/<img/);});
test('no formula results without acknowledgement',async()=>{const x=await setup();x.elements.startupSupport.value='10000000';await x.fire('startupRun');assert.doesNotMatch(x.elements.startupResult.innerHTML,/startup-amounts/);assert.match(x.elements.startupResult.innerHTML,/확인해야 합니다/);});
test('2027 title candidate does not overwrite2026 formulas',async()=>{const x=await setup({mutate:p=>{p['data/startup_routes.json'].new_notice_candidates=[{title:'2027 초기창업 candidate',source:'https://www.mss.go.kr/',id:'new',mode:'discovery'}];}});assert.match(x.elements.newNotices.innerHTML,/재검토 필요/);assert.match(x.elements.startupStatus.textContent,/2026 참고 경로/);});
test('original changes hold calculator',async()=>{const x=await setup({mutate:p=>{p['data/startup_sources.json'].records.pre.review_required=true;}});x.elements.startupSupport.value='10000000';x.elements.referenceAck.checked=true;await x.fire('startupRun');assert.doesNotMatch(x.elements.startupResult.innerHTML,/startup-amounts/);assert.match(x.elements.startupResult.innerHTML,/지문|실패/);});
test('no automatic portfolio total',async()=>{const x=await setup();assert.match(x.elements.startupComparison.innerHTML,/미확정/);assert.doesNotMatch(x.elements.startupComparison.innerHTML,/확보액 합계/);});
test('form navigation prohibited, no external client dependencies',async()=>{const x=await setup();assert.match(x.html,/form-action 'none'/);assert.match(x.html,/autocomplete="off"/);assert.doesNotMatch(x.html,/<script[^>]+src="https?:/);await x.fire('startupForm','submit');});

test('early region defaults to unknown, not best subsidy tier',async()=>{const x=await setup();x.elements.startupRoute.value='early-general';await x.fire('startupRoute','change');assert.equal(x.elements.startupScenario.value,'');assert.match(x.elements.scenarioHint.textContent,/선택/);});
