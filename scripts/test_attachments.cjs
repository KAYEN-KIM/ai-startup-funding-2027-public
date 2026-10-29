const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../assets/attachments-core.js'),E=require('../assets/eligibility-core.js');
const source='https://www.bizinfo.go.kr/test';
const manifest={notice_source:source,notice_status:'links_available',document_ids:['d'],review_required:false};
const row={id:'d',program_id:'P',notice_source:source,url:source,status:'text_extracted',review_required:false,last_error:null,extraction:{format:'pdf',sha256:'a'.repeat(64),text_characters:123,units:3,parser:'test',limitations:['table context unknown'],candidate_facts:[{category:'cofunding',excerpt:'자부담 20%',locator:'PDF p.1',status:'candidate_unverified',redacted:false}]}};
const p={id:'P',title:'test',source,year:2027,eligibility:'SME',amount:'unknown',mode:'beneficiary',opens:'2026-10-01',deadline:'2026-11-13'};
const c={schema:'program-conditions/v1',program_id:'P',bound_fields:Object.fromEntries(['id','title','source','year','eligibility','amount','opens','deadline'].map(k=>[k,p[k]])),metadata_state:'current',coverage:'partial',clauses:[{id:'sme',label:'SME',status:'reviewed',field:'is_sme',op:'eq',value:true,evidence_id:'s'}],sources:{s:{url:source,locator:'summary',excerpt:'SME required',checked_at:'2026-10-29T10:00:00+09:00',level:'official_summary_reviewed'}},open_questions:['attachments pending'],attachments_reviewed:false,exceptions_reviewed:false};
const now=new Date('2026-10-29T12:00:00+09:00');
function evaluate(m=manifest,r=row){return E.evaluate(p,c,{is_sme:true},{now,attachments:{programs:{P:m},records:{d:r}}});}
test('located candidates remain unreviewed',()=>{const html=A.card(row,'test',manifest);assert.match(html,/미검증/);assert.match(html,/PDF p.1/);assert.match(html,/20%/);});
test('raw HTML is escaped',()=>{const html=A.card({...row,name:'<img src=x onerror=x>'},'<script>x</script>',manifest);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script/);});
test('nonofficial URL not clickable',()=>{assert.doesNotMatch(A.card({...row,url:'https://attacker.test/x'},'test',manifest),/href="https:\/\/attacker/);});
test('failed parse old content labelled',()=>{assert.match(A.card({...row,status:'download_failed',last_error:'download_failed'},'test',manifest),/현재 확인 실패/);});
test('removed attachment labelled historical',()=>{assert.match(A.card(row,'test',{...manifest,document_ids:[]}),/과거 기록/);});
test('same data not blocked',()=>assert.equal(A.blocked(manifest,{d:row},source),null));
test('manifest changes blocked',()=>assert.ok(A.blocked({...manifest,review_required:true},{d:row},source)));
test('body changes blocked',()=>assert.ok(A.blocked(manifest,{d:{...row,review_required:true}},source)));
test('source mismatch blocked',()=>assert.ok(A.blocked(manifest,{d:row},source+'new')));
test('notice failure blocked',()=>assert.ok(A.blocked({...manifest,notice_status:'source_unavailable'},{d:row},source)));
test('partial rules still conditional after extraction',()=>assert.equal(evaluate().code,'conditional'));
test('changed file suppresses existing pass',()=>assert.equal(evaluate(manifest,{...row,review_required:true}).code,'insufficient'));
test('changed manifest suppresses existing pass',()=>assert.equal(evaluate({...manifest,review_required:true}).code,'insufficient'));
test('failed refresh suppresses use of old text',()=>assert.equal(evaluate(manifest,{...row,last_error:'download_failed'}).code,'insufficient'));
test('source identity mismatch suppresses use',()=>assert.equal(evaluate({...manifest,notice_source:source+'new'}).code,'insufficient'));
test('candidate amount never becomes decision clause',()=>{const r=evaluate();assert.equal(r.rows.length,1);assert.equal(r.code,'conditional');});

// Exercise the actual attachment UI without a browser account or outbound service.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
async function bootAttachment({fail=false,title='Public AI fixture'}={}) {
 const ids=['attachmentSearch','attachmentState','attachmentCount','attachmentList','attachmentAudit','reloadAttachments'];
 class El{constructor(){this.value='';this.disabled=false;this.listeners={};this._html='';this._text='';}addEventListener(n,f){this.listeners[n]=f;}set textContent(v){this._text=v;this._html='';}get textContent(){return this._text;}set innerHTML(v){this._html=v;this._text='';}get innerHTML(){return this._html;}}
 const elements=Object.fromEntries(ids.map(id=>[id,new El()])),requests=[],control={fail};elements.attachmentState.value='all';
 const data={'programs.json':{schema:'public-funding-radar/v1',items:[{id:'P',title}]},'attachments.json':{schema:'public-funding-attachments/v1',records:{d:row},programs:{P:manifest},run:{attempted:1,text_extracted:1},generated_at:'2026-10-29T12:00:00+09:00'}};
 const sandbox={console,URL,Date,Intl,document:{getElementById:id=>elements[id]},fetch:async(url,options)=>{requests.push({url,options});const name=url.split('/').pop().split('?')[0];return {ok:!control.fail,status:control.fail?503:200,json:async()=>JSON.parse(JSON.stringify(data[name]))};}};sandbox.window=sandbox;vm.createContext(sandbox);
 for(const name of ['radar-core.js','attachments-core.js','attachments-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),sandbox);
 await new Promise(setImmediate);return {elements,requests,control,click:()=>elements.reloadAttachments.listeners.click(),search:()=>elements.attachmentSearch.listeners.input(),filter:()=>elements.attachmentState.listeners.change()};
}
test('attachment UI loads only two static public GET documents',async()=>{const b=await bootAttachment();assert.equal(b.requests.length,2);assert.match(b.elements.attachmentList.innerHTML,/Public AI fixture/);for(const r of b.requests){assert.equal(r.options.credentials,'omit');assert.equal(r.options.body,undefined);assert.match(r.url,/^data\/(programs|attachments)\.json/);}});
test('attachment search works without extra requests',async()=>{const b=await bootAttachment();b.elements.attachmentSearch.value='no-match';b.search();assert.match(b.elements.attachmentList.innerHTML,/해당 첨부 기록이 없습니다/);assert.equal(b.requests.length,2);});
test('attachment search includes candidate text',async()=>{const b=await bootAttachment();b.elements.attachmentSearch.value='자부담';b.search();assert.match(b.elements.attachmentList.innerHTML,/20%/);});
test('attachment error filter separates successful rows',async()=>{const b=await bootAttachment();b.elements.attachmentState.value='error';b.filter();assert.match(b.elements.attachmentCount.textContent,/표시 0/);});
test('attachment initial load failure explicitly blocks display',async()=>{const b=await bootAttachment({fail:true});assert.match(b.elements.attachmentAudit.textContent,/조회 실패/);assert.equal(b.elements.attachmentCount.textContent,'');assert.equal(b.elements.reloadAttachments.disabled,false);});
test('failed reload cannot revive stale records by changing a filter',async()=>{const b=await bootAttachment();b.control.fail=true;await b.click();b.search();assert.doesNotMatch(b.elements.attachmentList.innerHTML,/Public AI fixture/);assert.match(b.elements.attachmentAudit.textContent,/조회 실패/);assert.equal(b.elements.attachmentCount.textContent,'');});
test('actual attachment UI escapes hostile source titles',async()=>{const b=await bootAttachment({title:'<img src=x onerror=alert(1)>'});assert.doesNotMatch(b.elements.attachmentList.innerHTML,/<img/);assert.match(b.elements.attachmentList.innerHTML,/&lt;img/);});

// P0.11 only bounded status codes are rendered, never response bodies.
test('P011 HTTP403 shown as access denial without bypass advice',()=>{const r={...row,status:'download_failed',last_error:'download_failed',http_status:403,failure_kind:'http_error',retryable:false};const h=A.card(r,'test',manifest);assert.match(h,/HTTP 403/);assert.match(h,/접근 제한을 우회하지 않습니다/);assert.match(h,/이전 성공 기록 보존/);});
test('P011 401 shows authentication access denial',()=>{assert.match(A.failureLabel({last_error:'download_failed',http_status:401}),/HTTP 401.*인증/);});
test('P011 404 reports missing file rather than no changes',()=>{assert.match(A.failureLabel({last_error:'download_failed',http_status:404}),/파일 없음/);});
test('P011 transient HTTP503 remains failed until rechecked',()=>{assert.match(A.failureLabel({last_error:'download_failed',http_status:503,retryable:true}),/성공으로 처리하지 않습니다/);});
test('P011 successful fetch has no lingering error text',()=>{assert.equal(A.failureLabel({last_error:null,http_status:403}),'');});
test('P011 malicious http status does not render raw text',()=>{assert.doesNotMatch(A.failureLabel({last_error:'download_failed',http_status:'<img src=x>'}),/<img/);});
test('P011 network failure is distinct from HTTP error',()=>{assert.match(A.failureLabel({last_error:'download_failed',failure_kind:'network_error'}),/연결·시간초과/);});
