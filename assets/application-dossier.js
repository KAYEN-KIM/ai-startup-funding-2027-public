/* P0.13: private requirement-to-evidence ledger. No I/O; self-reports only. */
(function(root){
  'use strict';
  const SCHEMA='private-funding-applications/v2',VERSION='0.13.0';
  const LIMITS=Object.freeze({applications:12,tasks:20,requirements:30,documents:30,links:5,bytes:524288});
  const ORIGINS=Object.freeze({internal:'내부 준비 항목 · 공식 요구 아님',notice_note:'공고에서 옮겼다고 기록 · 원문 미검증'});
  const APPLICABILITY=Object.freeze({unknown:'적용 여부 미확인',required:'필요하다고 자체판단',conditional:'조건부 · 조건 확인 필요',not_applicable:'해당 없음 · 사유 필요'});
  const DOC_STATES=Object.freeze({missing:'자료 없음',draft:'작성·발급 준비 중',ready_self:'보유·준비 완료라고 기록',needs_revision:'수정·재발급 필요'});
  const clone=x=>JSON.parse(JSON.stringify(x)),bytes=x=>new TextEncoder().encode(x).length;
  const fail=m=>{throw new Error(m);};
  function keys(o,allowed){
    if(!o||Array.isArray(o)||typeof o!=='object')fail('문서 준비 객체 형식 오류');
    for(const k of Object.keys(o))if(!allowed.includes(k))fail('허용하지 않는 문서 필드: '+k);
    for(const k of allowed)if(!Object.hasOwn(o,k))fail('문서 필드 누락: '+k);
  }
  function text(v,max,label){if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))fail(label+' 형식·길이 오류');return v;}
  function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(v))fail('자료·요구사항 코드 오류');return v;}
  function emptyDossier(){return {requirements:[],documents:[],reviewed_at:null,reviewed_reference:null};}
  function attach(B){
    if(!B||B.SCHEMA!=='private-funding-applications/v1')fail('기존 준비 보드 모듈 버전 불일치');
    const baseItem=a=>Object.fromEntries(['program_id','stage','internal_due','reference','tasks'].map(k=>[k,a[k]]));
    const baseState=s=>({schema:B.SCHEMA,saved_at:s.saved_at,items:s.items.map(baseItem)});
    function checkDossier(d){
      keys(d,['requirements','documents','reviewed_at','reviewed_reference']);
      if(!Array.isArray(d.requirements)||d.requirements.length>LIMITS.requirements)fail('공고별 요구사항은 최대 30개');
      if(!Array.isArray(d.documents)||d.documents.length>LIMITS.documents)fail('공고별 자료 참조는 최대 30개');
      if((d.reviewed_at===null)!==(d.reviewed_reference===null))fail('문서 대조 기록·참조 불일치');
      if(d.reviewed_at!==null){if(!B.stamp(d.reviewed_at))fail('문서 대조 시각 오류');B.validate({schema:B.SCHEMA,saved_at:d.reviewed_at,items:[{program_id:'review',stage:'review',internal_due:null,reference:d.reviewed_reference,tasks:[]}]});}
      const docs=new Set(),reqs=new Set();
      for(const e of d.documents){
        keys(e,['id','title','file_label','status','issued_on','valid_until']);id(e.id);
        if(docs.has(e.id))fail('중복 자료 참조코드');docs.add(e.id);
        text(e.title,160,'자료 이름');if(!e.title.trim())fail('자료 이름 필요');text(e.file_label,180,'파일 별칭');
        if(!Object.hasOwn(DOC_STATES,e.status))fail('자료 상태 오류');
        for(const k of ['issued_on','valid_until'])if(e[k]!==null&&!B.day(e[k]))fail('자료 날짜 오류');
        if(e.issued_on&&e.valid_until&&e.issued_on>e.valid_until)fail('발급일이 유효기간 뒤입니다.');
      }
      for(const r of d.requirements){
        keys(r,['id','title','origin','locator','applicability','condition_note','evidence_ids']);id(r.id);
        if(reqs.has(r.id))fail('중복 요구사항 코드');reqs.add(r.id);
        text(r.title,180,'요구사항');if(!r.title.trim())fail('요구사항 이름 필요');
        text(r.locator,240,'원문 위치');text(r.condition_note,400,'조건·제외 사유');
        if(!Object.hasOwn(ORIGINS,r.origin)||!Object.hasOwn(APPLICABILITY,r.applicability))fail('요구사항 출처·적용 구분 오류');
        if(!Array.isArray(r.evidence_ids)||r.evidence_ids.length>LIMITS.links)fail('요구사항별 연결 자료는 최대 5개');
        const refs=new Set();for(const e of r.evidence_ids){id(e);if(!docs.has(e)||refs.has(e))fail('없는 자료 연결 또는 중복 자료 연결');refs.add(e);}
      }
      return d;
    }
    function validate(s){
      // Explicit legacy migration preserves all P0.12 tasks/states and adds empty ledgers.
      if(s?.schema===B.SCHEMA){const b=B.validate(s);return {schema:SCHEMA,saved_at:b.saved_at,items:b.items.map(a=>({...a,dossier:emptyDossier()}))};}
      keys(s,['schema','saved_at','items']);
      if(s.schema!==SCHEMA||!Array.isArray(s.items))fail('지원하지 않는 준비파일 버전');
      for(const a of s.items)keys(a,['program_id','stage','internal_due','reference','tasks','dossier']);
      const b=B.validate(baseState(s));
      for(const a of s.items)checkDossier(a.dossier);
      const result={schema:SCHEMA,saved_at:b.saved_at,items:b.items.map((a,i)=>({...a,dossier:clone(s.items[i].dossier)}))};
      if(bytes(JSON.stringify(result))>LIMITS.bytes)fail('준비파일 크기 한도 512 KiB');
      return result;
    }
    function mergeBase(b,prior){const prev=new Map(prior.items.map(a=>[a.program_id,a.dossier]));return validate({schema:SCHEMA,saved_at:b.saved_at,items:b.items.map(a=>({...a,dossier:prev.get(a.program_id)||emptyDossier()}))});}
    function empty(now=new Date()){return validate(B.empty(now));}
    function add(s,p,now=new Date()){const v=validate(s);return mergeBase(B.add(baseState(v),p,now),v);}
    function acknowledge(s,pid,p){const v=validate(s);return mergeBase(B.acknowledge(baseState(v),pid,p),v);}
    function parseFile(raw){
      if(typeof raw!=='string'||bytes(raw)>LIMITS.bytes)fail('준비파일은 UTF-8 JSON 512 KiB 이하여야 합니다.');
      const obj=JSON.parse(raw,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))fail('금지된 필드');return v;});
      let nodes=0;function scan(v,depth){if(depth>12||++nodes>40000)fail('준비파일 구조 한도 초과');if(v&&typeof v==='object')for(const x of Object.values(v))scan(x,depth+1);}
      scan(obj,0);return validate(obj);
    }
    function serialize(s,now=new Date()){const v=validate(s);v.saved_at=now.toISOString();const valid=validate(v),pretty=JSON.stringify(valid,null,2);return bytes(pretty)<=LIMITS.bytes?pretty:JSON.stringify(valid);}
    function mutate(s,pid,fn){const v=validate(s),a=v.items.find(x=>x.program_id===pid);if(!a)fail('준비 공고 없음');fn(a.dossier);a.dossier.reviewed_at=null;a.dossier.reviewed_reference=null;return validate(v);}
    function nextId(rows,prefix){let n=1;while(rows.some(r=>r.id===prefix+n))n++;return prefix+n;}
    function addRequirement(s,pid,title){return mutate(s,pid,d=>d.requirements.push({id:nextId(d.requirements,'R'),title:title.trim(),origin:'internal',locator:'',applicability:'unknown',condition_note:'',evidence_ids:[]}));}
    function addDocument(s,pid,title){return mutate(s,pid,d=>d.documents.push({id:nextId(d.documents,'D'),title:title.trim(),file_label:'',status:'missing',issued_on:null,valid_until:null}));}
    function editRequirement(s,pid,rid,field,value){return mutate(s,pid,d=>{const r=d.requirements.find(x=>x.id===rid);if(!r||!['title','origin','locator','applicability','condition_note'].includes(field))fail('요구사항 편집 대상 오류');r[field]=value;});}
    function editDocument(s,pid,eid,field,value){return mutate(s,pid,d=>{const e=d.documents.find(x=>x.id===eid);if(!e||!['title','file_label','status','issued_on','valid_until'].includes(field))fail('자료 편집 대상 오류');e[field]=value;});}
    function link(s,pid,rid,eid){return mutate(s,pid,d=>{const r=d.requirements.find(x=>x.id===rid);if(!r)fail('요구사항 없음');if(r.evidence_ids.includes(eid))fail('이미 연결된 자료');r.evidence_ids.push(eid);});}
    function unlink(s,pid,rid,eid){return mutate(s,pid,d=>{const r=d.requirements.find(x=>x.id===rid);if(!r||!r.evidence_ids.includes(eid))fail('자료 연결 없음');r.evidence_ids=r.evidence_ids.filter(x=>x!==eid);});}
    function removeDocument(s,pid,eid){return mutate(s,pid,d=>{if(!d.documents.some(e=>e.id===eid))fail('자료 없음');d.documents=d.documents.filter(e=>e.id!==eid);for(const r of d.requirements)r.evidence_ids=r.evidence_ids.filter(x=>x!==eid);});}
    function removeRequirement(s,pid,rid){return mutate(s,pid,d=>{if(!d.requirements.some(r=>r.id===rid))fail('요구사항 없음');d.requirements=d.requirements.filter(r=>r.id!==rid);});}
    function review(s,pid,p,now=new Date()){
      const v=validate(s),a=v.items.find(x=>x.program_id===pid);
      if(!a||p?.id!==pid)fail('현재 공고 없이 문서 대조를 기록할 수 없습니다.');
      if(!a.dossier.requirements.length)fail('대조할 요구사항을 먼저 기록하십시오.');
      a.dossier.reviewed_at=now.toISOString();a.dossier.reviewed_reference=B.snapshot(p);return validate(v);
    }
    function inspectDossier(a,p,monitor,now=new Date()){
      const d=checkDossier(a.dossier),today=B.kstDay(now),target=a.internal_due&&a.internal_due>today?a.internal_due:today;
      const warnings=[],byDoc=new Map(d.documents.map(e=>[e.id,e]));
      function docIssues(e){const out=[];if(e.status!=='ready_self')out.push(DOC_STATES[e.status]);if(e.issued_on&&e.issued_on>today)out.push('발급일이 미래');if(e.valid_until&&e.valid_until<today)out.push('입력 유효기간 경과');else if(e.valid_until&&e.valid_until<target)out.push('내부 목표일 전에 유효기간 종료');return out;}
      const rows=d.requirements.map(r=>{
        const issues=[],excluded=r.applicability==='not_applicable';
        if(excluded){if(!r.condition_note.trim())issues.push('해당 없음 사유 누락');}
        else {
          if(r.applicability==='unknown')issues.push('적용 여부 미확인');
          if(r.applicability==='conditional')issues.push('조건부 요구: 해당 여부 확인 필요');
          if(r.origin!=='notice_note'||!r.locator.trim())issues.push('공고 요구 여부·원문 위치 확인 필요');
          if(!r.evidence_ids.length)issues.push('연결된 자료 없음');
          for(const eid of r.evidence_ids)for(const issue of docIssues(byDoc.get(eid)))issues.push(eid+': '+issue);
        }
        return {id:r.id,title:r.title,excluded,issues,ready:!excluded&&!issues.length};
      });
      const active=rows.filter(r=>!r.excluded),ready=rows.filter(r=>r.ready).length;
      if(!active.length)warnings.push('검토할 요구사항이 없습니다. 공식 제출목록을 먼저 확인하십시오.');
      if(!p)warnings.push('현재 공개 목록에서 공고를 찾을 수 없습니다.');
      else if(p.mode!=='beneficiary')warnings.push('현재 검증된 수혜기업 모집 분류가 아닙니다. 참고·후보는 실제 제출 가능으로 처리하지 않습니다.');
      if(p&&['expired','unknown','missing'].includes(B.reception(p,now).code))warnings.push('접수 가능 여부·마감일을 원문에서 확인하십시오.');
      if(p&&B.reception(p,now).code==='today_unknown')warnings.push('오늘 기재 마감이나 정확한 시각을 확인하지 못했습니다.');
      if(p&&B.reception(p,now).code==='scheduled')warnings.push('기재 접수 시작 전입니다. 실제 접수 시점은 원문에서 확인하십시오.');
      if(!B.freshness(monitor,now))warnings.push('공개 목록 수집 상태가 최신 성공으로 확인되지 않았습니다.');
      if(!d.reviewed_reference||!d.reviewed_at)warnings.push('요구사항 목록을 현재 공고와 대조했다고 기록하지 않았습니다.');
      else if(Date.parse(d.reviewed_at)>+now+300000)warnings.push('대조 기록 시각이 미래입니다.');
      else if(p&&B.changed({reference:d.reviewed_reference},p).length)warnings.push('문서 대조 이후 공고 표시 정보가 변경됐습니다. 요구사항 재대조가 필요합니다.');
      const unresolved=rows.filter(r=>r.issues.length).length;
      return {rows,warnings,active:active.length,ready,unresolved,excluded:rows.filter(r=>r.excluded).length,documents:d.documents.length,
        document_issues:d.documents.map(e=>({id:e.id,issues:docIssues(e)})),target,
        result:active.length&&unresolved===0&&warnings.length===0?'internal_gaps_not_detected':'review_required',
        official_requirements_complete:false,eligibility:'not_determined',submission_verified:false};
    }
    function board(s,catalog,monitor,now=new Date()){
      const v=validate(s),byId=new Map(v.items.map(a=>[a.program_id,a]));
      return B.board(baseState(v),catalog,monitor,now).map(r=>({...r,application:byId.get(r.application.program_id),dossier_check:inspectDossier(byId.get(r.application.program_id),r.program,monitor,now)}));
    }
    function calendar(s,catalog,monitor,now=new Date()){return B.calendar(baseState(validate(s)),catalog,monitor,now);}
    function preflight(s,pid,catalog,monitor,now=new Date()){
      const r=board(s,catalog,monitor,now).find(x=>x.application.program_id===pid);if(!r)fail('내보낼 준비 공고 없음');
      const a=r.application,d=a.dossier,c=r.dossier_check;
      const lines=['AI FUNDING RADAR — 비공개 제출 전 준비 점검표','생성: '+now.toISOString(),'공고: '+(r.program?.title||a.reference.title),'공고 코드: '+pid,
        '범위: 사용자 입력·자체기록의 누락 점검. 공식 제출서류 완비·신청자격·선정·접수를 검증하지 않습니다.',
        '원본 파일은 읽거나 첨부하지 않았습니다. 자료 코드는 참조용이며 실제 제출 전 공식 양식·원본·서명을 확인하십시오.',
        '이 파일은 암호화되지 않았습니다. 외부 공유·공개 저장소 업로드 전에 내용을 확인하십시오.','',
        '내부 상태: '+B.STAGES[a.stage]+' / 내부 목표일: '+(a.internal_due||'미입력'),
        '요구사항: '+c.active+'개 / 자체기록상 누락 미발견: '+c.ready+'개 / 확인 필요: '+c.unresolved+'개 / 해당 없음 자체판단: '+c.excluded+'개',
        '결과: '+(c.result==='internal_gaps_not_detected'?'입력한 범위에서만 누락 미발견. 공식 제출 승인 아님.':'확인할 항목이 남아 있습니다.'),'','[공고·대조 상태]',...c.warnings.map(x=>'- '+x),
        '문서 대조 자체기록: '+(d.reviewed_at||'없음'),'','[요구사항과 연결 자료]'];
      for(const req of d.requirements){const row=c.rows.find(x=>x.id===req.id);lines.push(req.id+' '+req.title,'  구분: '+ORIGINS[req.origin]+' / '+APPLICABILITY[req.applicability],'  위치: '+(req.locator||'미입력'),'  조건·제외 사유: '+(req.condition_note||'미입력'),'  연결: '+(req.evidence_ids.join(', ')||'없음'),'  점검: '+(row.issues.join(' / ')||(row.excluded?'해당 없음 자체판단':'입력 범위에서만 누락 미발견')));}
      lines.push('','[자료 참조목록 — 원본 파일 미포함]');
      for(const e of d.documents)lines.push(e.id+' '+e.title+' / '+DOC_STATES[e.status],'  파일 별칭: '+(e.file_label||'미입력')+' / 발급일: '+(e.issued_on||'미입력')+' / 사용자 입력 유효기한: '+(e.valid_until||'미입력·유효기한 요건 별도 확인'));
      lines.push('','[다음 준비 작업]',...a.tasks.filter(t=>!['done','not_applicable'].includes(t.status)).map(t=>'- '+t.title+' / '+(t.due_date||'목표일 미입력')),
        '','[공식 접수 전 직접 확인]','- 최신 공고·첨부·수정공고의 전체 제출서류와 조건부 증빙이 빠지지 않았는가?','- 양식 버전, 파일 형식·용량, 서명·날인, 발급 유효기간이 해당 공고와 일치하는가?','- 실제 접수처에서 제출 완료 상태와 접수증을 확인했는가?',
        '','실제 신청·자료 업로드·메일 발송·캘린더 쓰기는 실행하지 않았습니다.');
      return {text:lines.join('\r\n')+'\r\n',check:c};
    }
    return Object.freeze({...B,VERSION,SCHEMA,LIMITS,ORIGINS,APPLICABILITY,DOC_STATES,empty,validate,add,acknowledge,parseFile,serialize,board,calendar,
      addRequirement,addDocument,editRequirement,editDocument,link,unlink,removeDocument,removeRequirement,review,inspectDossier,preflight});
  }
  const api={SCHEMA,VERSION,LIMITS,ORIGINS,APPLICABILITY,DOC_STATES,emptyDossier,attach};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FundingApplicationDossier=api;
})(typeof globalThis!=='undefined'?globalThis:this);
