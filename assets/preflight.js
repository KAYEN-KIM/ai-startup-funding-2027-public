"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const VALID_SCHEMAS=new Set(["private-funding-applications/v3"]);
 const C=globalThis.FundingApplicationPlan?.attach?.(globalThis.FundingApplicationDossier?.attach?.(globalThis.FundingApplications));
 if(!C){document.getElementById("checkStatus").textContent="검증 모듈을 불러오지 못했습니다. 파일을 열지 마십시오.";return;}
 const TITLES=["고객·문제","제품·AI 기술","검증·실증","시장·수익모델","개발·사업화 일정","예산·자부담","팀·수행역량","데이터·권리·위험"];
 let report=null;
 function isObject(o){return !!o&&typeof o==="object"&&!Array.isArray(o)}
 function reject(msg){throw new Error(msg)}
 function scan(value,depth=0,state={nodes:0}) {
   if(depth>20||++state.nodes>60000)reject("파일 구조 한도 초과");
   if(isObject(value)||Array.isArray(value))for(const v of Object.values(value))scan(v,depth+1,state);
 }
 function analyze(o) {
   if(!isObject(o)||!VALID_SCHEMAS.has(o.schema)||!Array.isArray(o.items)||o.items.length>12)reject("지원되지 않는 준비파일 형식");
   scan(o);
   const applications=[];
   const seen=new Set();
   for(const a of o.items){
     if(!isObject(a)||typeof a.program_id!=="string"||!a.program_id||seen.has(a.program_id)||!isObject(a.reference)||typeof a.reference.title!=="string")reject("공고 식별자 또는 구조 오류");
     seen.add(a.program_id);
     const problems=[],tasks=Array.isArray(a.tasks)?a.tasks:[],docs=a.dossier?.documents,reqs=a.dossier?.requirements;
     if(!Array.isArray(a.tasks)||tasks.length>20)reject("준비 항목 구조 오류");
     for(const t of tasks){if(!isObject(t)||typeof t.title!=="string"||typeof t.status!=="string")reject("작업 형식 오류");if(!["done","not_applicable"].includes(t.status))problems.push("미완료 준비: "+t.title);}
     const mode=a.reference.mode;
     if(mode!=="beneficiary")problems.push("실제 수혜기업 신청 공고로 확정되지 않음");
     const closing=a.reference.deadline;
     const today=new Date(Date.now()+32400000).toISOString().slice(0,10);
     if(!closing)problems.push("마감일·시각 최신 원문 확인 필요");
     else if(/^20\d{2}-\d{2}-\d{2}$/.test(closing)){
       if(closing<today)problems.push("기재 마감일 경과 — 연장·수정공고 여부 재확인");
       else if(closing===today)problems.push("오늘 기재 마감 · 정확한 마감시각 미확인");
       else problems.push("날짜만 기록됨 — 공식 마감시각 확인 필요");
     }else if(Date.parse(closing)<Date.now())problems.push("기재 마감시각 경과 — 연장·수정공고 여부 재확인");
     if(a.stage==="submitted"||a.stage==="selected")problems.push("제출·선정은 사용자 자체기록 — 공식 접수증·기관 결과 대조 필요");
     if(o.schema!=="private-funding-applications/v1"){
       if(!isObject(a.dossier)||!Array.isArray(docs)||!Array.isArray(reqs)||docs.length>30||reqs.length>30)reject("요구사항/자료 구조 오류");
       const ids=new Set(docs.map(x=>x.id));
       if(ids.size!==docs.length)reject("자료 코드 중복");
       for(const doc of docs){
         if(!isObject(doc)||typeof doc.id!=="string"||typeof doc.status!=="string")reject("자료 형식 오류");
         if(doc.status!=="ready_self")problems.push("자료 상태 미완료: "+(doc.title||doc.id));
         if(doc.valid_until&&doc.valid_until<new Date(Date.now()+32400000).toISOString().slice(0,10))problems.push("자료 유효기간 경과: "+(doc.title||doc.id));
       }
       if(!reqs.length)problems.push("공식 제출요구 목록을 별도 대조하지 않음");
       for(const r of reqs){
         if(!isObject(r)||!Array.isArray(r.evidence_ids)||r.evidence_ids.some(id=>!ids.has(id)))reject("요구사항 자료 연결 오류");
         if(r.applicability==="unknown"||r.applicability==="conditional")problems.push("적용 조건 확인 필요: "+r.title);
         if(r.applicability==="required"&&!r.evidence_ids.length)problems.push("요구사항 자료 미연결: "+r.title);
       }
       if(!a.dossier.reviewed_at)problems.push("공식 요구사항 원문 재대조 기록 없음");
     } else problems.push("v1 파일: 자료·요구사항 연결 없음");
     if(o.schema==="private-funding-applications/v3"){
       if(!isObject(a.plan)||!Array.isArray(a.plan.sections)||a.plan.sections.length!==8)reject("사업계획서 항목 구조 오류");
       if(!String(a.plan.project_title||"").trim())problems.push("사업계획서 사업명 미입력");
       for(let i=0;i<8;i++){
         const s=a.plan.sections[i];
         if(!isObject(s)||!Array.isArray(s.evidence_ids)||!Array.isArray(s.requirement_ids))reject("초안 연결 구조 오류");
         if(!String(s.facts||"").trim()&&!String(s.proposal||"").trim())problems.push(TITLES[i]+": 문안 없음");
         if(!String(s.form_heading||"").trim()||!String(s.form_locator||"").trim())problems.push(TITLES[i]+": 공식 양식 위치 미입력");
         if(String(s.facts||"").trim()&&!s.evidence_ids.length)problems.push(TITLES[i]+": 실적 근거 연결 없음");
         if(s.char_limit!==null&&Number.isInteger(s.char_limit)&&[...String(s.facts||"")+String(s.proposal||"")].length>s.char_limit)problems.push(TITLES[i]+": 자체 글자수 한도 초과");
       }
     }else problems.push("사업계획서 v3 초안 항목 미포함");
     problems.push("최신 공고·첨부의 전체 변경 및 기관 접수상태는 이 파일만으로 확인 불가");
     applications.push({title:a.reference.title,id:a.program_id,issues:[...new Set(problems)]});
   }
   return applications;
 }
 function render(items){
   $("checkSummary").textContent=items.length+"개 공고 · 점검 알림 "+items.reduce((a,x)=>a+x.issues.length,0)+"건";
   $("checkResults").innerHTML=items.map(x=>'<article class="program-card"><h3>'+esc(x.title)+'</h3><p class="boundary">신청 허용·자격 통과 판정이 아닙니다.</p><ul>'+x.issues.map(y=>'<li>'+esc(y)+'</li>').join("")+'</ul></article>').join("")||'<p>등록 공고가 없습니다.</p>';
 }
 $("checkFile").addEventListener("change",async e=>{
   report=null;$("saveChecklist").disabled=true;$("checkSummary").textContent="";$("checkResults").innerHTML="";
   const file=e.target.files?.[0];if(!file)return;
   try{
     if(file.size>524288)reject("최대 512 KiB 파일만 처리");
     const raw=await file.text();
     if(new TextEncoder().encode(raw).length>524288)reject("UTF-8 한도 초과");
     const data=C.parseFile(raw);
     const results=analyze(data);
     render(results);report=results;
     $("saveChecklist").disabled=false;$("checkStatus").textContent="로컬 점검 완료. 공식 양식과 재대조하십시오.";
   }catch(err){$("checkStatus").textContent="읽기/검증 실패: "+String(err?.message||"알 수 없는 오류");}
 });
 $("saveChecklist").addEventListener("click",()=>{
   if(!report)return;
   const text="AI FUNDING RADAR P0.19 — 로컬 제출 전 참고 점검\n"+
   "공식 서류 검증이나 신청자격 확정이 아니며 최신 공고는 별도 확인 필요.\n\n"+
   report.map(x=>x.title+"\n"+x.issues.map(i=>"- "+i).join("\n")).join("\n\n");
   const url=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));
   const a=document.createElement("a");a.href=url;a.download="funding-preflight-local.txt";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 });
})();