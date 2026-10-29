/* P0.7: local, source-bound cash timing scenarios. Not an award or compliance engine. */
(function(root){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const S=node?require('./startup-core.js'):root.StartupCore;
const P=node?require('./planning-core.js'):root.PlanningCore;
const VERSION='0.7.0';
const DISCLAIMER='2026 참고조건과 사용자가 입력한 자금 일정의 가정 계산입니다. 선정·2027 자격·지원금 지급방식·비용 인정·병행 허용을 확정하지 않습니다.';
const METHOD='proportional_project_cash_reimbursement_assumption';
const KINDS=['equity','loan','principal','interest','extra_cost','extra_revenue'];
const min=(a,b)=>a<b?a:b,max=(a,b)=>a>b?a:b;
function res(code,reasons,more={}){return {engine_version:VERSION,scope:'historical_cashflow_assumption',code,reasons,...more,disclaimer:DISCLAIMER};}
function exact(obj,keys,label){
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))throw new Error(label+' 입력 형식이 유효하지 않습니다.');
}
function monthIndex(value){
 if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))throw new Error('월은 YYYY-MM 형식으로 입력하십시오.');
 return Number(value.slice(0,4))*12+Number(value.slice(5))-1;
}
function monthString(index){return String(Math.floor(index/12))+'-'+String(index%12+1).padStart(2,'0');}
function integer(value,lo,hi,label){if(!Number.isInteger(value)||value<lo||value>hi)throw new Error(label+'은 '+lo+'~'+hi+' 범위 정수여야 합니다.');return value;}
function amount(v){return P.won(v);}
function sum(rows){return rows.reduce((n,r)=>n+r.won,0n);}
function schedule(rows,label,first,last,limit=48){
 if(!Array.isArray(rows)||rows.length>limit)throw new Error(label+' 일정은 최대 '+limit+'행입니다.');
 return rows.map(r=>{exact(r,['month','won'],label);const month=monthIndex(r.month),won=amount(r.won);if(month<first||month>last)throw new Error(label+' 월이 분석 범위를 벗어났습니다.');return {month,won};});
}
function evenSchedule(total,start,count){
 const n=amount(total),base=monthIndex(start);integer(count,1,24,'배분 개월');
 if(base+count-1>=2100*12)throw new Error('지원 범위 밖의 연도입니다.');
 const each=n/BigInt(count),rest=n%BigInt(count);
 return Array.from({length:count},(_,i)=>({month:monthString(base+i),won:String(each+(i===count-1?rest:0n))}));
}
function financeEstimate(route,scenarioId,finance,ctx={}){
 try{
  exact(finance,['support_won','inkind_won','reference_ack','region_confirmed'],'참고 사업비');
  return S.estimate(route,scenarioId,{...finance,extra_cash_won:'0',available_cash_won:''},ctx);
 }catch(e){return res('invalid',[e.message]);}
}
function parsePlan(input,budget){
 exact(input,['start_month','months','opening_cash_won','monthly_revenue_won','monthly_operating_won','reserve_won','opening_debt_won','receipt_delay_months','budget_separated_ack','cash_model_ack','spending','receipts','financing'],'현금흐름');
 if(input.budget_separated_ack!==true||input.cash_model_ack!==true)throw new Error('사업비와 운영비 중복 배제 및 지원금 배분 가정 확인이 필요합니다.');
 const first=monthIndex(input.start_month),months=integer(input.months,1,24,'분석 개월'),last=first+months-1;
 if(last+24>=2100*12)throw new Error('분석 연도가 지원 범위를 벗어났습니다.');
 const delay=integer(input.receipt_delay_months,0,12,'지원금 지연 개월');
 const p={first,last,months,delay,opening:amount(input.opening_cash_won),revenue:amount(input.monthly_revenue_won),operating:amount(input.monthly_operating_won),reserve:amount(input.reserve_won),debt:amount(input.opening_debt_won)};
 p.spending=schedule(input.spending,'사업비 현금 지출',first,last);
 p.receipts=schedule(input.receipts,'지원금 유입',first,last+24);
 if(sum(p.spending)!==budget.cash)throw new Error('사업비 현금 지출 합계는 요청 지원액 + 자부담 현금과 같아야 합니다. 현물과 자부담을 중복 지출로 넣지 마십시오.');
 if(sum(p.receipts)!==budget.grant)throw new Error('지원금 지급 일정 합계는 요청 지원액과 같아야 합니다. 기간 이후 지급분도 별도 행에 배분하십시오.');
 if(!Array.isArray(input.financing)||input.financing.length>48)throw new Error('추가 자금 일정은 최대 48행입니다.');
 p.financing=input.financing.map(r=>{exact(r,['month','won','kind'],'추가 자금');const month=monthIndex(r.month),won=amount(r.won);if(month<first||month>last||!KINDS.includes(r.kind))throw new Error('추가 자금의 유형 또는 월이 유효하지 않습니다. 보증·현물·세액공제는 현금 유입으로 넣지 않습니다.');return {month,won,kind:r.kind};});
 let debt=p.debt;
 for(let m=first;m<=last;m++){
  debt+=p.financing.filter(r=>r.month===m&&r.kind==='loan').reduce((n,r)=>n+r.won,0n);
  debt-=p.financing.filter(r=>r.month===m&&r.kind==='principal').reduce((n,r)=>n+r.won,0n);
  if(debt<0n)throw new Error('기초 차입금과 입력한 신규 차입금을 초과하는 원금 상환이 있습니다.');
 }
 return p;
}
function simulate(p,budget,key,delay){
 const noGrant=key==='no_grant',cashRows=[];
 let general=p.opening,debt=p.debt,cumSpent=0n,received=0n,released=0n;
 let lowest=general,peak=max(0n,p.reserve-general),firstGap=general<0n?'opening':null,firstReserve=general<p.reserve?'opening':null;
 const totals={revenue:0n,equity:0n,loan:0n,principal:0n,interest:0n,extra_cost:0n,operating:0n,project:0n,grant:0n,grant_used:0n};
 for(let m=p.first;m<=p.last;m++){
  const f=Object.fromEntries(KINDS.map(k=>[k,p.financing.filter(r=>r.month===m&&r.kind===k).reduce((n,r)=>n+r.won,0n)]));
  const project=p.spending.filter(r=>r.month===m).reduce((n,r)=>n+r.won,0n);
  const grant=noGrant?0n:p.receipts.filter(r=>r.month+delay===m).reduce((n,r)=>n+r.won,0n);
  const revenue=p.revenue+f.extra_revenue,opening=general;
  cumSpent+=project;received+=grant;
  // Analytical cash-share allocation, NOT a statement of statutory eligible spending.
  // Until matched to modeled project expenditure, grant funds remain restricted.
  const cumulativeAllowance=cumSpent*budget.grant/budget.cash;
  const usable=min(received,cumulativeAllowance),grantUsed=usable-released;released=usable;
  const restricted=received-released;
  general+=revenue+f.equity+f.loan+grantUsed-p.operating-project-f.extra_cost-f.principal-f.interest;
  debt+=f.loan-f.principal;
  lowest=min(lowest,general);peak=max(peak,max(0n,p.reserve-general));
  if(firstGap===null&&general<0n)firstGap=monthString(m);
  if(firstReserve===null&&general<p.reserve)firstReserve=monthString(m);
  totals.revenue+=revenue;totals.equity+=f.equity;totals.loan+=f.loan;totals.principal+=f.principal;totals.interest+=f.interest;totals.extra_cost+=f.extra_cost;totals.operating+=p.operating;totals.project+=project;totals.grant+=grant;totals.grant_used+=grantUsed;
  cashRows.push({month:monthString(m),opening_won:String(opening),revenue_won:String(revenue),equity_won:String(f.equity),loan_won:String(f.loan),grant_received_won:String(grant),grant_used_won:String(grantUsed),operating_won:String(p.operating),project_cash_won:String(project),extra_cost_won:String(f.extra_cost),principal_won:String(f.principal),interest_won:String(f.interest),general_closing_won:String(general),restricted_closing_won:String(restricted),total_closing_won:String(general+restricted),debt_closing_won:String(debt),reserve_gap_won:String(max(0n,p.reserve-general))});
 }
 const after=noGrant?0n:p.receipts.filter(r=>r.month+delay>p.last).reduce((n,r)=>n+r.won,0n);
 return {key,delay_months:delay,rows:cashRows,summary:{opening_cash_won:String(p.opening),ending_general_won:String(general),ending_restricted_won:String(received-released),ending_total_won:String(general+received-released),ending_debt_won:String(debt),lowest_general_won:String(lowest),peak_reserve_gap_won:String(peak),minimum_extra_opening_cash_won:String(max(0n,-lowest)),first_negative_month:firstGap,first_below_reserve_month:firstReserve,grant_after_horizon_won:String(after),unfunded_grant_won:noGrant?String(budget.grant):'0',totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k+'_won',String(v)]))}};
}
function evaluate(route,scenarioId,finance,input,ctx={}){
 const estimate=financeEstimate(route,scenarioId,finance,ctx);
 if(estimate.code!=='historical_assumption')return res(estimate.code,estimate.reasons,{estimate});
 try{
  const grant=BigInt(estimate.amounts.support_won),own=BigInt(estimate.amounts.own_cash_won),cash=grant+own;
  const p=parsePlan(input,{grant,cash});
  const scenarios=[simulate(p,{grant,cash},'no_grant',0),simulate(p,{grant,cash},'planned',0),simulate(p,{grant,cash},'delayed',p.delay)];
  return res('calculated_assumption',[
   '동일한 사업비 지출을 유지한 채 지원금 없음·가정 일정·지원금 지연을 비교합니다. 미선정이면 실제로 집행한다는 권고가 아닙니다.',
   '지원금은 사업비 현금 지출의 지원금 비중만큼 누적 환입하는 가정입니다. 미사용 지원금은 제한자금으로 남겨 일반 운영비에 쓰지 않습니다. 실제 정산·직접지급·환입 허용은 별도 확인해야 합니다.',
   '지원금 외 매출·투자·차입도 사용자 가정입니다. 대출원금과 이자는 자동 추정하지 않고 입력 일정만 반영합니다.',
   '월말 기준 계산이며 월중 결제 순서·세금·비인정비용·정산 삭감·이미 수령한 자금의 중복 입력은 자동 검증하지 못합니다.'
  ],{reference_year:2026,target_start_month:input.start_month,route_id:route.id,program_id:route.program_id,scenario_id:scenarioId,method:METHOD,estimate,project_cash_total_won:String(cash),own_cash_won:String(own),inkind_used_won:estimate.amounts.inkind_used_won,month_count:p.months,scenarios});
 }catch(e){return res('invalid',[e.message],{estimate});}
}
const api={VERSION,DISCLAIMER,METHOD,KINDS,monthIndex,monthString,evenSchedule,financeEstimate,evaluate};
if(node)module.exports=api;else root.CashflowCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
