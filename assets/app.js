"use strict";
(() => {
  const $=id=>document.getElementById(id), C=window.RadarCore, esc=C.esc;
  const state={items:[],meta:{},monitor:{},evidence:{records:{}},reviews:{items:[]},visible:[],optionalErrors:[]};
  const fmt=v=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v)):"미확인";
  const day=v=>v?String(v).slice(0,10).replace(/-/g,". ")+".":"미확인";
  function link(url,label) {const u=C.sourceURL(url);return u?'<a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(label)+' ↗</a>':esc(label+" (출처 확인 필요)");}
  function card(p) {
    const verification=C.verification(p), d=C.deadline(p), ev=state.evidence.records?.[p.id];
    const reviewCount=state.reviews.items.filter(r=>r.program_id===p.id&&r.status==="pending").length;
    const rawAttachments=[...(p.attachments||[]),...(ev?.attachments||[])];
    const attachments=[...new Map(rawAttachments.filter(a=>C.sourceURL(a.url)).map(a=>[a.url,a])).values()];
    const evStatus=!ev?"원문 HTML 자동 열람 전":ev.status==="fetch_failed"?"이번 원문 열람 실패 · 이전 기록 보존":ev.review_required?"원문 내용 해시 변경 · 재검토 필요":"원문 HTML 열람 완료 · 조건/첨부 미검증";
    const deadlineText=p.deadline?day(p.deadline):"일정 별도 확인";
    const timeText=p.deadline&&p.deadline.length>10?fmt(p.deadline)+" KST":p.deadline?"날짜만 확인 · 23:59로 가정하지 않음":"상시/미정 여부 원문 확인";
    return '<article class="program-card"><div class="card-top"><span class="tag '+verification.css+'">'+esc(verification.text)+'</span><span class="tag '+d.css+'">'+esc(d.text)+'</span><span class="tag kind">'+esc(p.kind)+'</span><span class="tag">'+esc(C.years(p).join(" · "))+'</span>'+(p.relevance==="startup_general"?'<span class="tag s-gold">일반 창업지원 · AI 전용 아님</span>':"")+'</div>'+
      '<div class="card-main"><div><h3>'+esc(p.title)+'</h3><div class="meta"><span>'+esc(p.eligibility||"신청자격 확인 필요")+'</span></div><p class="desc">'+esc(p.note||"")+'</p></div><div class="deadline"><b>'+esc(deadlineText)+'</b><span>'+esc(timeText)+'</span></div></div>'+
      '<div class="card-bottom"><div class="amount">'+esc(p.amount||"규모 미확인")+'</div>'+link(p.source,"공식 원문")+'</div>'+
      '<details class="evidence-details"><summary>근거·첨부·변경 검토'+(reviewCount?' · 검토 대기 '+reviewCount+'건':"")+'</summary><p>'+esc(evStatus)+'</p><p>최종 원문 열람 성공: '+esc(fmt(ev?.last_success_at))+' / 최근 시도: '+esc(fmt(ev?.last_attempt_at))+'</p>'+
      (ev?.body_sha256?'<p>본문 해시: <code>'+esc(ev.body_sha256.slice(0,16))+'…</code> · 내용 변경 감지용이며 적격성 보증이 아닙니다.</p>':"")+
      (p.application_period_raw?'<p>API 신청기간 원문: '+esc(p.application_period_raw)+'</p>':"")+
      '<p>첨부 '+attachments.length+'건: '+(attachments.length?attachments.slice(0,10).map(a=>link(C.attachmentURL(a.url,p.source),(a.name||"첨부파일")+" · 공고/원본")).join(" · "):"발견된 링크 없음")+'</p><p>첨부는 링크만 수집했습니다. 본문과 제출서류 요건은 아직 검토하지 않았습니다.</p></details></article>';
  }
  function renderList() {
    const q=$("searchInput").value.trim().toLowerCase(), y=$("yearSelect").value, t=$("typeSelect").value, sort=$("sortSelect").value;
    const reception=$("statusSelect")?.value||"all", lane=$("laneSelect")?.value||"all";
    let list=state.items.filter(p=>{
      if(y!=="all"&&!C.years(p).map(String).includes(y))return false;
      if(t==="grant"&&p.mode!=="beneficiary")return false;
      if(["discovery","reference","operator","budget"].includes(t)&&p.mode!==t)return false;
      if(lane!=="all"&&p.relevance!==lane)return false;
      const d=C.deadline(p).code;
      if(reception==="open"&&!["open","open_date"].includes(d))return false;
      if(reception==="today"&&p.deadline?.slice(0,10)!==C.kstDay(new Date()))return false;
      if(reception==="closed"&&d!=="closed")return false;
      if(reception==="unknown"&&!["unknown","upcoming","today_unknown"].includes(d))return false;
      return !q||[p.title,p.eligibility,p.note,p.kind,p.agency,p.year].some(s=>String(s||"").toLowerCase().includes(q));
    });
    function rank(p){if(!p.deadline||!C.validDate(p.deadline))return "9";return (C.deadline(p).code==="closed"?"8":"1")+p.deadline;}
    if(sort==="title")list.sort((a,b)=>a.title.localeCompare(b.title,"ko-KR"));
    else if(sort==="year")list.sort((a,b)=>Math.max(...C.years(b))-Math.max(...C.years(a))||rank(a).localeCompare(rank(b)));
    else list.sort((a,b)=>rank(a).localeCompare(rank(b)));
    state.visible=list;
    $("resultCount").textContent='검색 결과 '+list.length+'개 / 전체 '+state.items.length+'개';
    $("programList").innerHTML=list.length?list.map(card).join(""):'<p class="empty">조건에 맞는 공고가 없습니다.</p>';
  }
  function renderStats() {
    $("totalCount").textContent=state.items.length+"개";
    $("openCount").textContent=state.items.filter(p=>p.mode==="beneficiary"&&["open","open_date"].includes(C.deadline(p).code)).length+"개";
    $("yearCount").textContent=state.items.filter(p=>C.years(p).includes(2027)&&p.mode==="beneficiary").length+"개";
    $("refCount").textContent=state.items.filter(p=>p.mode==="reference").length+"개";
    $("footerDate").textContent="P0.3 · 데이터 변경일 "+day(state.meta.generated_at);
    if($("qualitySummary"))$("qualitySummary").textContent="자격 미검증 후보 "+state.items.filter(p=>p.mode==="discovery").length+"개 · 오늘 마감시각 미확인 "+state.items.filter(p=>C.deadline(p).code==="today_unknown").length+"개 · API 차이 검토 "+state.reviews.items.filter(r=>r.status==="pending").length+"건. 수혜기업 모집 분류는 귀사 적격 판정이 아닙니다.";
  }
  function renderMonitor() {
    const m=state.monitor,a=m.sources?.bizinfo_api||m;
    const old=C.stale(a.last_success_at||m.last_success_at), status=a.status||"unknown";
    const labels={setup_required:"API 설정 필요",needs_api_key:"공식 API 인증키 미설정",ok_changed:"API 수집 완료 · 변경 있음",ok_no_change:"API 제공 범위 확인 · 변경 없음",partial:"일부 수집 · 전체 확인 아님",request_failed:"API 수집 실패 · 이전 자료 보존",bad_response:"응답 오류",unknown:"수집 상태 미확인"};
    $("monitorLabel").textContent=(old?"[갱신 지연/확인 필요] ":"")+(labels[status]||status);
    $("monitorDetail").textContent=m.message||"확인 기록 없음";
    $("monitorDot").className="status-dot "+(status==="request_failed"?"status-fail":old||status==="partial"||!status.startsWith("ok_")?"status-warn":"");
    $("attemptAt").textContent=fmt(a.last_attempt_at||m.last_attempt_at);
    $("successAt").textContent=fmt(a.last_success_at||m.last_success_at);
    $("attemptState").textContent=m.message||"기록 없음";
    $("successState").textContent="API 목록 수집 성공과 원문·첨부 검증은 별개입니다. 36시간 이상 갱신되지 않으면 경고합니다.";
    if($("sourceAudit")) {
      const h=m.sources?.html_evidence, ed=m.sources?.editorial;
      $("sourceAudit").innerHTML='<div class="audit-box"><b>자료원별 확인 범위</b><p>기업마당 API: '+esc(a.checked_count??m.checked_count??0)+'건 · '+esc(a.pages??"기록 없음")+'페이지 / 제공 총건수 '+esc(a.reported_total??"미확인")+' · '+(a.coverage_complete?"API 제공 범위 확인 완료":"일부 범위 또는 실패")+'</p><p>원문 HTML: '+esc(h?.success??0)+'건 성공 / '+esc(h?.failed??0)+'건 실패 · '+esc(fmt(h?.last_attempt_at))+'</p><p>독립 상세공고 검토 기록: '+esc(fmt(ed?.last_attempt_at))+' (API 수집 시각과 별도)</p><p>기관 전체 직접 수집과 첨부 PDF/HWP 본문 검증은 아직 제공하지 않습니다.</p>'+(state.optionalErrors.length?'<p class="warning">보조자료 로드 실패: '+esc(state.optionalErrors.join(", "))+'</p>':"")+'</div>';
    }
    if($("reviewList")) {
      const pending=state.reviews.items.filter(r=>r.status==="pending");
      $("reviewList").innerHTML=pending.length?pending.slice(0,40).map(r=>'<div class="review-item"><b>'+esc(state.items.find(p=>p.id===r.program_id)?.title||r.program_id)+'</b><p>'+esc(r.field)+': '+esc(String(r.previous??"미입력"))+' → '+esc(String(r.observed??"미확인"))+'</p><p>기존 값을 보존했습니다. API 차이는 정정 확정이 아니므로 원문 대조가 필요합니다. '+link(r.source,"근거")+'</p></div>').join(""):'<p>현재 기록된 API 차이 검토 대기가 없습니다. 공고가 전혀 변경되지 않았다는 뜻은 아닙니다.</p>';
    }
  }
  async function reload() {
    $("refreshBtn").disabled=true;$("refreshBtn").textContent="읽는 중…";state.optionalErrors=[];
    async function load(name,optional=false) {
      try {const r=await fetch("data/"+name+"?v="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json();}
      catch(e){if(!optional)throw e;state.optionalErrors.push(name);return null;}
    }
    try {
      const [p,m,e,r]=await Promise.all([load("programs.json"),load("monitor.json"),load("evidence.json",true),load("change_reviews.json",true)]);
      if(p.schema!=="public-funding-radar/v1"||!Array.isArray(p.items)||m.schema!=="public-funding-monitor/v1")throw new Error("자료 형식 오류");
      state.items=p.items;state.meta=p;state.monitor=m;state.evidence=e||{records:{}};state.reviews=r||{items:[]};renderStats();renderList();renderMonitor();
    }catch(e){$("monitorLabel").textContent="데이터 읽기 실패 · 표시값 최신성 미확인";$("monitorDetail").textContent=String(e.message);$("monitorDot").className="status-dot status-fail";if(!state.items.length)$("programList").innerHTML='<p class="empty">공개 데이터를 불러오지 못했습니다.</p>';}
    finally{$("refreshBtn").disabled=false;$("refreshBtn").textContent="↻ 저장 데이터 새로 읽기";}
  }
  function exportCsv(){
    const cols=[["title","사업명"],["year","대표연도"],["mode","검증분류"],["relevance","관련성"],["deadline","기재마감"],["amount","지원규모"],["eligibility","자격요약"],["source","출처"]];
    const csv=[cols.map(c=>c[1]),...state.visible.map(p=>cols.map(c=>p[c[0]]))].map(r=>r.map(C.csvCell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="AI_Funding_Radar_Public.csv";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),300);
  }
  function tick(){ $("kstTime").textContent=fmt(new Date().toISOString())+" KST";if(state.items.length){renderStats();renderList();renderMonitor();} }
  ["searchInput","yearSelect","typeSelect","sortSelect","statusSelect","laneSelect"].forEach(id=>$(id)?.addEventListener(id==="searchInput"?"input":"change",renderList));
  $("refreshBtn").addEventListener("click",reload);$("csvBtn").addEventListener("click",exportCsv);
  tick();setInterval(tick,60000);reload();
})();
