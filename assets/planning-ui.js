/* Public GETs only; all scenario inputs remain in page memory. */
(function(){
'use strict';
const $=id=>document.getElementById(id), C=window.RadarCore, P=window.PlanningCore;
const esc=C.esc, state={data:null,report:null,generation:0};
const budgetIDs=['supportWon','inkindWon','extraCashWon','availableCashWon'];
const paths={programs:['programs.json','public-funding-radar/v1'],rules:['funding_rules.json','public-funding-planning/v1'],attachments:['attachments.json','public-funding-attachments/v1'],evidence:['evidence.json','public-funding-evidence/v1'],reviews:['change_reviews.json','public-funding-reviews/v1']};
const labels={calculated_assumption:'공고상 비율 계산 · 사용자 가정',limited_no_conflict:'검토 조항에서만 충돌 미발견',conflict:'검토 조항과 충돌',hold:'확인 보류',invalid:'입력 오류',unknown:'미확인',exception_review:'예외 증빙 확인 필요',not_triggered:'해당 조항 미발동'};
function invalidate(text='입력이 바뀌었습니다. 다시 점검하십시오.'){
 state.report=null;$('planExport').hidden=true;$('planExportWarning').hidden=true;
 $('planResult').innerHTML='<div class="assessment-empty">'+esc(text)+'</div>';
}
function chosen(){return state.data?.rules.records.find(r=>r.id===$('planChoice').value)||null;}
function context(rule){return {program:state.data?.programs.items.find(p=>p.id===rule?.program_id),attachments:state.data?.attachments,evidence:state.data?.evidence,reviews:state.data?.reviews,now:new Date()};}
function money(value){return value===null?'미입력 · 판단 보류':new Intl.NumberFormat('ko-KR').format(BigInt(value))+'원';}
function lines(values){return '<ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';}
function summary(){
 const r=chosen();invalidate('금액·수행사업 조건을 입력한 뒤 점검하십시오.');
 if(!r){$('ruleSummary').innerHTML='';$('planRun').disabled=true;return;}
 const gate=P.sourceGate(r,context(r));$('planRun').disabled=false;
 const needed=new Set(r.restrictions.flatMap(q=>[q.field,q.exception_field].filter(Boolean)));
 for(const key of Object.keys(P.FIELDS))$('row_'+key).hidden=!needed.has(key);
 $('moneyFields').hidden=!r.finance;$('restrictionFields').hidden=!r.restrictions.length;
 const url=C.sourceURL(r.evidence.url),f=r.finance;
 $('ruleSummary').innerHTML='<article class="planning-rule"><span class="tag '+(gate.length?'s-gold':'s-green')+'">'+(gate.length?'근거·범위 확인 보류':'선택 조항의 원문 대조 완료')+'</span><h3>'+esc(r.label)+'</h3>'+
 (f?'<p>일반 연간 한도 <b>'+esc(money(String(f.max_support_won)))+'</b> · 정부 최대 '+f.government_max_bps/100+'% · 현금 최소 '+f.cash_min_bps/100+'% · 현물 최대 '+f.inkind_max_bps/100+'% (모두 총사업비 기준)</p>':'<p>이 항목에는 검토된 수령액·자부담 계산식이 없습니다.</p>')+
 '<details open><summary>적용 범위와 미확인 사항</summary>'+lines(r.notes)+lines(r.open_questions)+'</details>'+
 '<details><summary>원문 지문·위치</summary><p>PDF '+esc(r.evidence.pages.join(', '))+'쪽 · '+esc(r.evidence.reviewed_at)+'</p><code>'+esc(r.evidence.sha256)+'</code><p>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">공식 첨부 원본 ↗</a>':'원문 주소 확인 필요')+'</p></details>'+
 (gate.length?'<div class="pending-questions">'+lines(gate)+'</div>':'')+'</article>';
}
function readBudget(){return {support_won:$('supportWon').value.trim(),inkind_won:$('inkindWon').value.trim(),extra_cash_won:$('extraCashWon').value.trim(),available_cash_won:$('availableCashWon').value.trim()};}
function readFacts(rule){
 const out={},needed=new Set(rule.restrictions.flatMap(q=>[q.field,q.exception_field].filter(Boolean)));
 for(const key of needed){const value=$(key).value;if(value==='')continue;out[key]=key==='ibk_centres'?Number(value):value==='true'?true:value==='false'?false:value;}
 return out;
}
function renderBudget(result){
 if(!result)return '';
 let out='<section class="planning-block"><h3>'+esc(labels[result.code]||result.code)+'</h3>'+lines(result.reasons);
 if(result.amounts){
  const a=result.amounts;
  const rows=[['요청 바우처 액면 (수령 확정 아님)',a.support_won],['최대 지원비율로 역산한 최소 총사업비',a.total_minimum_won],['기업부담 총액 (현금 + 현물)',a.own_total_won],['표에 따른 최소 현금 하한',a.minimum_cash_won],['반영한 현물 (인정 가정)',a.inkind_used_won],['가정 현물을 반영한 실제 필요 자부담 현금',a.own_cash_won],['별도 운영·선지출 현금 (사용자 가정)',a.extra_cash_won],['자부담 + 별도 현금 필요액',a.cash_need_won],['가용 자기 현금',a.available_cash_won],['계산상 현금 부족액',a.shortfall_won]];
  out+='<div class="money-table">'+rows.map(([l,v])=>'<div><span>'+esc(l)+'</span><b>'+esc(money(v))+'</b></div>').join('')+'</div><p class="plan-muted">미반영 현물 '+esc(money(a.unused_inkind_won))+' · '+esc(result.locator)+'</p>';
 }
 return out+'<p class="assessment-disclaimer">'+esc(result.disclaimer)+'</p></section>';
}
function renderRestrictions(result){
 let out='<section class="planning-block"><h3>'+esc(labels[result.code]||result.code)+'</h3>'+lines(result.reasons);
 for(const r of result.rows||[])out+='<div class="condition-row"><div><strong>'+esc(r.label)+'</strong><span class="tag '+(r.code==='conflict'?'s-gold':'s-gray')+'">'+esc(labels[r.code]||r.code)+'</span></div><p>'+esc(r.reason)+'</p><small>'+esc(r.locator)+'</small></div>';
 return out+'<p class="assessment-disclaimer">'+esc(result.disclaimer)+'</p></section>';
}
function run(){
 const rule=chosen();if(!rule||!state.data)return;
 const facts=readFacts(rule),budget=rule.finance?readBudget():null,ctx=context(rule);
 const b=budget?P.estimate(rule,budget,ctx):null,r=P.restrictions(rule,facts,ctx);
 state.report={schema:'private-local-funding-scenario/v1',engine_version:P.VERSION,evaluated_at:ctx.now.toISOString(),rule_id:rule.id,rule_fingerprint:rule.rule_fingerprint,source_evidence:rule.evidence,private_local_input:{budget,facts},budget_result:b,restriction_result:r,warning:'사용자가 입력한 금액·수행사업 정보입니다. 공개 저장소 업로드 금지. 선정·교부·병행 허용 결과 아님.'};
 $('planResult').innerHTML=renderRestrictions(r)+renderBudget(b);$('planExport').hidden=false;$('planExportWarning').hidden=false;
}
async function load(){
 const generation=++state.generation;state.data=null;invalidate('공개 근거를 다시 읽고 있습니다.');$('planRun').disabled=true;$('planChoice').disabled=true;$('planLoadStatus').textContent='원문·첨부·변경 기록을 함께 읽고 있습니다.';
 try{
  const entries=await Promise.all(Object.entries(paths).map(async([key,[name,schema]])=>{
   const response=await fetch('data/'+name+'?v='+Date.now(),{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw new Error(name+' HTTP '+response.status);
   const value=await response.json();if(value.schema!==schema)throw new Error(name+' 형식 오류');return [key,value];
  }));
  if(generation!==state.generation)return;
  const data=Object.fromEntries(entries);
  if(!Array.isArray(data.rules.records)||!Array.isArray(data.programs.items)||!Array.isArray(data.reviews.items)||!data.attachments.records||!data.attachments.programs||!data.evidence.records)throw new Error('공개 데이터 구성 오류');
  state.data=data;$('planChoice').replaceChildren();
  const opt=document.createElement('option');opt.value='';opt.textContent='검토할 공고·세부 유형을 선택하십시오.';$('planChoice').append(opt);
  for(const r of data.rules.records){const option=document.createElement('option');option.value=r.id;option.textContent=r.label;$('planChoice').append(option);}
  $('planChoice').disabled=false;$('planLoadStatus').textContent='공개 근거 '+data.rules.records.length+'개 규칙 묶음을 읽었습니다. 회사 입력은 전송하지 않습니다.';
  summary();invalidate('공고를 선택하십시오. 자격 검토와 금액 계산은 별개입니다.');
 }catch(err){
  if(generation!==state.generation)return;
  state.data=null;$('planRun').disabled=true;$('planLoadStatus').textContent='검토 불가: '+String(err.message||err);$('ruleSummary').innerHTML='';invalidate('공개 근거를 모두 확인하지 못했습니다. 이전 결과를 재사용하지 않습니다.');
 }
}
function clear(){
 for(const id of budgetIDs)$(id).value='';$('inkindWon').value='0';$('extraCashWon').value='0';
 for(const id of Object.keys(P.FIELDS))$(id).value='';invalidate('입력과 이전 결과를 지웠습니다.');
}
function exportReport(){
 if(!state.report)return;
 const blob=new Blob([JSON.stringify(state.report,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='FUNDING_PRIVATE_SCENARIO_'+C.kstDay(new Date())+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('scenarioForm').addEventListener('submit',e=>e.preventDefault());
$('scenarioForm').addEventListener('input',()=>invalidate());$('scenarioForm').addEventListener('change',()=>invalidate());
$('planChoice').addEventListener('change',summary);$('planRun').addEventListener('click',run);$('planClear').addEventListener('click',clear);$('planReload').addEventListener('click',load);$('planExport').addEventListener('click',exportReport);
load();
})();
