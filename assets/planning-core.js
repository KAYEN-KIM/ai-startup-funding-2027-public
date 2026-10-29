/* P0.5 deterministic, browser-local planning. No network, persistence or award inference. */
(function(root){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./radar-core.js'):root.RadarCore;
const VERSION='0.5.0', DAY=86400000;
const BASIS=['id','title','source','year','eligibility','amount','opens','deadline'];
const FIELDS={active_jumpup:'다른 도약프로그램 수행 중',active_dips:'초격차·딥테크 TIPS 수행 중',dips_final_year_2026:'해당 초격차 다년도 협약의 마지막 연도가 2026년',active_worldclass:'월드클래스300 플러스 수행 중',same_cost:'다른 지원사업과 비용 항목 중복',other_copayment:'바우처로 다른 사업 자부담 납부',ibk_centres:'IBK창공 지원 센터 수'};
function result(code,reasons,extra={}){return {engine_version:VERSION,code,reasons,...extra,disclaimer:'신청 적격성·선정·교부액·현물인정 또는 전체 동시수행 허용을 보장하지 않습니다.'};}
function sourceGate(rule,ctx={}){
 const reasons=[], now=ctx.now||new Date();
 if(!Number.isFinite(+now))return ['계산 기준 시각이 유효하지 않습니다.'];
 if(!rule||rule.coverage!=='selected_clauses_only'||rule.status!=='reviewed_limited_scope'||rule.source_state!=='ready')return ['검토된 계산·제한 조항이 없거나 확인 보류 상태입니다.'];
 const ev=rule.evidence;
 if(!ev||!C.sourceURL(ev.url)||ev.review_method!=='rendered_page_and_text_check'||!Array.isArray(ev.pages)||!ev.pages.length||!/^[0-9a-f]{64}$/.test(ev.sha256||''))return ['원문 근거가 없거나 검토 형식이 올바르지 않습니다.'];
 for(const value of [ev.reviewed_at,rule.reviewed_at]){
  const t=Date.parse(value);
  if(!Number.isFinite(t)||!Number.isFinite(+now)||t>+now+300000||+now-t>14*DAY)reasons.push('검토 근거가 14일 이상 지났거나 검토 시각이 유효하지 않습니다.');
 }
 const p=ctx.program;
 if(!p||p.id!==rule.program_id||!rule.program_snapshot||BASIS.some(k=>JSON.stringify(p[k]??null)!==JSON.stringify(rule.program_snapshot[k]??null)))reasons.push('현재 공고와 검토 규칙의 버전이 다릅니다.');
 if(!p||['reference','operator','budget','discovery'].includes(p.mode))reasons.push('현재 검토된 수혜기업 공고가 아닙니다.');
 if(!ctx.attachments||ctx.attachments.schema!=='public-funding-attachments/v1'||ctx.evidence?.schema!=='public-funding-evidence/v1'||ctx.reviews?.schema!=='public-funding-reviews/v1'||!Array.isArray(ctx.reviews?.items))reasons.push('원문·첨부·변경 기록을 모두 읽어야 합니다.');
 const a=ctx.attachments||{},m=a.programs?.[rule.program_id],d=a.records?.[ev.document_id];
 if(!m||m.notice_source!==p?.source||m.manifest_sha256!==ev.manifest_sha256||!m.document_ids?.includes(ev.document_id)||m.review_required||m.last_error||m.notice_status==='source_unavailable')reasons.push('첨부 목록이 변경·실패했거나 현재 공고에 속하지 않습니다.');
 if(!d||d.program_id!==rule.program_id||d.url!==ev.url||d.sha256!==ev.sha256||d.observed_sha256!==ev.sha256||d.extraction?.sha256!==ev.sha256||d.status!=='text_extracted'||d.last_error||d.review_required)reasons.push('검토한 첨부 파일 지문과 최신 확인 상태가 일치하지 않습니다.');
 if(m?.document_ids?.some(id=>a.records?.[id]?.review_required||(a.records?.[id]?.last_error&&a.records?.[id]?.extraction)))reasons.push('관련 첨부에 미검토 변경 또는 최신 열람 실패가 있습니다.');
 const h=ctx.evidence?.records?.[rule.program_id];
 if(h&&(h.review_required||h.status==='fetch_failed'))reasons.push('공고 원문이 변경되었거나 열람에 실패했습니다.');
 const ack=new Set(rule.reviewed_difference_ids||[]);
 if((ctx.reviews?.items||[]).some(q=>q.program_id===rule.program_id&&q.status==='pending'&&!ack.has(q.id)))reasons.push('검토하지 않은 공고 정보 차이가 남아 있습니다.');
 if(p&&C.deadline(p,now).code==='closed')reasons.push('기재된 신청 마감이 지났습니다. 새 공고를 확인하십시오.');
 return [...new Set(reasons)];
}
function won(value,optional=false){
 if(optional&&(value===undefined||value===null||value===''))return null;
 if(typeof value==='number')value=Number.isSafeInteger(value)?String(value):'';
 if(typeof value!=='string'||!/^\d{1,13}$/.test(value))throw new Error('금액은 쉼표·소수·지수 표기 없이 0 이상의 원 단위 정수로 입력하십시오.');
 const n=BigInt(value);if(n>1000000000000n)throw new Error('계산 범위는 항목별 1조 원 이내입니다.');return n;
}
const ceil=(x,y)=>(x+y-1n)/y;
const min=(...a)=>a.reduce((x,y)=>x<y?x:y);
const max=(x,y)=>x>y?x:y;
function formulaReady(f){return f&&f.model==='ratio_of_total'&&f.amount_type==='voucher_face_value'&&f.period==='one_year'&&f.cap_scope==='standard_not_regional_uplift'&&Number.isSafeInteger(f.max_support_won)&&f.max_support_won>0&&f.max_support_won<=1e12&&['government_max_bps','cash_min_bps','inkind_max_bps'].every(k=>Number.isInteger(f[k])&&f[k]>=0&&f[k]<=10000)&&f.government_max_bps>0&&f.government_max_bps<10000&&f.cash_min_bps>0&&f.government_max_bps+f.cash_min_bps+f.inkind_max_bps===10000;}
function estimate(rule,input={},ctx={}){
 const gate=sourceGate(rule,ctx);if(gate.length)return result('hold',gate);
 if(!formulaReady(rule.finance))return result('hold',['검토된 수치 계산식이 없습니다. 금액이나 현금비율을 임의로 채우지 않습니다.']);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['support_won','inkind_won','extra_cash_won','available_cash_won'].includes(k)))return result('invalid',['허용되지 않은 계산 입력입니다.']);
 try{
  const G=won(input.support_won),I=won(input.inkind_won),X=won(input.extra_cash_won),A=won(input.available_cash_won,true),f=rule.finance;
  if(G<=0n||G>BigInt(f.max_support_won))return result('invalid',['요청 지원액은 0원보다 크고 선택한 일반 연간 한도 이하여야 합니다.']);
  const T=ceil(G*10000n,BigInt(f.government_max_bps)),own=T-G,inkindCap=T*BigInt(f.inkind_max_bps)/10000n;
  const floorCash=max(ceil(T*BigInt(f.cash_min_bps),10000n),own-inkindCap);
  const used=min(I,inkindCap,own-floorCash),cash=own-used,need=cash+X;
  const out={support_won:G,total_minimum_won:T,own_total_won:own,minimum_cash_won:floorCash,inkind_cap_won:inkindCap,inkind_used_won:used,unused_inkind_won:I-used,own_cash_won:cash,extra_cash_won:X,cash_need_won:need,available_cash_won:A,shortfall_won:A===null?null:max(0n,need-A)};
  return result('calculated_assumption',['요청 지원액에 공고상 최대 지원비율을 적용한 최소 사업비 시나리오입니다. 협약은 더 큰 자부담을 요구할 수 있습니다.','현물과 추가 운영현금은 사용자의 가정입니다. 인정 여부·부가세·집행 시차·필수 지출은 별도 확인해야 합니다.'],{rule_id:rule.id,amounts:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v===null?null:String(v)])),reception:C.deadline(ctx.program,ctx.now||new Date()).code,source:rule.evidence,locator:f.locator});
 }catch(err){return result('invalid',[err.message]);}
}
function restrictions(rule,input={},ctx={}){
 const gate=sourceGate(rule,ctx);if(gate.length)return result('hold',gate,{rows:[]});
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(FIELDS,k)))return result('invalid',['허용되지 않은 점검 입력입니다.'],{rows:[]});
 for(const [k,v] of Object.entries(input)){
  if(v===null||v===undefined||v==='')continue;
  if(k==='ibk_centres'?(typeof v!=='number'||!Number.isInteger(v)||v<0||v>6):typeof v!=='boolean')return result('invalid',['예·아니오·미확인과 정수 센터 수만 허용합니다.'],{rows:[]});
 }
 const rows=(rule.restrictions||[]).map(q=>{
  const v=input[q.field],known=typeof v==='boolean';let code='unknown',reason='미입력·미확인은 제한 없음으로 간주하지 않습니다.';
  if(q.type==='prohibit_true'&&known){code=v?'conflict':'not_triggered';reason=v?'검토된 금지 조항에 해당하는 입력입니다.':'이 조항의 금지 조건은 현재 입력에서 발견되지 않았습니다.';}
  else if(q.type==='max_count'&&typeof v==='number'){
   code=v>q.limit?'conflict':v===0?'unknown':'not_triggered';reason=v>q.limit?'센터 간 중복지원 제한에 해당합니다.':v===0?'지원할 센터를 선택하지 않았습니다.':'단일 센터 조건만 확인했습니다. 다른 사업 병행은 별도 검토입니다.';
  }else if(q.type==='conditional_exception'&&known){
   if(!v){code='not_triggered';reason='이 수행사업 제외 조항은 현재 입력에서 발견되지 않았습니다.';}
   else if(input[q.exception_field]===false){code='conflict';reason='해당 사업 수행 중이며 2026년 마지막 연차 예외에도 해당하지 않는다는 입력입니다.';}
   else if(input[q.exception_field]===true){code='exception_review';reason='2026년 마지막 연차 예외 후보입니다. 협약·증빙과 기관 확인 전까지 허용으로 처리하지 않습니다.';}
   else{reason='다년도 협약 마지막 연도가 2026년인지 확인해야 합니다.';}
  }
  return {id:q.id,label:q.label,code,reason,locator:q.locator};
 });
 const code=rows.some(r=>r.code==='conflict')?'conflict':rows.some(r=>r.code==='unknown'||r.code==='exception_review')||!rows.length?'hold':'limited_no_conflict';
 return result(code,[code==='conflict'?'등록된 제한 조항과 충돌하는 입력을 찾았습니다.':code==='hold'?'미확인 또는 예외 증빙이 남아 있습니다.':'검토한 조항에서만 충돌을 발견하지 못했습니다. 모든 지원사업의 동시수행 허용 판정이 아닙니다.'],{rows,rule_id:rule.id,source:rule.evidence});
}
const api={VERSION,FIELDS,sourceGate,won,formulaReady,estimate,restrictions};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlanningCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
