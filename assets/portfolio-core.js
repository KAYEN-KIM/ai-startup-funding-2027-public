/* P0.8: one-company allocation audit and explicitly hypothetical combined cashflow.
 * No award optimization, legal clearance, persistence or network calls. */
(function(root){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const S=node?require('./startup-core.js'):root.StartupCore;
const F=node?require('./cashflow-core.js'):root.CashflowCore;
const P=node?require('./planning-core.js'):root.PlanningCore;
const E=node?require('./portfolio-evidence.js'):root.PortfolioEvidence;
const VERSION='0.9.0';
const DISCLAIMER='조합의 동시신청·선정·수행 허용은 미확정입니다. 비용 배분 검사는 공식 비용 인정이나 선정액 검증이 아니며, 합산 현금은 모든 사업의 선정·병행을 가정한 계획 모형입니다.';
const CATEGORIES=['personnel','cloud','outsourcing','equipment','travel','other'];
const max=(a,b)=>a>b?a:b,min=(a,b)=>a<b?a:b;
function exact(o,keys,label){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))throw new Error(label+' 입력 형식이 유효하지 않습니다.');}
function integer(n,lo,hi,label){if(!Number.isInteger(n)||n<lo||n>hi)throw new Error(label+' 범위를 확인하십시오.');return n;}
function ident(s,label){if(typeof s!=='string'||!/^([A-Z][A-Z0-9_-]{0,23})$/.test(s))throw new Error(label+'는 영문 대문자로 시작하는 익명 식별자입니다. 실명·사업자번호를 넣지 마십시오.');return s;}
function day(s){if(typeof s!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(s))throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw new Error('존재하지 않는 날짜입니다.');return s;}
function interval(a,b){a=day(a);b=day(b);if(a>b)throw new Error('시작일은 종료일보다 늦을 수 없습니다.');return [a,b];}
function overlap(a,b){const start=a[0]>b[0]?a[0]:b[0],end=a[1]<b[1]?a[1]:b[1];return start<=end?{start_date:start,end_date:end,days:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1}:null;}
function issue(list,code,severity,message,refs=[]){list.push({code,severity,message,refs});}
function response(code,reasons,more={}){return {engine_version:VERSION,scope:'unconfirmed_combination_assumption',code,permission:'not_determined',reasons,...more,disclaimer:DISCLAIMER};}
function parseCompany(x){
 exact(x,['start_month','months','opening_cash_won','monthly_revenue_won','monthly_operating_won','reserve_won','opening_debt_won','receipt_delay_months','financing'],'공통 운영현금');
 const first=F.monthIndex(x.start_month),months=integer(x.months,1,24,'분석 개월'),last=first+months-1;
 if(last+36>=2100*12)throw new Error('분석 종료 연도가 지원 범위 밖입니다.');
 const p={first,last,months,opening:P.won(x.opening_cash_won),revenue:P.won(x.monthly_revenue_won),operating:P.won(x.monthly_operating_won),reserve:P.won(x.reserve_won),debt:P.won(x.opening_debt_won),delay:integer(x.receipt_delay_months,0,12,'지연 개월')};
 if(!Array.isArray(x.financing)||x.financing.length>48)throw new Error('추가 자금 일정은 최대 48행입니다.');
 p.financing=x.financing.map(r=>{exact(r,['month','kind','won'],'추가 자금');const month=F.monthIndex(r.month),won=P.won(r.won);if(!F.KINDS.includes(r.kind)||month<first||month>last)throw new Error('추가 자금의 유형·월을 확인하십시오.');return {month,kind:r.kind,won};});
 let debt=p.debt;for(let m=first;m<=last;m++){debt+=p.financing.filter(r=>r.month===m&&r.kind==='loan').reduce((n,r)=>n+r.won,0n);debt-=p.financing.filter(r=>r.month===m&&r.kind==='principal').reduce((n,r)=>n+r.won,0n);if(debt<0n)throw new Error('상환 원금이 기초 차입금과 신규 차입금을 초과합니다.');}
 return p;
}
function review(input,ctx={}){
 try{
  exact(input,['review_year','phase','reference_ack','combination_ack','unique_cost_ack','company','projects','costs'],'조합');
  if(![2026,2027].includes(input.review_year)||!['application','execution'].includes(input.phase))throw new Error('검토 연도·신청/수행 단계를 선택하십시오.');
  if(input.reference_ack!==true||input.combination_ack!==true||input.unique_cost_ack!==true)return response('hold',['참고연도·미확정 조합·비용 중복 배제 가정에 모두 동의해야 합니다.'],{can_export:false,can_simulate:false});
  if(!Array.isArray(input.projects)||input.projects.length<1||input.projects.length>3)throw new Error('한 회사의 사업 1~3개만 검토할 수 있습니다.');
  if(!Array.isArray(input.costs)||input.costs.length<1||input.costs.length>60)throw new Error('비용 명세는 1~60행입니다.');
  const company=parseCompany(input.company),issues=[],projects=[],ids=new Set(),sourceHolds=[];
  for(const x of input.projects){
   exact(x,['id','route_id','scenario_id','category','start_date','end_date','support_won','inkind_won','own_cash_won','region_confirmed','receipts','notice_code','award_year','selection_status'],'사업');
   const id=ident(x.id,'사업 ID');if(ids.has(id))throw new Error('사업 ID가 중복되었습니다.');ids.add(id);
   const period=interval(x.start_date,x.end_date);let grant,cash,own,inkind,source=null,label,sourceKind;
   if(x.route_id==='manual'){
    if(x.scenario_id!=='manual'||!['rd','startup','other'].includes(x.category)||typeof x.region_confirmed!=='boolean')throw new Error('직접 입력 사업의 유형을 확인하십시오.');
    grant=P.won(x.support_won);own=P.won(x.own_cash_won);inkind=P.won(x.inkind_won);cash=grant+own;
    if(cash<=0n)throw new Error('직접 입력 사업의 현금 사업비는 0보다 커야 합니다.');
    label='직접 입력 '+id+' · 공식 규칙 미검증';sourceKind='user_assumption';
    issue(issues,'manual_budget','review',id+': 요청액·자부담·사업분류는 사용자 가정입니다. 공식 공고·비용 인정·중복제한을 확인해야 합니다.',[id]);
   }else{
    if(x.category!=='startup'||x.own_cash_won!=='')throw new Error('참고 창업 경로의 자부담은 기존 규칙으로 계산합니다. 수동 현금을 중복 입력하지 마십시오.');
    if(ctx.routes?.schema!=='public-startup-preparation/v1')throw new Error('참고 경로 자료의 형식이 유효하지 않습니다.');
    const route=ctx.routes.records?.find(r=>r.id===x.route_id);
    const estimate=F.financeEstimate(route,x.scenario_id,{support_won:x.support_won,inkind_won:x.inkind_won,reference_ack:true,region_confirmed:x.region_confirmed},ctx);
    if(estimate.code!=='historical_assumption'){sourceHolds.push(...estimate.reasons.map(s=>id+': '+s));continue;}
    grant=BigInt(estimate.amounts.support_won);own=BigInt(estimate.amounts.own_cash_won);inkind=BigInt(estimate.amounts.inkind_used_won);cash=grant+own;source=route.source;label=route.label;sourceKind='historical_2026_reference';
   }
   if(!Array.isArray(x.receipts)||x.receipts.length<1||x.receipts.length>48)throw new Error('사업별 지급 일정은 1~48행입니다.');
   const receipts=x.receipts.map(r=>{exact(r,['month','won'],'지원금 지급');const month=F.monthIndex(r.month),won=P.won(r.won);if(month<company.first||month>company.last+24)throw new Error('지원금 지급월은 분석 시작부터 종료 후 24개월 이내입니다.');return {month,won};});
   if(receipts.reduce((s,r)=>s+r.won,0n)!==grant)issue(issues,'receipts_mismatch','conflict',id+': 지급 일정 합계와 요청액 가정이 다릅니다.',[id]);
   if(period[0].slice(0,7)<F.monthString(company.first)||period[1].slice(0,7)>F.monthString(company.last))issue(issues,'partial_period','review',id+': 분석 기간은 수행기간 전체를 포함하지 않습니다. 기간 밖 비용 누락을 확인하십시오.',[id]);
   projects.push({id,route_id:x.route_id,scenario_id:x.scenario_id,category:x.category,period,grant,cash,own,inkind,source,label,sourceKind,receipts});
  }
  if(sourceHolds.length)return response('source_hold',[...new Set(sourceHolds)],{can_export:false,can_simulate:false});
  const pairs=[];
  for(let i=0;i<projects.length;i++)for(let j=i+1;j<projects.length;j++){
   const a=projects[i],b=projects[j],known=a.route_id!=='manual'&&b.route_id!=='manual',same=known&&a.route_id===b.route_id;
   const pair={a:a.id,b:b.id,overlap:overlap(a.period,b.period),permission:'not_determined',sources:[a.source,b.source].filter(Boolean)};
   if(known){
    pair.code=same?'same_route_alternatives':'startup_alternatives';
    pair.message=same?'동일 경로의 지역·금액 대안은 별도 지원사업이 아닙니다.':'예비·초기 참고 경로는 대안으로 비교합니다. 이 화면에서 지원액을 합산하지 않습니다.';
    if(input.review_year===2026&&!same)pair.historical_check=S.compareExecution([a.route_id,b.route_id],2026,input.phase);
    issue(issues,'alternative_sum_blocked','conflict',a.id+' / '+b.id+': '+pair.message+' 수행기간이 분리되어도 합산을 허용하지 않습니다.',[a.id,b.id]);
   }else{
    pair.code='pair_rule_unverified';pair.message=pair.overlap?'수행기간이 겹칩니다. 양 사업의 동시신청·선정·수행 제한과 같은 목적·비용을 원문으로 확인하십시오.':'수행기간은 겹치지 않지만 기수혜·연도별 제한 때문에 병행 허용을 확정할 수 없습니다.';
    issue(issues,'pair_rule_unverified','review',a.id+' / '+b.id+': '+pair.message,[a.id,b.id]);
   }
   pairs.push(pair);
  }
  if(input.review_year===2027)issue(issues,'next_year_unconfirmed','review','2026 참고 조항을 2027 확정 자격·병행 허용으로 전환하지 않았습니다. 새 수혜기업 공고가 필요합니다.');
  const costs=[],keys=new Set(),allocated=new Map(projects.map(p=>[p.id,0n]));
  for(const x of input.costs){
   exact(x,['key','start_date','end_date','payment_month','category','amount_won','eligibility','allocations','economic_key','proof_status','labor'],'비용');
   const key=ident(x.key,'비용 ID');if(keys.has(key))throw new Error('같은 비용 ID가 여러 행에 있습니다. 한 비용은 한 행에서 사업별로 나누십시오.');keys.add(key);
   const period=interval(x.start_date,x.end_date),month=F.monthIndex(x.payment_month),amount=P.won(x.amount_won);
   if(month<company.first||month>company.last)throw new Error('비용 지급월이 분석 기간 밖입니다.');
   if(!CATEGORIES.includes(x.category)||!['unknown','assumed','excluded'].includes(x.eligibility)||amount<=0n)throw new Error('비용 유형·인정 상태·양수 금액을 확인하십시오.');
   if(!Array.isArray(x.allocations)||x.allocations.length>3)throw new Error('사업별 비용 배분을 확인하십시오.');
   const allocationIds=new Set();let assigned=0n;
   const allocations=x.allocations.map(a=>{
    exact(a,['project_id','won'],'배분');const p=projects.find(p=>p.id===a.project_id);if(!p||allocationIds.has(a.project_id))throw new Error('배분 대상 사업이 없거나 같은 사업이 중복되었습니다.');allocationIds.add(a.project_id);
    const won=P.won(a.won);assigned+=won;allocated.set(p.id,allocated.get(p.id)+won);
    if(won>0n&&(period[0]<p.period[0]||period[1]>p.period[1]))issue(issues,'outside_project_period','conflict',key+' → '+p.id+': 비용 발생기간이 입력한 수행기간 밖입니다. 허용 예외나 기간 입력을 확인해야 합니다.',[key,p.id]);
    if(won>0n&&(x.payment_month<p.period[0].slice(0,7)||x.payment_month>p.period[1].slice(0,7)))issue(issues,'payment_period_review','review',key+' → '+p.id+': 지급월이 수행기간 밖입니다. 선지급·후정산 가능 여부를 별도 확인하십시오.',[key,p.id]);
    return {project_id:p.id,won};
   });
   if(assigned>amount)issue(issues,'overallocated','conflict',key+': 사업별 배분 합계가 비용 원금보다 큽니다. 같은 비용을 중복 청구하는 계획을 계산하지 않습니다.',[key]);
   if(assigned>0n&&x.eligibility==='excluded')issue(issues,'excluded_cost','conflict',key+': 비인정으로 표시한 비용을 사업비로 배분했습니다.',[key]);
   if(assigned>0n&&x.eligibility==='unknown')issue(issues,'eligibility_missing','hold',key+': 비용 인정 미확인입니다. 가정 모형에 포함하려면 인정 가능 가정임을 명시하거나 배분을 제거하십시오.',[key]);
   if(assigned>0n&&x.eligibility==='assumed')issue(issues,'eligibility_assumed','review',key+': 비용 인정은 사용자 가정이며 검토된 공고 규칙이 아닙니다.',[key]);
   costs.push({key,period,month,amount,assigned,allocations,eligibility:x.eligibility,category:x.category});
  }
  for(const p of projects)if(allocated.get(p.id)!==p.cash)issue(issues,'budget_mismatch','conflict',p.id+': 배분된 현금 비용 합계는 요청액 + 자부담 현금과 같아야 합니다. 현물은 배분하지 않습니다.',[p.id]);
  const evidence=E.audit(input,ctx);
  if(evidence.holds.length)return response('source_hold',evidence.holds,{can_export:false,can_simulate:false});
  issues.push(...evidence.issues);
  const canSimulate=!issues.some(i=>i.severity==='conflict'||i.severity==='hold');
  const actual=costs.reduce((n,c)=>n+c.amount,0n),assign=costs.reduce((n,c)=>n+c.assigned,0n);
  const budgets=projects.map(p=>({id:p.id,route_id:p.route_id,scenario_id:p.scenario_id,label:p.label,source_kind:p.sourceKind,source:p.source,start_date:p.period[0],end_date:p.period[1],support_assumption_won:String(p.grant),own_cash_assumption_won:String(p.own),inkind_assumption_won:String(p.inkind),project_cash_won:String(p.cash),allocated_cash_won:String(allocated.get(p.id))}));
  const ledger=costs.map(c=>({key:c.key,start_date:c.period[0],end_date:c.period[1],payment_month:F.monthString(c.month),cost_won:String(c.amount),allocated_won:String(c.assigned),company_only_won:c.assigned<=c.amount?String(c.amount-c.assigned):null,allocations:c.allocations.map(a=>({project_id:a.project_id,won:String(a.won)}))}));
  const questions=[
   '각 사업의 신청·선정·확약·협약·수행 중 어느 단계에서 타 사업 제한이 적용됩니까? 기수혜 및 수행기간이 겹치지 않는 경우도 제한됩니까?',
   '같은 목적·결과물과 공유 인건비·클라우드·외주비를 어떻게 분리해야 합니까? 비용별 배분 근거와 증빙 요건은 무엇입니까?',
   '사업별 실제 지급·정산·환입 방식, 비인정 비용, 부가세 및 삭감·환수 가능성을 확인해 주십시오.',
   ...pairs.map(p=>p.a+' / '+p.b+': 두 공고의 상호 중복수혜 조항과 적용 예외를 원문 조항 번호로 확인해 주십시오.'),
   ...evidence.checks.map(c=>c.from+' → '+c.to+': 2026 참고 '+c.source.locator+'의 제한이 실제 신청 사업연도·진행단계에 적용됩니까? 역방향 제한·예외도 확인해 주십시오.'),
   ...evidence.cost_checks.map(c=>c.key+': '+c.checklist.join('; ')+' — 내부 준비 제안이며 필수서류 목록 확정이 아닙니다. 해당 사업의 인정·증빙 기준을 확인해 주십시오.'),
   ...projects.filter(p=>p.sourceKind==='user_assumption').map(p=>p.id+': 직접 입력한 금액·사업유형·자부담의 공식 공고 및 근거를 확인해 주십시오.')
  ];
  return response(canSimulate?'review_required':'blocked',canSimulate?['비용 배분 산식에는 충돌이 없으나 조합의 적격성·병행 허용은 미확정입니다. 가정 현금흐름만 제공합니다.']:['비용 배분·자료 또는 대안 합산에 미해결 문제가 있어 합산 현금흐름을 계산하지 않았습니다.'],{
   review_year:input.review_year,phase:input.phase,can_export:true,can_simulate:canSimulate,budgets,pairs,issues,ledger,evidence,
   cost_totals:{unique_cash_cost_won:String(actual),allocated_cash_won:String(assign),company_only_cash_won:assign<=actual?String(actual-assign):null},questions,
   scenarios:canSimulate?['no_grant','planned','delayed'].map(k=>simulate(company,projects,costs,k)):null
  });
 }catch(e){return response('invalid',[e.message],{can_export:false,can_simulate:false});}
}
function simulate(company,projects,costs,key){
 const delay=key==='delayed'?company.delay:0,noGrant=key==='no_grant',states=new Map(projects.map(p=>[p.id,{spent:0n,received:0n,released:0n}]));
 let general=company.opening,debt=company.debt,lowest=general,peak=max(0n,company.reserve-general),firstGap=general<0n?'opening':null;
 const rows=[];
 for(let m=company.first;m<=company.last;m++){
  const f=Object.fromEntries(F.KINDS.map(k=>[k,company.financing.filter(r=>r.month===m&&r.kind===k).reduce((n,r)=>n+r.won,0n)]));
  let used=0n,received=0n,restricted=0n;const projectRows=[];
  for(const p of projects){
   const s=states.get(p.id),spent=costs.filter(c=>c.month===m).flatMap(c=>c.allocations).filter(a=>a.project_id===p.id).reduce((n,a)=>n+a.won,0n),r=noGrant?0n:p.receipts.filter(r=>r.month+delay===m).reduce((n,r)=>n+r.won,0n);
   s.spent+=spent;s.received+=r;const allowance=s.spent*p.grant/p.cash,release=min(s.received,allowance),u=release-s.released;s.released=release;
   used+=u;received+=r;restricted+=s.received-s.released;
   projectRows.push({project_id:p.id,cash_spent_won:String(spent),received_won:String(r),released_won:String(u),restricted_won:String(s.received-s.released)});
  }
  const unique=costs.filter(c=>c.month===m).reduce((n,c)=>n+c.amount,0n),opening=general,revenue=company.revenue+f.extra_revenue;
  general+=revenue+f.equity+f.loan+used-company.operating-unique-f.extra_cost-f.principal-f.interest;debt+=f.loan-f.principal;
  lowest=min(lowest,general);peak=max(peak,max(0n,company.reserve-general));if(firstGap===null&&general<0n)firstGap=F.monthString(m);
  rows.push({month:F.monthString(m),opening_won:String(opening),revenue_won:String(revenue),equity_won:String(f.equity),loan_won:String(f.loan),principal_won:String(f.principal),interest_won:String(f.interest),extra_cost_won:String(f.extra_cost),operating_won:String(company.operating),unique_cost_won:String(unique),grant_received_won:String(received),grant_used_won:String(used),general_closing_won:String(general),restricted_closing_won:String(restricted),total_closing_won:String(general+restricted),debt_closing_won:String(debt),projects:projectRows});
 }
 const after=noGrant?0n:projects.flatMap(p=>p.receipts).filter(r=>r.month+delay>company.last).reduce((n,r)=>n+r.won,0n);
 return {key,delay_months:delay,method:'per_project_proportional_assumption_unique_company_costs',rows,summary:{lowest_general_won:String(lowest),peak_reserve_gap_won:String(peak),minimum_extra_opening_cash_won:String(max(0n,-lowest)),first_negative_month:firstGap,ending_general_won:String(general),ending_restricted_won:rows.at(-1).restricted_closing_won,ending_total_won:rows.at(-1).total_closing_won,ending_debt_won:String(debt),grant_after_horizon_won:String(after)}};
}
const api={VERSION,DISCLAIMER,CATEGORIES,day,interval,overlap,review};
if(node)module.exports=api;else root.PortfolioCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
