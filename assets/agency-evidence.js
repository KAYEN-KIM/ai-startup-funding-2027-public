/* P0.17: separate source-bound candidate evidence; no applicant inputs. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={queued:'첨부 처리 대기',text_extracted:'본문 추출·조건 미검증',partial_text:'부분 본문만 추출',no_text:'본문 없음·OCR 미수행',download_failed:'다운로드 실패',source_unavailable:'원문 열람 실패',source_not_linked:'연결·수집 정책 확인 필요',protected_document:'보호 문서·처리 중단',unsupported_format:'지원하지 않는 형식',size_limit:'크기·복잡도 한도',unsafe_archive:'안전하지 않은 압축파일',unsafe_xml:'안전하지 않은 XML',malformed_document:'문서 해석 실패',dependency_missing:'처리 모듈 미준비',parser_timeout:'본문 처리시간 초과',resource_limit:'처리 자원 한도'};
const categories={eligibility:'신청대상 후보',exclusion:'제외조건 후보',overlap:'중복지원 문구',cofunding:'자부담 문구',amount:'지원규모 문구',documents:'제출서류 문구',deadline:'신청기간 문구'};
function checked(d){
 if(!d||d.schema!=='public-funding-agency-evidence/v1'||d.version!=='0.17.0'||d.model_calls!==0||d.automatic_approval!==false||
    !d.notices||Array.isArray(d.notices)||!d.documents||Array.isArray(d.documents)||!d.run||
    !['not_run','idle','ok_scoped','partial'].includes(d.run.status)||Object.keys(d.notices).length>1200||Object.keys(d.documents).length>6000)throw Error('기관 근거자료 형식 오류');
 for(const [id,n] of Object.entries(d.notices)){
   if(!n||id!==n.id||!['mss','nipa'].includes(n.agency_id)||typeof n.title!=='string'||n.title.length>400||
      !['not_run','html_available','fetch_failed'].includes(n.status)||!Array.isArray(n.documents)||n.documents.length>10||!Array.isArray(n.history)||n.history.length>5)throw Error('원문 기록 형식 오류');
   for(const ref of n.documents){
     const f=d.documents[ref.id];
     if(!f||f.program_id!==id||f.notice_source!==n.source||f.url!==ref.public_url||f.name!==ref.name||typeof ref.name!=='string'||ref.name.length>160)throw Error('첨부 연결 불일치');
     if(!Object.hasOwn(labels,f.status))throw Error('첨부 상태 오류');
     if(f.extraction&&(!Array.isArray(f.extraction.candidate_facts)||f.extraction.candidate_facts.length>24||f.extraction.attachments_reviewed!==false||f.extraction.coverage!=='body_text_only_unreviewed'||f.sha256!==f.extraction.sha256))throw Error('첨부 검증 승격 금지');
     for(const c of f.extraction?.candidate_facts||[])if(!c||c.status!=='candidate_unverified'||c.context_warning!==true||typeof c.excerpt!=='string'||c.excerpt.length>260||typeof c.locator!=='string')throw Error('미검증 후보 형식 오류');
   }
 }
 return d;
}
function link(value,source,label){
 try{
   const u=new URL(value),s=new URL(source);
   if(u.protocol!=='https:'||s.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')return '';
   const pairs=[...u.searchParams];if(new Set(pairs.map(x=>x[0])).size!==pairs.length||pairs.some(x=>/token|key|secret|password|signature/i.test(x[0])))return '';
   const ms=['www.mss.go.kr','mss.go.kr'],np=['www.nipa.kr','nipa.kr'];
   const mss=ms.includes(u.hostname)&&ms.includes(s.hostname)&&u.searchParams.get('cbIdx')==='310'&&/^\d{5,12}$/.test(u.searchParams.get('bcIdx')||'')&&u.searchParams.get('bcIdx')===s.searchParams.get('bcIdx')&&
     (u.pathname==='/site/smba/ex/bbs/View.do'||u.pathname==='/common/board/Download.do'&&/^[A-Za-z0-9_-]{8,120}\.(pdf|hwpx?)$/i.test(u.searchParams.get('streFileNm')||''));
   const nipa=np.includes(u.hostname)&&np.includes(s.hostname)&&/^\/home\/bsnsAll\/\d{1,2}\/nttDetail$/.test(u.pathname)&&u.searchParams.get('bbsNo')==='4'&&/^\d{3,12}$/.test(u.searchParams.get('nttNo')||'')&&u.searchParams.get('nttNo')===s.searchParams.get('nttNo');
   if(!mss&&!nipa)return '';
   return '<a href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
 }catch{return '';}
}
function oldTime(at,now){const v=Date.parse(at);return typeof at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(at)||!Number.isFinite(v)||+now-v>30*3600000||v-+now>300000;}
function sourceWarning(n,listing,now){
 const r=listing?.records?.[n.id],s=listing?.sources?.[n.agency_id];
 return !r||r.fingerprint!==n.listing_fingerprint||!s||r.last_seen_at!==s.last_attempt_at||!['ok_changed','ok_no_change'].includes(s.status)||oldTime(s.last_success_at,now)||oldTime(n.last_success_at,now)||n.status!=='html_available';
}
function view(data,listing,filters={},now=new Date()){
 const d=checked(data),all=Object.values(d.notices),q=String(filters.query||'').toLowerCase().trim();
 const records=all.filter(n=>(!filters.agency||filters.agency==='all'||n.agency_id===filters.agency)&&(!q||n.title.toLowerCase().includes(q)||n.id.toLowerCase().includes(q)));
 records.sort((a,b)=>(b.last_attempt_at||'').localeCompare(a.last_attempt_at||'')||a.id.localeCompare(b.id));
 const r=d.run,runLabel={not_run:'아직 실행하지 않음',idle:'처리 대상 없음·전체 확인 아님',ok_scoped:'이번 제한 범위 처리 성공',partial:'일부 실패·제한·재확인 필요'}[r.status];
 let out='<div class="bot-banner bot-warning"><b>기관 후보 원문·첨부 근거 · AI 호출 0회</b><p>'+esc(runLabel)+' / '+esc(r.at||'실행 기록 없음')+'</p><p>'+esc(d.scope)+'</p><p>기존 지원사업 숫자와 합산하지 않으며, 원문을 읽어도 신청 가능으로 승격하지 않습니다.</p></div>';
 out+='<p>이번 실행: 원문 '+esc(r.notices_success)+' 성공 / '+esc(r.notices_failed)+' 실패 · 첨부 '+esc(r.files_attempted)+' 시도 · 본문 '+esc(r.text_extracted)+' · 부분/본문 없음 '+esc(r.partial_or_no_text)+' · 제한 '+esc(r.blocked)+' · 실패 '+esc(r.failed)+'</p>';
 out+='<p>보존 원문 '+all.length+'건 / 필터 '+records.length+'건. 최대 60건 표시. 대기 중인 전체 후보의 검증 완료를 뜻하지 않습니다.</p><ul class="bot-list">';
 out+=records.slice(0,60).map(n=>{
  const warning=sourceWarning(n,listing,now),matched=listing?.records?.[n.id];
  let html='<li id="agencyEvidence-'+esc(n.id)+'"><b>'+esc(n.title)+'</b><p>'+esc(n.id)+' · 목록 분류 '+esc(matched?.kind||'재확인 필요')+' · 마지막 원문 성공 '+esc(n.last_success_at||'없음')+'</p>';
  if(warning)html+='<p><strong>현재 목록·원문 상태 재확인 필요. 아래 내용은 이전 성공 기록일 수 있습니다.</strong></p>';
  if(n.review_required||matched?.review_required)html+='<p><strong>내용·첨부 목록 변경: 원문 재검토 필요</strong></p>';
  if(n.last_error)html+='<p>최근 원문 실패: '+esc(n.last_error)+'</p>';
  if(n.unhandled_links)html+='<p>미지원·차단된 첨부 링크 '+esc(n.unhandled_links)+'건. 모든 첨부를 읽은 것이 아닙니다.</p>';
  html+=link(n.source,n.source,'기관 원문 열기 ↗');
  if(matched?.kind==='candidate'&&link(n.source,n.source,''))html+=' <a href="applications.html#agency='+encodeURIComponent(n.id)+'">검토 후보로 준비하기</a>';
  html+='<details><summary>첨부 '+n.documents.length+'건의 근거·조건 후보</summary>';
  if(!n.documents.length)html+='<p>현재 허용된 파일 링크 없음. 첨부가 실제로 없거나 모든 제출요건이 확인됐다는 뜻은 아닙니다.</p>';
  for(const ref of n.documents){
    const f=d.documents[ref.id],ex=f.extraction;
    html+='<article class="audit-box"><b>'+esc(ref.name)+'</b><p>'+esc(labels[f.status])+' · 마지막 성공 '+esc(f.last_success_at||'없음')+'</p>';
    if(f.review_required)html+='<p><strong>파일 내용 변경·재검토 필요</strong></p>';
    if(ex&&f.status!=='text_extracted')html+='<p>현재 성공 자료가 아닐 수 있습니다. 아래 후보는 마지막으로 추출한 과거 기록입니다.</p>';
    html+=link(ref.public_url,n.source,n.agency_id==='nipa'?'원문에서 현재 첨부 열기 ↗':'공식 첨부 열기 ↗');
    if(n.agency_id==='nipa')html+='<p>NIPA 임시 다운로드 주소는 저장하지 않습니다. 원문 페이지에서 현재 링크를 사용합니다.</p>';
    if(ex){
      html+='<p>형식 '+esc(ex.format)+' · '+esc(ex.bytes)+'바이트 · 파일 지문 <code>'+esc(ex.sha256)+'</code></p>';
      html+='<p>'+esc((ex.limitations||[]).join(' '))+'</p><ul>';
      for(const c of ex.candidate_facts)html+='<li><b>'+esc(categories[c.category]||'조건 후보')+'</b> — '+esc(c.excerpt)+'<p>근거 위치: '+esc(c.locator)+' · 후보·미검증</p></li>';
      html+='</ul>';
      if(!ex.candidate_facts.length)html+='<p>추출 패턴에 맞는 후보 없음. 조건이 없다는 뜻은 아닙니다.</p>';
    }
    html+='</article>';
  }
  return html+'</details></li>';
 }).join('')||'<li>아직 열람 기록이 없습니다. 목록 수집 성공과 원문·첨부 처리는 별도입니다.</li>';
 return out+'</ul>';
}
const api={checked,link,oldTime,sourceWarning,view};if(typeof module==='object'&&module.exports)module.exports=api;
root.FundingAgencyEvidence=api;if(typeof document==='undefined')return;
const host=document.getElementById('agencyEvidenceBody');if(!host)return;
const filter=document.getElementById('agencyEvidenceFilter'),query=document.getElementById('agencyEvidenceQuery');
let current=null,listing=null,ticket=0;
function render(){if(current)host.innerHTML=view(current,listing,{agency:filter?.value,query:query?.value});}
async function load(){const own=++ticket;try{
 const v='?v='+Date.now();const results=await Promise.all([fetch('data/agency_evidence.json'+v,{cache:'no-store'}),fetch('data/agency_discovery.json'+v,{cache:'no-store'})]);
 if(results.some(r=>!r.ok))throw Error('unavailable');
 const [d,l]=await Promise.all(results.map(r=>r.json()));checked(d);
 if(l?.schema!=='public-funding-agency-discovery/v1'||l.automatic_approval!==false||l.model_calls!==0)throw Error('bad listing');
 if(own===ticket){current=d;listing=l;render();}
 }catch{if(own===ticket){current=null;listing=null;host.textContent='기관 원문·첨부 기록을 읽지 못했습니다. 이전 목록 성공을 근거 검증 성공으로 판단하지 마십시오.';}}}
if(filter)filter.addEventListener('change',render);if(query)query.addEventListener('input',render);
const refresh=document.getElementById('refreshBtn');if(refresh)refresh.addEventListener('click',load);load();
})(typeof globalThis!=='undefined'?globalThis:this);
