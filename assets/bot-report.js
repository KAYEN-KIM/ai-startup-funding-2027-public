/* P0.15. Public-only deterministic report. No LLM, persistence or private input access. */
(function(root) {
  'use strict';
  const schema = 'public-funding-bot-briefing/v1';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {ok_scoped:'이번 범위 확인',failed:'실패',partial_or_stale:'부분 확인·재확인 필요',
    partial:'부분 확인',unknown:'확인 기록 부족',stale:'오래된 확인',clock_uncertain:'시각 확인 필요',
    review_required:'원문 재검토 필요',due_today:'오늘 기재 마감',today_time_unknown:'오늘 마감·시각 미확인',
    upcoming:'기재 마감 예정',not_started:'접수 시작 전',closed:'마감 경과',retry_bot:'봇 재시도 대상',review_original:'원문 대조 필요'};
  function checked(report) {
    if (!report || report.schema !== schema || report.generation !== 'deterministic_no_model' ||
        report.report_model_calls !== 0 || report.ai_transport !== 'manual_cli_only' ||
        report.automatic_submission !== false || report.automatic_rule_approval !== false ||
        !Array.isArray(report.lanes) || report.lanes.length !== 4 || !Array.isArray(report.queue) ||
        report.queue.length > 200 || !Array.isArray(report.deadlines) || report.deadlines.length > 30 ||
        !report.counts || !report.unresolved || !Number.isFinite(Date.parse(report.generated_at))) {
      throw new Error('봇 보고서 형식 오류');
    }
    return report;
  }
  function sourceLink(value) {
    if(typeof value!=='string') return '';
    try {
      const u=new URL(value), h=u.hostname.toLowerCase();
      const allowed=h.endsWith('.go.kr')||h.endsWith('.or.kr')||h.endsWith('.ac.kr')||['nipa.kr','www.nipa.kr','k-startup.go.kr','www.k-startup.go.kr'].includes(h);
      if(u.protocol!=='https:'||!allowed||u.username||u.password||u.port&&u.port!=='443')return '';
      for(const key of u.searchParams.keys())if(/token|key|signature|secret|password/i.test(key))return '';
      return '<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">공식 원문 ↗</a>';
    } catch { return ''; }
  }
  function liveDeadline(row, now) {
    const raw=row.deadline;
    if(typeof raw!=='string')return 'unknown';
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
      return raw<day?'closed':raw===day?'today_time_unknown':row.status;
    }
    const end=Date.parse(raw);
    return !Number.isFinite(end)?'unknown':end<=+now?'closed':row.status;
  }
  function view(report, now = new Date()) {
    checked(report);
    const age=(+now-Date.parse(report.generated_at))/3600000;
    const stale=!Number.isFinite(age)||age>30||age<-(5/60);
    const header=stale?'보고서 생성 후 시간이 경과했거나 시각 확인이 필요합니다.':(labels[report.run_status]||'상태 미확인');
    const lanes=report.lanes.map(x=>'<div class="bot-lane"><b>'+esc(x.name)+'</b><span>'+esc(labels[x.status]||'미확인')+'</span><small>최근 시도 '+esc(x.last_attempt_at||'기록 없음')+'</small></div>').join('');
    const deadlines=report.deadlines.map(x=>'<li><b>'+esc(x.deadline)+'</b> · '+esc(x.title)+' <span class="tag">'+esc(labels[liveDeadline(x,now)]||'미확인')+'</span> <span class="tag">'+(x.mode==='discovery'?'발견 후보·원문 미검증':'수혜기업 모집 분류·개인 자격 미판정')+'</span> '+sourceLink(x.source)+'</li>').join('');
    const queue=report.queue.map(x=>'<li><span class="tag">'+esc(x.priority)+'</span> <b>'+esc(x.title)+'</b><p>'+esc(x.reason)+'</p><small>'+esc(labels[x.action]||'검토 필요')+'</small> '+sourceLink(x.source)+'</li>').join('');
    return '<div class="bot-banner '+(stale||report.attention_required?'bot-warning':'')+'"><b>'+esc(header)+'</b><p>AI 호출 없는 규칙 기반 보고 · 생성 '+esc(report.generated_at)+'</p><p>이번 실행 성공은 이전 실패의 해결이나 전체 공고 검증을 뜻하지 않습니다.</p></div>'+
      '<div class="bot-grid">'+lanes+'</div><div class="note-bar">미해결 첨부 실패 <b>'+esc(report.unresolved.attachment_failures)+'</b>건 · 변경 대조 <b>'+esc(report.unresolved.pending_differences)+'</b>건 · 미검증 후보 <b>'+esc(report.unresolved.unverified_programs)+'</b>건 · 대기 첨부 <b>'+esc(report.unresolved.queued_attachments)+'</b>건</div>'+
      '<details class="audit-box" open><summary>다음 '+esc(report.deadline_window_days)+'일 내 기재 마감 · 보고서 기준 ('+esc(report.counts.upcoming_deadlines)+'건)</summary><ul class="bot-list">'+(deadlines||'<li>조건에 맞는 기재 마감 없음. 누락·실패가 없다는 뜻은 아닙니다.</li>')+'</ul>'+(report.deadline_rows_truncated?'<p>표시 한도를 넘는 항목은 전체 지원사업 목록에서 확인하십시오.</p>':'')+'</details>'+
      '<details class="audit-box"><summary>검토 대기 '+esc(report.counts.queue_total)+'건 — 검토 순서, 선정 점수 아님</summary><ul class="bot-list">'+(queue||'<li>현재 집계된 검토 대기 없음. 전체 검증 완료가 아닙니다.</li>')+'</ul>'+(report.queue_truncated?'<p>표시 한도에 따라 일부 대기가 생략되었습니다.</p>':'')+'</details><p>'+esc(report.scope)+'</p><p>'+esc(report.notice)+'</p>';
  }
  const api={checked,sourceLink,liveDeadline,view};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FundingBotReport=api;
  if(typeof document==='undefined')return;
  const host=document.getElementById('botReportBody');
  if(!host)return;
  let active=0;
  async function load() {
    const ticket=++active;
    try {
      const r=await fetch('data/bot_briefing.json?v='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('report unavailable');
      const report=await r.json();
      if(ticket===active)host.innerHTML=view(report);
    } catch {
      if(ticket===active)host.textContent='봇 보고서를 불러오지 못했습니다. 변경 없음이나 수집 성공으로 판단하지 마십시오.';
    }
  }
  const button=document.getElementById('refreshBtn');
  if(button)button.addEventListener('click',load);
  load();
})(typeof globalThis!=='undefined'?globalThis:this);
