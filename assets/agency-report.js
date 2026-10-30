/* P0.16: separate public official-board observations, never eligibility approval. */
(function(root) {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds={candidate:'목록 발견 후보·자격 미검증',operator:'운영·주관기관 모집',procurement:'용역·입찰',policy:'통합계획·정책',competition:'공모전·경진대회',result:'평가·선정 결과'};
  const statuses={ok_changed:'확인 범위 내 목록 변화',ok_no_change:'확인 범위 내 변화 없음',partial:'일부 조회 실패',failed:'조회 실패',policy_blocked:'수집 정책에 따라 중단',not_run:'미실행'};
  function checked(d){
    if(!d||d.schema!=='public-funding-agency-discovery/v1'||d.model_calls!==0||d.automatic_approval!==false||
       !d.sources||!d.records||typeof d.sources!=='object'||typeof d.records!=='object'||Array.isArray(d.records)||
       Object.keys(d.records).length>1200||Object.keys(d.sources).some(x=>!['mss','nipa'].includes(x))||!d.run||
       !['ok_scoped','partial','failed','not_run'].includes(d.run.status)||!Array.isArray(d.deferred)||d.deferred.length>10)
      throw new Error('기관 수집자료 형식 오류');
    for(const r of Object.values(d.records)){
      if(!r||!['mss','nipa'].includes(r.agency_id)||!Object.hasOwn(kinds,r.kind)||typeof r.title!=='string'||r.title.length>400||
         !Array.isArray(r.matched_program_ids)||!Array.isArray(r.possible_duplicate_ids)||!Array.isArray(r.differences)||!Array.isArray(r.history))throw new Error('공고 관측값 형식 오류');
    }
    return d;
  }
  function sourceLink(value){
    try{
      const u=new URL(value);
      if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash)return '';
      const entries=[...u.searchParams.entries()];
      if(new Set(entries.map(x=>x[0])).size!==entries.length||entries.some(x=>/token|key|secret|signature|password/i.test(x[0])))return '';
      const mss=['www.mss.go.kr','mss.go.kr'].includes(u.hostname)&&u.pathname==='/site/smba/ex/bbs/View.do'&&u.searchParams.get('cbIdx')==='310'&&/^\d{5,12}$/.test(u.searchParams.get('bcIdx')||'');
      const nipa=['www.nipa.kr','nipa.kr'].includes(u.hostname)&&/^\/home\/bsnsAll\/\d{1,2}\/nttDetail$/.test(u.pathname)&&u.searchParams.get('bbsNo')==='4'&&/^\d{3,12}$/.test(u.searchParams.get('nttNo')||'');
      if(!mss&&!nipa)return '';
      return '<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">기관 원문 ↗</a>';
    }catch{return '';}
  }
  function freshness(value,now){
    if(typeof value!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(value))return '확인 시각 없음';
    const age=(+now-Date.parse(value))/3600000;
    if(!Number.isFinite(age)||age<-(5/60))return '시각 재확인 필요';
    return age>30?'마지막 성공이 오래됨':'최근 성공 기록';
  }
  function reception(r,now){
    const raw=r.deadline;
    if(!raw)return '마감 미확인';
    const kst=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw<kst?'마감 경과':raw===kst?'오늘 마감일·시각 미확인':'기재 마감 예정';
    const end=Date.parse(raw);
    if(!/(?:Z|[+-]\d\d:\d\d)$/.test(raw)||!Number.isFinite(end))return '마감 미확인';
    if(end<=+now)return '마감 경과';
    if(r.opens&&/(?:Z|[+-]\d\d:\d\d)$/.test(r.opens)&&Date.parse(r.opens)>+now)return '기재 접수 시작 전';
    if(r.opens&&/^\d{4}-\d{2}-\d{2}$/.test(r.opens)&&r.opens>kst)return '기재 접수 시작 전';
    return '기재 마감 전·자격 미판정';
  }
  function view(data,filters={},now=new Date()){
    const d=checked(data),all=Object.values(d.records);
    const q=String(filters.query||'').trim().toLowerCase();
    const selected=all.filter(r=>(!filters.agency||filters.agency==='all'||r.agency_id===filters.agency)&&
      (!filters.kind||filters.kind==='all'||r.kind===filters.kind)&&(!q||r.title.toLowerCase().includes(q)));
    selected.sort((a,b)=>(b.last_seen_at||'').localeCompare(a.last_seen_at||'')||a.id.localeCompare(b.id));
    const lanes=['mss','nipa'].map(id=>{
      const s=d.sources[id];
      return '<div class="bot-lane"><b>'+esc(id==='mss'?'중소벤처기업부 RSS':'NIPA 사업공고')+'</b>'+(s?
        '<span>'+esc(statuses[s.status]||'미확인')+'</span><small>'+esc(s.pages_checked)+'페이지·'+esc(s.rows_checked)+'행 / 관련 '+esc(s.candidate_rows)+'건</small><small>시도 '+esc(s.last_attempt_at)+'</small><small>성공 '+esc(s.last_success_at||'없음')+' · '+esc(freshness(s.last_success_at,now))+'</small><small>'+esc((s.error_codes||[]).join(', '))+'</small>':'<span>아직 수집하지 않음</span>')+'</div>';
    }).join('');
    const rows=selected.slice(0,80).map(r=>{
      const s=d.sources[r.agency_id],old=!s||!['ok_changed','ok_no_change'].includes(s.status)||freshness(s.last_success_at,now)!=='최근 성공 기록';
      const notSeen=s&&r.last_seen_at!==s.last_attempt_at;
      const matches=r.matched_program_ids.length?'<p>기존 등록과 원문 URL 일치: '+esc(r.matched_program_ids.join(', '))+' · 자동 병합하지 않음</p>':'';
      const probable=r.possible_duplicate_ids.length?'<p>제목 일치 대조 후보: '+esc(r.possible_duplicate_ids.join(', '))+' · 동일 사업 확정 아님</p>':'';
      const difference=r.differences.map(x=>'<li>'+esc(x.field)+': 등록값 '+esc(x.registered)+' / 목록 관측 '+esc(x.listed)+'</li>').join('');
      const history=r.history.map(x=>'<li>'+esc(x.observed_at)+' · '+esc(x.snapshot?.title)+' · 이전 기재 마감 '+esc(x.snapshot?.deadline||'미확인')+'</li>').join('');
      return '<li><b>'+esc(r.title)+'</b> <span class="tag">'+esc(kinds[r.kind])+'</span><p>'+esc(reception(r,now))+' · '+esc(r.deadline||'정확한 기한은 원문 확인')+'</p><p>목록 게시일 '+esc(r.published_date||'미확인')+' / 마지막 관측 '+esc(r.last_seen_at)+'</p>'+
        (old?'<p>현재 출처 재확인 실패·지연 가능: 이전 관측값을 보존 중입니다.</p>':'')+
        (notSeen?'<p>이번 제한된 목록에서 재관측되지 않음. 삭제·종료로 단정하지 않습니다.</p>':'')+
        (r.review_required?'<p><strong>목록 값 변경·원문 재검토 필요</strong></p>':'')+matches+probable+
        (difference||history?'<details><summary>이전 값·기존 공고와의 차이</summary><ul>'+difference+history+'</ul></details>':'')+sourceLink(r.source)+'</li>';
    }).join('');
    const deferred=d.deferred.map(x=>'<li><b>'+esc(x.name)+'</b> — '+esc(x.reason)+'</li>').join('');
    return '<div class="bot-banner bot-warning"><b>공식기관 직접 목록 · 독립 검토 후보</b><p>정기 AI 호출 0회. 기존 지원사업 숫자와 합산하지 않습니다. 운영기관·용역·정책은 창업 지원금이 아닙니다.</p><p>'+esc(d.scope)+'</p></div>'+
      '<div class="bot-grid">'+lanes+'</div><details class="audit-box"><summary>아직 직접 수집하지 않는 기관</summary><ul>'+deferred+'</ul></details>'+
      '<p>보존 관측 '+all.length+'건 / 필터 '+selected.length+'건. 최대 80건 표시. 목록 확인은 원문·첨부·개인 신청자격 확인과 다릅니다.</p>'+
      '<ul class="bot-list">'+(rows||'<li>해당 필터의 관측 후보 없음. 수집 실패·누락이 없다는 뜻은 아닙니다.</li>')+'</ul>';
  }
  const api={checked,sourceLink,freshness,reception,view};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FundingAgencyReport=api;
  if(typeof document==='undefined')return;
  const host=document.getElementById('agencyReportBody');if(!host)return;
  const agency=document.getElementById('agencySourceFilter'),kind=document.getElementById('agencyKindFilter'),query=document.getElementById('agencyQuery');
  let current=null,ticket=0;
  function render(){if(current)host.innerHTML=view(current,{agency:agency?.value,kind:kind?.value,query:query?.value});}
  async function load(){const own=++ticket;try{
    const res=await fetch('data/agency_discovery.json?v='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error('source unavailable');const data=checked(await res.json());
    if(own===ticket){current=data;render();}
  }catch{if(own===ticket){current=null;host.textContent='기관별 수집자료를 읽지 못했습니다. 변경 없음·수집 성공으로 판단하지 마십시오.';}}}
  for(const el of [agency,kind])if(el)el.addEventListener('change',render);
  if(query)query.addEventListener('input',render);
  const refresh=document.getElementById('refreshBtn');if(refresh)refresh.addEventListener('click',load);
  load();
})(typeof globalThis!=='undefined'?globalThis:this);
