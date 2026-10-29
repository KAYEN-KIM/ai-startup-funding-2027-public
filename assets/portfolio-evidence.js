/* P0.9: scoped historical notice checks and private cost-evidence arithmetic.
 * No assertion of current eligibility, cost recognition, or permission to combine.
 * Public 2026 HWPX originals were downloaded and hash-matched on 2026-10-29.
 */
(function(root){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const S=node?require('./startup-core.js'):root.StartupCore;
const P=node?require('./planning-core.js'):root.PlanningCore;
const VERSION='0.9.0';
const CATALOG=[
 ['pre','예비창업패키지'],['pre-inhouse','예비창업패키지(사내벤처팀)'],
 ['early-general','초기창업패키지(일반형)'],['early-deep','초기창업패키지(딥테크 특화형)'],['early-invest','초기창업패키지(투자연계형)'],
 ['growth-general','창업도약패키지(일반형)'],['growth-deep','창업도약패키지(딥테크 특화형)'],['growth-invest','창업도약패키지(투자연계형)'],
 ['dips','초격차 스타트업 프로젝트 DIPS'],['global-dips','초격차 스타트업 프로젝트 Global DIPS'],
 ['tips-business','TIPS 창업사업화'],['pre-tips','프리팁스'],['post-tips','포스트팁스'],['startup-university','창업중심대학'],
 ['restart','재도전성공패키지'],['product-all-in-one','제품화 ALL-In-One 팩'],['manufacturing-scaleup','첨단제조 스케일업 지원사업'],
 ['youth-academy','청년창업사관학교'],['ai-digital-overseas','AI·디지털전환 혁신기업 해외실증'],
 ['eco-startup','에코스타트업'],['agrifood-venture','농식품 벤처육성'],['private-scaleup','민간투자기반 스케일업'],
 ['youth-food','청년식품 창업성장'],['tourism-innovation','관광 오픈이노베이션'],['tourism-venture','관광벤처사업'],
 ['leading-partner','선도기업 연계 동반성장'],['sports-early-growth','스포츠산업 예비초기창업·창업도약'],
 ['sports-accelerator','스포츠산업 창업중기 액셀러레이팅'],['arts','예술분야 창업기업'],['traditional-culture','전통문화 청년창업'],
 ['content-accelerator','콘텐츠 액셀러레이터 연계'],['content-investment','콘텐츠 투자 연계 창업도약'],
 ['existing-management','기창업자 경영개선자금'],['small-new-startup','소규모 신규 창업자'],['marine-incubation','해양신산업 인큐베이팅'],
 ['forest-youth','청년 산림창업 마중물'],['defense-gumi','경북·구미 방산혁신클러스터 창업지원'],['defense-daejeon','대전 방산혁신클러스터 드론특화 창업지원']
];
const SOURCES={
 'early-general':{sha256:'e34bdaf1618c03d37e48c4aa0836f9e03aa7b3d8b3f2b9c8a14af098a163341f',url:'https://www.mss.go.kr/common/board/Download.do?bcIdx=1065015&cbIdx=310&streFileNm=6d1ee9de-ebd4-4a28-b361-f3b43db0b3a1.hwpx',locator:'Contents/section0.xml · 표 1 · 신청 제외 ⑦ · 확약서 안내 · 붙임 5; 현물 안내 문단 185 (0부터 번호)'},
 'early-deep':{sha256:'6bdb1a0a28bc4903361b8525c0e8988e7bfdd45d4f014cc55b4e49cbe409e658',url:'https://www.mss.go.kr/common/board/Download.do?bcIdx=1064566&cbIdx=310&streFileNm=af3acf02-931b-4f29-945a-5f9d792c6b42.hwpx',locator:'Contents/section0.xml · 표 1 · 신청 제외 ⑦ · 확약서 안내 · 붙임 5; 현물 안내 문단 151 (0부터 번호)'}
};
const CLAUSES={
 same_year:'2026 원공고의 붙임 5에는 동시수행 제한 대상 사업이 열거되어 있습니다. 신청과 실제 수행은 구분하며 대상 사업연도·선정 상태를 확인해야 합니다.',
 pledge:'검토한 원공고는 해당 범위의 사업 중 먼저 제출한 협약체결확약서에 따라 수행할 사업이 정해지고 다른 선정 절차에 영향을 줄 수 있음을 안내합니다. 범위·제출 순서·예외를 재확인해야 합니다.',
 exception:'다른 사업연도 또는 지자체 사업에 관한 신청 예외는 다른 사업 측 제한, 기수혜 제한, 동일 비용의 이중 청구까지 허용하는 뜻이 아닙니다.',
 inkind:'두 초기창업 원공고는 대표자와 직접 참여 고용인력의 인건비 등을 현물 부담의 예로 들고 있습니다. 이를 대표자 급여의 현금 지급 승인으로 바꾸지 않습니다.'
};
const STATUSES=['unknown','planned','applied','selected','pledged','active','completed'];
const TYPES=[['unknown','대상 사업 미확인'],...CATALOG,['tips-rd','TIPS R&D · 창업사업화와 다름'],['other-rd','다른 R&D · 별도 규칙 필요'],['local','지자체 사업 · 별도 규칙 필요'],['other','목록 밖·다른 사업 · 허용 확정 아님']];
const PROOF=['unknown','planned','held'];
const CHECKLIST={
 personnel:['근로계약·월별 급여 원금·지급 증빙','실제 참여업무·기간과 다른 과제 청구액 대조','현금·현물 구분, 대표자·관계인·현금계상 예외를 해당 지침에서 확인'],
 cloud:['청구 기간·서비스 명세·사용량과 과제별 사용기록','동일 계정 비용의 중복·외화·세금·선결제 기간 확인'],
 outsourcing:['과업 범위·계약·견적·검수·결과물·지급 증빙','같은 결과물의 다른 과제 중복, 지식재산권·관계인 거래 확인'],
 equipment:['사전 승인·구매/임차 구분·자산대장·지급 증빙','사용 목적·수행기간·부가세·자산 귀속 조건 확인'],
 travel:['출장 목적·일정·참석·결제 증빙','여비 기준과 다른 과제/운영비 중복 확인'],
 other:['공고 비목·사업계획·협약 승인·증빙과 실제 비용 대조']
};
function exact(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))throw new Error('상세 근거 입력 형식이 유효하지 않습니다.');}
function token(v,label,optional=false){if(optional&&(v===undefined||v===''))return '';if(typeof v!=='string'||! /^[A-Z][A-Z0-9_-]{0,23}$/.test(v))throw new Error(label+'는 익명 영문 대문자 코드만 사용합니다.');return v;}
function month(v){if(typeof v!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))throw new Error('급여 대상월이 유효하지 않습니다.');return v;}
function audit(input,ctx={}){
 const issues=[],checks=[],labor=new Map(),economic=new Map(),costChecks=[],holds=[];
 const add=(code,severity,message,refs=[],source=null)=>issues.push({code,severity,message,refs,...(source?{source}:{}),basis:source?'reviewed_2026_notice_partial':'user_evidence_arithmetic_not_official_cost_approval'});
 const projects=input.projects.map(p=>{
  const code=p.notice_code??(CATALOG.some(x=>x[0]===p.route_id)?p.route_id:'unknown');
  const year=p.award_year??'unknown',status=p.selection_status??'unknown';
  if(!TYPES.some(t=>t[0]===code)||!['unknown','2025','2026','2027','2028'].includes(year)||!STATUSES.includes(status))throw new Error('사업의 공고분류·사업연도·진행단계를 확인하십시오.');
  if(p.route_id!=='manual'&&code!=='unknown'&&code!==p.route_id)throw new Error('참고 경로와 제한목록 사업 선택이 서로 다릅니다.');
  return {...p,notice_code:code,award_year:year,selection_status:status};
 });
 for(const a of projects){
  const src=SOURCES[a.route_id];if(!src)continue;
  const route=ctx.routes?.records?.find(r=>r.id===a.route_id);
  if(!route||route.source?.sha256!==src.sha256||route.source?.url!==src.url){holds.push(a.id+': 제한 조항의 검토 원본과 경로 원본이 다릅니다.');continue;}
  const gate=S.gate(route,ctx);if(gate.length){holds.push(...gate.map(s=>a.id+': '+s));continue;}
  const source={...src,reference_year:2026,reviewed_on:'2026-10-29'};
  for(const b of projects){
   if(a.id===b.id)continue;
   let code='outside_reviewed_list',level='review';
   let text='검토한 제한목록 밖이거나 사업분류가 미확인입니다. 반대 사업의 제한·동일 비용·기수혜 조건은 별도로 확인하십시오.';
   const listed=CATALOG.some(v=>v[0]===b.notice_code);
   if(input.review_year!==2026||a.award_year==='2027'||a.award_year==='2028'||b.award_year==='2027'||b.award_year==='2028'){
    code='future_rule_unconfirmed';text='2026 제한목록에서 '+(listed?'대상으로 대응한':'확인되지 않은')+' 사업입니다. 2027 이후의 확정 제한·허용으로 적용하지 않습니다.';
   }else if(a.award_year==='unknown'||b.award_year==='unknown'){
    code='award_year_unknown';text='수행기간의 연도가 아니라 각 공고의 사업연도가 필요합니다. 미입력 사업연도를 추정하지 않습니다.';
   }else if(a.award_year!=='2026'||b.award_year!=='2026'){
    code='different_year_review';text=CLAUSES.exception;
   }else if(listed){
    const active=['pledged','active'].includes(b.selection_status);
    if(active||input.phase==='execution'){
     code='historical_one_sided_restriction';level='conflict';text='2026년 사업으로 대응한 '+b.id+'는 '+a.id+' 원공고 붙임 5의 제한 대상입니다. 같은 해 수행 가정을 합산하지 않습니다. 기간이 나뉘어도 목록 제한을 없애지 않습니다.';
    }else if(b.selection_status==='unknown'||b.selection_status==='completed'){
     code='selection_history_review';level='hold';text='상대 사업의 선정·수행·종료/중단 이력과 확약서 상태를 확인해야 합니다. 해당 공고의 제외·예외조항 확인 전 계산을 보류합니다.';
    }else{
     code='application_not_execution';text='신청 검토와 실제 협약·수행은 다릅니다. 선정되더라도 이 사업들을 모두 수행한다는 가정은 확정되지 않았습니다. '+CLAUSES.pledge;
     level='hold';
    }
   }
   checks.push({from:a.id,to:b.id,code,level,message:text,source,permission:'not_determined',counterparty_identity:'user_selected_not_verified'});
   add(code,level,a.id+' → '+b.id+': '+text,[a.id,b.id],source);
  }
  if(input.costs.some(c=>c.category==='personnel'&&c.allocations.some(v=>v.project_id===a.id&&P.won(v.won)>0n)))add('inkind_is_not_cash_authorization','review',a.id+': '+CLAUSES.inkind,[a.id],source);
 }
 for(const c of input.costs){
  const key=token(c.economic_key,'경제적 비용 코드',true),proof=c.proof_status??'unknown';
  if(!PROOF.includes(proof))throw new Error('증빙 준비 상태가 유효하지 않습니다.');
  if(key){if(economic.has(key))add('same_economic_cost','conflict',economic.get(key)+' / '+c.key+': 같은 경제적 비용 코드입니다. 하나의 원금 행으로 통합하거나 잘못 연결한 코드를 확인하십시오.',[economic.get(key),c.key]);else economic.set(key,c.key);}
  costChecks.push({key:c.key,economic_key:key||null,proof_status:proof,proof_verification:'self_report_only_no_documents_read',official_cost_eligibility:'not_determined',basis:'internal_preparation_suggestion_not_mandatory_official_document_list',checklist:CHECKLIST[c.category]||CHECKLIST.other});
  if(proof!=='held')add('proof_not_ready','review',c.key+': 증빙은 '+(proof==='planned'?'준비 예정':'미확인')+'입니다. 현재 계산은 비용 인정 가정이며 증빙 검증이 아닙니다.',[c.key]);
  if(c.category!=='personnel'){if(c.labor!==undefined&&c.labor!==null)throw new Error('인건비가 아닌 행에는 급여 대조 입력을 넣지 마십시오.');continue;}
  if(!c.labor){add('salary_details_missing','hold',c.key+': 인건비는 익명 인력 코드·급여 대상월·월 급여 원금·다른 사업 청구액의 대조가 필요합니다.',[c.key]);continue;}
  exact(c.labor,['person_code','salary_month','salary_basis_won','other_claimed_won']);
  const person=token(c.labor.person_code,'인력 코드'),m=month(c.labor.salary_month);
  const salary=P.won(c.labor.salary_basis_won),outside=P.won(c.labor.other_claimed_won);
  if(salary<=0n)throw new Error('월 급여 원금은 0보다 커야 합니다.');
  if(c.start_date.slice(0,7)!==m||c.end_date.slice(0,7)!==m){add('salary_month_scope','conflict',c.key+': 급여 발생기간은 입력한 한 달 안이어야 합니다. 여러 달 급여는 월별로 분리하십시오.',[c.key]);}
  const group=person+'|'+m;
  if(!labor.has(group))labor.set(group,{person_code:person,month:m,basis:salary,outside,total:0n,claimed:0n,keys:[]});
  const g=labor.get(group);
  if(g.basis!==salary||g.outside!==outside)add('salary_basis_mismatch','conflict',person+' / '+m+': 같은 인력·월의 급여 원금 또는 다른 사업 청구액이 서로 다릅니다.',[...g.keys,c.key]);
  g.total+=P.won(c.amount_won);g.claimed+=c.allocations.reduce((n,a)=>n+P.won(a.won),0n);g.keys.push(c.key);
 }
 const salaries=[...labor.values()].map(g=>{
  const combined=g.claimed+g.outside;
  if(g.total>g.basis)add('salary_cash_over_basis','conflict',g.person_code+' / '+g.month+': 여러 행의 실제 급여 원금 합계가 입력한 월 급여 원금을 넘습니다. 다른 비용 ID로 중복 입력했는지 확인하십시오.',g.keys);
  if(combined>g.basis)add('salary_claims_over_basis','conflict',g.person_code+' / '+g.month+': 이번 배분액과 다른 사업 청구액 합계가 월 급여 원금을 초과합니다.',g.keys);
  return {person_code:g.person_code,month:g.month,salary_basis_won:String(g.basis),cost_total_won:String(g.total),current_claimed_won:String(g.claimed),other_claimed_won:String(g.outside),combined_claimed_won:String(combined),claim_share_bps_floor:String(combined*10000n/g.basis),remaining_unclaimed_won:combined<=g.basis?String(g.basis-combined):null,kind:'cash_salary_amount_reconciliation_not_statutory_participation_rate',keys:g.keys};
 });
 return {engine_version:VERSION,scope:'partial_2026_notice_and_private_cost_evidence',holds,issues,checks,cost_checks:costChecks,salary_checks:salaries,coverage:{notice_rules:2,listed_counterpart_names:CATALOG.length,official_cost_recognition_complete:false,statutory_labor_rate_rules:false},limitations:['사업명·사업연도·진행상태·증빙 보유 여부는 사용자 입력이며 실제 문서와 대조하지 않았습니다.','인건비 비율은 입력한 현금 급여 원금 대비 청구액 산술입니다. 국가R&D 인건비계상률·연구수당·현물·기관별 예외 판정이 아닙니다.','서로 다른 익명 코드를 부여한 동일 증빙은 자동으로 식별하지 못합니다.','2026 두 초기창업 원공고의 부분 규칙이며, 역방향 공고 전체와 2027 제한을 확인한 것이 아닙니다.']};
}
const api={VERSION,CATALOG,TYPES,SOURCES,CLAUSES,STATUSES,PROOF,CHECKLIST,audit};
if(node)module.exports=api;else root.PortfolioEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this);
