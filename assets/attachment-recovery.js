/* P0.23 read-only public collector repair plan. No LLM/private data writes. */
(function(root){
'use strict';
const SCHEMA='public-funding-attachment-recovery/v1';
const ACTION={queued:'신규 첨부 처리',retry_due:'전송 오류 재시도 예정',retry_wait:'재시도 대기시간',
 manual:'원문 수동 검토',revisit:'기존 성공 자료 재확인',current:'최근 처리됨',inactive:'현재 연결되지 않음'};
function check(data){
 if(!data||data.schema!==SCHEMA||data.version!=='0.23.0'||
    !data.counts||!Array.isArray(data.selected)||data.selected.length>4||
    !Array.isArray(data.issues)||data.issues.length>25||
    !Number.isFinite(Date.parse(data.generated_at))||
    !Number.isInteger(data.active_records)||data.active_records<0)
    throw Error('복구 보고서 구조 오류');
 for(const k of Object.keys(ACTION)){
   if(!Number.isInteger(data.counts[k])||data.counts[k]<0)throw Error('분류 건수 오류');
 }
 for(const item of [...data.selected,...data.issues]){
   if(!item||typeof item.id!=='string'||!/^[a-f0-9]{24}$/.test(item.id)||
     typeof item.program_id!=='string'||item.program_id.length>160||
     !Object.hasOwn(ACTION,item.decision)||
     typeof item.reason!=='string'||item.reason.length>100||
     typeof item.review_required!=='boolean')throw Error('대기 항목 구조 오류');
 }
 return data;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(raw){
 const x=check(raw),c=x.counts;
 const selected=x.selected.map(r=>'<li><b>'+esc(ACTION[r.decision])+'</b> · <code>'+esc(r.id.slice(0,12))+'</code>'+
   '<small> 공고 참조: '+esc(r.program_id)+' · 이전 성공 자료 '+(r.previous_extraction_kept?'별도 보존':'없음')+'</small></li>').join('');
 const errors=x.issues.filter(r=>r.decision==='manual').slice(0,10).map(r=>'<li>'+esc(ACTION[r.decision])+
   ' · '+esc(r.status)+' · <code>'+esc(r.id.slice(0,12))+'</code></li>').join('');
 return '<div class="bot-banner bot-warning"><b>재시도 가능한 전송 오류 '+esc(c.retry_due)+
 '건 · 쿨다운 '+esc(c.retry_wait)+'건 · 원문 직접검토 '+esc(c.manual)+'건</b>'+
 '<p>정기 수집에서 이번 최대 4건만 시도합니다. 이전 실패 기록과 성공했던 본문은 삭제하지 않습니다.</p></div>'+
 '<div class="bot-grid">'+
 '<div class="bot-lane"><b>아직 처리하지 않은 첨부</b><span>'+esc(c.queued)+'건</span><small>최초 처리 슬롯에 우선 배정</small></div>'+
 '<div class="bot-lane"><b>이전 성공 자료 순환 재확인</b><span>'+esc(c.revisit)+'건</span><small>최근 처리된 '+esc(c.current)+'건은 불필요한 재수집을 피합니다.</small></div></div>'+
 '<details class="audit-box"><summary>다음 제한 수집의 대상 '+esc(x.selected.length)+'건</summary><ul class="bot-list">'+
 (selected||'<li>현재 정책상 자동 재시도 대상 없음</li>')+'</ul></details>'+
 '<details class="audit-box"><summary>접근권한·형식·본문 한계 등 직접 검토</summary><ul class="bot-list">'+
 (errors||'<li>현재 집계된 직접 검토 항목 없음. 공식 검증 완료는 아님.</li>')+
 '</ul>'+(x.issues_truncated?'<p>일부 항목은 화면 표시 한도를 넘어 생략했습니다.</p>':'')+'</details>'+
 '<p>집계 기준: '+esc(x.generated_at)+' · '+esc(x.scope)+'</p>';
}
const api={check,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FundingAttachmentRecovery=api;
if(typeof document==='undefined')return;
const host=document.getElementById('attachmentRecoveryBody');
if(!host)return;
let active=0;
async function load(){
 const ticket=++active;
 try{
  const res=await fetch('data/attachment_recovery.json?v='+Date.now(),{cache:'no-store',credentials:'omit'});
  if(!res.ok)throw Error('failed');
  const data=await res.json();
  if(ticket===active)host.innerHTML=render(data);
 }catch{
  if(ticket===active)host.textContent='첨부 복구 현황을 확인하지 못했습니다. 실패 없음·자료 검증 완료로 해석하지 마십시오.';
 }
}
document.getElementById('refreshBtn')?.addEventListener('click',load);
load();
})(typeof globalThis!=='undefined'?globalThis:this);
