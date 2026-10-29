/* Private form values never leave this page. Public source GET only. */
(function(){
'use strict';
const $=id=>document.getElementById(id),C=window.PortfolioCore,F=window.CashflowCore,R=window.RadarCore,E=window.PortfolioEvidence;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v===null||v===undefined?'판정 보류':BigInt(v).toLocaleString('ko-KR')+'원';
const kinds={personnel:'인건비',cloud:'클라우드',outsourcing:'외주',equipment:'장비',travel:'출장',other:'기타'};
const financeKinds={equity:'민간투자',loan:'신규 차입',principal:'원금상환',interest:'이자',extra_cost:'추가 지출',extra_revenue:'추가 입금'};
const state={ready:false,data:null,projects:[],costs:[],financing:[],projectNext:1,costNext:1,result:null,stamp:null};
const ctx=()=>({routes:state.data?.routes,programs:state.data?.programs,sources:state.data?.sources,now:new Date()});
const options=(items,value)=>items.map(([v,l])=>'<option value="'+esc(v)+'"'+(String(v)===String(value)?' selected':'')+'>'+esc(l)+'</option>').join('');
const field=(id,label,value='',type='text')=>'<label for="'+id+'">'+esc(label)+'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'"'+(type==='text'?' inputmode="numeric" maxlength="13"':'')+'></label>';
function invalidate(message='입력이 바뀌었습니다. 다시 검토하십시오.'){
 state.result=null;state.stamp=null;$('pfResultActions').hidden=true;$('pfExportWarning').hidden=true;
 $('pfResult').innerHTML='<p class="assessment-empty">'+esc(message)+'</p>';
}
function newProject(){const id='P'+state.projectNext++;return {id,route_id:'',scenario_id:'',category:'',start_date:'',end_date:'',support_won:'',inkind_won:'0',own_cash_won:'',region_confirmed:false,notice_code:'unknown',award_year:'unknown',selection_status:'unknown',receipts:[{month:'',won:''}]};}
function newCost(){const id='C'+state.costNext++;return {uiId:id,key:id,start_date:'',end_date:'',payment_month:'',category:'other',amount_won:'',eligibility:'unknown',economic_key:'',proof_status:'unknown',labor:null,allocations:state.projects.map(p=>({project_id:p.id,won:'0'}))};}
function sync(){
 for(const p of state.projects){const n='pf'+p.id;for(const [k,s] of [['route_id','Route'],['scenario_id','Scenario'],['category','Category'],['start_date','Start'],['end_date','End'],['support_won','Grant'],['inkind_won','Inkind'],['own_cash_won','Own'],['notice_code','Notice'],['award_year','AwardYear'],['selection_status','Selection']])p[k]=$(n+s).value;p.region_confirmed=$(n+'Region').checked;p.receipts=p.receipts.map((r,i)=>({month:$(n+'PayMonth'+i).value,won:$(n+'PayWon'+i).value}));}
 for(const c of state.costs){const n='pf'+c.uiId;for(const [k,s] of [['key','Key'],['start_date','Start'],['end_date','End'],['payment_month','Month'],['category','Category'],['amount_won','Amount'],['eligibility','Eligibility'],['economic_key','Economic'],['proof_status','Proof']])c[k]=$(n+s).value;c.allocations=state.projects.map(p=>({project_id:p.id,won:$(n+'To'+p.id).value}));c.labor=c.category==='personnel'?{person_code:$(n+'Person').value,salary_month:$(n+'SalaryMonth').value,salary_basis_won:$(n+'SalaryBasis').value,other_claimed_won:$(n+'OtherClaim').value}:null;}
 state.financing=state.financing.map((r,i)=>({month:$('pfFinMonth'+i).value,kind:$('pfFinKind'+i).value,won:$('pfFinWon'+i).value}));
}
function routeChoices(){return [['','경로를 선택하십시오'],...(state.data?.routes.records||[]).map(r=>[r.id,r.label]),['manual','직접 입력 사업 · 공식 규칙 미검증']];}
function noticeControls(p,n){
 return '<details class="cf-method"><summary>공고 대응·사업연도·선정 단계</summary><div class="cf-grid"><label for="'+n+'Notice">2026 제한목록 대응 · 사용자 확인<select id="'+n+'Notice">'+options(E.TYPES,p.notice_code||'unknown')+'</select></label><label for="'+n+'AwardYear">실제 공고의 사업연도<select id="'+n+'AwardYear">'+options([['unknown','미확인'],['2025','2025'],['2026','2026'],['2027','2027'],['2028','2028']],p.award_year||'unknown')+'</select></label><label for="'+n+'Selection">현재/가정 진행 상태<select id="'+n+'Selection">'+options([['unknown','미확인'],['planned','신청 계획'],['applied','신청 완료'],['selected','선정 · 확약 전'],['pledged','확약서 제출'],['active','협약·수행 중'],['completed','종료·중단 이력']],p.selection_status||'unknown')+'</select></label></div><p class="cf-muted">선택은 사용자의 대응이며 원문을 자동 식별한 것이 아닙니다. 2026 제한조항은 미래 사업의 승인·거절로 전환되지 않습니다.</p></details>';
}
function costEvidenceControls(c,n){
 const l=c.labor||{};
 return '<details class="cf-method"><summary>증빙·동일 비용·인건비 대조</summary><div class="cf-grid"><label for="'+n+'Economic">같은 경제적 비용 코드 · 선택<input id="'+n+'Economic" type="text" maxlength="24" value="'+esc(c.economic_key||'')+'" placeholder="예: BILL_A (실제 증빙번호 금지)"><small>같은 청구 원금에는 같은 익명 코드. 여러 행에 반복되면 통합 검토합니다.</small></label><label for="'+n+'Proof">증빙 준비 상태 · 자체 기록<select id="'+n+'Proof">'+options([['unknown','미확인'],['planned','준비 예정'],['held','보유했다고 입력 · 미검증']],c.proof_status||'unknown')+'</select></label><label for="'+n+'Person">익명 인력 코드 · 인건비만<input id="'+n+'Person" type="text" maxlength="24" value="'+esc(l.person_code||'')+'" placeholder="예: STAFF_A (실명 금지)"></label>'+field(n+'SalaryMonth','급여 대상월 · 인건비만',l.salary_month||'','month')+field(n+'SalaryBasis','그 달의 현금 급여 원금 · 원',l.salary_basis_won||'')+field(n+'OtherClaim','다른 사업에서 청구한 동일 급여 · 원',l.other_claimed_won??'')+'</div><p class="cf-muted">급여 대상월은 발생기간과 맞춰 월별로 나눕니다. 다른 사업 청구액은 같은 인력·월마다 동일하게 입력하며 한 번만 합산합니다. 현물·연구수당·법정 인건비계상률 판정은 포함하지 않습니다.</p></details>';
}
function renderProjects(){
 $('pfProjects').innerHTML=state.projects.map(p=>{
  const n='pf'+p.id,route=state.data?.routes.records.find(r=>r.id===p.route_id),manual=p.route_id==='manual';
  const scenarioChoices=manual?[['manual','직접 입력 가정']]:[['','지역·단계 선택'],...(route?.scenarios||[]).map(s=>[s.id,s.label])];
  const source=route&&R.sourceURL(route.source?.url)?'<a href="'+esc(route.source.url)+'" target="_blank" rel="noopener noreferrer">2026 참고 원본 ↗</a><p>'+esc(route.source.locator)+'</p>':'<p>직접 입력 또는 미선택 경로입니다. 공식 지원액·자부담·병행 제한이 검증되지 않았습니다.</p>';
  return '<fieldset class="pf-card"><legend>사업 '+p.id+'</legend><div class="cf-grid"><label for="'+n+'Route">지원 경로<select id="'+n+'Route">'+options(routeChoices(),p.route_id)+'</select></label><label for="'+n+'Scenario">지역·단계<select id="'+n+'Scenario">'+options(scenarioChoices,p.scenario_id)+'</select></label><label for="'+n+'Category">직접 입력 사업유형<select id="'+n+'Category"'+(!manual?' disabled':'')+'>'+options([['','유형 선택'],['startup','창업사업화'],['rd','연구개발'],['other','기타']],p.category)+'</select></label>'+field(n+'Start','수행 시작일',p.start_date,'date')+field(n+'End','수행 종료일',p.end_date,'date')+field(n+'Grant','요청 지원액 가정 · 원',p.support_won)+field(n+'Inkind','현물 가정 · 현금 제외',p.inkind_won)+'<label for="'+n+'Own">직접 입력 자부담 현금 · 원<input id="'+n+'Own" type="text" inputmode="numeric" maxlength="13" value="'+esc(p.own_cash_won)+'"'+(!manual?' disabled':'')+'><small>참고 경로는 기존 계산식으로 산정합니다.</small></label></div>'+noticeControls(p,n)+'<label class="check-row" for="'+n+'Region"><input id="'+n+'Region" type="checkbox"'+(p.region_confirmed?' checked':'')+'>지역은 원문 확인 또는 명시적 가정입니다. 자동 지역 판정이 아닙니다.</label><div class="cf-source">'+source+'</div><h3>지원금 지급 가정</h3><div class="pf-receipts">'+p.receipts.map((r,i)=>'<div class="pf-line">'+field(n+'PayMonth'+i,'지급월 '+(i+1),r.month,'month')+field(n+'PayWon'+i,'입금 가정액 · 원',r.won)+'<button id="'+n+'PayRemove'+i+'" type="button" class="btn btn-secondary">지급행 삭제</button></div>').join('')+'</div><div class="cf-tools"><button id="'+n+'AddPay" type="button" class="btn btn-secondary">분할 지급행 추가</button><button id="'+n+'Remove" type="button" class="btn btn-secondary">사업 삭제 · 배분 제거</button></div></fieldset>';
 }).join('');
 for(const p of state.projects){const n='pf'+p.id;
  $(n+'Route').addEventListener('change',()=>{sync();p.scenario_id=p.route_id==='manual'?'manual':(p.route_id==='pre'?'stage1':'');p.category=p.route_id==='manual'?'':'startup';p.own_cash_won='';p.region_confirmed=false;p.notice_code=p.route_id==='manual'?'unknown':p.route_id;p.award_year='unknown';p.selection_status='unknown';renderProjects();invalidate('지원 경로가 바뀌었습니다. 금액·기간·지급 가정을 확인하고 다시 검토하십시오.');});
  $(n+'AddPay').addEventListener('click',()=>{sync();if(p.receipts.length>=16){$('pfMessage').textContent='화면의 분할 지급은 사업별 최대 16행입니다.';return;}p.receipts.push({month:'',won:''});renderProjects();invalidate('지급 일정이 바뀌었습니다. 다시 검토하십시오.');});
  $(n+'Remove').addEventListener('click',()=>{sync();if(state.projects.length===1){$('pfMessage').textContent='최소 한 사업을 남겨야 합니다.';return;}state.projects=state.projects.filter(v=>v.id!==p.id);for(const c of state.costs)c.allocations=c.allocations.filter(a=>a.project_id!==p.id);renderProjects();renderCosts();invalidate('사업과 해당 배분을 제거했습니다. 비용 원금은 유지되며 미배분액은 회사 단독 지출입니다.');});
  p.receipts.forEach((r,i)=>$(n+'PayRemove'+i).addEventListener('click',()=>{sync();p.receipts.splice(i,1);if(!p.receipts.length)p.receipts.push({month:'',won:''});renderProjects();invalidate('지급 일정이 바뀌었습니다. 다시 검토하십시오.');}));
 }
 $('pfAddProject').disabled=!state.ready||state.projects.length>=3;
}
function renderCosts(){
 $('pfCosts').innerHTML=state.costs.map(c=>{const n='pf'+c.uiId;return '<fieldset class="pf-card"><legend>비용 행 '+esc(c.uiId)+'</legend><div class="cf-grid"><label for="'+n+'Key">유일한 익명 비용 ID<input id="'+n+'Key" type="text" maxlength="24" value="'+esc(c.key)+'"><small>동일한 비용은 한 ID로 한 행에만 입력합니다.</small></label><label for="'+n+'Category">비용 종류<select id="'+n+'Category">'+options(Object.entries(kinds),c.category)+'</select></label>'+field(n+'Start','비용 발생 시작일',c.start_date,'date')+field(n+'End','비용 발생 종료일',c.end_date,'date')+field(n+'Month','실제 현금 지급월 가정',c.payment_month,'month')+field(n+'Amount','비용 원금 · 원',c.amount_won)+'<label for="'+n+'Eligibility">비용 인정 검토<select id="'+n+'Eligibility">'+options([['unknown','미확인 · 계산 보류'],['assumed','인정 가능 가정 · 미검증'],['excluded','비인정 비용']],c.eligibility)+'</select></label></div>'+costEvidenceControls(c,n)+'<div class="pf-allocation"><b>이 비용의 사업별 배분</b><div class="cf-grid">'+state.projects.map(p=>field(n+'To'+p.id,p.id+' 배분액 · 원',c.allocations.find(a=>a.project_id===p.id)?.won||'0')).join('')+'</div><p class="cf-muted">미배분액은 회사 단독 지출입니다. 배분액을 합쳐 비용 원금을 초과하면 계산을 차단합니다.</p></div><button id="'+n+'Remove" type="button" class="btn btn-secondary">이 비용 삭제</button></fieldset>';}).join('');
 for(const c of state.costs)$('pf'+c.uiId+'Remove').addEventListener('click',()=>{sync();if(state.costs.length===1){$('pfMessage').textContent='최소 한 비용을 남겨야 합니다.';return;}state.costs=state.costs.filter(v=>v.uiId!==c.uiId);renderCosts();invalidate('비용 명세가 바뀌었습니다. 다시 검토하십시오.');});
 $('pfAddCost').disabled=!state.ready||state.costs.length>=60;
}
function renderFinancing(){
 $('pfFinancing').innerHTML=state.financing.map((r,i)=>'<div class="pf-line">'+field('pfFinMonth'+i,'월',r.month,'month')+'<label for="pfFinKind'+i+'">유형<select id="pfFinKind'+i+'">'+options(Object.entries(financeKinds),r.kind)+'</select></label>'+field('pfFinWon'+i,'금액 · 원',r.won)+'<button id="pfFinRemove'+i+'" type="button" class="btn btn-secondary">삭제</button></div>').join('');
 state.financing.forEach((r,i)=>$('pfFinRemove'+i).addEventListener('click',()=>{sync();state.financing.splice(i,1);renderFinancing();invalidate('추가 자금이 바뀌었습니다. 다시 검토하십시오.');}));
}
function readInput(){
 sync();return {review_year:Number($('pfYear').value),phase:$('pfPhase').value,reference_ack:$('pfReferenceAck').checked,combination_ack:$('pfCombinationAck').checked,unique_cost_ack:$('pfCostAck').checked,
  company:{start_month:$('pfStart').value,months:Number($('pfMonths').value),opening_cash_won:$('pfOpening').value,monthly_revenue_won:$('pfRevenue').value,monthly_operating_won:$('pfOperating').value,reserve_won:$('pfReserve').value,opening_debt_won:$('pfDebt').value,receipt_delay_months:Number($('pfDelay').value),financing:state.financing.map(r=>({...r}))},projects:state.projects.map(p=>({...p,receipts:p.receipts.map(r=>({...r}))})),costs:state.costs.map(({uiId,...c})=>({...c,allocations:c.allocations.map(a=>({...a}))}))};
}
function renderResult(r){
 const title=r.can_simulate?'조합 허용은 미확정 · 비용 배분 가정 계산':'합산 현금 계산 보류';
 let h='<div class="pf-verdict '+(r.can_simulate?'pf-review':'pf-blocked')+'"><h3>'+title+'</h3><p>'+esc(r.reasons.join(' '))+'</p><p>'+esc(r.disclaimer)+'</p></div>';
 if(r.issues?.length)h+='<details open class="cf-method"><summary>충돌·보류·추가 확인 '+r.issues.length+'건</summary><ul>'+r.issues.map(i=>'<li><strong>'+esc({conflict:'충돌',hold:'보류',review:'검토 필요'}[i.severity])+'</strong> — '+esc(i.message)+'</li>').join('')+'</ul></details>';
 if(r.budgets){h+='<h3>사업별 입력·산식 근거</h3><div class="pf-budget-grid">'+r.budgets.map(b=>'<article class="pf-mini"><b>'+esc(b.id+' · '+b.label)+'</b><p>요청액 가정 '+money(b.support_assumption_won)+'<br>자부담 현금 '+money(b.own_cash_assumption_won)+'<br>현물(현금 제외) '+money(b.inkind_assumption_won)+'<br>현금 사업비 '+money(b.project_cash_won)+'<br>배분된 비용 '+money(b.allocated_cash_won)+'</p><small>'+esc(b.source_kind==='user_assumption'?'공식 금액·비율 미검증':'2026 참고 비율·원본 확인 필요')+'</small></article>').join('')+'</div>';}
 if(r.pairs?.length)h+='<h3>사업 쌍별 수행기간·제한</h3><div class="pf-budget-grid">'+r.pairs.map(p=>'<article class="pf-mini"><b>'+esc(p.a+' / '+p.b)+'</b><p>'+esc(p.overlap?'기간 겹침 '+p.overlap.start_date+' ~ '+p.overlap.end_date+' ('+p.overlap.days+'일)':'입력한 수행기간은 겹치지 않음')+'</p><p>'+esc(p.message)+'</p><small>병행 허용: 미확정</small></article>').join('')+'</div>';
 if(r.bilateral){
  const names={both_directions_partial:'양쪽 일부 조항 대조',one_direction_partial:'한쪽 일부 조항만 대조',both_sources_scope_pending:'양쪽 원문은 있으나 연도·대상 적용 보류',one_source_only:'한쪽 원문만 연결',no_direction_reviewed:'양쪽 원문 규칙 미연결',source_hold:'근거 변경·확인 실패'};
  h+='<section class="pf-bilateral"><h3>양방향 원문 검토표</h3><p class="cf-warning">A → B와 B → A를 따로 확인합니다. 2/2는 일부 조항의 방향별 대조 수이며, 병행 허용이나 전체 검토 완료가 아닙니다. 직접 입력 금액으로 바꾸어도 대응한 공고의 검사를 건너뛰지 않습니다.</p>';
  if(!r.bilateral.pairs.length)h+='<p>사업이 한 개입니다. 상대 사업을 추가하면 두 방향을 비교합니다.</p>';
  for(const pair of r.bilateral.pairs){
   h+='<article class="pf-pair"><h4>'+esc(pair.a+' ↔ '+pair.b)+' · '+esc(names[pair.coverage]||pair.coverage)+'</h4><p>부분 조항 대조 '+esc(pair.reviewed_directions)+'/2 · 병행 허용 미확정</p><div class="pf-directions">';
   for(const d of pair.directions){h+='<div class="pf-mini"><b>'+esc(d.from+' → '+d.to)+'</b><p>'+esc(d.message)+'</p>';
    if(d.source){h+='<small>2026 참고 · '+esc(d.source.locator)+'</small><p>'+(R.sourceURL(d.source.url)?'<a href="'+esc(d.source.url)+'" target="_blank" rel="noopener noreferrer">이 방향의 검토 원본 ↗</a>':'출처 확인 필요')+'</p><small class="pf-hash">SHA-256 '+esc(d.source.sha256)+'</small>';}
    else h+='<p class="cf-muted">미확인 방향입니다. 반대쪽 판단으로 대신하지 않습니다.</p>';
    h+='</div>';
   }
   h+='</div></article>';
  }
  h+='<p class="cf-muted">'+esc(r.bilateral.limitations.join(' '))+'</p></section>';
 }
 if(r.cost_totals)h+='<h3>비용 원금 검산</h3><p>유일한 비용 합계 <strong>'+money(r.cost_totals.unique_cash_cost_won)+'</strong> · 사업 배분 '+money(r.cost_totals.allocated_cash_won)+' · 회사 단독 '+money(r.cost_totals.company_only_cash_won)+'</p><div class="cf-table-wrap"><table class="cf-table"><caption>같은 비용은 한 번만 집계</caption><thead><tr><th>비용 ID</th><th>지급월</th><th>원금</th><th>사업 배분</th><th>회사 단독</th></tr></thead><tbody>'+r.ledger.map(c=>'<tr><td>'+esc(c.key)+'</td><td>'+esc(c.payment_month)+'</td><td>'+money(c.cost_won)+'</td><td>'+money(c.allocated_won)+'</td><td>'+money(c.company_only_won)+'</td></tr>').join('')+'</tbody></table></div>';
 if(r.scenarios){const names={no_grant:'지원금 없음',planned:'전부 선정·병행 가정',delayed:'전부 선정·지연 가정'};h+='<h3>조건부 합산 현금흐름 · 확보액 아님</h3><p class="cf-warning">공식 병행 허용·비용 인정이 확인되지 않은 조합입니다. 아래 숫자는 산식 비교만을 위한 가정이며, 이를 근거로 지출·대출을 실행하지 마십시오.</p><div class="pf-budget-grid">'+r.scenarios.map(s=>'<article class="pf-mini"><b>'+names[s.key]+'</b><p>최저 가용 현금<br><strong>'+money(s.summary.lowest_general_won)+'</strong></p><p>목표잔액까지 최대 부족액 '+money(s.summary.peak_reserve_gap_won)+'<br>첫 음수 월 '+esc(s.summary.first_negative_month||'없음')+'<br>기간 이후 지급 '+money(s.summary.grant_after_horizon_won)+'</p></article>').join('')+'</div>';
 for(const s of r.scenarios)h+='<details class="cf-method"><summary>'+names[s.key]+' · 월별 상세</summary><div class="cf-table-wrap"><table class="cf-table"><caption>원 단위 월말 모형 · 월중 부족은 미계산</caption><thead><tr><th>월</th><th>운영비</th><th>유일 비용</th><th>수령 가정</th><th>사용 가정</th><th>가용잔액</th><th>제한잔액</th></tr></thead><tbody>'+s.rows.map(t=>'<tr><td>'+esc(t.month)+'</td><td>'+money(t.operating_won)+'</td><td>'+money(t.unique_cost_won)+'</td><td>'+money(t.grant_received_won)+'</td><td>'+money(t.grant_used_won)+'</td><td>'+money(t.general_closing_won)+'</td><td>'+money(t.restricted_closing_won)+'</td></tr>').join('')+'</tbody></table></div><p>종료 시 미상환 차입원금 '+money(s.summary.ending_debt_won)+'</p></details>';
 }
 if(r.evidence){
  const ev=r.evidence;
  h+='<h3>2026 원문 제한·비용 증빙 대조</h3><p class="cf-warning">아래는 기존 두 초기창업 공고의 부분 검사입니다. 양방향 검토표와 함께 보십시오. 예외 전체·2027 조건·실제 비용 인정은 미확정입니다.</p>';
  if(ev.checks.length)h+='<div class="pf-budget-grid">'+ev.checks.map(v=>'<article class="pf-mini"><b>'+esc(v.from+' → '+v.to)+'</b><p>'+esc(v.message)+'</p><small>'+esc(v.source.locator)+'</small><p>'+(R.sourceURL(v.source.url)?'<a href="'+esc(v.source.url)+'" target="_blank" rel="noopener noreferrer">검토한 2026 원본 ↗</a>':'원본 URL 확인 필요')+'</p></article>').join('')+'</div>';
  if(ev.salary_checks.length)h+='<div class="cf-table-wrap"><table class="cf-table"><caption>현금 급여 원금 대조 · 법정 인건비계상률 아님</caption><thead><tr><th>익명 인력 / 월</th><th>급여 원금</th><th>이번 배분</th><th>다른 사업</th><th>미청구 잔액</th></tr></thead><tbody>'+ev.salary_checks.map(v=>'<tr><td>'+esc(v.person_code+' / '+v.month)+'</td><td>'+money(v.salary_basis_won)+'</td><td>'+money(v.current_claimed_won)+'</td><td>'+money(v.other_claimed_won)+'</td><td>'+money(v.remaining_unclaimed_won)+'</td></tr>').join('')+'</tbody></table></div>';
  h+='<details class="cf-method"><summary>비용별 증빙 준비 제안 · 공식 필수서류 목록 아님</summary>'+ev.cost_checks.map(v=>'<article class="pf-mini"><b>'+esc(v.key)+' · '+esc({unknown:'증빙 미확인',planned:'준비 예정',held:'보유 자체입력 · 미검증'}[v.proof_status])+'</b><ul>'+v.checklist.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></article>').join('')+'</details><p class="cf-muted">'+esc(ev.limitations.join(' '))+'</p>';
 }
 if(r.questions)h+='<h3>담당기관에 확인할 질문</h3><ol>'+r.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ol>';
 $('pfResult').innerHTML=h;$('pfResultActions').hidden=!r.can_export;
}
function run(){
 if(!state.ready)return;try{const input=readInput(),r=C.review(input,ctx());state.result={input,result:r};state.stamp=JSON.stringify(input);renderResult(r);$('pfMessage').textContent=r.can_simulate?'비용 배분 모형 계산 완료 · 병행 허용은 미확정':'충돌·보류 항목을 확인하십시오.';}catch(e){invalidate(e.message);}
}
function current(){
 if(!state.result||!state.ready)return null;
 try{const input=readInput();if(JSON.stringify(input)!==state.stamp){invalidate('입력이 변경되어 저장을 막았습니다. 다시 검토하십시오.');return null;}const result=C.review(input,ctx());if(!result.can_export){invalidate('근거 확인이 변경·만료되었습니다. 공개 근거를 다시 읽고 검토하십시오.');return null;}state.result={input,result};return state.result;}catch(e){invalidate(e.message);return null;}
}
function download(content,type,name){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);$('pfExportWarning').hidden=false;}
function resetForm(){
 for(const [id,value] of Object.entries({pfYear:'2027',pfPhase:'execution',pfStart:'2027-01',pfMonths:'12',pfOpening:'',pfRevenue:'0',pfOperating:'',pfReserve:'0',pfDebt:'0',pfDelay:'2'}))$(id).value=value;
 for(const id of ['pfReferenceAck','pfCombinationAck','pfCostAck'])$(id).checked=false;
 state.projectNext=1;state.costNext=1;state.projects=[newProject()];state.costs=[newCost()];state.financing=[];renderProjects();renderCosts();renderFinancing();$('pfDemoNotice').hidden=true;$('pfMessage').textContent='';invalidate('입력과 결과를 지웠습니다.');
}
function demo(){
 resetForm();for(const [id,v] of Object.entries({pfMonths:'6',pfOpening:'10000000',pfOperating:'1000000'}))$(id).value=v;
 for(const id of ['pfReferenceAck','pfCombinationAck','pfCostAck'])$(id).checked=true;
 state.projects=[{id:'P1',route_id:'early-general',scenario_id:'nonpreferred',category:'startup',start_date:'2027-01-01',end_date:'2027-06-30',support_won:'7000000',inkind_won:'0',own_cash_won:'',region_confirmed:true,receipts:[{month:'2027-05',won:'7000000'}]},{id:'P2',route_id:'manual',scenario_id:'manual',category:'rd',start_date:'2027-01-01',end_date:'2027-06-30',support_won:'5000000',inkind_won:'0',own_cash_won:'2000000',region_confirmed:false,receipts:[{month:'2027-06',won:'5000000'}]}];state.projectNext=3;
 state.costs=[{uiId:'C1',key:'C1',category:'cloud',start_date:'2027-01-01',end_date:'2027-01-31',payment_month:'2027-01',amount_won:'10000000',eligibility:'assumed',allocations:[{project_id:'P1',won:'6000000'},{project_id:'P2',won:'4000000'}]},{uiId:'C2',key:'C2',category:'outsourcing',start_date:'2027-02-01',end_date:'2027-02-28',payment_month:'2027-02',amount_won:'7000000',eligibility:'assumed',allocations:[{project_id:'P1',won:'4000000'},{project_id:'P2',won:'3000000'}]}];state.costNext=3;
 for(const p of state.projects){p.notice_code=p.route_id==='manual'?'other-rd':p.route_id;p.award_year='2027';p.selection_status='planned';}for(const c of state.costs){c.economic_key='BILL_'+c.key;c.proof_status='planned';c.labor=null;}
 renderProjects();renderCosts();$('pfDemoNotice').hidden=false;invalidate('가상 예시를 채웠습니다. 계산 전 모든 사업의 선정·병행 가정과 비용 배분을 확인하십시오.');
}
async function load(){
 state.ready=false;$('pfRun').disabled=true;$('pfDemo').disabled=true;$('pfAddProject').disabled=true;$('pfAddCost').disabled=true;$('pfAddFinance').disabled=true;invalidate('공개 근거를 다시 읽습니다. 입력은 외부로 전송하지 않습니다.');
 try{const stamp=Date.now(),names=['startup_routes','programs','startup_sources'];const values=await Promise.all(names.map(async n=>{const r=await fetch('data/'+n+'.json?v='+stamp,{cache:'no-store'});if(!r.ok)throw new Error('자료 HTTP 실패');return r.json();}));const [routes,programs,sources]=values;if(routes.schema!=='public-startup-preparation/v1'||!Array.isArray(routes.records)||programs.schema!=='public-funding-radar/v1'||sources.schema!=='public-startup-source-checks/v1')throw new Error('자료 형식 불일치');state.data={routes,programs,sources};state.ready=true;$('pfStatus').textContent='공개 근거를 읽었습니다. 2027 확정 조합은 없으며, 직접 입력 사업은 미검증 가정입니다.';if(!state.projects.length)resetForm();else{sync();renderProjects();renderCosts();}$('pfRun').disabled=false;$('pfDemo').disabled=false;$('pfAddFinance').disabled=false;
 }catch(e){$('pfStatus').textContent='자료 확인 실패 · 계산 및 저장 중단: '+e.message;}
}
$('pfForm').addEventListener('submit',e=>e.preventDefault());
for(const t of ['input','change'])$('pfForm').addEventListener(t,()=>invalidate('입력이 바뀌었습니다. 다시 검토하십시오.'));
$('pfReload').addEventListener('click',load);$('pfDemo').addEventListener('click',demo);$('pfClear').addEventListener('click',resetForm);$('pfRun').addEventListener('click',run);
$('pfAddProject').addEventListener('click',()=>{if(!state.ready||state.projects.length>=3)return;sync();state.projects.push(newProject());renderProjects();renderCosts();invalidate('사업을 추가했습니다. 기존 비용의 배분과 새 사업비를 확인하십시오.');});
$('pfAddCost').addEventListener('click',()=>{if(!state.ready||state.costs.length>=60)return;sync();state.costs.push(newCost());renderCosts();invalidate('비용을 추가했습니다. 다시 검토하십시오.');});
$('pfAddFinance').addEventListener('click',()=>{if(!state.ready||state.financing.length>=48)return;sync();state.financing.push({month:$('pfStart').value,kind:'equity',won:''});renderFinancing();invalidate('추가 자금이 바뀌었습니다. 다시 검토하십시오.');});
$('pfExport').addEventListener('click',()=>{const r=current();if(r)download(JSON.stringify({schema:'private-portfolio-plan-export/v1',created_at:new Date().toISOString(),...r},null,2),'application/json','Private_Portfolio_Review.json');});
$('pfQuestions').addEventListener('click',()=>{const r=current();if(r)download('사업 조합 담당기관 확인 질문\n병행 허용·적격성은 미확정입니다.\n\n'+r.result.questions.map((q,i)=>(i+1)+'. '+q).join('\n\n'),'text/plain;charset=utf-8','Portfolio_Agency_Questions.txt');});
load();
})();
