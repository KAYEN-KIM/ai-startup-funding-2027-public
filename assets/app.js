"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const state = { items: [], meta: {}, monitor: {}, visible: [] };
  const kstNow = () => new Date();
  const shortDate = raw => raw ? String(raw).slice(0, 10).replace(/-/g, ". ") + "." : "확인 필요";
  const fmtKST = dt => dt ? new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(dt)) : "미확인";
  const officialLink = raw => {
    try {
      const u = new URL(raw);
      if(u.protocol !== "https:") return null;
      const h = u.hostname.toLowerCase();
      const accepted = [".go.kr",".or.kr",".kr","k-startup.go.kr"];
      if (!accepted.some(s => h === s.slice(1) || h.endsWith(s))) return null;
      return u.href;
    } catch { return null; }
  };
  const expiry = p => {
    if (!p.deadline) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.deadline)) return new Date(p.deadline + "T23:59:59+09:00");
    const v = new Date(p.deadline);
    return Number.isNaN(+v) ? null : v;
  };
  function classify(p) {
    if (p.mode === "discovery") return {text:"공식 API 발견 · 원문 검토 전",css:"s-purple",code:"discovery"};
    if (p.mode === "reference") return {text:"2026 조건 참고",css:"s-gold",code:"reference"};
    if (p.mode === "operator") return {text:"운영기관 모집 · 기업신청 아님",css:"s-gray",code:"operator"};
    if (p.mode === "budget") return {text:"예산안 · 공고 아님",css:"s-gray",code:"budget"};
    const end = expiry(p);
    if (end && end < kstNow()) return {text:"마감",css:"s-gray",code:"closed"};
    if (p.opens && new Date(p.opens + "T00:00:00+09:00") > kstNow()) return {text:"접수 예정",css:"s-purple",code:"scheduled"};
    if (end && end >= kstNow()) return {text:"접수 중",css:"s-green",code:"open"};
    return {text:"일정 확인 필요",css:"s-gray",code:"unknown"};
  }
  function renderCard(p) {
    const c = classify(p), url = officialLink(p.source), end = expiry(p);
    const date = p.deadline ? shortDate(p.deadline) : "별도 확인";
    const time = p.deadline && String(p.deadline).length > 10
      ? String(p.deadline).slice(11,16) + " KST" : (p.deadline ? "날짜만 확인" : "2027 일정 미정");
    const original = url ? '<a href="'+escape(url)+'" rel="noopener noreferrer" target="_blank" aria-label="'+escape(p.title)+' 공식 출처 새 창에서 열기">공식 원문 확인 ↗</a>' : '<span>출처 확인 필요</span>';
    return '<article class="program-card">' +
      '<div class="card-top"><span class="tag '+c.css+'">'+escape(c.text)+'</span><span class="tag kind">'+escape(p.kind)+'</span><span class="tag">'+escape(String(p.year))+'</span></div>'+
      '<div class="card-main"><div><h3>'+escape(p.title)+'</h3><div class="meta"><span>'+escape(p.eligibility || "공고 원문에서 자격 확인")+'</span></div><p class="desc">'+escape(p.note || "공고에 기재된 조건 확인 필요")+'</p></div>'+
      '<div class="deadline"><b>'+escape(date)+'</b><span>'+escape(time)+'</span></div></div>'+
      '<div class="card-bottom"><div class="amount">'+escape(p.amount || "지원 금액 별도 확인")+'</div>'+original+'</div></article>';
  }
  function compareDeadline(a,b) {
    const da=expiry(a), db=expiry(b), now=+kstNow();
    const va=da ? (+da>=now ? +da : +da+1e13) : 8e13;
    const vb=db ? (+db>=now ? +db : +db+1e13) : 8e13;
    return va-vb;
  }
  function renderList() {
    const q=$("searchInput").value.trim().toLocaleLowerCase("ko-KR");
    const y=$("yearSelect").value,t=$("typeSelect").value,s=$("sortSelect").value;
    let list=state.items.filter(p=>{
      if(y!=="all"&&String(p.year)!==y) return false;
      if(t==="grant"&&p.mode!=="beneficiary") return false;
      if(t==="discovery"&&p.mode!=="discovery") return false;
    if(t==="reference"&&p.mode!=="reference") return false;
      if(t==="operator"&&p.mode!=="operator") return false;
      if(t==="budget"&&p.mode!=="budget") return false;
      return !q || [p.title,p.eligibility,p.note,p.amount,p.kind,p.year].some(s=>String(s||"").toLocaleLowerCase("ko-KR").includes(q));
    });
    if(s==="soon") list.sort((a,b)=>compareDeadline(a,b));
    else if(s==="title") list.sort((a,b)=>a.title.localeCompare(b.title,"ko-KR"));
    else list.sort((a,b)=>b.year-a.year||compareDeadline(a,b));
    state.visible=list;
    $("resultCount").textContent="검색 결과 "+list.length+"개 / 전체 "+state.items.length+"개";
    $("programList").innerHTML=list.length?list.map(renderCard).join(""):'<p class="empty">선택한 조건에 맞는 공고가 없습니다. 필터를 변경해 보세요.</p>';
  }
  function renderStats() {
    $("totalCount").textContent=state.items.length+"개";
    $("openCount").textContent=state.items.filter(p=>p.mode==="beneficiary"&&classify(p).code==="open").length+"개";
    $("yearCount").textContent=state.items.filter(p=>p.year===2027&&p.mode==="beneficiary").length+"개";
    $("refCount").textContent=state.items.filter(p=>p.mode==="reference").length+"개";
    $("footerDate").textContent="초기 근거 확인일 "+shortDate(state.meta.generated_at);
  }
  function renderMonitor() {
    const m=state.monitor;
    const status=m.status || "unknown";
    const labels={
      "setup_required":"API 키 설정 전 — 정기 수집 미가동",
      "needs_api_key":"자동 확인 시도 · 공식 API 인증키 미설정",
      "ok_changed":"공식 API 확인 · 신규/변경 공고 확인",
      "ok_no_change":"공식 API 확인 · 변경 없음",
      "request_failed":"자동 확인 실패 · 이전 자료 보존",
      "bad_response":"공식 API 응답 오류 · 이전 자료 보존",
      "unknown":"자동 수집 상태 미확인"
    };
    $("monitorLabel").textContent=labels[status]||status;
    $("monitorDetail").textContent=m.message||"공고 원문을 확인해 주십시오.";
    $("monitorDot").className="status-dot "+(status==="ok_changed"||status==="ok_no_change"?"":status==="request_failed"||status==="bad_response"?"status-fail":"status-warn");
    $("attemptAt").textContent=fmtKST(m.last_attempt_at);
    $("successAt").textContent=fmtKST(m.last_success_at);
    $("attemptState").textContent=m.message||"시도 기록 없음";
    $("successState").textContent=m.last_success_at?"자동 갱신 결과는 공식 API 색인 기준이며 공고별 세부조건을 재확인해야 합니다.":"자동 성공 기록 없음. 2026년 기준 참고자료는 별개로 제공됩니다.";
  }
  async function reload() {
    $("refreshBtn").disabled=true;
    $("refreshBtn").textContent="읽는 중…";
    try {
      const now="?v="+Date.now();
      const [a,b]=await Promise.all([fetch("data/programs.json"+now,{cache:"no-store"}),fetch("data/monitor.json"+now,{cache:"no-store"})]);
      if(!a.ok||!b.ok) throw new Error("자료 파일 HTTP 오류");
      const result=await a.json(), monitor=await b.json();
      if(!Array.isArray(result.items)||result.schema!=="public-funding-radar/v1") throw new Error("자료 형식 오류");
      state.items=result.items;state.meta=result;state.monitor=monitor;
      renderStats();renderList();renderMonitor();
    } catch(e) {
      $("programList").innerHTML='<p class="empty">공개 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주십시오.</p>';
      $("monitorLabel").textContent="자료 연결 실패";
      $("monitorDetail").textContent=String(e.message||e);
      $("monitorDot").className="status-dot status-fail";
    } finally {$("refreshBtn").disabled=false;$("refreshBtn").textContent="↻ 데이터 새로 읽기";}
  }
  function exportCsv() {
    const cols=[["title","사업명"],["year","연도"],["kind","분류"],["mode","공고구분"],["deadline","마감"],["amount","지원규모"],["eligibility","신청자격"],["source","원문URL"]];
    const csv=[cols.map(c=>c[1]),...state.visible.map(p=>cols.map(c=>p[c[0]]??""))]
      .map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    const u=URL.createObjectURL(blob);
    const anchor=document.createElement("a");anchor.href=u;anchor.download="AI_Funding_Radar_Public_2027.csv";document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(u),300);
  }
  function updateClock(){
    $("kstTime").textContent=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())+" KST";
  }
  ["searchInput","yearSelect","typeSelect","sortSelect"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",renderList));
  $("refreshBtn").addEventListener("click",reload);
  $("csvBtn").addEventListener("click",exportCsv);
  updateClock();setInterval(updateClock,60000);reload();
})();