/* P0.21: read a generated local-only heading candidate file; no network or persistence. */
(function(root){
'use strict';
const SCHEMA="local-form-outline-candidates/v1", LIMIT=100000, MAX=40;
function fail(msg){throw new Error(msg);}
function validate(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>LIMIT)fail("후보 JSON 100KB 한도 초과");
 let data;
 try {data=JSON.parse(raw,(k,v)=>{if(["__proto__","prototype","constructor"].includes(k))fail("금지 객체 키");return v;});}
 catch(e){fail("잘못된 후보 JSON 또는 금지된 필드");}
 if(!data||data.schema!==SCHEMA||!Array.isArray(data.candidates)||data.candidates.length>MAX)fail("지원하지 않는 후보 구조");
 const doc=data.document;
 if(!doc||typeof doc.sha256!=="string"||!/^[a-f0-9]{64}$/.test(doc.sha256)||
   !["pdf","hwp","hwpx"].includes(doc.format)||doc.source_status!=="self_supplied_unverified"||
   typeof doc.file_label!=="string"||doc.file_label.length>160||
   typeof doc.source_url!=="string"||doc.source_url.length>2500)fail("문서 지문·출처 형식 오류");
 if(typeof data.note!=="string"||!data.note.includes("미검증"))fail("후보 한계 안내 누락");
 if(data.candidates.some((c,i)=>!c||c.id!=="H"+(i+1)||
   typeof c.heading!=="string"||!c.heading.trim()||c.heading.length>140||
   /[\x00-\x1f\x7f]/.test(c.heading)||typeof c.locator!=="string"||
   c.locator.length>180||!c.locator||
   !["numbered","known_heading"].includes(c.reason)||
   c.status!=="candidate_unverified"))fail("항목 제목·원문 위치 또는 미검증 상태 오류");
 return data;
}
const api=Object.freeze({SCHEMA,validate});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
else root.FundingFormOutlineImport=api;
if(typeof document==="undefined")return;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let data=null,selected=new Set();
function reset(){
 data=null;selected=new Set();
 $("outlineCandidateRows").innerHTML="";
 $("outlineCandidateStatus").textContent="";
 $("approveCandidateCopy").checked=false;
 $("applyOutlineCandidates").disabled=true;
}
function status(s){$("outlineCandidateStatus").textContent=s;}
$("outlineCandidateFile").addEventListener("change",async e=>{
 reset();
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>LIMIT)fail("후보 파일은 100KB 이하여야 합니다.");
  const parsed=validate(await file.text());data=parsed;
  $("outlineCandidateRows").innerHTML=parsed.candidates.map((c,i)=>
   '<label class="outline-candidate"><input type="checkbox" data-index="'+i+'">'+
   '<span><b>'+esc(c.heading)+'</b><small>'+esc(c.locator)+' · 미검증 후보</small></span></label>'
  ).join("")||'<p>추출된 제목 후보가 없습니다. 공식 양식 원문에서 직접 목차를 확인하십시오.</p>';
  status("미검증 후보 "+parsed.candidates.length+"건 · "+parsed.document.format.toUpperCase()+
   " · 문서 SHA-256 "+parsed.document.sha256.slice(0,12)+"… · 원본 파일·버전은 사용자가 직접 대조해야 합니다.");
 }catch(err){status("후보 파일 읽기 거부: "+String(err.message||err));}
});
function enable(){ $("applyOutlineCandidates").disabled=!(data&&selected.size&&$("approveCandidateCopy").checked); }
$("outlineCandidateRows").addEventListener("change",e=>{
 const i=Number(e.target?.dataset?.index);
 if(!data||!Number.isInteger(i)||i<0||i>=data.candidates.length)return;
 if(e.target.checked)selected.add(i);else selected.delete(i);
 enable();
});
$("approveCandidateCopy").addEventListener("change",enable);
$("applyOutlineCandidates").addEventListener("click",()=>{
 if(!data||!selected.size||!$("approveCandidateCopy").checked)return;
 const lines=[...selected].sort((a,b)=>a-b).map(i=>data.candidates[i].heading);
 try{
   if(!root.FundingFormMappingUI?.importOutline)fail("목차 대응 화면을 불러오지 못했습니다.");
   root.FundingFormMappingUI.importOutline(lines);
   status("선택한 미검증 후보 "+lines.length+"건을 목차 입력창에 복사했습니다. 직접 수정·분석·수동 대응하십시오.");
   $("approveCandidateCopy").checked=false;enable();
 }catch(err){status("복사 실패: "+String(err.message||err));}
});
})(typeof globalThis!=="undefined"?globalThis:this);
