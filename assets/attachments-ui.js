'use strict';
(()=>{
 const $=id=>document.getElementById(id),A=window.AttachmentCore;
 const state={docs:{records:{},programs:{}},programs:[],ready:false};
 function render(){
  if(!state.ready){$('attachmentCount').textContent='';return;}
  const filter=$('attachmentSearch').value.trim().toLowerCase(),kind=$('attachmentState').value;
  const programs=Object.fromEntries(state.programs.map(p=>[p.id,p]));
  const all=Object.values(state.docs.records),rows=all.filter(r=>{
   if(kind==='review'&&!r.review_required&&!state.docs.programs[r.program_id]?.review_required)return false;
   if(kind==='error'&&(!r.last_error))return false;
   if(kind==='extracted'&&!r.extraction)return false;
   return !filter||[programs[r.program_id]?.title,r.name,...(r.extraction?.candidate_facts||[]).map(c=>c.excerpt)].join(' ').toLowerCase().includes(filter);
  });
  $('attachmentCount').textContent='표시 '+rows.length+' / 기록 '+all.length+'건 · 판정용 검증 규칙으로 자동 승격하지 않습니다.';
  $('attachmentList').innerHTML=rows.length?rows.map(r=>A.card(r,programs[r.program_id]?.title||r.program_id,state.docs.programs[r.program_id])).join(''):'<p class="empty">해당 첨부 기록이 없습니다. 미수집은 지원 조건 없음이 아닙니다.</p>';
 }
 async function load(){
  state.ready=false;$('reloadAttachments').disabled=true;$('attachmentAudit').textContent='공개 첨부 근거를 읽는 중입니다.';
  try{
   const get=async n=>{const r=await fetch('data/'+n+'?v='+Date.now(),{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
   const [p,a]=await Promise.all(['programs.json','attachments.json'].map(get));
   if(p.schema!=='public-funding-radar/v1'||a.schema!=='public-funding-attachments/v1'||!a.records||!a.programs)throw Error('자료 형식 불일치');
   state.programs=p.items;state.docs=a;state.ready=true;const r=a.run||{};
   $('attachmentAudit').textContent=(a.generated_at||'아직 실행 전')+' · 이번 회차 첨부 시도 '+(r.attempted||0)+'건 / 본문 추출 '+(r.text_extracted||0)+' / 일부·텍스트 없음 '+(r.partial_or_no_text||0)+' / 차단·미지원 '+(r.blocked_or_unsupported||0)+' / 실패 '+(r.failed||0)+' · 원문 열람 실패 '+(r.notice_failed||0)+'건';
   render();
  }catch(e){state.programs=[];state.docs={records:{},programs:{}};$('attachmentCount').textContent='';$('attachmentAudit').textContent='첨부 근거 조회 실패: '+e.message;$('attachmentList').textContent='이전 기록을 현재 검증된 것으로 사용하지 마십시오.';}
  finally{$('reloadAttachments').disabled=false;}
 }
 $('attachmentSearch').addEventListener('input',render);$('attachmentState').addEventListener('change',render);$('reloadAttachments').addEventListener('click',load);load();
})();
