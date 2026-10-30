/* P0.18: memory-only agency discovery bridge. No network, storage or model calls. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./agency-report.js'),require('./agency-evidence.js'));
  else root.FundingApplicationAgency=factory(root.FundingAgencyReport,root.FundingAgencyEvidence);
})(typeof globalThis!=='undefined'?globalThis:this,function(Listing,Evidence){
  'use strict';
  const PREFIX='AGENCY-',VERSION='0.18.0',MARK='agency_candidate_unreviewed/v1:';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const HEX=/^[a-f0-9]{64}$/;
  const kinds={candidate:'기관 목록 발견 후보',operator:'운영·주관기관 모집',procurement:'용역·입찰',policy:'정책·통합계획',competition:'공모전·경진대회',result:'평가·선정 결과'};
  function fail(m){throw Error(m);}
  function canonical(value){
    try{
      const u=new URL(value),pairs=[...u.searchParams];
      if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||new Set(pairs.map(x=>x[0])).size!==pairs.length)return null;
      if(pairs.some(([k])=>/token|key|secret|signature|password/i.test(k)))return null;
      if(['mss.go.kr','www.mss.go.kr'].includes(u.hostname)&&u.pathname==='/site/smba/ex/bbs/View.do'&&u.searchParams.get('cbIdx')==='310'&&/^\d{5,12}$/.test(u.searchParams.get('bcIdx')||''))return 'MSS-'+u.searchParams.get('bcIdx');
      if(['nipa.kr','www.nipa.kr'].includes(u.hostname)&&/^\/home\/bsnsAll\/\d{1,2}\/nttDetail$/.test(u.pathname)&&u.searchParams.get('bbsNo')==='4'&&/^\d{3,12}$/.test(u.searchParams.get('nttNo')||''))return 'NIPA-'+u.searchParams.get('nttNo');
    }catch{}
    return null;
  }
  function validDay(v){if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;}
  function validDate(v){if(v===null)return true;if(validDay(v))return true;if(typeof v!=='string'||!/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|\+09:00)$/.test(v))return false;return validDay(v.slice(0,10))&&Number.isFinite(Date.parse(v));}
  function bounded(s,n){return typeof s==='string'&&s.length<=n&&!/[\x00-\x1f\x7f]/.test(s);}
  function checked(listing,evidence){
    if(!Listing?.checked||!Evidence?.checked)fail('기관 검토 모듈을 읽지 못했습니다.');
    Listing.checked(listing);Evidence.checked(evidence);
    for(const [key,r] of Object.entries(listing.records)){
      if(key!==r.id||canonical(r.source)!==key||r.agency_id!==(key.startsWith('MSS-')?'mss':'nipa')||!bounded(r.title,400)||!r.title.trim()||!HEX.test(r.fingerprint)||!Array.isArray(r.years)||r.years.length>8||r.years.some(y=>!Number.isInteger(y)||y<2000||y>2099)||!validDate(r.opens)||!validDate(r.deadline))fail('기관 공고 식별자·연도·날짜 불일치');
      const n=evidence.notices[key];
      if(n){
        if(canonical(n.source)!==key||n.agency_id!==r.agency_id||!HEX.test(n.listing_fingerprint)||[n.body_sha256,n.manifest_sha256].some(h=>h!==null&&h!==undefined&&!HEX.test(h)))fail('기관 원문 근거 연결 불일치');
        for(const ref of n.documents){
          if(!/^[a-f0-9]{16,64}$/.test(ref.id))fail('첨부 식별자 불일치');
          const f=evidence.documents[ref.id];
          if(f.sha256!==null&&f.sha256!==undefined&&!HEX.test(f.sha256))fail('첨부 지문 오류');
        }
      }
    }
    return {listing,evidence};
  }
  function signature(r,n,documents){
    // Existing private v3 field: source/file SHA-256 only, no document bodies.
    const files=(n?.documents||[]).map(ref=>[ref.id,documents[ref.id]?.sha256||null]).sort((a,b)=>a[0].localeCompare(b[0]));
    const s=MARK+JSON.stringify([r.fingerprint,n?.listing_fingerprint||null,n?.body_sha256||null,n?.manifest_sha256||null,files]);
    if(s.length>3000)fail('근거 기준 크기 한도 초과');return s;
  }
  function combine(base,listing,evidence){
    checked(listing,evidence);
    if(!Array.isArray(base?.items)||base.items.length>10000)fail('공개 공고 목록 형식 오류');
    const items=base.items.slice(),used=new Set(),contexts={},links={},stats={listed:0,candidates:0,projected:0,reused:0,excluded:0,year_held:0,ambiguous:0};
    for(const p of items){if(!p||typeof p.id!=='string'||used.has(p.id))fail('공개 공고 ID 중복');used.add(p.id);}
    for(const r of Object.values(listing.records)){
      stats.listed++;if(r.kind==='candidate')stats.candidates++;else stats.excluded++;
      const id=PREFIX+r.id,n=evidence.notices[r.id]||null,years=[...new Set(r.years)];
      const c={record:r,notice:n,documents:evidence.documents,source:listing.sources[r.agency_id]||null,held:null};
      contexts[id]=c;
      const matches=base.items.filter(p=>canonical(p.source)===r.id);
      if(r.kind==='candidate'&&matches.length===1){
        const p=matches[0];
        if(['operator','budget'].includes(p.mode)){links[r.id]={id:null,reason:'기존 등록의 기업 신청 대상 구분을 먼저 확인하십시오.'};continue;}
        c.held='동일 공식 공고의 기존 등록 '+p.id+'에 연결됩니다. 이전 후보의 저장 작업은 자동 이전하지 않습니다.';
        links[r.id]={id:p.id,reused:true,reason:'기관·공식 공고 식별자가 같아 기존 등록을 선택합니다. 검증 내용은 변경하지 않습니다.'};stats.reused++;continue;
      }
      if(matches.length>1){links[r.id]={id:null,reason:'같은 공식 공고 식별자의 기존 등록이 여러 개입니다. 직접 대조가 필요합니다.'};c.held='공식 식별자 중복 대조 필요';stats.ambiguous++;continue;}
      if(years.length!==1){links[r.id]={id:null,reason:'단일 사업연도가 명시되지 않아 보드 연결을 보류합니다. 관측연도를 사업연도로 대신 사용하지 않습니다.'};c.held='사업연도 확인 필요';if(r.kind==='candidate')stats.year_held++;continue;}
      if(used.has(id))fail('기관 후보 ID가 기존 공고와 충돌합니다.');
      const mode=r.kind==='candidate'?'discovery':r.kind==='policy'?'budget':'operator';
      const p={id,title:r.title,year:years[0],kind:'기관 직접수집 후보',mode,opens:r.opens,deadline:r.deadline,source:r.source,source_level:signature(r,n,evidence.documents),amount:'지원금액 미검증 · 합산 금지',eligibility:'기관 목록의 검토 후보입니다. 실제 신청자격·예외·서류·마감시각은 원문 확인 필요',note:'개인 준비용 메모리 투영. 검증된 지원사업 등록·지원금 승격·실제 신청이 아닙니다.'};
      items.push(p);used.add(id);
      if(r.kind==='candidate'){links[r.id]={id,reason:'원문·자격 미검증 후보를 선택합니다. 추가 버튼을 눌러야 준비 기록을 만듭니다.'};stats.projected++;}
      else links[r.id]={id:null,reason:kinds[r.kind]+'은 이 창업 신청 준비 보드의 연결 대상이 아닙니다.'};
    }
    return {catalog:{...base,items},contexts,links,stats};
  }
  function old(at,now){const t=Date.parse(at||'');return !Number.isFinite(t)||t>+now+300000||+now-t>30*3600000;}
  function inspect(id,view,now=new Date(),readFailed=false){
    if(!id?.startsWith(PREFIX))return null;
    const c=view?.contexts?.[id];
    const warnings=['기관 발견 후보의 내부 준비 기록입니다. 신청자격·공식 제출요건·선정은 확인되지 않았습니다.'];
    if(readFailed)warnings.push('공개 기관 자료 재조회 실패. 아래 근거는 마지막으로 읽은 과거 기록일 수 있습니다.');
    if(!c)return {warnings:[...warnings,'현재 기관 목록에 대응하는 기록이 없습니다. 저장 작업과 문안은 보존합니다.'],available:false,counts:{total:0,extracted:0,other:0}};
    const {record:r,notice:n,source:s,documents}=c;
    if(c.held)warnings.push(c.held);
    if(r.kind!=='candidate')warnings.push('현재 목록 분류는 '+kinds[r.kind]+'입니다. 창업 신청 후보로 취급하지 마십시오.');
    if(!s||!['ok_changed','ok_no_change'].includes(s.status)||old(s.last_success_at,now))warnings.push('이 기관 목록의 최신 확인이 실패·지연·미확인 상태입니다.');
    if(!s||r.last_seen_at!==s.last_attempt_at)warnings.push('이번 제한된 목록에서 재관측되지 않았습니다. 삭제나 종료로 단정하지 않습니다.');
    if(r.review_required)warnings.push('목록 표시값이 바뀌어 원문 재검토가 필요합니다.');
    if((r.possible_duplicate_ids||[]).length)warnings.push('제목으로 대조할 기존 공고: '+r.possible_duplicate_ids.join(', ')+' (자동 병합하지 않음)');
    if(!n)warnings.push('원문·첨부 처리 기록이 아직 없습니다.');
    else{
      if(n.status!=='html_available'||old(n.last_success_at,now))warnings.push('원문 열람이 실패·지연·미확인 상태입니다.');
      if(n.listing_fingerprint!==r.fingerprint)warnings.push('원문을 읽었을 때의 목록 지문과 현재 관측이 다릅니다.');
      if(n.review_required)warnings.push('원문 내용·첨부 목록 변경: 직접 재대조가 필요합니다.');
      if(n.unhandled_links)warnings.push('처리하지 못한 첨부 링크가 있습니다. 전체 첨부를 확인한 상태가 아닙니다.');
    }
    const refs=n?.documents||[],fs=refs.map(ref=>documents[ref.id]);
    if(!refs.length)warnings.push('읽은 첨부가 없습니다. 제출서류가 없다는 뜻은 아닙니다.');
    if(fs.some(f=>f.status!=='text_extracted'))warnings.push('대기·제한·실패·부분 추출 첨부가 남아 있습니다.');
    if(fs.some(f=>old(f.last_success_at,now)))warnings.push('첨부파일의 최근 재확인이 아직 완료되지 않았습니다.');
    if(fs.some(f=>f.review_required))warnings.push('첨부파일 내용 변경이 기록돼 있습니다. 이전 조건을 재검토하십시오.');
    return {warnings,available:true,record:r,notice:n,source:s,counts:{total:fs.length,extracted:fs.filter(f=>f.status==='text_extracted').length,other:fs.filter(f=>f.status!=='text_extracted').length}};
  }
  function panel(id,view,now=new Date(),readFailed=false){
    const c=inspect(id,view,now,readFailed);if(!c)return '';
    const r=c.record;
    return '<section class="agency-prep-context" aria-label="기관 후보 근거 상태"><h4>기관 후보 · 원문·첨부 재확인</h4><ul>'+c.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>'+(r?'<p>기관 '+esc(r.agency_id.toUpperCase())+' · 목록 성공 '+esc(c.source?.last_success_at||'없음')+' · 원문 성공 '+esc(c.notice?.last_success_at||'없음')+'</p><p>첨부 '+c.counts.total+'건 / 본문 추출 '+c.counts.extracted+'건 / 나머지 '+c.counts.other+'건. 본문 추출은 조건 검증이 아닙니다.</p><a href="index.html#agencyEvidence-'+esc(r.id)+'">홈의 원문·첨부 근거로 이동</a>':'')+'</section>';
  }
  function report(id,view,now=new Date(),readFailed=false){const c=inspect(id,view,now,readFailed);return c?'\n\n[기관 후보 근거 상태 · 공식 승인 아님]\n'+c.warnings.map(w=>'- '+w).join('\n')+'\n':'';}
  return Object.freeze({VERSION,PREFIX,MARK,canonical,validDay,validDate,checked,signature,combine,inspect,panel,report});
});