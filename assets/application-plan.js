/* P0.14: evidence-linked business-plan working drafts. Pure functions; no model/network calls. */
(function(root){
'use strict';
const VERSION='0.14.0',SCHEMA='private-funding-applications/v3';
const SECTIONS=Object.freeze([
['problem','고객·문제','누가 어떤 업무에서 어떤 비용·불편을 겪는가? 인터뷰와 측정 근거를 구분하십시오.'],
['solution','제품·AI 기술','제품 흐름, 자체 개발 범위, 외부 모델 의존, 기존 방식과의 차이를 적으십시오.'],
['validation','검증·실증','실제 시험 조건·표본·기간·결과와 앞으로의 실증 목표를 구분하십시오.'],
['market','시장·수익모델','첫 구매자, 가격 가정, 고객 확보 경로와 실제 계약·매출을 구분하십시오.'],
['execution','개발·사업화 일정','기간별 산출물, 담당 역할, 검증 방법, 선행조건을 적으십시오.'],
['budget','예산·자부담','요청액·비용 근거·가용 현금·지급 지연 대응을 적고 계산 결과와 대조하십시오.'],
['team','팀·수행역량','실제 확보된 인력·경험과 채용·협력 계획을 구분하십시오. 민감정보는 쓰지 마십시오.'],
['rights','데이터·권리·위험','데이터 사용권, 지식재산권, 보안·품질 위험과 대응 계획을 적으십시오.']
].map(([id,title,prompt])=>Object.freeze({id,title,prompt})));
const clone=x=>JSON.parse(JSON.stringify(x)),bytes=x=>new TextEncoder().encode(x).length,fail=m=>{throw new Error(m);};
const SECTION_KEYS=['id','form_heading','form_locator','facts','proposal','questions','char_limit','evidence_ids','requirement_ids'];
function keys(o,allowed){if(!o||Array.isArray(o)||typeof o!=='object')fail('초안 객체 형식 오류');for(const k of Object.keys(o))if(!allowed.includes(k))fail('허용하지 않는 초안 필드: '+k);for(const k of allowed)if(!Object.hasOwn(o,k))fail('초안 필드 누락: '+k);}
function text(v,max,label,multi=false){if(typeof v!=='string'||v.length>max||(multi?/[\x00-\x08\x0b-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(v))fail(label+' 형식·길이 오류');return v;}
function emptyPlan(){return {project_title:'',one_line:'',sections:SECTIONS.map(s=>({id:s.id,form_heading:'',form_locator:'',facts:'',proposal:'',questions:'',char_limit:null,evidence_ids:[],requirement_ids:[]}))};}
function attach(D){
if(D?.SCHEMA!=='private-funding-applications/v2')fail('준비자료 모듈 버전 불일치');
const LIMITS=Object.freeze({...D.LIMITS,sections:8,section_facts:3000,section_proposal:3000,section_questions:1000});
const strip=s=>({schema:D.SCHEMA,saved_at:s.saved_at,items:s.items.map(a=>Object.fromEntries(['program_id','stage','internal_due','reference','tasks','dossier'].map(k=>[k,a[k]])))});
function checkPlan(p,d){
keys(p,['project_title','one_line','sections']);text(p.project_title,160,'사업명');text(p.one_line,500,'한 줄 설명');
if(!Array.isArray(p.sections)||p.sections.length!==SECTIONS.length)fail('초안은 정해진 8개 항목을 유지해야 합니다.');
const docs=new Set(d.documents.map(e=>e.id)),reqs=new Set(d.requirements.map(r=>r.id));
p.sections.forEach((s,i)=>{
keys(s,SECTION_KEYS);if(s.id!==SECTIONS[i].id)fail('초안 항목 순서·코드 오류');text(s.form_heading,180,'양식 항목명');text(s.form_locator,240,'양식 위치');
text(s.facts,LIMITS.section_facts,'관찰·실적',true);text(s.proposal,LIMITS.section_proposal,'계획·가정',true);text(s.questions,LIMITS.section_questions,'추가 확인사항',true);
if(s.char_limit!==null&&(!Number.isInteger(s.char_limit)||s.char_limit<1||s.char_limit>20000))fail('글자수 가정은 1~20,000 정수 또는 미입력');
for(const [k,set] of [['evidence_ids',docs],['requirement_ids',reqs]])if(!Array.isArray(s[k])||s[k].length>5||new Set(s[k]).size!==s[k].length||s[k].some(id=>typeof id!=='string'||!set.has(id)))fail('초안의 자료·요구사항 연결 오류');
});return p;
}
function validate(s){
if(s?.schema!==SCHEMA){const old=D.validate(s);return validate({schema:SCHEMA,saved_at:old.saved_at,items:old.items.map(a=>({...a,plan:emptyPlan()}))});}
keys(s,['schema','saved_at','items']);if(!Array.isArray(s.items))fail('준비 항목 형식 오류');for(const a of s.items)keys(a,['program_id','stage','internal_due','reference','tasks','dossier','plan']);
const b=D.validate(strip(s));s.items.forEach((a,i)=>checkPlan(a.plan,b.items[i].dossier));
const out={schema:SCHEMA,saved_at:b.saved_at,items:b.items.map((a,i)=>({...a,plan:clone(s.items[i].plan)}))};
if(bytes(JSON.stringify(out))>LIMITS.bytes)fail('초안을 포함한 준비파일 크기 한도 512 KiB');return out;
}
function preserve(base,prior){
const plans=new Map(prior.items.map(a=>[a.program_id,a.plan]));return validate({schema:SCHEMA,saved_at:base.saved_at,items:base.items.map(a=>{
const plan=clone(plans.get(a.program_id)||emptyPlan()),docs=new Set(a.dossier.documents.map(e=>e.id)),reqs=new Set(a.dossier.requirements.map(r=>r.id));
for(const s of plan.sections){s.evidence_ids=s.evidence_ids.filter(id=>docs.has(id));s.requirement_ids=s.requirement_ids.filter(id=>reqs.has(id));}return {...a,plan};})});
}
const mutations={};for(const name of ['add','acknowledge','addRequirement','addDocument','editRequirement','editDocument','link','unlink','removeDocument','removeRequirement','review'])mutations[name]=(s,...args)=>{const v=validate(s);return preserve(D[name](strip(v),...args),v);};
function empty(now=new Date()){return validate(D.empty(now));}
function parseFile(raw){
if(typeof raw!=='string'||bytes(raw)>LIMITS.bytes)fail('준비파일은 UTF-8 JSON 512 KiB 이하여야 합니다.');
const obj=JSON.parse(raw,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))fail('금지된 필드');return v;});let nodes=0;
function scan(v,d){if(d>14||++nodes>60000)fail('초안 파일 구조 한도 초과');if(v&&typeof v==='object')for(const x of Object.values(v))scan(x,d+1);}scan(obj,0);return validate(obj);
}
function serialize(s,now=new Date()){const v=validate(s);v.saved_at=now.toISOString();const out=validate(v),pretty=JSON.stringify(out,null,2);return bytes(pretty)<=LIMITS.bytes?pretty:JSON.stringify(out);}
function mutate(s,pid,fn){const v=validate(s),a=v.items.find(x=>x.program_id===pid);if(!a)fail('준비 공고 없음');fn(a.plan,a.dossier);return validate(v);}
function editPlan(s,pid,sectionId,field,value){return mutate(s,pid,p=>{if(sectionId===null){if(!['project_title','one_line'].includes(field))fail('초안 머리말 필드 오류');p[field]=value;}else{const row=p.sections.find(x=>x.id===sectionId);if(!row||!['form_heading','form_locator','facts','proposal','questions','char_limit'].includes(field))fail('초안 편집 대상 오류');row[field]=typeof value==='string'?value.replace(/\r\n?/g,'\n'):value;}});}
function linkPlan(s,pid,sectionId,kind,code,remove=false){return mutate(s,pid,p=>{const row=p.sections.find(x=>x.id===sectionId);if(!row||!['evidence_ids','requirement_ids'].includes(kind))fail('초안 연결 대상 오류');if(remove){if(!row[kind].includes(code))fail('초안 연결 없음');row[kind]=row[kind].filter(x=>x!==code);}else{if(row[kind].includes(code))fail('이미 연결된 초안 항목');row[kind].push(code);}});}
const bodyText=s=>[s.facts,s.proposal].filter(x=>x.trim()).join('\n\n');
function inspectPlan(a,p,monitor,now=new Date()){
checkPlan(a.plan,a.dossier);const base=D.inspect(a,p,monitor,now),dossier=D.inspectDossier(a,p,monitor,now),docs=new Map(a.dossier.documents.map(e=>[e.id,e])),reqs=new Map(a.dossier.requirements.map(r=>[r.id,r]));
const warnings=[...new Set([...base.issues,...dossier.warnings])];if(!a.plan.project_title.trim())warnings.push('사업명 미입력');if(!a.plan.one_line.trim())warnings.push('사업의 한 줄 설명 미입력');
if(p&&p.mode!=='beneficiary')warnings.push('참고·후보 또는 기업 모집이 아닌 공고: 제출용 확정 양식으로 사용하지 마십시오.');
if(base.reception.code==='expired')warnings.push('기재 마감 경과. 최신 수정·연장 공고 확인 필요.');if(base.reception.code==='today_unknown')warnings.push('오늘 마감이나 정확한 마감시각 미확인.');
const rows=a.plan.sections.map((s,i)=>{
const issues=[],written=!!(s.facts.trim()||s.proposal.trim()),count=Array.from(bodyText(s)).length;
if(!written)issues.push('문안 미입력');if(!s.form_heading.trim()||!s.form_locator.trim())issues.push('공식 양식 항목·위치 대응 미입력');
if(s.facts.trim()&&!s.evidence_ids.length)issues.push('관찰·실적 문안에 자료 참조 연결 없음');if(s.char_limit!==null&&count>s.char_limit)issues.push('자체입력 글자수 가정 초과 ('+count+' / '+s.char_limit+')');
for(const id of s.evidence_ids){const e=docs.get(id);if(e.status!=='ready_self')issues.push(id+': '+D.DOC_STATES[e.status]);for(const q of dossier.document_issues.find(x=>x.id===id)?.issues||[])if(!issues.includes(id+': '+q))issues.push(id+': '+q);}
for(const id of s.requirement_ids){const r=reqs.get(id);if(r.applicability==='not_applicable')issues.push(id+': 해당 없음 자체판단 요구와 연결됨');else if(r.applicability==='unknown'||r.applicability==='conditional')issues.push(id+': 적용 조건 확인 필요');}
if(s.questions.trim())issues.push('추가 확인사항이 기록되어 있습니다.');return {id:s.id,title:SECTIONS[i].title,written,characters:count,issues};
});
const mapped=new Set(a.plan.sections.flatMap(s=>s.requirement_ids)),unmapped=a.dossier.requirements.filter(r=>r.applicability!=='not_applicable'&&!mapped.has(r.id)).map(r=>({id:r.id,title:r.title}));
if(unmapped.length)warnings.push('문안에 연결하지 않은 요구사항 '+unmapped.length+'개. 증빙 전용 요구는 별도 제출목록에서 확인하십시오.');
return {rows,warnings,unmapped,written:rows.filter(x=>x.written).length,issue_sections:rows.filter(x=>x.issues.length).length,official_template_verified:false,claims_verified:false,permission:'not_determined'};
}
function board(s,catalog,monitor,now=new Date()){const v=validate(s),map=new Map(v.items.map(a=>[a.program_id,a]));return D.board(strip(v),catalog,monitor,now).map(r=>({...r,application:map.get(r.application.program_id),plan_check:inspectPlan(map.get(r.application.program_id),r.program,monitor,now)}));}
function draft(s,pid,catalog,monitor,now=new Date()){
const row=board(s,catalog,monitor,now).find(r=>r.application.program_id===pid);if(!row)fail('초안 공고 없음');const a=row.application,check=row.plan_check;if(!check.written)fail('내보내기 전에 최소 한 항목의 문안을 입력하십시오.');
const docs=new Map(a.dossier.documents.map(e=>[e.id,e])),reqs=new Map(a.dossier.requirements.map(r=>[r.id,r]));
const lines=['AI FUNDING RADAR — 비공개 사업계획서 작업 초안','작성 기준: '+now.toISOString(),'대상 공고: '+(row.program?.title||a.reference.title),'공고 코드: '+pid,'사업명: '+(a.plan.project_title||'[입력 필요]'),'한 줄 설명: '+(a.plan.one_line||'[입력 필요]'),'',
'범위: 사용자가 입력한 문안을 항목별로 조립한 작업 초안입니다. AI 문장 생성·원문 문서 읽기·신청 제출을 하지 않았습니다.',
'기본 8개 항목은 내부 작성 가이드이지 해당 공고의 공식 양식·평가표가 아닙니다. 실제 양식의 순서·표·분량·서명을 직접 확인하십시오.',
'관찰·실적과 보유 자료는 모두 자체기록이며 검증되지 않았습니다. 계획·목표를 이미 달성한 성과로 제출하지 마십시오.',
'이 파일은 암호화되지 않았습니다. 외부 공유 또는 AI 서비스에 제공하기 전에 민감정보·비공개 자료의 권한을 확인하십시오.','','[작성·원문 재확인]',...check.warnings.map(x=>'- '+x),''];
a.plan.sections.forEach((s,i)=>{
const c=check.rows[i];lines.push('=== '+(i+1)+'. '+SECTIONS[i].title+' ===','양식 대응(자체입력): '+(s.form_heading||'[미대응]'),'양식 위치: '+(s.form_locator||'[미입력]'),
'문안 글자수: '+c.characters+' / 자체입력 가정: '+(s.char_limit??'미입력')+' (공백·줄바꿈 포함 Unicode 문자 수, 공식 편집기 분량 계산과 다를 수 있음)',
'[자체입력 관찰·실적 — 미검증]',s.facts.trim()?s.facts:'[입력 필요: 실제 확인한 내용만 작성]',
'[계획·목표·가정 — 달성 실적 아님]',s.proposal.trim()?s.proposal:'[입력 필요: 계획과 검증 방법 작성]',
'[추가 확인사항]',s.questions.trim()?s.questions:'[별도 기록 없음 — 검토 완료를 뜻하지 않음]',
'[연결한 요구사항]',...(s.requirement_ids.length?s.requirement_ids.map(id=>{const r=reqs.get(id);return id+' '+r.title+' / '+D.ORIGINS[r.origin]+' / '+(r.locator||'위치 미입력');}):['연결 없음']),
'[자료 참조 — 파일 원본 미포함]',...(s.evidence_ids.length?s.evidence_ids.map(id=>{const e=docs.get(id);return id+' '+e.title+' / '+D.DOC_STATES[e.status]+' / 별칭: '+(e.file_label||'미입력');}):['연결 없음']),
'[내부 점검]',...(c.issues.length?c.issues.map(x=>'- '+x):['입력 범위에서만 점검 항목 미발견. 공식 승인·내용 검증 아님.']),'');});
lines.push('[문안에 미연결한 요구사항]',...(check.unmapped.length?check.unmapped.map(x=>x.id+' '+x.title):['입력된 요구사항 범위에서만 미연결 없음. 공식 요구사항 전체를 확인한 것은 아님.']),
'','[제출 전 직접 확인]','- 최신 공고·첨부 양식에 맞게 항목·순서·분량을 다시 편집했는가?','- 모든 수치·성과·권리·비용 주장을 원본 자료와 대조했는가?','- 계획과 달성 실적, 자체기록과 공식 확인을 구분했는가?','- 접수처에서 실제 제출 결과와 접수증을 확인했는가?');
return {text:lines.join('\n')+'\n',check};
}
return Object.freeze({...D,...mutations,VERSION,SCHEMA,LIMITS,SECTIONS,empty,validate,parseFile,serialize,editPlan,linkPlan,inspectPlan,board,draft,calendar:(s,...args)=>D.calendar(strip(validate(s)),...args),preflight:(s,...args)=>D.preflight(strip(validate(s)),...args)});
}
const api={VERSION,SCHEMA,SECTIONS,emptyPlan,attach};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FundingApplicationPlan=api;
})(typeof globalThis!=='undefined'?globalThis:this);
