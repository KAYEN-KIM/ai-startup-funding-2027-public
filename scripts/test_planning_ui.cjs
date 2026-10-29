const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./planning_fixture.cjs'),ROOT=path.join(__dirname,'..');
const ids=['planLoadStatus','planChoice','planRun','planClear','planReload','planExport','planExportWarning','ruleSummary','planResult','moneyFields','restrictionFields','scenarioForm','supportWon','inkindWon','extraCashWon','availableCashWon','active_jumpup','active_dips','dips_final_year_2026','active_worldclass','same_cost','other_copayment','ibk_centres'];
const facts=['active_jumpup','active_dips','dips_final_year_2026','active_worldclass','same_cost','other_copayment','ibk_centres'];
async function boot({fail=null,wrongSchema=null,malicious=false}={}){
 const el={},requests=[],downloads=[],blobs=[];let failNext=null;
 class El{
  constructor(id=''){this.id=id;this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';this.children=[];this.listeners={};}
  addEventListener(k,f){this.listeners[k]=f;}append(x){this.children.push(x);if(this.id==='planChoice'&&this.children.length===1)this.value=x.value;}
  replaceChildren(){this.children=[];this.value='';this.innerHTML='';}remove(){}
  click(){if(this.download)downloads.push({name:this.download,url:this.href});return this.listeners.click?.({preventDefault(){}});}
 }
 for(const k of [...ids,...facts.map(k=>'row_'+k)])el[k]=new El(k);
 el.inkindWon.value='0';el.extraCashWon.value='0';el.planExport.hidden=true;
 const {r,ctx}=fixture();r.label=malicious?'<img src=x onerror=alert(1)>':'Synthetic reviewed table';r.notes=['Synthetic scope'];r.open_questions=['Not complete eligibility'];r.rule_fingerprint='fixture';
 ctx.evidence.schema='public-funding-evidence/v1';ctx.reviews.schema='public-funding-reviews/v1';
 const data={'programs.json':{schema:'public-funding-radar/v1',items:[ctx.program]},'funding_rules.json':{schema:'public-funding-planning/v1',records:[r]},'attachments.json':ctx.attachments,'evidence.json':ctx.evidence,'change_reviews.json':ctx.reviews};
 class Clock extends Date{constructor(...x){super(...(x.length?x:['2026-10-29T15:00:00+09:00']));}static now(){return +new Date('2026-10-29T15:00:00+09:00');}}
 class SafeURL extends URL{};SafeURL.createObjectURL=b=>{blobs.push(b);return 'blob:local-'+blobs.length;};SafeURL.revokeObjectURL=()=>{};
 const sandbox={console,URL:SafeURL,Date:Clock,Intl,Blob,setTimeout:()=>0,document:{getElementById:id=>el[id],createElement:tag=>new El(tag),body:new El('body')},fetch:async(url,options)=>{requests.push({url,options});const name=String(url).split('/').pop().split('?')[0];if(name===fail||name===failNext)return {ok:false,status:503};const v=JSON.parse(JSON.stringify(data[name]));if(name===wrongSchema)v.schema='wrong';return {ok:true,status:200,json:async()=>v};}};
 Object.defineProperty(sandbox,'localStorage',{get(){throw Error('Storage forbidden');}});Object.defineProperty(sandbox,'sessionStorage',{get(){throw Error('Storage forbidden');}});
 sandbox.window=sandbox;vm.createContext(sandbox);
 for(const f of ['radar-core.js','planning-core.js','planning-ui.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',f),'utf8'),sandbox,{filename:f});
 await new Promise(setImmediate);await new Promise(setImmediate);
 const change=id=>el[id].listeners.change?.({preventDefault(){}});
 const choose=()=>{el.planChoice.value=r.id;change('planChoice');};
 const fill=()=>{choose();el.supportWon.value='200000000';el.inkindWon.value='25000000';el.same_cost.value='false';el.active_dips.value='false';};
 return {el,requests,downloads,blobs,data,choose,fill,change,click:id=>el[id].click(),setFailure:x=>{failNext=x;}};
}
test('loads five public documents; no auto selection or automatic download',async()=>{const a=await boot();assert.equal(a.requests.length,5);assert.equal(a.el.planChoice.value,'');assert.equal(a.el.planRun.disabled,true);assert.equal(a.downloads.length,0);});
test('all calls use omit credentials and no input-bearing body',async()=>{const a=await boot();for(const q of a.requests){assert.match(q.url,/^data\/(programs|funding_rules|attachments|evidence|change_reviews)\.json\?v=\d+$/);assert.equal(q.options.credentials,'omit');assert.equal(q.options.body,undefined);assert.equal(q.options.referrerPolicy,'no-referrer');}});
test('selecting a rule renders source notes, not an eligibility promise',async()=>{const a=await boot();a.choose();assert.match(a.el.ruleSummary.innerHTML,/원문 대조 완료/);assert.equal(a.el.planRun.disabled,false);assert.match(a.el.ruleSummary.innerHTML,/Synthetic scope/);});
test('computation yields 25m own cash and no additional request',async()=>{const a=await boot();a.fill();a.click('planRun');assert.match(a.el.planResult.innerHTML,/25,000,000원/);assert.match(a.el.planResult.innerHTML,/충돌 미발견/);assert.equal(a.requests.length,5);assert.equal(a.el.planExport.hidden,false);});
test('unset restriction stays unknown',async()=>{const a=await boot();a.choose();a.el.supportWon.value='200000000';a.click('planRun');assert.match(a.el.planResult.innerHTML,/확인 보류/);});
test('empty requested grant is an input error, not zero',async()=>{const a=await boot();a.choose();a.click('planRun');assert.match(a.el.planResult.innerHTML,/입력 오류/);});
test('cost overlap renders conflict separate from numeric scenario',async()=>{const a=await boot();a.fill();a.el.same_cost.value='true';a.click('planRun');assert.match(a.el.planResult.innerHTML,/검토 조항과 충돌/);assert.match(a.el.planResult.innerHTML,/사용자 가정/);});
test('edits invalidate saved report',async()=>{const a=await boot();a.fill();a.click('planRun');a.change('scenarioForm');assert.equal(a.el.planExport.hidden,true);a.click('planExport');assert.equal(a.downloads.length,0);});
test('clear removes financial and restriction inputs and old report',async()=>{const a=await boot();a.fill();a.click('planRun');a.click('planClear');assert.equal(a.el.supportWon.value,'');assert.equal(a.el.same_cost.value,'');assert.equal(a.el.inkindWon.value,'0');assert.equal(a.el.planExport.hidden,true);a.click('planExport');assert.equal(a.downloads.length,0);});
test('explicit export contains local input and evidence fingerprint',async()=>{const a=await boot();a.fill();a.click('planRun');assert.equal(a.downloads.length,0);a.click('planExport');assert.equal(a.downloads.length,1);assert.match(a.downloads[0].name,/PRIVATE/);const x=JSON.parse(await a.blobs[0].text());assert.equal(x.private_local_input.budget.support_won,'200000000');assert.equal(x.rule_fingerprint,'fixture');assert.equal(a.requests.length,5);});
for(const fail of ['programs.json','funding_rules.json','attachments.json','evidence.json','change_reviews.json'])test('missing '+fail+' blocks screen',async()=>{const a=await boot({fail});assert.equal(a.el.planRun.disabled,true);assert.match(a.el.planLoadStatus.textContent,/검토 불가/);});
test('schema mismatch blocks screen',async()=>{const a=await boot({wrongSchema:'funding_rules.json'});assert.equal(a.el.planRun.disabled,true);assert.match(a.el.planLoadStatus.textContent,/검토 불가/);});
test('untrusted label escapes HTML in summary',async()=>{const a=await boot({malicious:true});a.choose();assert.doesNotMatch(a.el.ruleSummary.innerHTML,/<img/);assert.match(a.el.ruleSummary.innerHTML,/&lt;img/);});
test('reload cannot leave an older successful result exportable after failure',async()=>{const a=await boot();a.fill();a.click('planRun');a.setFailure('attachments.json');a.click('planReload');await new Promise(setImmediate);assert.equal(a.el.planRun.disabled,true);assert.equal(a.el.planExport.hidden,true);a.click('planExport');assert.equal(a.downloads.length,0);});
test('reload preserves no report and sends only public GET paths',async()=>{const a=await boot();a.fill();a.click('planRun');a.click('planReload');await new Promise(setImmediate);assert.equal(a.requests.length,10);assert.equal(a.el.planExport.hidden,true);assert.ok(a.requests.every(x=>!x.url.includes('200000000')&&!x.options.body));});
test('an ambiguous finance record shows hold, never a fabricated ratio',async()=>{const a=await boot();const r=a.data['funding_rules.json'].records[0];r.finance=null;r.status='clarification_required';r.source_state='hold';a.click('planReload');await new Promise(setImmediate);a.choose();a.click('planRun');assert.equal(a.el.moneyFields.hidden,true);assert.match(a.el.planResult.innerHTML,/확인 보류/);assert.doesNotMatch(a.el.planResult.innerHTML,/250,000,000/);});
