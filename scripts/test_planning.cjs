const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../assets/planning-core.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const {fixture}=require('./planning_fixture.cjs');
test('80/10/10 table: 200m grant, 250m total, 25m own cash and 25m inkind',()=>{const {r,ctx,input}=fixture();const v=P.estimate(r,input,ctx);assert.equal(v.code,'calculated_assumption');assert.equal(v.amounts.total_minimum_won,'250000000');assert.equal(v.amounts.own_cash_won,'25000000');assert.equal(v.amounts.inkind_used_won,'25000000');assert.equal(v.amounts.shortfall_won,null);});
test('70/10/20 table denominator is TOTAL, not own contribution',()=>{const {r,ctx,input}=fixture();Object.assign(r.finance,{max_support_won:280000000,government_max_bps:7000,inkind_max_bps:2000});Object.assign(input,{support_won:'280000000',inkind_won:'80000000'});const a=P.estimate(r,input,ctx).amounts;assert.equal(a.total_minimum_won,'400000000');assert.equal(a.minimum_cash_won,'40000000');assert.equal(a.own_total_won,'120000000');});
test('60/10/30 table',()=>{const {r,ctx,input}=fixture();Object.assign(r.finance,{max_support_won:750000000,government_max_bps:6000,inkind_max_bps:3000});Object.assign(input,{support_won:'750000000',inkind_won:'375000000'});const a=P.estimate(r,input,ctx).amounts;assert.equal(a.total_minimum_won,'1250000000');assert.equal(a.own_cash_won,'125000000');});
test('no inkind means full self contribution is cash',()=>{const {r,ctx,input}=fixture();input.inkind_won='0';assert.equal(P.estimate(r,input,ctx).amounts.own_cash_won,'50000000');});
test('excess inkind is not counted or turned into cash',()=>{const {r,ctx,input}=fixture();input.inkind_won='99999999';const a=P.estimate(r,input,ctx).amounts;assert.equal(a.inkind_used_won,'25000000');assert.equal(a.unused_inkind_won,'74999999');});
test('extra cash is added once; available cash produces shortage',()=>{const {r,ctx,input}=fixture();Object.assign(input,{extra_cash_won:'10000000',available_cash_won:'30000000'});const a=P.estimate(r,input,ctx).amounts;assert.equal(a.cash_need_won,'35000000');assert.equal(a.shortfall_won,'5000000');});
test('zero available cash differs from unknown',()=>{const {r,ctx,input}=fixture();input.available_cash_won='0';assert.equal(P.estimate(r,input,ctx).amounts.shortfall_won,'25000000');});
test('surplus available cash does not create negative shortage',()=>{const {r,ctx,input}=fixture();input.available_cash_won='100000000';assert.equal(P.estimate(r,input,ctx).amounts.shortfall_won,'0');});
for(const x of ['', '-1','1.1','1e8','200,000',' 123','Infinity','NaN','0','200000001',true,null,{},1.1,1000000000001])test('invalid grant input '+String(x),()=>{const {r,ctx,input}=fixture();input.support_won=x;assert.equal(P.estimate(r,input,ctx).code,'invalid');});
test('unknown required inkind is not assumed zero',()=>{const {r,ctx,input}=fixture();delete input.inkind_won;assert.equal(P.estimate(r,input,ctx).code,'invalid');});
test('unknown extra cash is not assumed zero',()=>{const {r,ctx,input}=fixture();delete input.extra_cash_won;assert.equal(P.estimate(r,input,ctx).code,'invalid');});
test('nonallowlisted company identity input rejected',()=>{const {r,ctx,input}=fixture();input.company_name='private';assert.equal(P.estimate(r,input,ctx).code,'invalid');});
test('integer won rounding always satisfies exact ratio bounds for 1..1000 won',()=>{for(const g of [8000,7000,6000])for(let n=1;n<=1000;n++){const {r,ctx,input}=fixture();r.finance.government_max_bps=g;r.finance.inkind_max_bps=9000-g;input.support_won=String(n);input.inkind_won='100000000';const a=P.estimate(r,input,ctx).amounts,T=BigInt(a.total_minimum_won),G=BigInt(a.support_won),I=BigInt(a.inkind_used_won),C=BigInt(a.own_cash_won);assert.ok(G*10000n<=T*BigInt(g));assert.ok(C*10000n>=T*1000n);assert.ok(I*10000n<=T*BigInt(9000-g));assert.equal(G+C+I,T);}});
const gates={
 'no attachments':x=>{delete x.ctx.attachments;},
 'no change history':x=>{delete x.ctx.reviews;},
 'no html evidence':x=>{delete x.ctx.evidence;},
 'metadata changed':x=>{x.ctx.program.amount='different';},
 'old evidence':x=>{x.ctx.now=new Date('2026-11-13T16:00:00+09:00');},
 'future review':x=>{x.r.reviewed_at='2026-11-10T09:00:00+09:00';},
 'invalid clock':x=>{x.ctx.now=new Date('bad');},
 'source pending':x=>{x.r.source_state='hold';},
 'ambiguous denominator':x=>{x.r.status='clarification_required';},
 'unsafe source':x=>{x.r.evidence.url='https://evil.example/a';},
 'manifest replaced':x=>{x.ctx.attachments.programs['test-program'].manifest_sha256='c'.repeat(64);},
 'document replaced':x=>{x.ctx.attachments.records.doc.observed_sha256='c'.repeat(64);},
 'wrong document ownership':x=>{x.ctx.attachments.records.doc.program_id='wrong';},
 'parser bytes differ':x=>{x.ctx.attachments.records.doc.extraction.sha256='c'.repeat(64);},
 'failed document retrieval':x=>{x.ctx.attachments.records.doc.last_error='timeout';},
 'removed attachment':x=>{x.ctx.attachments.programs['test-program'].document_ids=[];},
 'HTML changed':x=>{x.ctx.evidence.records['test-program']={review_required:true};},
 'unreviewed difference':x=>{x.ctx.reviews.items=[{id:'diff',program_id:'test-program',status:'pending'}];},
 'expired application':x=>{x.ctx.now=new Date('2026-11-14T09:00:00+09:00');},
 'discovery alone':x=>{x.ctx.program.mode='discovery';},
 'missing formula':x=>{x.r.finance=null;},
 'invalid ratio sum':x=>{x.r.finance.cash_min_bps=999;},
 'other related attachment changed':x=>{x.ctx.attachments.programs['test-program'].document_ids.push('other');x.ctx.attachments.records.other={review_required:true};}
};
for(const [name,mutate] of Object.entries(gates))test('holds on '+name,()=>{const x=fixture();mutate(x);assert.equal(P.estimate(x.r,x.input,x.ctx).code,'hold');});
test('unrelated pending change does not block',()=>{const {r,ctx,input}=fixture();ctx.reviews.items=[{id:'different',program_id:'other',status:'pending'}];assert.equal(P.estimate(r,input,ctx).code,'calculated_assumption');});
test('explicitly acknowledged metadata difference accepted',()=>{const {r,ctx,input}=fixture();ctx.reviews.items=[{id:'diff',program_id:'test-program',status:'pending'}];r.reviewed_difference_ids=['diff'];assert.equal(P.estimate(r,input,ctx).code,'calculated_assumption');});
test('same cost is conflict',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{same_cost:true,active_dips:false},ctx).code,'conflict');});
test('unchecked is unknown, not no conflict',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{},ctx).code,'hold');});
test('all known false is LIMITED no conflict, never full eligibility',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{same_cost:false,active_dips:false},ctx).code,'limited_no_conflict');});
test('active DIPS not final year is conflict',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{same_cost:false,active_dips:true,dips_final_year_2026:false},ctx).code,'conflict');});
test('2026 last-year exception still requires review',()=>{const {r,ctx}=fixture();const a=P.restrictions(r,{same_cost:false,active_dips:true,dips_final_year_2026:true},ctx);assert.equal(a.code,'hold');assert.equal(a.rows[1].code,'exception_review');});
test('exception without active DIPS does not grant other permissions',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{same_cost:false,active_dips:false,dips_final_year_2026:true},ctx).code,'limited_no_conflict');});
test('truthy string is not valid true input',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{same_cost:'false'},ctx).code,'invalid');});
test('restriction private fields rejected',()=>{const {r,ctx}=fixture();assert.equal(P.restrictions(r,{company_name:'A'},ctx).code,'invalid');});
test('IBK one centre only',()=>{const {r,ctx}=fixture();r.restrictions=[{id:'ibk',type:'max_count',field:'ibk_centres',limit:1,label:'centres',locator:'p.2'}];assert.equal(P.restrictions(r,{ibk_centres:1},ctx).code,'limited_no_conflict');assert.equal(P.restrictions(r,{ibk_centres:2},ctx).code,'conflict');assert.equal(P.restrictions(r,{ibk_centres:0},ctx).code,'hold');});
test('source and caller inputs are never mutated',()=>{const x=fixture(),before=JSON.stringify(x);P.estimate(x.r,x.input,x.ctx);P.restrictions(x.r,{same_cost:true},x.ctx);assert.equal(JSON.stringify(x),before);});
