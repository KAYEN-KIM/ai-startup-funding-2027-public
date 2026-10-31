/* P0.20: manually supplied official form outline -> private draft mapping.
 * Deterministic only. No model calls, cookies, networking or automatic submission. */
(function(root){
"use strict";
const SECTION_INFO=Object.freeze([
 ["problem","고객·문제",["문제인식","문제정의","고객문제","시장문제","수요분석","사업필요성"]],
 ["solution","제품·AI 기술",["실현가능성","창업아이템","제품서비스","기술차별","기술혁신","핵심기술"]],
 ["validation","검증·실증",["검증실적","실증계획","성능시험","테스트결과","실증성과","시제품검증"]],
 ["market","시장·수익모델",["성장전략","사업화전략","시장진입","수익모델","판로개척","사업모델","시장확대"]],
 ["execution","개발·사업화 일정",["추진일정","추진계획","실행일정","사업수행계획","개발일정","추진체계"]],
 ["budget","예산·자부담",["사업비","자부담","재원조달","소요예산","정부지원금","사업비집행"]],
 ["team","팀·수행역량",["팀구성","팀역량","인력구성","대표역량","인적자원","보유인력","기업현황"]],
 ["rights","데이터·권리·위험",["지식재산","정보보안","개인정보","데이터권리","위험관리","윤리","보안계획"]]
]);
const IDS=SECTION_INFO.map(x=>x[0]);const MAX_HEADINGS=40;const MAX_TEXT=12000;
function fail(m){throw new Error(m);}
function norm(s){return String(s).normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");}
function headings(raw){
 if(typeof raw!=="string"||raw.length>MAX_TEXT)fail("양식 목차는 12,000자 이하여야 합니다.");
 const lines=raw.replace(/\r/g,"").split("\n").map(x=>x.trim()).filter(Boolean);
 if(!lines.length)fail("양식의 항목 제목을 한 줄씩 입력하십시오.");
 if(lines.length>MAX_HEADINGS)fail("양식 제목은 최대 40줄입니다. 본문을 붙여넣지 마십시오.");
 const result=lines.map((line,index)=>{
  if(line.length>140||/[\x00-\x08\x0b-\x1f\x7f]/.test(line))fail("양식 제목의 길이·제어문자 오류 ("+(index+1)+"행)");
  const title=line.replace(/^(?:제\s*\d+\s*[장절항]\s*|[0-9]{1,3}(?:\s*[-.]\s*[0-9]{1,3}){0,4}\s*[.):．]?\s*|[가-하]\s*[.)]\s*|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.)]?\s*|[①-⑳]\s*)/u,"").trim()||line;
  return {id:"F"+(index+1),raw:line,title};
 });
 return result;
}
function suggest(title){
 const n=norm(title), found=SECTION_INFO.filter(x=>x[2].some(a=>n.includes(norm(a))));
 if(!found.length)return {code:"none",sections:[]};
 if(found.length>1)return {code:"ambiguous",sections:found.map(x=>x[0])};
 return {code:"candidate",sections:[found[0][0]]};
}
function sourceInfo(form){
 if(!form||typeof form!=="object")fail("양식 출처가 없습니다.");
 for(const k of ["title","edition","source"]){
  if(typeof form[k]!=="string"||form[k].length>(k==="source"?512:180)||/[\x00-\x1f\x7f]/.test(form[k]))fail("양식 출처 형식 오류: "+k);
 }
 if(form.source&&(!/^https:\/\/[^@\s/]+(?:\/[^\s]*)?$/i.test(form.source)||form.source.includes("\\")))fail("양식 출처는 HTTPS URL 또는 빈칸이어야 합니다.");
 return form;
}
function build({fields,choices,application,form}){
 sourceInfo(form);
 if(!Array.isArray(fields)||fields.length<1||fields.length>MAX_HEADINGS||!Array.isArray(choices)||choices.length!==fields.length)fail("목차·연결 배열 불일치");
 if(!application||!application.reference||!application.plan||!Array.isArray(application.plan.sections)||application.plan.sections.length!==8)fail("검증된 v3 준비파일의 사업계획서가 필요합니다.");
 const sectionMap=new Map(application.plan.sections.map(s=>[s.id,s]));
 if(IDS.some(id=>!sectionMap.has(id)))fail("사업계획서 항목 구성이 다릅니다.");
 const issues=[],used=new Map(),out=[
 "AI FUNDING RADAR — 양식 목차 대응 작업패킷 P0.20",
 "범위: 사용자가 붙여넣은 목차와 자체 작성 초안의 수동 연결. 정부 공식 양식 검증·파일 기입·지원 적격·신청 제출이 아닙니다.",
 "자체입력 실적과 계획은 검증되지 않았습니다. 공식 접수 전 원문·표·순서·분량·파일형식을 반드시 직접 확인하십시오.",
 "문서명(사용자 입력): "+(form.title||"[미입력]"),
 "양식 버전(사용자 입력): "+(form.edition||"[미입력]"),
 "양식 출처(확인 전 입력): "+(form.source||"[미입력]"),
 "공고명(저장파일 기록): "+application.reference.title,
 "공고 ID(저장파일 기록): "+application.program_id,
 "","[양식 항목별 초안 대응]"
 ];
 for(let i=0;i<fields.length;i++){
  const item=fields[i],ch=choices[i];
  if(!item||item.id!=="F"+(i+1)||typeof item.title!=="string"||typeof item.raw!=="string"||item.raw.length>140)fail("양식 항목 식별·길이 오류");
  if(!ch||typeof ch.section!=="string"||typeof ch.scope!=="string"||!["both","facts","proposal"].includes(ch.scope))fail("연결 설정 형식 오류");
  if(ch.section&&!sectionMap.has(ch.section))fail("존재하지 않는 초안 항목을 연결했습니다.");
  out.push("","■ "+item.id+" "+item.raw);
  if(!ch.section){issues.push(item.id+" 미연결: "+item.raw);out.push("대응: 미설정 · 직접 확인 필요");continue;}
  const n=(used.get(ch.section)||0)+1;used.set(ch.section,n);
  const section=sectionMap.get(ch.section),title=SECTION_INFO.find(x=>x[0]===ch.section)[1];
  out.push("대응: "+title+" (사용자 선택 · 공식 검증 아님)");
  if(["both","facts"].includes(ch.scope))out.push("[관찰·실적 — 사용자 자체기록·미검증]",section.facts?.trim()||"[미작성]");
  if(["both","proposal"].includes(ch.scope))out.push("[향후 계획·목표 — 달성된 실적 아님]",section.proposal?.trim()||"[미작성]");
  out.push("근거 자료 참조코드: "+(section.evidence_ids?.join(", ")||"없음"),"요구사항 참조코드: "+(section.requirement_ids?.join(", ")||"없음"));
  if(!section.facts?.trim()&&!section.proposal?.trim())issues.push(item.id+" 연결된 문안이 비어 있음");
 }
 for(const [id,count] of used)if(count>1)issues.push(SECTION_INFO.find(x=>x[0]===id)[1]+": "+count+"개 양식 항목에 중복 대응 — 문안 중복 여부 검토");
 if(!form.edition.trim())issues.push("양식 버전·수정일 확인 필요");
 if(!form.source.trim())issues.push("양식 공식 출처 링크 확인 필요");
 issues.push("표·이미지·서명·첨부·공식 글자수 제한은 이 도구에서 검증하지 않음");
 out.push("","[제출 전 확인 사항]",...issues.map(x=>"- "+x),"","자동 업로드·AI 생성·서버 저장은 실행하지 않았습니다.");
 return {text:out.join("\n")+"\n",issues,connected:used.size,total:fields.length};
}
const api=Object.freeze({SECTION_INFO,IDS,headings,suggest,build});
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.FundingFormMapping=api;
if(typeof document==="undefined")return;
const $=id=>document.getElementById(id);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state={applications:[],current:null,fields:[],choices:[],generated:null};
const runtime=root.FundingApplicationPlan?.attach?.(root.FundingApplicationDossier?.attach?.(root.FundingApplications));
if(!runtime){$("formStatus").textContent="기존 준비파일 검증 모듈을 불러오지 못했습니다.";return;}
function invalidate(){state.generated=null;$("exportPacket").disabled=true;$("packetPreview").textContent="변경된 설정을 검토하려면 '미리보기'를 다시 누르십시오.";}
root.FundingFormMappingUI=Object.freeze({
 importOutline(lines){
  if(!Array.isArray(lines)||lines.length<1||lines.length>MAX_HEADINGS||
     lines.some(x=>typeof x!=="string"||x.length>140))fail("목차 후보 배열 오류");
  const joined=lines.join("\n");
  // Validate before modifying the current draft or user choices.
  headings(joined);
  $("outlineInput").value=joined;
  state.fields=[];state.choices=[];
  $("mappedRows").innerHTML="";
  $("mappingSummary").textContent="후보를 목차 입력창에 복사했습니다. 이제 '목차 분석' 후 직접 대응을 선택하십시오.";
  invalidate();
  $("formStatus").textContent="공식 양식의 확정 목차가 아닌, 사용자가 선택한 미검증 후보를 입력창에 복사했습니다.";
  return lines.length;
 }
});
function render(){
 const choices=state.choices;
 const list=$("mappedRows");
 list.innerHTML=state.fields.map((f,i)=>{
 const recommendation=suggest(f.title);
 const hint=recommendation.code==="none"?"추천 없음":recommendation.code==="ambiguous"?"복수 후보(수동 선택 필요)":("참고 후보: "+SECTION_INFO.find(x=>x[0]===recommendation.sections[0])[1]);
 const opts=['<option value="">대응 없음 · 직접 선택</option>',...SECTION_INFO.map(x=>'<option value="'+x[0]+'"'+(choices[i].section===x[0]?" selected":"")+'>'+escape(x[1])+'</option>')].join("");
 return '<div class="mapping-row"><div><b>'+escape(f.id+". "+f.raw)+'</b><small>'+escape(hint)+' · 추천은 승인·자동입력이 아닙니다.</small></div><label>초안 항목<select data-index="'+i+'" data-field="section">'+opts+'</select></label><label>포함 범위<select data-index="'+i+'" data-field="scope"><option value="both"'+(choices[i].scope==="both"?" selected":"")+'>실적과 계획</option><option value="facts"'+(choices[i].scope==="facts"?" selected":"")+'>실적만</option><option value="proposal"'+(choices[i].scope==="proposal"?" selected":"")+'>계획만</option></select></label></div>';
 }).join("");
 $("mappingSummary").textContent=state.fields.length+"개 목차 · 수동 연결 "+choices.filter(x=>x.section).length+"개 · 나머지는 미연결";
}
$("prepFile").addEventListener("change",async e=>{
 state.current=null;state.applications=[];invalidate();$("packetPreview").textContent="";$("projectSelect").innerHTML="";
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>524288)fail("준비파일 최대 크기는 512 KiB입니다.");
  const raw=await file.text();
  const result=runtime.parseFile(raw);
  state.applications=result.items;
  $("projectSelect").innerHTML=result.items.map((a,i)=>'<option value="'+i+'">'+escape(a.reference.title)+'</option>').join("");
  state.current=result.items[0]||null;
  $("formStatus").textContent="준비파일 "+result.items.length+"개 공고를 검증했습니다. 입력은 현재 화면에만 남습니다.";
 }catch(err){$("formStatus").textContent="읽기 거부: "+String(err.message||err);}
});
$("projectSelect").addEventListener("change",e=>{state.current=state.applications[Number(e.target.value)]||null;invalidate();});
$("outlineInput").addEventListener("input",()=>{state.fields=[];state.choices=[];$("mappedRows").innerHTML="";$("mappingSummary").textContent="목차를 다시 분석하십시오.";invalidate();});
$("parseOutline").addEventListener("click",()=>{
 try{state.fields=headings($("outlineInput").value);state.choices=state.fields.map(()=>({section:"",scope:"both"}));invalidate();render();$("formStatus").textContent="목차를 해석했습니다. 추천을 확인하고 사용자가 항목을 연결하십시오.";}
 catch(err){$("formStatus").textContent="목차 분석 오류: "+err.message;}
});
$("mappedRows").addEventListener("change",e=>{
 const i=Number(e.target.dataset.index),field=e.target.dataset.field;
 if(!Number.isInteger(i)||i<0||i>=state.choices.length||!["section","scope"].includes(field))return;
 const value=e.target.value;
 if(field==="section"&&value&&!IDS.includes(value))return;
 if(field==="scope"&&!["both","facts","proposal"].includes(value))return;
 state.choices[i][field]=value;invalidate();render();
});
["formTitle","formEdition","formSource"].forEach(id=>$(id).addEventListener("input",invalidate));
function packet(){
 if(!state.current)fail("준비파일과 대상 공고를 먼저 선택하십시오.");
 return build({fields:state.fields,choices:state.choices,application:state.current,form:{title:$("formTitle").value,edition:$("formEdition").value,source:$("formSource").value}});
}
$("previewPacket").addEventListener("click",()=>{
 try{const generated=packet();state.generated=generated;$("packetPreview").textContent=generated.text;$("exportPacket").disabled=false;$("formStatus").textContent="작성용 대응 패킷 생성. 연결 누락 "+generated.issues.length+"건(검토 주의 포함). 공식 양식 제출본은 아닙니다.";}
 catch(e){invalidate();$("formStatus").textContent="미리보기 오류: "+e.message;}
});
$("exportPacket").addEventListener("click",()=>{
 if(!state.generated)return;
 try{const fresh=packet();const blob=new Blob([fresh.text],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="funding-form-mapping-private.txt";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);}
 catch(e){invalidate();$("formStatus").textContent="내보내기 보류: "+e.message;}
});
})(typeof globalThis!=="undefined"?globalThis:this);
