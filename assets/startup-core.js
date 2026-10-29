/* P0.6: source-bound 2026 historical scenarios, never a 2027 award forecast. */
(function(root){
'use strict';
const P=typeof module!=='undefined'&&module.exports?require('./planning-core.js'):root.PlanningCore;
const C=typeof module!=='undefined'&&module.exports?require('./radar-core.js'):root.RadarCore;
const VERSION='0.6.0',DAY=86400000,BASIS=['id','title','source','year','mode','eligibility','amount','opens','deadline'];
const DISCLAIMER='2026 종료 공고의 준비용 계산입니다. 2027 지원액·신청일·적격성·선정·현물인정·병행 허용을 확정하지 않습니다.';
function result(code,reasons,other={}){return {engine_version:VERSION,code,reference_year:2026,target_year:2027,scope:'historical_preparation_only',reasons,...other,disclaimer:DISCLAIMER};}
function gate(route,ctx={}){
 const now=ctx.now||new Date();
 if(!route||route.scope!=='historical_preparation_only'||route.reference_year!==2026||route.target_year!==2027||route.source_state!=='reference_ready')return ['2026 참고 경로가 없거나 근거 확인이 보류 중입니다.'];
 const reasons=[],src=route.source,p=ctx.programs?.items?.find(p=>p.id===route.program_id),s=ctx.sources?.records?.[route.id];
 if(!Number.isFinite(+now))reasons.push('기준 시각이 유효하지 않습니다.');
 if(!src||!C.sourceURL(src.url)||!/^[a-f0-9]{64}$/.test(src.sha256||'')||!['hwpx_structured_cells_and_context','official_pdf_text_and_parallel_copy_visual_check'].includes(src.review_method)||!src.locator)reasons.push('검토한 원문과 위치 정보가 없습니다.');
 const reviewed=Date.parse(route.reviewed_at);
 if(!Number.isFinite(reviewed)||reviewed>+now+300000)reasons.push('검토 시각을 확인할 수 없습니다.');
 if(ctx.programs?.schema!=='public-funding-radar/v1'||!p||p.mode!=='reference'||p.year!==2026||BASIS.some(k=>JSON.stringify(p[k]??null)!==JSON.stringify(route.program_snapshot?.[k]??null)))reasons.push('참고 공고와 규칙 버전이 다릅니다. 2027 공고로 자동 전환하지 않습니다.');
 if(ctx.sources?.schema!=='public-startup-source-checks/v1'||!s||s.url!==src?.url||s.expected_sha256!==src?.sha256||s.observed_sha256!==src?.sha256||s.status!=='matched'||s.review_required||s.error)reasons.push('검토 원본의 지문이 불일치하거나 최신 확인에 실패했습니다.');
 const last=Date.parse(s?.last_success_at),attempt=Date.parse(s?.last_attempt_at);
 if(!Number.isFinite(last)||!Number.isFinite(attempt)||last>+now+300000||attempt>+now+300000||+now-last>7*DAY||attempt<last)reasons.push('원본 재확인이 7일 이상 지났거나 확인 시각이 유효하지 않습니다.');
 return [...new Set(reasons)];
}
function validScenario(s){
 if(!s||!Number.isSafeInteger(s.max_support_won)||s.max_support_won<=0||s.max_support_won>1e12)return false;
 const [g,c,i]=['government_bps','cash_min_bps','inkind_max_bps'].map(k=>s[k]);
 if(![g,c,i].every(v=>Number.isInteger(v)&&v>=0&&v<=10000)||g<=0||g+c+i!==10000)return false;
 return (s.own_model==='none'&&g===10000&&c===0&&i===0)||(s.own_model==='cash_or_inkind'&&g<10000&&c===0)||(s.own_model==='ratio_of_total'&&g<10000&&c>0);
}
const ceil=(a,b)=>(a+b-1n)/b,min=(a,b)=>a<b?a:b,max=(a,b)=>a>b?a:b;
function estimate(route,scenarioId,input={},ctx={}){
 const holds=gate(route,ctx);if(holds.length)return result('hold',holds);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['support_won','inkind_won','extra_cash_won','available_cash_won','reference_ack','region_confirmed'].includes(k)))return result('invalid',['허용되지 않은 입력입니다.']);
 if(input.reference_ack!==true)return result('hold',['2026 참고 계산이며 2027 확정 금액이 아님을 확인해야 합니다.']);
 if(route.stage!=='pre'&&input.region_confirmed!==true)return result('hold',['2026 원문 붙임 6의 본점 지역 분류를 확인하거나 가정임을 명시해야 합니다. 시도만으로 자동 적용하지 않습니다.']);
 const s=route.scenarios?.find(x=>x.id===scenarioId);if(!validScenario(s))return result('hold',['검토된 지역·단계별 계산식이 없습니다.']);
 try{
  const G=P.won(input.support_won),I=P.won(input.inkind_won),X=P.won(input.extra_cash_won),A=P.won(input.available_cash_won,true);
  if(G<=0n||G>BigInt(s.max_support_won))return result('invalid',['요청액은 0보다 크고 선택한 2026 단계·유형 한도 이하여야 합니다. 평균액을 한도로 사용하지 않습니다.']);
  const T=ceil(G*10000n,BigInt(s.government_bps)),own=T-G;
  let floor=0n,cap=0n;
  if(s.own_model==='cash_or_inkind')cap=own;
  if(s.own_model==='ratio_of_total'){
   cap=T*BigInt(s.inkind_max_bps)/10000n;
   floor=max(ceil(T*BigInt(s.cash_min_bps),10000n),own-cap);
   cap=min(cap,own-floor);
  }
  const used=min(I,cap),cash=own-used,need=cash+X;
  const amounts={support_won:G,total_minimum_won:T,own_total_won:own,minimum_cash_won:floor,inkind_cap_won:cap,inkind_used_won:used,unused_inkind_won:I-used,own_cash_won:cash,extra_cash_won:X,cash_need_won:need,available_cash_won:A,shortfall_won:A===null?null:max(0n,need-A)};
  return result('historical_assumption',['요청 지원액에 최대 지원비율을 적용한 수학적 최소 사업비입니다. 실제 협약·반올림 단위·비인정비용에 따라 달라집니다.','현물은 사용자의 인정 가능 가정이며 승인된 현물이 아닙니다. 신규 2027 공고가 나오면 모든 비율을 다시 검토해야 합니다.'],{route_id:route.id,scenario_id:s.id,amounts:Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,v===null?null:String(v)])),source:route.source});
 }catch(e){return result('invalid',[e.message]);}
}
function prepare(route,input={},ctx={}){
 const holds=gate(route,ctx);if(holds.length)return result('hold',holds);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['business_state','completed_tasks'].includes(k))||!['unknown','preparing','registered'].includes(input.business_state)||!Array.isArray(input.completed_tasks)||input.completed_tasks.some(id=>!route.tasks.some(t=>t.id===id)))return result('invalid',['준비 상태·체크 항목 입력이 유효하지 않습니다.']);
 let next='2027 기준일·신청자격과 대표의 이전 사업 이력부터 확인하십시오.';
 if(input.business_state==='preparing')next=route.stage==='pre'?'고객검증을 진행하되, 법인 설립일은 차기 공고 자격과 실제 계약·채용 필요를 함께 보고 결정하십시오.':'설립이 필요할 수 있는 경로입니다. 지원금 한도만 보고 설립 시점을 앞당기지 마십시오.';
 if(input.business_state==='registered')next=route.stage==='pre'?'현재 등록 여부만으로 예비창업 경로를 탈락 처리하지 않습니다. 2026년에는 기준일 이후 등록 예외가 있었으므로 2027 원문 확인이 필요합니다.':'실제 창업 인정·업력 기준일·본점 소재지와 기수혜 이력을 준비하십시오.';
 const done=new Set(input.completed_tasks);
 return result('preparation_only',[next,'체크리스트는 내부 준비 진척이며 선정 가능성이나 신청 적격성 점수가 아닙니다.'],{route_id:route.id,completed:done.size,total:route.tasks.length,tasks:route.tasks.map(t=>({...t,done:done.has(t.id)})),conditions:route.conditions,notes:route.notes});
}
function compareExecution(ids,year,phase){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!['pre','early-general','early-deep'].includes(id))||!['application','execution'].includes(phase))return result('invalid',['비교 항목이 유효하지 않습니다.']);
 if(year!==2026)return result('new_year_unconfirmed',['2027 동시신청·동시수행 제한은 차기 공고 확인 전 미확정입니다. 2026 제한은 준비상 위험 알림으로만 사용합니다.']);
 if(ids.length>1&&phase==='execution')return result('historical_execution_conflict',['2026 기준 선택 경로들은 같은 연도 창업사업화 동시수행 제한을 검토해야 합니다. 대안별 한도를 더해 확보액으로 계산하지 않습니다.']);
 if(ids.length>1&&phase==='application')return result('historical_application_review',['초기 일반형·딥테크는 2026 중복 신청과 실제 수행이 구분됐습니다. 예비 경로의 자격·확약서와 다른 제한까지 허용한다는 뜻은 아닙니다.']);
 return result('preparation_only',['단일 경로도 다른 사업·기수혜 이력과 비용의 충돌을 별도로 확인해야 합니다.']);
}
const api={VERSION,DISCLAIMER,BASIS,gate,validScenario,estimate,prepare,compareExecution};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
