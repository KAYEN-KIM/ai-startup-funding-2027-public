'use strict';
// Test-only synthetic company amounts; public source fixtures are cloned, never persisted.
const fs=require('node:fs'),path=require('node:path'),ROOT=path.join(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function context(){
 const routes=read('data/startup_routes.json'),programs=read('data/programs.json'),sources=read('data/startup_sources.json');
 const now=new Date('2026-10-29T20:00:00+09:00');
 for(const r of routes.records){r.source_state='reference_ready';r.reviewed_at='2026-10-29T15:43:18+09:00';sources.records[r.id]={...sources.records[r.id],url:r.source.url,expected_sha256:r.source.sha256,observed_sha256:r.source.sha256,status:'matched',error:null,review_required:false,last_success_at:'2026-10-29T19:00:00+09:00',last_attempt_at:'2026-10-29T19:00:00+09:00'};}
 return {routes,programs,sources,now};
}
function plan(){return {
 review_year:2027,phase:'execution',reference_ack:true,combination_ack:true,unique_cost_ack:true,
 company:{start_month:'2027-01',months:6,opening_cash_won:'10000000',monthly_revenue_won:'0',monthly_operating_won:'1000000',reserve_won:'0',opening_debt_won:'0',receipt_delay_months:2,financing:[]},
 projects:[{id:'P1',route_id:'early-general',scenario_id:'nonpreferred',category:'startup',start_date:'2027-01-01',end_date:'2027-06-30',support_won:'7000000',inkind_won:'0',own_cash_won:'',region_confirmed:true,receipts:[{month:'2027-05',won:'7000000'}]},{id:'P2',route_id:'manual',scenario_id:'manual',category:'rd',start_date:'2027-01-01',end_date:'2027-06-30',support_won:'5000000',inkind_won:'0',own_cash_won:'2000000',region_confirmed:false,receipts:[{month:'2027-06',won:'5000000'}]}],
 costs:[{key:'C1',category:'cloud',start_date:'2027-01-01',end_date:'2027-01-31',payment_month:'2027-01',amount_won:'10000000',eligibility:'assumed',allocations:[{project_id:'P1',won:'6000000'},{project_id:'P2',won:'4000000'}]},{key:'C2',category:'outsourcing',start_date:'2027-02-01',end_date:'2027-02-28',payment_month:'2027-02',amount_won:'7000000',eligibility:'assumed',allocations:[{project_id:'P1',won:'4000000'},{project_id:'P2',won:'3000000'}]}]
};}
module.exports={context,plan};
