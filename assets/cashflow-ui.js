/* Static public GETs only. User amounts and schedules remain in page memory. */
(function(){
'use strict';
const $=id=>document.getElementById(id),C=window.RadarCore,S=window.StartupCore,F=window.CashflowCore,E=C.esc;
let catalog=null,programs=null,sources=null,last=null,gridMonths=[],layoutKey='',financeIds=[],nextFinance=0,alternatives=[];
const ctx=()=>({programs,sources,now:new Date()});
const route=()=>catalog?.records.find(r=>r.id===$('cfRoute').value);
const money=v=>BigInt(v).toLocaleString('ko-KR')+'원';
const small=v=>BigInt(v).toLocaleString('ko-KR');
const notify=t=>{$('cfInputMessage').textContent=t;};
const selectedKey=()=>JSON.stringify([$('cfStart').value,$('cfMonths').value]);
function invalidate(message='입력 또는 근거가 바뀌었습니다. 다시 계산하십시오.'){
 last=null;$('cfResultActions').hidden=true;$('cfExportWarning').hidden=true;$('cfResult').innerHTML='<div class="assessment-empty">'+E(message)+'</div>';
}
function sourceKey(r){return JSON.stringify({id:r.id,source:r.source,reviewed_at:r.reviewed_at,scenarios:r.scenarios,program_snapshot:r.program_snapshot});}
function financeInput(){return {support_won:$('cfSupport').value,inkind_won:$('cfInkind').value,reference_ack:$('cfReferenceAck').checked,region_confirmed:$('cfRegionAck').checked};}
function estimate(){const r=route();if(!r)throw new Error('참고 경로를 선택하십시오.');const v=F.financeEstimate(r,$('cfScenario').value,financeInput(),ctx());if(v.code!=='historical_assumption')throw new Error(v.reasons.join(' '));return v;}
function requireGrid(){if(!gridMonths.length||layoutKey!==selectedKey())throw new Error('분석 기간이 바뀌었습니다. 「기간 적용·일정표 초기화」 후 일정을 다시 입력하십시오.');}
function newGrid(){
 try{
  const first=F.monthIndex($('cfStart').value),n=Number($('cfMonths').value);if(!Number.isInteger(n)||n<1||n>24)throw new Error('분석 기간은 1~24개월입니다.');
  gridMonths=Array.from({length:n},(_,i)=>F.monthString(first+i));layoutKey=selectedKey();
  $('cfSchedule').innerHTML=gridMonths.map((m,i)=>'<tr><th scope="row">'+E(m)+'</th><td><label class="sr-only" for="cfExpense'+i+'">'+E(m)+' 사업비 현금 지출</label><input id="cfExpense'+i+'" type="text" inputmode="numeric" maxlength="13" value="0"></td><td><label class="sr-only" for="cfGrant'+i+'">'+E(m)+' 지원금 입금 가정</label><input id="cfGrant'+i+'" type="text" inputmode="numeric" maxlength="13" value="0"></td></tr>').join('');
  // Assign values explicitly for consistent reset behavior and testability.
  gridMonths.forEach((m,i)=>{$('cfExpense'+i).value='0';$('cfGrant'+i).value='0';});
  $('cfAfterMonth').value='';$('cfAfterAmount').value='0';financeIds=[];$('cfFinancing').innerHTML='';
  invalidate();notify('월별 표와 추가 자금 일정을 초기화했습니다. 기존 금액은 제거됐습니다.');
 }catch(e){notify(e.message);invalidate();}
}
function showScenario(){
 const r=route(),s=r?.scenarios.find(x=>x.id===$('cfScenario').value);
 $('cfCap').textContent=s?'2026 참고 상한 '+money(String(s.max_support_won))+' · 확정 수령액 아님':'지역·단계를 확인한 뒤 선택하십시오.';
 $('cfRegionRow').hidden=r?.stage==='pre';invalidate();
}
function showRoute(){
 const r=route();invalidate();if(!r)return;
 $('cfScenario').innerHTML=(r.stage==='pre'?'':'<option value="">지역 확인 후 선택</option>')+r.scenarios.map(s=>'<option value="'+E(s.id)+'">'+E(s.label)+'</option>').join('');
 $('cfScenario').value=r.stage==='pre'?r.scenarios[0].id:'';$('cfScenario').disabled=false;
 $('cfReferenceAck').checked=false;$('cfRegionAck').checked=false;
 const url=C.sourceURL(r.source.url),holds=S.gate(r,ctx());
 $('cfSource').innerHTML='<strong>'+E(r.label)+' · 2026 종료 공고</strong><p>'+(url?'<a href="'+E(url)+'" target="_blank" rel="noopener noreferrer">검토한 원본 ↗</a>':'원본 URL 확인 필요')+' · '+E(r.source.locator)+'</p><p>원본 마지막 성공 확인: '+E(sources.records[r.id]?.last_success_at||'미확인')+'</p>'+(holds.length?'<p class="cf-error">'+holds.map(E).join('<br>')+'</p>':'')+'<p>신청 자격·2027 조건·사업 간 병행 여부는 이 계산으로 승인하지 않습니다.</p>';
 showScenario();
}
function applyEven(){
 try{requireGrid();const e=estimate(),total=String(BigInt(e.amounts.support_won)+BigInt(e.amounts.own_cash_won));const rows=F.evenSchedule(total,$('cfSpendStart').value,Number($('cfSpendCount').value));if(rows.some(r=>!gridMonths.includes(r.month)))throw new Error('균등 집행 기간을 분석 기간 안에 두십시오.');gridMonths.forEach((m,i)=>{$('cfExpense'+i).value=rows.find(r=>r.month===m)?.won||'0';});$('cfBudgetHint').textContent='배분한 사업비 현금 '+money(total)+' = 지원액 '+money(e.amounts.support_won)+' + 자부담 현금 '+money(e.amounts.own_cash_won)+'. 현물 '+money(e.amounts.inkind_used_won)+'은 현금에서 제외했습니다.';invalidate();notify('사업비 현금 지출만 균등 배분했습니다. 지급 일정은 별도로 입력하십시오.');}catch(e){notify(e.message);invalidate();}
}
function onePayment(){
 try{requireGrid();const e=estimate(),m=$('cfPayMonth').value,index=F.monthIndex(m),start=F.monthIndex(gridMonths[0]),end=F.monthIndex(gridMonths.at(-1));if(index<start||index>end+24)throw new Error('지급 가정 월은 시작월부터 분석 종료 후 24개월 이내여야 합니다.');gridMonths.forEach((x,i)=>{$('cfGrant'+i).value=x===m?e.amounts.support_won:'0';});$('cfAfterMonth').value=index>end?m:'';$('cfAfterAmount').value=index>end?e.amounts.support_won:'0';invalidate();notify('일괄 지급 가정을 적용했습니다. 기존 지급 배분을 교체했으며 실제 지급 조건은 아닙니다.');}catch(e){notify(e.message);invalidate();}
}
function financingValues(){return financeIds.map(id=>({month:$('cfFinMonth'+id).value,kind:$('cfFinKind'+id).value,won:$('cfFinAmount'+id).value}));}
const kindLabels={equity:'투자금 유입',loan:'차입금 유입',principal:'대출 원금 상환',interest:'이자 지급',extra_cost:'별도 현금 지출',extra_revenue:'추가 매출 입금'};
function drawFinancing(rows){
 financeIds=rows.map(()=>nextFinance++);
 $('cfFinancing').innerHTML=rows.map((r,i)=>{const id=financeIds[i];return '<div class="cf-finance-row"><label for="cfFinMonth'+id+'">월<input id="cfFinMonth'+id+'" type="month" value="'+E(r.month)+'"></label><label for="cfFinKind'+id+'">유형<select id="cfFinKind'+id+'">'+Object.entries(kindLabels).map(([k,v])=>'<option value="'+k+'"'+(k===r.kind?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label for="cfFinAmount'+id+'">금액 · 원<input id="cfFinAmount'+id+'" type="text" inputmode="numeric" maxlength="13" value="'+E(r.won)+'"></label><button type="button" class="btn btn-secondary" id="cfFinRemove'+id+'">행 제거</button></div>';}).join('');
 financeIds.forEach((id,i)=>{$('cfFinMonth'+id).value=rows[i].month;$('cfFinKind'+id).value=rows[i].kind;$('cfFinAmount'+id).value=rows[i].won;$('cfFinRemove'+id).addEventListener('click',()=>{const values=financingValues();drawFinancing(values.filter((_,j)=>j!==i));invalidate();});});
}
function addFinance(){try{requireGrid();const rows=financingValues();if(rows.length>=48)throw new Error('추가 일정은 최대 48행입니다.');rows.push({month:gridMonths[0],kind:'equity',won:'0'});drawFinancing(rows);invalidate();}catch(e){notify(e.message);}}
function snapshot(){
 requireGrid();
 const receipts=gridMonths.map((m,i)=>({month:m,won:$('cfGrant'+i).value}));
 if($('cfAfterAmount').value!=='0'){
  if(F.monthIndex($('cfAfterMonth').value)<=F.monthIndex(gridMonths.at(-1)))throw new Error('기간 이후 지급 칸에는 분석 종료 이후 월을 입력하십시오.');
  receipts.push({month:$('cfAfterMonth').value,won:$('cfAfterAmount').value});
 }
 return {route_id:$('cfRoute').value,scenario_id:$('cfScenario').value,finance:financeInput(),plan:{start_month:$('cfStart').value,months:Number($('cfMonths').value),opening_cash_won:$('cfOpening').value,monthly_revenue_won:$('cfRevenue').value,monthly_operating_won:$('cfOperating').value,reserve_won:$('cfReserve').value,opening_debt_won:$('cfDebt').value,receipt_delay_months:Number($('cfDelay').value),budget_separated_ack:$('cfBudgetAck').checked,cash_model_ack:$('cfModelAck').checked,spending:gridMonths.map((m,i)=>({month:m,won:$('cfExpense'+i).value})),receipts,financing:financingValues()},controls:{spend_start:$('cfSpendStart').value,spend_count:$('cfSpendCount').value,pay_month:$('cfPayMonth').value,after_month:$('cfAfterMonth').value,after_amount:$('cfAfterAmount').value}};
}
const names={no_grant:'지원금 없음 · 동일 지출',planned:'지원금 유입 가정',delayed:'지원금 지연 가정'};
function first(v){return v==='opening'?'시작 시점':v||'기간 내 없음';}
function table(s){
 return '<details class="cf-result-details"><summary>'+names[s.key]+' · 월별 원장</summary><p>가용 잔액은 제한된 지원금을 제외한 모델상 현금입니다. 지원금 사용은 법적 비용 인정이 아닌 비례 환입 가정입니다.</p><div class="cf-table-wrap"><table class="cf-table"><caption>'+names[s.key]+' · 모든 금액 원</caption><thead><tr>'+['월','매출 입금','투자 유입','차입 유입','지원금 수령','지원금 사용/환입','운영·추가 지출','사업비 현금 지출','원금·이자 상환','가용 잔액','제한 지원금','차입원금 잔액'].map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(r=>'<tr><th scope="row">'+E(r.month)+'</th>'+[r.revenue_won,r.equity_won,r.loan_won,r.grant_received_won,r.grant_used_won,String(BigInt(r.operating_won)+BigInt(r.extra_cost_won)),r.project_cash_won,String(BigInt(r.principal_won)+BigInt(r.interest_won)),r.general_closing_won,r.restricted_closing_won,r.debt_closing_won].map(v=>'<td'+(BigInt(v)<0n?' class="cf-negative"':'')+'>'+E(small(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
}
function renderResult(v){
 const a=v.estimate.amounts;
 const cards=v.scenarios.map(s=>{const q=s.summary;return '<article class="cf-card"><h3>'+names[s.key]+(s.key==='delayed'?' · '+s.delay_months+'개월':'')+'</h3><span class="cf-label">목표 가용잔액까지 최대 부족액</span><strong class="cf-number">'+E(money(q.peak_reserve_gap_won))+'</strong><dl>'+[['잔액 0원 미만 첫 시점',first(q.first_negative_month)],['0원 유지 추가 초기현금',money(q.minimum_extra_opening_cash_won)],['기말 가용현금',money(q.ending_general_won)],['기말 제한 지원금',money(q.ending_restricted_won)],['기말 차입원금',money(q.ending_debt_won)],['기간 밖 지급 가정액',money(q.grant_after_horizon_won)]].map(([k,x])=>'<div><dt>'+E(k)+'</dt><dd>'+E(x)+'</dd></div>').join('')+'</dl></article>';}).join('');
 $('cfResult').innerHTML='<p class="cf-warning"><strong>가정 계산 · 지급 및 적격성 미확정</strong><br>'+E(F.DISCLAIMER)+'</p><p class="cf-form-note">사업비 현금 '+E(money(v.project_cash_total_won))+' = 요청액 '+E(money(a.support_won))+' + 자기 현금 '+E(money(a.own_cash_won))+'. 현물 '+E(money(a.inkind_used_won))+'은 현금 합계에서 제외했습니다.</p><div class="cf-cards">'+cards+'</div><p class="cf-muted">최대 부족액은 매달 부족액을 더한 값이 아닙니다. 해당 가정에서 시작 시점에 추가로 확보해야 할 현금의 월말 기준 최대치입니다. 월중 선지출은 더 클 수 있습니다.</p>'+v.scenarios.map(table).join('')+'<details class="cf-result-details"><summary>가정·해석 제한</summary>'+v.reasons.map(x=>'<p>'+E(x)+'</p>').join('')+'</details>';
}
function run(){
 invalidate();
 try{const input=snapshot(),r=route();const calculation=F.evaluate(r,input.scenario_id,input.finance,input.plan,ctx());if(calculation.code!=='calculated_assumption')throw new Error(calculation.reasons.join(' '));last={schema:'private-cashflow-plan-export/v1',at:new Date().toISOString(),input,source_key:sourceKey(r),calculation};renderResult(calculation);$('cfResultActions').hidden=false;$('cfExportWarning').hidden=false;notify('3개 가정을 계산했습니다. 선정·동시수행 허용 판정은 하지 않았습니다.');}catch(e){$('cfResult').innerHTML='<p class="cf-error">계산 보류: '+E(e.message)+'</p>';notify('입력 또는 근거를 확인하십시오.');}
}
function currentIsValid(){
 try{if(!last||JSON.stringify(last.input)!==JSON.stringify(snapshot())||last.source_key!==sourceKey(route())||S.gate(route(),ctx()).length)return false;const v=F.evaluate(route(),last.input.scenario_id,last.input.finance,last.input.plan,ctx());return v.code==='calculated_assumption';}catch{return false;}
}
function showAlternatives(){
 if(!alternatives.length){$('cfAlternatives').innerHTML='<p class="cf-muted">아직 보관한 대안이 없습니다.</p>';return;}
 $('cfAlternatives').innerHTML='<div class="cf-table-wrap"><table class="cf-table cf-compare"><caption>독립 대안 비교 · 합산 또는 선정 순위 아님</caption><thead><tr><th>대안·분석기간</th><th>요청액 가정</th><th>지원금 없음 최대 부족</th><th>가정 일정 최대 부족</th><th>지연 시 최대 부족</th></tr></thead><tbody>'+alternatives.map((x,i)=>{
  const r=catalog?.records.find(r=>r.id===x.input.route_id),valid=r&&sourceKey(r)===x.source_key&&!S.gate(r,ctx()).length;
  if(!valid)return '<tr><th>대안 '+(i+1)+'</th><td colspan="4">근거가 달라졌거나 확인에 실패했습니다. 다시 계산 필요</td></tr>';
  const q=x.calculation;return '<tr><th>대안 '+(i+1)+' · '+E(r.label)+'<br>'+E(x.input.plan.start_month)+'부터 '+x.input.plan.months+'개월</th><td>'+E(money(q.estimate.amounts.support_won))+'</td>'+q.scenarios.map(s=>'<td>'+E(money(s.summary.peak_reserve_gap_won))+'</td>').join('')+'</tr>';
 }).join('')+'</tbody></table></div>';
}
function keep(){
 if(!currentIsValid()){invalidate();notify('현재 입력과 근거로 다시 계산한 뒤 보관하십시오.');return;}
 if(alternatives.length>=3){notify('최대 3개 대안입니다. 보관 대안을 지운 뒤 다시 추가하십시오.');return;}
 if(alternatives.some(x=>JSON.stringify(x.input)===JSON.stringify(last.input))){notify('동일한 가정이 이미 보관되어 있습니다.');return;}
 alternatives.push(JSON.parse(JSON.stringify(last)));showAlternatives();notify('독립 대안을 이 화면 메모리에만 보관했습니다.');
}
function save(){
 if(!currentIsValid()){invalidate();notify('입력·근거가 바뀌어 저장을 중단했습니다. 다시 계산하십시오.');return;}
 const u=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='AI_Funding_Private_Cashflow_Assumption.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),500);
}
function clear(){
 for(const id of ['cfOpening','cfOperating','cfSupport','cfPayMonth'])$(id).value='';
 for(const id of ['cfInkind','cfRevenue','cfReserve','cfDebt'])$(id).value='0';
 $('cfStart').value='2027-01';$('cfMonths').value='12';$('cfDelay').value='2';$('cfSpendStart').value='2027-01';$('cfSpendCount').value='6';
 for(const id of ['cfBudgetAck','cfModelAck','cfReferenceAck','cfRegionAck'])$(id).checked=false;
 alternatives=[];showAlternatives();newGrid();if(route())showRoute();$('cfExampleNotice').hidden=true;notify('입력·결과·보관 대안을 지웠습니다.');
}
function demo(){
 if(!catalog)return;clear();$('cfRoute').value='pre';showRoute();$('cfReferenceAck').checked=true;$('cfSupport').value='20000000';$('cfInkind').value='0';$('cfOpening').value='10000000';$('cfOperating').value='2000000';$('cfRevenue').value='1000000';$('cfMonths').value='6';$('cfSpendCount').value='4';$('cfBudgetAck').checked=true;$('cfModelAck').checked=true;$('cfPayMonth').value='2027-05';newGrid();applyEven();onePayment();$('cfExampleNotice').hidden=false;notify('가상 예시를 채웠습니다. 실제 회사 금액·일정이 아닙니다. 계산 버튼으로 확인하십시오.');
}
async function load(){
 invalidate();for(const id of ['cfRun','cfRoute','cfEven','cfOnePayment','cfDemo','cfReload'])$(id).disabled=true;$('cfStatus').textContent='공개 근거를 다시 읽고 있습니다.';
 try{
  const payload=await Promise.all(['data/startup_routes.json','data/programs.json','data/startup_sources.json'].map(async path=>{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('공개 데이터 연결 실패');return r.json();}));
  if(payload[0].schema!=='public-startup-preparation/v1'||payload[0].version!=='0.6.0'||payload[0].scope!=='historical_preparation_only'||!Array.isArray(payload[0].records)||!payload[0].records.length||payload[1].schema!=='public-funding-radar/v1'||payload[2].schema!=='public-startup-source-checks/v1')throw new Error('공개 데이터 형식 불일치');
  [catalog,programs,sources]=payload;for(const r of catalog.records)if(!r.id||!r.source||!Array.isArray(r.scenarios)||!r.scenarios.length)throw new Error('참고 경로 형식 불일치');
  $('cfRoute').innerHTML=catalog.records.map(r=>'<option value="'+E(r.id)+'">'+E(r.label)+'</option>').join('');$('cfRoute').value=catalog.records[0].id;
  const held=catalog.records.filter(r=>S.gate(r,ctx()).length).length;
  $('cfStatus').textContent='2026 참고 경로 '+catalog.records.length+'개 · 근거 보류 '+held+'개. 2027 확정 조건·실제 지급 일정은 아닙니다.';
  for(const id of ['cfRun','cfRoute','cfEven','cfOnePayment','cfDemo'])$(id).disabled=false;showRoute();showAlternatives();
 }catch(e){catalog=null;programs=null;sources=null;$('cfStatus').textContent='자료 확인 실패: '+e.message;$('cfScenario').disabled=true;$('cfSource').textContent='이전 근거로 계산하지 않습니다.';showAlternatives();}
 finally{$('cfReload').disabled=false;}
}
$('cfForm').addEventListener('submit',e=>e.preventDefault());
$('cfForm').addEventListener('input',()=>invalidate());$('cfForm').addEventListener('change',()=>invalidate());
$('cfRoute').addEventListener('change',showRoute);$('cfScenario').addEventListener('change',showScenario);
for(const [id,fn] of Object.entries({cfNewGrid:newGrid,cfEven:applyEven,cfOnePayment:onePayment,cfAddFinance:addFinance,cfRun:run,cfKeep:keep,cfExport:save,cfClear:clear,cfDemo:demo,cfReload:load,cfClearAlternatives:()=>{alternatives=[];showAlternatives();}}))$(id).addEventListener('click',fn);
newGrid();load();
})();
