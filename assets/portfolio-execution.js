/* P0.11: source-bound execution readiness, not settlement approval.
 * 2026 general/deeptech originals: located clauses reviewed 2026-10-29.
 * No application submission, bank access, tax/refund calculator or storage. */
(function(root){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const S=node?require('./startup-core.js'):root.StartupCore;
const P=node?require('./planning-core.js'):root.PlanningCore;
const E=node?require('./portfolio-evidence.js'):root.PortfolioEvidence;
const VERSION='0.11.0';
// Independently pinned execution review; another module cannot silently replace its source.
const REVIEWED={"early-general":{"url":"https://www.mss.go.kr/common/board/Download.do?bcIdx=1065015&cbIdx=310&streFileNm=6d1ee9de-ebd4-4a28-b361-f3b43db0b3a1.hwpx","sha256":"e34bdaf1618c03d37e48c4aa0836f9e03aa7b3d8b3f2b9c8a14af098a163341f"},"early-deep":{"url":"https://www.mss.go.kr/common/board/Download.do?bcIdx=1064566&cbIdx=310&streFileNm=af3acf02-931b-4f29-945a-5f9d792c6b42.hwpx","sha256":"6bdb1a0a28bc4903361b8525c0e8988e7bfdd45d4f014cc55b4e49cbe409e658"}};
const FIELDS=['enabled','agreement_date','bank_account','management_system','own_cash_due_date','own_cash_paid_won','own_cash_paid_date','inkind_proof','payment_basis','settlement_basis'];
const CHOICES={readiness:['unknown','ready','unavailable'],proof:['unknown','planned','held'],basis:['unknown','assumed','self_report_checked']};
const LOCATORS={
 'early-general':{payment:803,bank:812,contribution:832,monitoring:805},
 'early-deep':{payment:656,bank:665,contribution:685,monitoring:658}
};
const TERMS={
 payment:'정부지원사업비는 협약 후 분할하여 지급될 수 있음. 원문에서 고정 분할 비율이나 개별 기업 입금일은 확인하지 않았습니다.',
 bank:'지정 은행의 사업비 계좌 개설과 창업사업통합정보관리시스템을 통한 지출·회계처리가 가능해야 합니다.',
 contribution:'자부담 현금은 정해진 기한 내 지정 계좌에 납입하고, 현물은 증빙을 갖춰 주관기관에 제출해야 합니다.',
 monitoring:'수시·최종 점검 결과에 따라 지원 중단 또는 환수 조치가 있을 수 있습니다. 환수액·정산 산식은 검토하지 않았습니다.'
};
function defaults(){return {enabled:false,agreement_date:'',bank_account:'unknown',management_system:'unknown',own_cash_due_date:'',own_cash_paid_won:'0',own_cash_paid_date:'',inkind_proof:'unknown',payment_basis:'unknown',settlement_basis:'unknown'};}
function date(v){if(v==='')return '';if(typeof v!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(v))throw new Error('집행 검토 날짜는 YYYY-MM-DD 형식이어야 합니다.');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)throw new Error('집행 검토에 존재하지 않는 날짜가 있습니다.');return v;}
function normalize(v){
 if(v===undefined)return defaults();
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!FIELDS.includes(k)))throw new Error('집행 검토 입력에는 지정된 날짜·상태·금액만 허용됩니다.');
 const x={...defaults(),...v};if(typeof x.enabled!=='boolean')throw new Error('집행 검토 선택을 확인하십시오.');
 for(const k of ['agreement_date','own_cash_due_date','own_cash_paid_date'])x[k]=date(x[k]);
 for(const k of ['bank_account','management_system'])if(!CHOICES.readiness.includes(x[k]))throw new Error('계좌·관리시스템 준비 상태가 유효하지 않습니다.');
 if(!CHOICES.proof.includes(x.inkind_proof))throw new Error('현물 증빙 상태가 유효하지 않습니다.');
 for(const k of ['payment_basis','settlement_basis'])if(!CHOICES.basis.includes(x[k]))throw new Error('지급·정산 근거의 자체 확인 상태가 유효하지 않습니다.');
 P.won(x.own_cash_paid_won);return x;
}
function audit(input,ctx={},budgets=[]){
 const rows=[],issues=[],holds=[],questions=[];
 const add=(project_id,code,severity,message)=>issues.push({code:'execution_'+code,severity,message:project_id+': '+message,refs:[project_id],basis:'partial_2026_execution_terms_or_self_report'});
 for(const p of input.projects){
  const x=normalize(p.execution),identity=p.route_id==='manual'?(p.notice_code||'unknown'):p.route_id;
  const sourceDef=REVIEWED[identity],loc=LOCATORS[identity],budget=budgets.find(b=>b.id===p.id);
  if(!budget)throw new Error('집행 검토 사업비 계산 결과가 없습니다.');
  const required=P.won(budget.own_cash_assumption_won),inkind=P.won(budget.inkind_assumption_won),paid=P.won(x.own_cash_paid_won);
  const source=sourceDef&&loc?{url:sourceDef.url,sha256:sourceDef.sha256,reference_year:2026,reviewed_on:'2026-10-29',locator:'Contents/section0.xml / 0-based paragraph indices '+Object.values(loc).join(', '),paragraph_indices:loc}:null;
  if(source){
   const route=ctx.routes?.records?.find(r=>r.id===identity);
   if(!route||route.source?.url!==source.url||route.source?.sha256!==source.sha256){holds.push(p.id+': 집행 조항의 검토 원본이 일치하지 않습니다.');continue;}
   const gate=S.gate(route,ctx);if(gate.length){holds.push(...gate.map(t=>p.id+': '+t));continue;}
  }
  const applies=Boolean(source&&input.review_year===2026&&p.award_year==='2026');
  const row={project_id:p.id,notice_identity:identity,source,scope:source?'partial_historical_execution_terms':'no_reviewed_execution_terms',enabled:x.enabled,applicability:applies?'2026_scope_partial':source?'historical_reference_not_current_rule':'unreviewed',terms:source?TERMS:null,findings:[],own_cash_required_assumption_won:String(required),own_cash_paid_self_report_won:String(paid),own_cash_not_deposited_assumption_won:String(required>paid?required-paid:0n),cashflow_adjustment_won:'0',actual_settlement_approved:false,official_cost_eligibility:'not_determined',status:'not_requested'};
  const find=(code,severity,message)=>{row.findings.push({code,severity,message});add(p.id,code,severity,message);};
  questions.push(p.id+': 실제 협약일·분할 지급 조건과 회차별 지급월은 무엇입니까? 지원 중단·정산·환수 및 세금 처리 기준을 확인해 주십시오.');
  if(source)questions.push(p.id+': 검토한 2026 원문 '+source.locator+'의 지정 계좌·관리시스템·자부담 납입기한·현물 증빙 조항이 실제 신청 연도에 어떻게 적용됩니까?');
  if(!x.enabled){row.findings.push({code:'not_requested',severity:'review',message:'집행 준비 검토를 선택하지 않았습니다. 기존 현금흐름은 지급·정산 규칙이 검증되지 않은 가정입니다.'});rows.push(row);continue;}
  row.status='review_required';
  if(paid>0n&&!x.own_cash_paid_date)find('paid_date_missing','hold','납입했다고 입력한 금액이 있지만 납입일이 없습니다.');
  if(paid===0n&&x.own_cash_paid_date)find('paid_amount_missing','hold','납입일을 입력했으나 금액은 0원입니다. 미납입과 실제 납입을 구분하십시오.');
  if(!applies)find('scope_pending','review',source?'2026 일부 조항만 검토했습니다. 미확인 사업연도·2027 이후 사업에 공식 집행 규칙으로 적용하지 않습니다.':'이 공고의 지급·집행·정산 원문 규칙은 연결되지 않았습니다.');
  const severity=applies?'hold':'review';
  if(!x.agreement_date)find('agreement_missing',severity,'실제 또는 가정 협약일을 입력해야 협약 전 지급 여부를 대조할 수 있습니다.');
  if(x.agreement_date){
   const m=x.agreement_date.slice(0,7);
   for(const r of p.receipts){if(P.won(r.won)===0n)continue;
    if(r.month<m)find('before_agreement',applies?'conflict':'review','지원금 지급월 '+r.month+'이 입력한 협약일보다 앞섭니다. '+(applies?'검토한 2026 협약 후 지급 조항과 충돌합니다.':'미래 공고의 지급 근거를 별도로 확인하십시오.'));
    else if(r.month===m)find('same_month','review','협약일과 지급월이 같습니다. 월 단위 일정만으로 당일 선후관계를 확인할 수 없습니다.');
   }
  }
  for(const [k,label] of [['bank_account','지정 사업비 계좌'],['management_system','관리시스템 지출·회계처리']]){
   if(x[k]!=='ready')find(k,severity,label+' 상태가 '+(x[k]==='unavailable'?'불가':'미확인')+'입니다.');
   else row.findings.push({code:k+'_self_report',severity:'review',message:label+' 가능으로 자체 입력했습니다. 계좌 개설이나 시스템 접근을 실제 검증하지 않았습니다.'});
  }
  if(required>0n){
   if(!x.own_cash_due_date)find('cash_due_missing',severity,'자부담 현금의 기관 지정 납입기한이 미확인입니다.');
   if(paid<required)find('cash_not_deposited',severity,'산식상 필요한 자부담 현금보다 납입 자체입력액이 적습니다. 미납입 잔액은 별도 표시하며 사업비 지출에 다시 더하지 않습니다.');
   if(x.own_cash_due_date&&x.own_cash_paid_date&&x.own_cash_paid_date>x.own_cash_due_date)find('cash_late',applies?'conflict':'review','입력한 납입일이 입력한 납입기한보다 늦습니다. 기한 연장·예외의 기관 확인이 필요합니다.');
  }else if(paid>0n)find('cash_above_assumption','review','현재 산식상 자부담 현금은 0원이나 납입액을 입력했습니다. 현물 조정·추가 납입을 별도로 확인하십시오.');
  if(inkind>0n&&x.inkind_proof!=='held')find('inkind_proof',severity,'현물 투입 증빙이 준비되지 않았거나 미확인입니다.');
  if(inkind>0n&&x.inkind_proof==='held')row.findings.push({code:'inkind_self_report',severity:'review',message:'현물 증빙 보유는 자체 입력이며 기관 제출·인정은 검증하지 않았습니다.'});
  for(const [k,label] of [['payment_basis','분할 지급 일정'],['settlement_basis','비용 인정·정산·환수']]){
   if(x[k]!=='self_report_checked')find(k,'review',label+'의 실제 지침은 '+(x[k]==='assumed'?'사용자 가정':'미확인')+'입니다.');
   else row.findings.push({code:k+'_self_report',severity:'review',message:label+' 확인은 자체 입력입니다. 문서·기관 승인까지 검증한 것으로 처리하지 않습니다.'});
  }
  row.status=row.findings.some(f=>['hold','conflict'].includes(f.severity))?'incomplete':'self_report_review_only';
  rows.push(row);
 }
 return {engine_version:VERSION,scope:'partial_execution_readiness_not_settlement_approval',rows,issues,holds,questions,official_cost_rules_complete:false,settlement_model_verified:false,limitations:['계좌·협약·납입·증빙은 사용자 자체 입력이며 실제 서류나 은행에 접근하지 않습니다.','자부담 납입은 사업비 재원 이동이므로 원가에 중복 합산하지 않습니다. 이 모듈은 가용현금·제한현금의 실제 계좌 이체 시점을 모델링하지 않습니다.','검토한 원문은 2026 초기 일반형·딥테크 두 공고의 일부 조항입니다. 지급 비율·개별 입금일·비목별 인정·부가세·환수 산식·2027 조건은 미확정입니다.']};
}
const api={VERSION,REVIEWED,FIELDS,CHOICES,LOCATORS,TERMS,defaults,normalize,audit};
if(node)module.exports=api;else root.PortfolioExecution=api;
})(typeof globalThis!=='undefined'?globalThis:this);
