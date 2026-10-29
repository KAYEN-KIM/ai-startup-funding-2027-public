/* Public deterministic presentation rules. No applicant data or network writes. */
(function(root) {
  "use strict";
  const HOSTS = ["bizinfo.go.kr","mss.go.kr","k-startup.go.kr","nipa.kr","kocca.kr","iris.go.kr","kosmes.or.kr","kdata.or.kr","culture.go.kr","korea.kr","work24.go.kr","nts.go.kr","rnd.or.kr","koita.or.kr","seoul.rnbd.kr"];
  function sourceURL(value) {
    try {
      if(typeof value !== "string" || /[\x00-\x1f]/.test(value)) return null;
      const u = new URL(value);
      if(u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
      if(!HOSTS.some(h=>u.hostname === h || u.hostname.endsWith("."+h))) return null;
      if([...u.searchParams.keys()].some(k=>/^(crtfckey|servicekey|api_key|token|access_token|password|secret|downloadtoken)$/i.test(k))) return null;
      return u.href;
    } catch { return null; }
  }
  function attachmentURL(file,notice) {
    const safe=sourceURL(file);if(!safe)return null;
    const u=new URL(safe);
    if((u.hostname==='bizinfo.go.kr'||u.hostname.endsWith('.bizinfo.go.kr'))&&/^\/cmm\/fms\/(fileDown|getImageFile)\.do$/i.test(u.pathname))return sourceURL(notice);
    return safe;
  }
  const esc = v=>String(v??"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function validDate(value) {
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
    const day=value.slice(0,10), test=new Date(day+"T00:00:00Z");
    return !Number.isNaN(+test) && test.toISOString().slice(0,10)===day && !Number.isNaN(Date.parse(value));
  }
  function kstDay(now) {return new Date(+now+9*3600000).toISOString().slice(0,10);}
  function deadline(p, now=new Date()) {
    if(p.mode === "reference" || p.mode === "budget") return {code:"not_application",text:"신청 일정 아님",css:"s-gray"};
    const end=p.deadline;
    if(!end || !validDate(end)) return {code:"unknown",text:"접수 일정 확인 필요",css:"s-gray"};
    if(end.length===10) {
      const day=kstDay(now);
      if(end<day) return {code:"closed",text:"기재일 경과 · 연장 확인",css:"s-gray"};
      if(end===day) return {code:"today_unknown",text:"오늘 마감 · 시각 미확인",css:"s-gold"};
    } else if(Date.parse(end)<=+now) return {code:"closed",text:"기재 마감 경과",css:"s-gray"};
    let start=p.opens;
    if(start && validDate(start)) {
      const ms=Date.parse(start.length===10?start+"T00:00:00+09:00":start);
      if(ms>+now) return {code:"scheduled",text:"접수 예정",css:"s-purple"};
      return end.length===10 ? {code:"open_date",text:"접수기간 내 · 마감시각 미확인",css:"s-green"}
        : {code:"open",text:"기재 접수기간 내",css:"s-green"};
    }
    return {code:"upcoming",text:"마감 예정 · 접수개시 확인",css:"s-gold"};
  }
  function verification(p) {
    if(p.mode==="operator") return {text:"운영기관 모집 · 기업신청 아님",css:"s-gray"};
    if(p.mode==="budget") return {text:"예산·정책 · 개별 공고 아님",css:"s-gray"};
    if(p.mode==="reference") return {text:p.year+"년 참고조건",css:"s-gold"};
    if(p.mode==="discovery") return {text:"API 발견 · 자격 미검증",css:"s-purple"};
    if(p.source_level==="official_notice_summary_verified") return {text:"공식 공고 요약 검토",css:"s-green"};
    return {text:"수혜기업 모집 분류 · 자격 별도 확인",css:"s-green"};
  }
  function stale(stamp, now=new Date(), hours=36) {
    const ms=Date.parse(stamp||"");
    return !Number.isFinite(ms) || +now-ms>hours*3600000 || ms>+now+300000;
  }
  function csvCell(v) {
    let value=String(v??"");
    if(/^[\s\uFEFF]*[=+@-]/.test(value)||/^[\t\r\n]/.test(value)) value="'"+value;
    return '"'+value.replace(/"/g,'""')+'"';
  }
  function years(p) {
    return Array.isArray(p.years) && p.years.length ? p.years : [p.year];
  }
  const api={VERSION:"0.2.0",sourceURL,attachmentURL,esc,validDate,kstDay,deadline,verification,stale,csvCell,years};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.RadarCore=api;
})(typeof globalThis!=="undefined"?globalThis:this);
