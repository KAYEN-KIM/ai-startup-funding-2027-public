/* P0.10: direction-by-direction review of specific historical notice clauses.
 * A known notice selected under a manual budget must not bypass its source gate.
 * No full eligibility, counterpart clearance or 2027 permission is inferred.
 */
(function(root){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const S=node?require('./startup-core.js'):root.StartupCore;
const E=node?require('./portfolio-evidence.js'):root.PortfolioEvidence;
const VERSION='0.10.0';
const PRE={
 sha256:'d705d10cd5a4be4c304a28dafd9cd054739b95781b89d196617cf96adb38304b',
 url:'https://www.mss.go.kr/common/board/Download.do?bcIdx=1066579&cbIdx=310&streFileNm=236d517e-fc4d-4607-8ba0-6b2557afeb62.pdf',
 locator:'제2026-207호 · 인쇄 5쪽 제외 ⑥, 12~13쪽 신청·선정 유의사항, 21쪽 붙임 3의 초기 일반형·딥테크 항목',
 reviewed_on:'2026-10-29',reference_year:2026
};
// Independently reviewed subset in the pre-startup notice. Do not inherit the
// whole initial-startup list: its scope and exceptions are not identical.
const PRE_TARGETS=['early-general','early-deep'];
const KNOWN=['pre','early-general','early-deep'];
const SOURCES={pre:PRE,...E.SOURCES};
const codeOf=p=>p.route_id==='manual'?(p.notice_code||'unknown'):p.route_id;
const statuses=['unknown','planned','applied','selected','pledged','active','completed'];
function sourceFor(code){const s=SOURCES[code];return s?{...s,reviewed_on:'2026-10-29',reference_year:2026}:null;}
function gate(code,ctx){
 const src=sourceFor(code),route=ctx.routes?.records?.find(r=>r.id===code);
 if(!src)return [];
 if(!route||route.source?.url!==src.url||route.source?.sha256!==src.sha256)return ['검토한 공고 원본과 현재 참고 경로가 일치하지 않습니다.'];
 return S.gate(route,ctx);
}
function direction(a,b,input,ctx){
 const fromCode=codeOf(a),toCode=codeOf(b),source=sourceFor(fromCode);
 const base={from:a.id,to:b.id,from_notice:fromCode,to_notice:toCode,source,
  identity_basis:'user_selected_not_verified',permission:'not_determined',scope:'partial_historical_clause_only',
  reference_year:source?2026:null};
 if(!source)return {...base,code:'missing_direction',level:'review',coverage:'unreviewed',message:'이 방향의 원공고 제한·예외 규칙이 없습니다. 반대쪽 결과를 복사하여 허용 또는 금지로 판단하지 않습니다.'};
 const holds=gate(fromCode,ctx);
 if(holds.length)return {...base,code:'source_hold',level:'hold',coverage:'source_unusable',holds,message:holds.join(' ')};
 // Selection of manual money changes only the budget model, not applicability
 // of a known public notice. Future years remain explicitly unconfirmed.
 if(input.review_year!==2026||['2027','2028'].includes(a.award_year)||['2027','2028'].includes(b.award_year))return {...base,code:'new_year_unconfirmed',level:'review',coverage:'historical_only',message:'2026 원공고의 부분 조항만 있습니다. 2027 이후 실제 조합에 적용할 양쪽 새 공고가 필요합니다.'};
 if(!a.award_year||!b.award_year||a.award_year==='unknown'||b.award_year==='unknown')return {...base,code:'award_year_unknown',level:'hold',coverage:'input_missing',message:'양쪽 사업의 공고 사업연도가 필요합니다. 수행 시작일로 사업연도를 추정하지 않습니다.'};
 if(a.award_year!=='2026'||b.award_year!=='2026')return {...base,code:'different_year_review',level:'review',coverage:'outside_reviewed_year',message:'다른 사업연도에 관한 신청 예외가 전체 병행 허용은 아닙니다. 기수혜·종료 이력·상대 사업 제한은 별도 검토가 필요합니다.'};
 const included=fromCode==='pre'?PRE_TARGETS.includes(toCode):E.CATALOG.some(v=>v[0]===toCode);
 if(!included)return {...base,code:'outside_reviewed_targets',level:'review',coverage:'target_not_reviewed',message:fromCode==='pre'?'예비창업 원문에서 이번에 대조한 상대는 초기 일반형·딥테크 두 항목입니다. 다른 대상은 미검토이지 허용이 아닙니다.':'상대는 검토한 목록과 대응되지 않습니다. 특히 TIPS R&D는 TIPS 창업사업화와 별개이며, 목록 밖이라는 이유만으로 병행 허용이 되지 않습니다.'};
 const stage=b.selection_status||'unknown';
 if(stage==='unknown'||stage==='completed')return {...base,code:'history_needs_review',level:'hold',coverage:'clause_reviewed_partial',message:'상대 사업의 확약·협약·수행·종료/중단 이력과 예외 증빙을 확인해야 합니다. 종료만으로 기수혜 제한이 해소되지는 않습니다.'};
 if(input.phase==='execution'||['pledged','active'].includes(stage))return {...base,code:'historical_direction_conflict',level:'conflict',coverage:'clause_reviewed_partial',message:'양쪽을 2026 사업으로 대응한 수행 가정은 이 원공고의 동시수행·확약 제한과 충돌합니다. 금액을 직접 입력하거나 기간을 나누어도 이 검토를 건너뛰지 않습니다.'};
 return {...base,code:'application_requires_choice',level:'hold',coverage:'clause_reviewed_partial',message:'신청 검토와 실제 수행은 다릅니다. 선정·확약 단계의 선택과 제외 효과를 확인하기 전 두 지원액을 모두 확보한 가정으로 계산하지 않습니다.'};
}
function audit(input,ctx={}){
 const projects=input.projects,issues=[],holds=[],pairs=[],identities=new Map();
 const add=(code,severity,message,refs)=>issues.push({code,severity,message,refs,basis:'partial_historical_bidirectional_review'});
 for(const p of projects){
  const code=codeOf(p),year=p.award_year||'unknown',stage=p.selection_status||'unknown';
  if(!E.TYPES.some(t=>t[0]===code)||!['unknown','2025','2026','2027','2028'].includes(year)||!statuses.includes(stage))throw new Error('공고 대응·사업연도·진행단계를 확인하십시오.');
  if(p.route_id!=='manual'&&p.notice_code&&p.notice_code!=='unknown'&&p.notice_code!==p.route_id)throw new Error('참고 경로와 공고 대응이 서로 다릅니다.');
  // Even a standalone manual project that claims a known notice uses its gate.
  if(KNOWN.includes(code))holds.push(...gate(code,ctx).map(s=>p.id+': '+s));
  const key=code+'|'+year;
  if(code!=='unknown'&&!['other','local','other-rd'].includes(code)&&year!=='unknown'){
   if(identities.has(key))add('same_notice_budget_duplicate','conflict',identities.get(key)+' / '+p.id+': 같은 사업·사업연도의 금액 대안을 별도 지원금으로 합산하지 않습니다. 실제 다른 공고·차수인지 확인하십시오.',[identities.get(key),p.id]);
   else identities.set(key,p.id);
  }
 }
 for(let i=0;i<projects.length;i++)for(let j=i+1;j<projects.length;j++){
  const a=projects[i],b=projects[j],directions=[direction(a,b,input,ctx),direction(b,a,input,ctx)];
  const reviewed=directions.filter(d=>d.coverage==='clause_reviewed_partial').length;
  const usable=directions.filter(d=>d.source&&d.code!=='source_hold').length;
  const severity=directions.some(d=>d.level==='conflict')?'conflict':directions.some(d=>d.level==='hold')?'hold':'review';
  const coverage=directions.some(d=>d.code==='source_hold')?'source_hold':reviewed===2?'both_directions_partial':reviewed===1?'one_direction_partial':usable===2?'both_sources_scope_pending':usable===1?'one_source_only':'no_direction_reviewed';
  const question=d=>d.from+' → '+d.to+': '+(d.source?'이 '+d.reference_year+' 원문 '+d.source.locator+'의 적용 사업연도·진행단계·예외 및 실제 공고 일치 여부를 확인해 주십시오.':'해당 방향의 공식 공고·첨부·중복수혜 조항·예외의 문서명과 위치를 알려 주십시오.');
  pairs.push({a:a.id,b:b.id,coverage,reviewed_directions:reviewed,total_directions:2,severity,permission:'not_determined',directions,questions:directions.map(question),
   note:'2/2는 두 방향의 일부 조항 대조 수입니다. 전체 적격성·예외 검토 완료 또는 동시수행 허용이 아닙니다.'});
  for(const d of directions){
   // Older early-startup nonmanual direction checks stay intact. New issues
   // are needed for pre, manual known notices, and explicitly missing sides.
   const original=projects.find(p=>p.id===d.from);
   const coveredByPrevious=original.route_id!=='manual'&&['early-general','early-deep'].includes(original.route_id);
   if(!coveredByPrevious)add('bilateral_'+d.code,d.level,d.from+' → '+d.to+': '+d.message,[d.from,d.to]);
  }
 }
 return {engine_version:VERSION,scope:'partial_historical_bidirectional_review',permission:'not_determined',
  pairs,issues,holds:[...new Set(holds)],sources_reviewed:3,pre_counterpart_subset:PRE_TARGETS.slice(),
  limitations:['공고명·사업연도·진행단계는 사용자 대응이며 실제 신청서나 기관 확인서를 읽지 않았습니다.','예비창업의 상대 대상은 초기 일반형·딥테크 두 항목만 대조했습니다.','2/2 대조도 모든 예외·기수혜·지급·정산 조건의 완료 판정이 아닙니다.','2026 참고 규칙을 2027의 확정 제한이나 허용으로 전환하지 않습니다.']};
}
const api={VERSION,PRE,PRE_TARGETS,KNOWN,SOURCES,codeOf,gate,direction,audit};
if(node)module.exports=api;else root.PortfolioBilateral=api;
})(typeof globalThis!=='undefined'?globalThis:this);
