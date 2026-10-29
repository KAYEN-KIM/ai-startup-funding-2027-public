'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),F=require('../assets/cashflow-core.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function fixture(id='pre',sid='stage1'){
 const routes=read('data/startup_routes.json'),programs=read('data/programs.json'),sources=read('data/startup_sources.json');
 const route=routes.records.find(r=>r.id===id),s=sources.records[id];
 route.source_state='reference_ready';s.status='matched';s.error=null;s.review_required=false;s.observed_sha256=route.source.sha256;s.expected_sha256=route.source.sha256;
 const now=new Date(Math.max(Date.parse(s.last_success_at),Date.parse(route.reviewed_at))+60000);
 const finance={support_won:'20000000',inkind_won:'0',reference_ack:true,region_confirmed:true};
 const ctx={programs,sources,now};
 const plan={start_month:'2027-01',months:6,opening_cash_won:'10000000',monthly_revenue_won:'1000000',monthly_operating_won:'2000000',reserve_won:'0',opening_debt_won:'0',receipt_delay_months:2,budget_separated_ack:true,cash_model_ack:true,spending:F.evenSchedule('20000000','2027-01',4),receipts:[{month:'2027-05',won:'20000000'}],financing:[]};
 return {route,sid,finance,plan,ctx};
}
const run=x=>F.evaluate(x.route,x.sid,x.finance,x.plan,x.ctx);
const scenario=(r,id)=>r.scenarios.find(s=>s.key===id);
function good(x){const r=run(x);assert.equal(r.code,'calculated_assumption',r.reasons?.join(' '));return r;}
function bad(x,pattern){const r=run(x);assert.equal(r.code,'invalid',JSON.stringify(r));if(pattern)assert.match(r.reasons.join(' '),pattern);}
test('P0.7 source-bound example: full planned reimbursement and no grant stress',()=>{const r=good(fixture()),a=scenario(r,'planned').summary,b=scenario(r,'no_grant').summary;assert.equal(a.minimum_extra_opening_cash_won,'14000000');assert.equal(a.ending_general_won,'4000000');assert.equal(a.first_negative_month,'2027-02');assert.equal(b.minimum_extra_opening_cash_won,'16000000');assert.equal(b.ending_general_won,'-16000000');});
test('grant delayed outside horizon is disclosed and not included in balances',()=>{const r=good(fixture()),d=scenario(r,'delayed').summary;assert.equal(d.grant_after_horizon_won,'20000000');assert.equal(d.minimum_extra_opening_cash_won,'16000000');assert.equal(d.totals.grant_won,'0');});
test('same period cost is not canceled when grant is not selected',()=>{const r=good(fixture());assert.equal(scenario(r,'no_grant').summary.totals.project_won,'20000000');assert.equal(scenario(r,'no_grant').summary.unfunded_grant_won,'20000000');});
test('advance grant excess is restricted, not spendable operating cash',()=>{const x=fixture();x.plan.receipts[0].month='2027-01';const r=good(x),row=scenario(r,'planned').rows[0];assert.equal(row.general_closing_won,'9000000');assert.equal(row.restricted_closing_won,'15000000');assert.equal(row.total_closing_won,'24000000');assert.equal(row.grant_used_won,'5000000');});
test('target reserve gap is not sum of monthly deficits',()=>{const x=fixture();x.plan.reserve_won='3000000';const q=scenario(good(x),'planned').summary;assert.equal(q.peak_reserve_gap_won,'17000000');assert.equal(q.minimum_extra_opening_cash_won,'14000000');});
test('opening shortfall detected before first revenue',()=>{const x=fixture();x.plan.opening_cash_won='0';x.plan.reserve_won='1';const q=scenario(good(x),'planned').summary;assert.equal(q.first_below_reserve_month,'opening');assert.equal(q.first_negative_month,'2027-01');});
test('reserve zero and exact closing zero are not insolvency claims',()=>{const x=fixture();x.plan.opening_cash_won='26000000';const q=scenario(good(x),'no_grant').summary;assert.equal(q.ending_general_won,'0');assert.equal(q.first_negative_month,null);assert.equal(q.peak_reserve_gap_won,'0');});
test('zero delay equals planned schedule',()=>{const x=fixture();x.plan.receipt_delay_months=0;const r=good(x);assert.deepEqual(scenario(r,'planned').summary,scenario(r,'delayed').summary);});
test('month rollover correct',()=>{assert.equal(F.monthString(F.monthIndex('2026-12')+1),'2027-01');});
test('even allocation preserves every won without floats',()=>{const a=F.evenSchedule('10','2027-11',3);assert.deepEqual(a,[{month:'2027-11',won:'3'},{month:'2027-12',won:'3'},{month:'2028-01',won:'4'}]);});
test('distribution smaller than months retains exact sum',()=>{const a=F.evenSchedule('1','2027-01',24);assert.equal(a.reduce((n,r)=>n+BigInt(r.won),0n),1n);assert.equal(a.at(-1).won,'1');});
for(const v of ['2027-13','2027-00','2027-1','2027/01','not a month','2027-01-01',null,202701])test('reject malformed month '+String(v),()=>assert.throws(()=>F.monthIndex(v)));
for(const n of [0,25,-1,2.5,'12',null])test('reject horizon '+String(n),()=>{const x=fixture();x.plan.months=n;bad(x,/분석 개월/);});
for(const n of [-1,13,1.2,'2'])test('reject delay '+String(n),()=>{const x=fixture();x.plan.receipt_delay_months=n;bad(x,/지연/);});
for(const v of ['',null,undefined,'-1','1.5','1e6','1,000','1000000000001',' 10',Number.MAX_SAFE_INTEGER])test('reject money '+String(v),()=>{const x=fixture();x.plan.opening_cash_won=v;bad(x);});
test('explicit zero money is accepted',()=>{const x=fixture();x.plan.opening_cash_won='0';good(x);});
test('unknown field rejected',()=>{const x=fixture();x.plan.name='private';bad(x,/형식/);});
test('unknown finance keys cannot be silently ignored',()=>{const x=fixture();x.finance.extra_cash_won='1';bad(x,/형식/);});
test('acknowledge non-overlapping budget',()=>{const x=fixture();x.plan.budget_separated_ack=false;bad(x,/중복/);});
test('acknowledge model cash allocation explicitly',()=>{const x=fixture();x.plan.cash_model_ack=false;bad(x,/배분/);});
test('source acknowledgement still required',()=>{const x=fixture();x.finance.reference_ack=false;assert.equal(run(x).code,'hold');});
test('spending mismatch not silently padded',()=>{const x=fixture();x.plan.spending[0].won='1';bad(x,/현금 지출 합계/);});
test('own contribution cannot be counted twice',()=>{const x=fixture();x.plan.spending.push({month:'2027-02',won:'100'});bad(x,/합계/);});
test('unallocated grant is invalid, not guaranteed missing receipt',()=>{const x=fixture();x.plan.receipts=[];bad(x,/지급 일정 합계/);});
test('grant over-allocation rejected',()=>{const x=fixture();x.plan.receipts.push({month:'2027-06',won:'1'});bad(x,/지급 일정 합계/);});
test('cost after horizon rejected instead of understating cash need',()=>{const x=fixture();x.plan.spending[0].month='2027-07';bad(x,/범위/);});
test('receipt before opening rejected to avoid counting opening cash twice',()=>{const x=fixture();x.plan.receipts[0].month='2026-12';bad(x,/범위/);});
test('original receipt outside horizon disclosed',()=>{const x=fixture();x.plan.receipts[0].month='2027-07';const q=scenario(good(x),'planned').summary;assert.equal(q.grant_after_horizon_won,'20000000');});
test('receipt over future bound rejected',()=>{const x=fixture();x.plan.receipts[0].month='2030-01';bad(x,/범위/);});
test('too many schedule entries rejected',()=>{const x=fixture();x.plan.receipts=Array.from({length:49},()=>({month:'2027-05',won:'0'}));bad(x,/최대/);});
test('typed schedule must not carry hidden fields',()=>{const x=fixture();x.plan.spending[0].note='sensitive';bad(x,/형식/);});
test('investment and borrowing are separate, not government support',()=>{const x=fixture();x.plan.financing=[{month:'2027-01',kind:'equity',won:'3000000'},{month:'2027-01',kind:'loan',won:'7000000'}];const q=scenario(good(x),'planned').summary;assert.equal(q.totals.equity_won,'3000000');assert.equal(q.totals.loan_won,'7000000');assert.equal(q.totals.grant_won,'20000000');assert.equal(q.ending_debt_won,'7000000');assert.equal(q.minimum_extra_opening_cash_won,'4000000');});
test('opening debt is not credited as cash',()=>{const x=fixture();x.plan.opening_debt_won='5000000';const q=scenario(good(x),'planned').summary;assert.equal(q.ending_general_won,'4000000');assert.equal(q.ending_debt_won,'5000000');});
test('principal and interest outflows accounted without inventing rates',()=>{const x=fixture();x.plan.opening_debt_won='5000000';x.plan.financing=[{month:'2027-06',kind:'principal',won:'2000000'},{month:'2027-06',kind:'interest',won:'100000'}];const q=scenario(good(x),'planned').summary;assert.equal(q.ending_general_won,'1900000');assert.equal(q.ending_debt_won,'3000000');assert.equal(q.totals.principal_won,'2000000');assert.equal(q.totals.interest_won,'100000');});
test('overpayment rejects negative debt',()=>{const x=fixture();x.plan.financing=[{month:'2027-03',kind:'principal',won:'1'}];bad(x,/초과/);});
test('future borrowing cannot fund a past principal repayment',()=>{const x=fixture();x.plan.financing=[{month:'2027-03',kind:'principal',won:'1'},{month:'2027-04',kind:'loan',won:'2'}];bad(x,/초과/);});
test('same-month borrowing and repayment uses explicit monthly convention',()=>{const x=fixture();x.plan.financing=[{month:'2027-03',kind:'principal',won:'1'},{month:'2027-03',kind:'loan',won:'2'}];assert.equal(scenario(good(x),'planned').summary.ending_debt_won,'1');});
for(const kind of ['guarantee','inkind','tax_credit','grant','unknown'])test('noncash/unsupported financing type '+kind,()=>{const x=fixture();x.plan.financing=[{month:'2027-03',kind,won:'1'}];bad(x,/유형/);});
test('additional expense and revenue included once',()=>{const x=fixture();x.plan.financing=[{month:'2027-06',kind:'extra_cost',won:'2000000'},{month:'2027-06',kind:'extra_revenue',won:'1000000'}];assert.equal(scenario(good(x),'planned').summary.ending_general_won,'3000000');});
test('financing outside horizon not silently omitted',()=>{const x=fixture();x.plan.financing=[{month:'2027-07',kind:'equity',won:'1'}];bad(x,/월/);});
test('too many financing rows rejected',()=>{const x=fixture();x.plan.financing=Array.from({length:49},()=>({month:'2027-01',kind:'loan',won:'0'}));bad(x,/최대/);});
test('stale original prevents computation',()=>{const x=fixture();x.ctx.now=new Date(+x.ctx.now+8*86400000);assert.equal(run(x).code,'hold');});
test('changed source hash prevents computation',()=>{const x=fixture();x.ctx.sources.records.pre.observed_sha256='f'.repeat(64);assert.equal(run(x).code,'hold');});
test('failed source check prevents computation',()=>{const x=fixture();x.ctx.sources.records.pre.error='timeout';assert.equal(run(x).code,'hold');});
test('program mismatch prevents computation',()=>{const x=fixture();x.ctx.programs.items.find(p=>p.id===x.route.program_id).amount='new';assert.equal(run(x).code,'hold');});
test('historical rule never becomes 2027 award',()=>{const r=good(fixture());assert.equal(r.reference_year,2026);assert.equal(r.scope,'historical_cashflow_assumption');assert.match(r.disclaimer,/2027/);assert.equal(r.method,F.METHOD);assert.ok(!Object.hasOwn(r,'award_probability'));});
test('input documents not mutated',()=>{const x=fixture(),before=JSON.stringify(x);good(x);assert.equal(JSON.stringify(x),before);});
test('JSON serialization never leaks BigInt values',()=>{assert.doesNotThrow(()=>JSON.stringify(good(fixture())));});
for(const id of ['early-general','early-deep'])for(const sid of ['special','preferred','ordinary','nonpreferred'])test('historical route cash/inkind identity '+id+'/'+sid,()=>{const x=fixture(id,sid);x.finance.support_won='70000000';x.finance.inkind_won='20000000';const e=F.financeEstimate(x.route,sid,x.finance,x.ctx);assert.equal(e.code,'historical_assumption');const total=BigInt(e.amounts.support_won)+BigInt(e.amounts.own_cash_won);x.plan.spending=F.evenSchedule(String(total),'2027-01',4);x.plan.receipts=[{month:'2027-01',won:'70000000'}];const r=good(x),q=scenario(r,'planned');assert.equal(r.project_cash_total_won,String(total));assert.equal(q.summary.totals.project_won,String(total));assert.equal(q.summary.totals.grant_used_won,'70000000');assert.equal(BigInt(q.summary.ending_general_won),10000000n-6000000n-BigInt(e.amounts.own_cash_won));});
test('all month-level identities hold for random schedules and delay windows',()=>{
 for(let seed=1;seed<=40;seed++){
  const x=fixture();x.finance.support_won=String(seed*10003);const G=BigInt(x.finance.support_won);x.plan.spending=F.evenSchedule(String(G),'2027-01',6);x.plan.receipts=[{month:'2027-'+String(seed%6+1).padStart(2,'0'),won:String(G/2n)},{month:'2027-06',won:String(G-G/2n)}];x.plan.receipt_delay_months=seed%5;
  const r=good(x);
  for(const s of r.scenarios){let received=0n,used=0n;for(const row of s.rows){received+=BigInt(row.grant_received_won);used+=BigInt(row.grant_used_won);assert.equal(BigInt(row.restricted_closing_won),received-used);assert.ok(used<=received);assert.ok(BigInt(row.restricted_closing_won)>=0n);assert.equal(BigInt(row.total_closing_won),BigInt(row.general_closing_won)+BigInt(row.restricted_closing_won));assert.equal(BigInt(row.general_closing_won),BigInt(row.opening_won)+BigInt(row.revenue_won)+BigInt(row.equity_won)+BigInt(row.loan_won)+BigInt(row.grant_used_won)-BigInt(row.operating_won)-BigInt(row.project_cash_won)-BigInt(row.extra_cost_won)-BigInt(row.principal_won)-BigInt(row.interest_won));}assert.ok(BigInt(s.summary.peak_reserve_gap_won)>=BigInt(s.summary.minimum_extra_opening_cash_won));}
 }
});
