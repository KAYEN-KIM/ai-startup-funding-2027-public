/* Browser-like VM tests of interactions and the outbound request boundary. */
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..'),fixed='2026-10-29T12:00:00+09:00';
async function boot({fail=null,title='Synthetic notice'}={}) {
  const ids=['loadStatus','evaluateBtn','compareBtn','programChoice','result','exportReport','exportWarning','comparisonPanel','comparisonResults','comparisonSummary','companyFields','clearInput','reloadData','assessmentTitle','entity','founded_on','is_sme','headquarters_region','innovation','digital_capability'];
  const elements={},requests=[],downloads=[],blobs=[];
  class El {
    constructor(id=''){this.id=id;this.value='';this.innerHTML='';this.textContent='';this.hidden=['exportReport','exportWarning','comparisonPanel'].includes(id);this.disabled=false;this.children=[];this.listeners={};this.dataset={};}
    addEventListener(name,fn){this.listeners[name]=fn;}
    append(el){this.children.push(el);if(this.id==='programChoice'&&!this.value)this.value=el.value;}
    replaceChildren(...els){this.children=els;this.innerHTML='';if(this.id==='programChoice')this.value='';}
    querySelectorAll(){return [];}
    reset(){for(const k of ['entity','founded_on','is_sme','headquarters_region','innovation','digital_capability'])elements[k].value='';}
    click(){if(this.download)downloads.push({name:this.download,href:this.href});return this.listeners.click?.({preventDefault(){}});}
    remove(){} scrollIntoView(){}
  }
  ids.forEach(id=>elements[id]=new El(id));
  const p={id:'fixture-1',title,source:'https://www.bizinfo.go.kr/test',year:2027,eligibility:'SME only',amount:'test',mode:'beneficiary',opens:'2026-10-01',deadline:'2026-11-13'};
  const binding=Object.fromEntries(['id','title','source','year','eligibility','amount','opens','deadline'].map(k=>[k,p[k]??null]));
  const c={schema:'program-conditions/v1',program_id:p.id,bound_fields:binding,metadata_state:'current',coverage:'partial',clauses:[{id:'sme',label:'SME',status:'reviewed',field:'is_sme',op:'eq',value:true,evidence_id:'s'}],sources:{s:{url:p.source,locator:'Fixture',excerpt:'Synthetic condition',checked_at:'2026-10-29T10:00:00+09:00',level:'official_summary_reviewed'}},candidate_facts:[],attachments_reviewed:false,exceptions_reviewed:false,open_questions:['첨부 미검증'],reviewed_difference_ids:[]};
  const data={'attachments.json':{schema:'public-funding-attachments/v1',records:{},programs:{}},'programs.json':{schema:'public-funding-radar/v1',items:[p]},'conditions.json':{schema:'public-funding-conditions/v1',records:{[p.id]:c}},'evidence.json':{schema:'public-funding-evidence/v1',records:{}},'change_reviews.json':{schema:'public-funding-reviews/v1',items:[]}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return +new Date(fixed);}}
  class SafeURL extends URL{};SafeURL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test-'+blobs.length;};SafeURL.revokeObjectURL=()=>{};
  const sandbox={console,URL:SafeURL,URLSearchParams,Date:Clock,Intl,Blob,setTimeout:()=>0,clearTimeout(){},document:{getElementById:id=>elements[id],createElement:tag=>new El(tag),body:new El('body')},fetch:async(url,options)=>{requests.push({url,options});const name=String(url).split('/').pop().split('?')[0];if(name===fail)return {ok:false,status:503};return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(data[name]))};}};
  sandbox.window=sandbox;vm.createContext(sandbox);
  for(const f of ['radar-core.js','eligibility-core.js','eligibility-ui.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',f),'utf8'),sandbox,{filename:f});
  await new Promise(setImmediate);await new Promise(setImmediate);
  return {elements,requests,downloads,blobs,click:id=>elements[id].click(),change:id=>elements[id].listeners.change?.({preventDefault(){}})};
}
test('screen loads the five public documents and enables checks',async()=>{const a=await boot();assert.equal(a.requests.length,5);assert.equal(a.elements.evaluateBtn.disabled,false);assert.equal(a.elements.programChoice.children.length,1);});
test('all network calls omit credentials and are public GETs',async()=>{const a=await boot();for(const r of a.requests){assert.match(r.url,/^data\/(programs|conditions|evidence|change_reviews|attachments)\.json\?v=\d+$/);assert.equal(r.options.credentials,'omit');assert.equal(r.options.body,undefined);assert.equal(r.options.method,undefined);}});
test('no automatic downloads or persistent writes',async()=>{const a=await boot();assert.equal(a.downloads.length,0);assert.equal(a.blobs.length,0);assert.equal(a.elements.exportReport.hidden,true);});
test('missing input renders insufficient information',async()=>{const a=await boot();a.click('evaluateBtn');assert.match(a.elements.result.innerHTML,/정보 부족/);assert.equal(a.requests.length,5);});
test('input and evaluation make no outbound request',async()=>{const a=await boot();a.elements.is_sme.value='true';a.elements.entity.value='corporation';a.elements.founded_on.value='2021-02-03';a.click('evaluateBtn');assert.match(a.elements.result.innerHTML,/조건부 검토/);assert.equal(a.requests.length,5);assert.ok(!a.requests.some(r=>r.url.includes('2021')||r.url.includes('corporation')));});
test('false condition renders rejection without numeric scores',async()=>{const a=await boot();a.elements.is_sme.value='false';a.click('evaluateBtn');assert.match(a.elements.result.innerHTML,/필수조건 불충족/);assert.doesNotMatch(a.elements.result.innerHTML,/선정 확률.*\d/);});
test('editing invalidates previous result and export',async()=>{const a=await boot();a.elements.is_sme.value='true';a.click('evaluateBtn');assert.equal(a.elements.exportReport.hidden,false);a.change('companyFields');assert.equal(a.elements.exportReport.hidden,true);assert.match(a.elements.result.innerHTML,/입력이 바뀌었습니다/);});
test('clearing wipes fields and cached report',async()=>{const a=await boot();a.elements.is_sme.value='true';a.click('evaluateBtn');a.click('clearInput');assert.equal(a.elements.is_sme.value,'');assert.equal(a.elements.exportReport.hidden,true);a.click('exportReport');assert.equal(a.downloads.length,0);});
test('export only on explicit click includes local warning-labelled input',async()=>{const a=await boot();a.elements.is_sme.value='true';a.click('evaluateBtn');assert.equal(a.downloads.length,0);a.click('exportReport');assert.equal(a.downloads.length,1);const report=JSON.parse(await a.blobs[0].text());assert.equal(report.private_local_input.is_sme,true);assert.equal(report.result.code,'conditional');assert.match(a.downloads[0].name,/PRIVATE/);assert.equal(a.requests.length,5);});
test('bulk comparison uses current data without a network request',async()=>{const a=await boot();a.elements.is_sme.value='true';a.click('compareBtn');assert.equal(a.elements.comparisonPanel.hidden,false);assert.match(a.elements.comparisonSummary.textContent,/조건부 검토 1건/);assert.equal(a.requests.length,5);});
test('missing review history blocks, rather than assuming no changes',async()=>{const a=await boot({fail:'change_reviews.json'});assert.equal(a.elements.evaluateBtn.disabled,true);assert.match(a.elements.loadStatus.textContent,/검토 불가/);});
test('catalog load failure blocks',async()=>{const a=await boot({fail:'conditions.json'});assert.equal(a.elements.compareBtn.disabled,true);});
test('source HTML injection escaped in results',async()=>{const a=await boot({title:'<img src=x onerror=alert(1)>'});a.elements.is_sme.value='true';a.click('evaluateBtn');assert.match(a.elements.result.innerHTML,/&lt;img/);assert.doesNotMatch(a.elements.result.innerHTML,/<img/);});
test('refresh publicly reloads sources without transmitting current input',async()=>{const a=await boot();a.elements.is_sme.value='true';a.click('evaluateBtn');a.click('reloadData');await new Promise(setImmediate);assert.equal(a.requests.length,10);assert.ok(a.requests.every(r=>!r.options.body));assert.equal(a.elements.exportReport.hidden,true);});

test('missing attachment evidence blocks the screen',async()=>{const a=await boot({fail:'attachments.json'});assert.equal(a.elements.evaluateBtn.disabled,true);assert.match(a.elements.loadStatus.textContent,/검토 불가/);});
