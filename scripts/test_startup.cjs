'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../assets/startup-core.js');
const load=p=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',p),'utf8'));
function fixture(id='early-general'){
 const data=load('data/startup_routes.json'),programs=load('data/programs.json'),sources=load('data/startup_sources.json'),r=data.records.find(r=>r.id===id);
 for(const route of data.records){const s=sources.records[route.id];s.status='matched';s.error=null;s.review_required=false;s.observed_sha256=route.source.sha256;s.expected_sha256=route.source.sha256;route.source_state='reference_ready';}
 const now=new Date(Math.max(...Object.values(sources.records).map(s=>Date.parse(s.last_success_at)))+60000);
 const ctx={programs,sources,now};return {r,ctx,input:{support_won:'70000000',inkind_won:'0',extra_cash_won:'0',available_cash_won:'',reference_ack:true,region_confirmed:true}};
}
function estimate(id='early-general',scenario='nonpreferred',over={}){const f=fixture(id);return S.estimate(f.r,scenario,{...f.input,...over},f.ctx);}
test('reference gate accepts independently bound original',()=>{const f=fixture();assert.deepEqual(S.gate(f.r,f.ctx),[]);});
test('nonpreferred without in-kind needs entire own cash',()=>{const a=estimate().amounts;assert.equal(a.total_minimum_won,'100000000');assert.equal(a.own_cash_won,'30000000');assert.equal(a.minimum_cash_won,'10000000');});
test('nonpreferred with sufficient in-kind',()=>{const a=estimate('early-general','nonpreferred',{inkind_won:'20000000'}).amounts;assert.equal(a.own_cash_won,'10000000');assert.equal(a.inkind_used_won,'20000000');});
test('in-kind cap clamps excessive input',()=>{const a=estimate('early-general','nonpreferred',{inkind_won:'30000000'}).amounts;assert.equal(a.unused_inkind_won,'10000000');});
test('ordinary total75 cash10 in-kind15',()=>{const a=estimate('early-general','ordinary',{support_won:'75000000',inkind_won:'15000000'}).amounts;assert.equal(a.total_minimum_won,'100000000');assert.equal(a.own_cash_won,'10000000');});
test('preferred total80 cash10 in-kind10',()=>{const a=estimate('early-general','preferred',{support_won:'80000000',inkind_won:'10000000'}).amounts;assert.equal(a.own_total_won,'20000000');assert.equal(a.own_cash_won,'10000000');});
test('special can use all own portion as in-kind',()=>{const a=estimate('early-general','special',{support_won:'90000000',inkind_won:'10000000'}).amounts;assert.equal(a.own_total_won,'10000000');assert.equal(a.minimum_cash_won,'0');assert.equal(a.own_cash_won,'0');});
test('special no in-kind is NOT no own contribution',()=>{const a=estimate('early-general','special',{support_won:'90000000'}).amounts;assert.equal(a.own_cash_won,'10000000');});
test('special one-won rounding can still be all in-kind',()=>{const a=estimate('early-general','special',{support_won:'1',inkind_won:'1'}).amounts;assert.equal(a.total_minimum_won,'2');assert.equal(a.own_cash_won,'0');});
test('pre stage1 only no mandatory own contribution',()=>{const a=estimate('pre','stage1',{support_won:'20000000',inkind_won:'1000000',extra_cash_won:'3000000'}).amounts;assert.equal(a.own_total_won,'0');assert.equal(a.own_cash_won,'0');assert.equal(a.cash_need_won,'3000000');assert.equal(a.unused_inkind_won,'1000000');});
test('pre average40m cannot substitute stage1 cap20m',()=>assert.equal(estimate('pre','stage1',{support_won:'40000000'}).code,'invalid'));
test('stage2 never fabricated',()=>assert.equal(estimate('pre','stage2',{support_won:'10000000'}).code,'hold'));
test('deep150m cap accepted',()=>assert.equal(estimate('early-deep','ordinary',{support_won:'150000000'}).code,'historical_assumption'));
test('general150m cap rejected',()=>assert.equal(estimate('early-general','ordinary',{support_won:'150000000'}).code,'invalid'));
test('no available cash leaves shortfall unknown',()=>assert.equal(estimate().amounts.shortfall_won,null));
test('zero available cash is not missing',()=>assert.equal(estimate('early-general','nonpreferred',{available_cash_won:'0'}).amounts.shortfall_won,'30000000'));
test('extra costs and actual cash combined without grant duplication',()=>{const a=estimate('early-general','nonpreferred',{inkind_won:'20000000',extra_cash_won:'5000000',available_cash_won:'12000000'}).amounts;assert.equal(a.cash_need_won,'15000000');assert.equal(a.shortfall_won,'3000000');});
test('no negative shortfall',()=>assert.equal(estimate('early-general','nonpreferred',{available_cash_won:'50000000'}).amounts.shortfall_won,'0'));
for(const [label,value] of [['negative','-1'],['fraction','1.5'],['exponent','1e8'],['comma','50,000'],['empty',''],['huge','1000000000001'],['nan',NaN],['zero','0']])test('invalid grant '+label,()=>assert.equal(estimate('early-general','ordinary',{support_won:value}).code,'invalid'));
test('reference acknowledgement is required',()=>assert.equal(estimate('early-general','ordinary',{reference_ack:false}).code,'hold'));
test('region confirmation required',()=>assert.equal(estimate('early-general','ordinary',{region_confirmed:false}).code,'hold'));
test('pre no regional eligibility invented',()=>assert.equal(estimate('pre','stage1',{support_won:'10000000',region_confirmed:false}).code,'historical_assumption'));
test('unknown region not defaulted to generous rate',()=>assert.equal(estimate('early-general','unknown').code,'hold'));
test('unknown input fields rejected',()=>assert.equal(estimate('early-general','ordinary',{bank_account:'do-not-store'}).code,'invalid'));
for(const [name,mutate] of [
 ['2027 source promotion',f=>{f.r.reference_year=2027;}],['unsupported scope',f=>{f.r.scope='live';}],['held review',f=>{f.r.source_state='hold';}],['document changed',f=>{f.ctx.sources.records[f.r.id].observed_sha256='0'.repeat(64);}],['source failure',f=>{f.ctx.sources.records[f.r.id].status='fetch_failed';}],['sticky review',f=>{f.ctx.sources.records[f.r.id].review_required=true;}],['future timestamp',f=>{f.ctx.sources.records[f.r.id].last_success_at='2099-01-01T00:00:00+09:00';}],['stale original',f=>{f.ctx.now=new Date(+f.ctx.now+8*86400000);}],['missing source',f=>{delete f.ctx.sources.records[f.r.id];}],['different program',f=>{f.ctx.programs.items.find(p=>p.id===f.r.program_id).amount='changed';}],['wrong source URL',f=>{f.r.source.url='https://example.com';}],['missing program catalog',f=>{delete f.ctx.programs;}],['invalid clock',f=>{f.ctx.now=new Date(NaN);}]
])test('source gate holds '+name,()=>{const f=fixture();mutate(f);assert.equal(S.estimate(f.r,'nonpreferred',f.input,f.ctx).code,'hold');});
for(const id of ['pre','early-general','early-deep'])test('all scenarios conserve budget '+id,()=>{const f=fixture(id);for(const s of f.r.scenarios)for(const g of ['1','1234567',String(s.max_support_won)]){const out=S.estimate(f.r,s.id,{...f.input,support_won:g,inkind_won:'1000000000'},f.ctx);assert.equal(out.code,'historical_assumption');const a=out.amounts;assert.equal(BigInt(a.support_won)+BigInt(a.own_total_won),BigInt(a.total_minimum_won));assert.equal(BigInt(a.own_cash_won)+BigInt(a.inkind_used_won),BigInt(a.own_total_won));assert.ok(BigInt(a.own_cash_won)>=BigInt(a.minimum_cash_won));}});
test('registered applicant not auto-rejected for future pre route',()=>{const f=fixture('pre');const r=S.prepare(f.r,{business_state:'registered',completed_tasks:[]},f.ctx);assert.equal(r.code,'preparation_only');assert.match(r.reasons[0],/자동|탈락/);});
test('checklist completion never grants eligibility',()=>{const f=fixture();const r=S.prepare(f.r,{business_state:'registered',completed_tasks:f.r.tasks.map(t=>t.id)},f.ctx);assert.equal(r.code,'preparation_only');assert.equal(r.completed,7);assert.equal(r.eligibility,undefined);});
test('unknown checklist field rejected',()=>{const f=fixture();assert.equal(S.prepare(f.r,{business_state:'unknown',completed_tasks:['fake']},f.ctx).code,'invalid');});
test('2027 pair cannot inherit confirmed2026 prohibition',()=>assert.equal(S.compareExecution(['early-general','early-deep'],2027,'execution').code,'new_year_unconfirmed'));
test('2026 execution conflict not sum',()=>assert.equal(S.compareExecution(['early-general','early-deep'],2026,'execution').code,'historical_execution_conflict'));
test('application is not execution',()=>assert.equal(S.compareExecution(['early-general','early-deep'],2026,'application').code,'historical_application_review'));
test('duplicate choice invalid',()=>assert.equal(S.compareExecution(['pre','pre'],2026,'execution').code,'invalid'));
