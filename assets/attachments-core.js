/* P0.4 public-only attachment evidence; never modifies eligibility rules. */
(function(root){'use strict';
 const C=typeof module!=='undefined'&&module.exports?require('./radar-core.js'):root.RadarCore;
 const LABELS={queued:'대기',text_extracted:'본문 추출 · 조건 미검증',partial_text:'일부 본문만 추출',no_text:'텍스트 없음 · 이미지/스캔 가능',protected_document:'보호문서 · 우회하지 않음',unsupported_format:'미지원 형식',size_limit:'크기·복잡도 한도',unsafe_archive:'안전하지 않은 압축 구조',unsafe_xml:'안전하지 않은 XML',malformed_document:'문서 해석 실패',dependency_missing:'파서 의존성 누락',parser_timeout:'파싱 시간 초과',resource_limit:'파싱 자원 한도',download_failed:'다운로드 실패',source_not_linked:'공식 연결 확인 불가',source_unavailable:'공고 원문 확인 실패'};
 const CAT={eligibility:'신청자격',exclusion:'제외조건',overlap:'중복수혜',cofunding:'자부담',amount:'지원규모',documents:'제출서류',deadline:'신청기간'};
 function status(r){return LABELS[r?.status]||'확인 필요';}
 function failureLabel(r){
  if(!r?.last_error)return '';
  const n=r.http_status;
  if(Number.isInteger(n)&&n>=400&&n<=599)return 'HTTP '+n+(n===401||n===403?' · 인증·접근 거부. 접근 제한을 우회하지 않습니다.':n===404||n===410?' · 파일 없음 또는 제거됨. 원문 연결을 확인하십시오.':r.retryable===true?' · 일시 오류 가능. 재확인 전 성공으로 처리하지 않습니다.':' · 현재 다운로드 불가');
  return r.failure_kind==='network_error'?'연결·시간초과 오류 · 이전 기록 보존':'상세 오류 미확인 · 이전 기록 보존';
 }
 function safeLink(url,label){const s=C.sourceURL(url);return s?'<a target="_blank" rel="noopener noreferrer" href="'+C.esc(s)+'">'+C.esc(label)+' ↗</a>':'출처 미확인';}
 function blocked(manifest,docs,source){
  if(!manifest)return null;
  if(manifest.notice_source!==source)return '첨부 근거와 현재 공고 출처가 일치하지 않습니다.';
  if(manifest.review_required)return '첨부파일 목록이 바뀌었습니다. 기존 조건을 다시 검토해야 합니다.';
  if(manifest.notice_status==='source_unavailable')return '첨부 원문을 현재 확인하지 못했습니다.';
  if((manifest.document_ids||[]).some(id=>docs[id]?.review_required))return '첨부파일 내용이 바뀌었습니다. 기존 조건을 다시 검토해야 합니다.';
  if((manifest.document_ids||[]).some(id=>docs[id]?.last_error&&docs[id]?.extraction))return '이전에 읽은 첨부파일의 최신 상태를 확인하지 못했습니다.';
  return null;
 }
 function card(r,title,manifest){
  const ex=r.extraction,old=Boolean(ex&&r.last_error),current=(manifest?.document_ids||[]).includes(r.id);
  const flag=!current?'현재 첨부 목록에서 빠진 과거 기록':r.review_required?'파일 변경 · 재검토 필요':old?'이전 성공 기록 보존 · 현재 확인 실패':'자동 추출 결과는 판정에 사용하지 않습니다.';
  const hash=ex?.sha256||r.observed_sha256||'';
  const facts=ex?.candidate_facts||[];
  return '<article class="program-card"><div class="card-top"><span class="tag s-purple">'+C.esc(status(r))+'</span><span class="tag">'+C.esc(ex?.format?.toUpperCase()||'형식 미확인')+'</span></div><h3>'+C.esc(title)+'</h3><p>'+C.esc(r.name||'첨부파일')+'</p><p class="notice-warning">'+C.esc(flag)+'</p>'+(r.last_error?'<p class="notice-warning">'+C.esc(failureLabel(r))+'</p>':'')+'<p class="source-small">시도 '+C.esc(r.last_attempt_at||'미실행')+' · 마지막 성공 '+C.esc(r.last_success_at||'없음')+'</p>'+(ex?'<p>'+C.esc(ex.text_characters)+'자 · '+C.esc(ex.units)+'개 텍스트 단위 · 후보 '+facts.length+'건</p>':'')+'<details><summary>파일 지문·추출 범위</summary><p class="hash">SHA-256 '+C.esc(hash||'미확인')+'</p><p>'+C.esc(ex?.parser||'미실행')+'</p><p>'+C.esc((ex?.limitations||[]).join(' / '))+'</p></details><details><summary>조건 후보 '+facts.length+'건 · 원문 문맥 확인 필수</summary>'+facts.map(f=>'<blockquote><span class="tag s-gold">'+C.esc(CAT[f.category]||'검토')+'</span><p>'+C.esc(f.excerpt)+'</p><small>'+C.esc(f.locator)+(f.redacted?' · 연락처 등 생략':'')+'</small></blockquote>').join('')+(facts.length?'':'<p>추출된 조건 후보 없음. 지원 조건이 없다는 뜻이 아닙니다.</p>')+'</details><div class="card-bottom">'+safeLink(r.notice_source,'공고 원문')+safeLink(C.attachmentURL(r.url,r.notice_source),'최신 첨부 · 공고/원본')+'</div></article>';
 }
 const api={LABELS,CAT,status,failureLabel,blocked,card};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AttachmentCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
