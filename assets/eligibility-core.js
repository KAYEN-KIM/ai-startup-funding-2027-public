/* P0.3 deterministic pre-screening. Pure functions. No storage, network or inferred eligibility. */
(function(root) {
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./radar-core.js'):root.RadarCore;
  const VERSION='0.3.0';
  const REGIONS=['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
  const FIELDS={entity:'사업자 상태',founded_on:'창업일',is_sme:'중소기업 해당 여부',headquarters_region:'사업자등록증상 본사 소재지',innovation:'혁신기술·아이디어 보유',digital_capability:'디지털 기술 개발·실증 역량'};
  const BOOLEANS=['is_sme','innovation','digital_capability'];
  const LABELS={eligible:'등록된 조건 충족',conditional:'조건부 검토',excluded:'확인된 필수조건 불충족',insufficient:'정보 부족',not_applicable:'직접 신청 대상 아님',closed:'기재 마감 경과'};
  function known(v){return v!==null&&v!==undefined&&v!=='';}
  function dayValid(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&C.validDate(v);}
  function normalized(input={},now=new Date()) {
    const values={},errors=[];
    if(!input||typeof input!=='object'||Array.isArray(input))return {values,errors:['회사 입력 형식 오류']};
    for(const field of Object.keys(input))if(!Object.hasOwn(FIELDS,field))errors.push('허용되지 않은 입력 필드');
    if(known(input.entity)) {
      if(['not_established','sole_proprietor','corporation'].includes(input.entity))values.entity=input.entity;
      else errors.push('사업자 상태 값 오류');
    }
    if(known(input.founded_on)) {
      if(!dayValid(input.founded_on)||input.founded_on>C.kstDay(now))errors.push('창업일은 유효한 과거 또는 오늘 날짜여야 합니다.');
      else values.founded_on=input.founded_on;
    }
    if(values.entity==='not_established'&&values.founded_on)errors.push('미설립 상태에 창업일을 함께 입력할 수 없습니다.');
    for(const field of BOOLEANS) {
      if(!known(input[field]))continue;
      if(typeof input[field]==='boolean')values[field]=input[field];
      else errors.push(FIELDS[field]+' 값 오류');
    }
    if(known(input.headquarters_region)) {
      if(REGIONS.includes(input.headquarters_region))values.headquarters_region=input.headquarters_region;
      else errors.push('본사 소재지는 목록의 시·도만 선택하십시오.');
    }
    return {values,errors:[...new Set(errors)]};
  }
  function observation(rule,values) {
    if(rule.op==='all'||rule.op==='any') {
      if(!Array.isArray(rule.children)||!rule.children.length)return {code:'unknown',reason:'빈 복합 조건',missing:[]};
      const rows=rule.children.map(r=>observation(r,values));
      const code=rule.op==='all'?(rows.some(r=>r.code==='fail')?'fail':rows.every(r=>r.code==='pass')?'pass':'unknown'):(rows.some(r=>r.code==='pass')?'pass':rows.every(r=>r.code==='fail')?'fail':'unknown');
      return {code,reason:rule.op==='all'?'모든 하위조건을 충족해야 합니다.':'하위조건 중 하나 이상을 충족해야 합니다.',children:rows,missing:[...new Set(rows.flatMap(r=>r.missing||[]))]};
    }
    const field=rule.field;
    if(!Object.hasOwn(FIELDS,field))return {code:'unknown',reason:'지원하지 않는 조건 필드',missing:[]};
    const value=values[field];
    if(!known(value))return {code:'unknown',reason:FIELDS[field]+' 입력 필요',missing:[field]};
    if(rule.op==='tenure_lte'||rule.op==='tenure_gte') {
      if(field!=='founded_on'||!dayValid(value)||!dayValid(rule.as_of)||!Number.isInteger(rule.years)||rule.years<0||rule.years>100)return {code:'unknown',reason:'업력 기준일 또는 계산 규칙 미확인',missing:[]};
      if(value>rule.as_of)return {code:'fail',reason:'공고의 업력 기준일 이후에 창업했습니다.',missing:[]};
      const anniversary=String(Number(value.slice(0,4))+rule.years)+value.slice(4);
      if(!dayValid(anniversary))return {code:'unknown',reason:'윤년 경계의 법정 계산 방식 확인 필요',missing:[]};
      if(anniversary===rule.as_of)return {code:'unknown',reason:'정확히 '+rule.years+'년 경계일: 첨부의 포함·제외 기준 확인 필요',missing:[]};
      const pass=rule.op==='tenure_lte'?anniversary>rule.as_of:anniversary<rule.as_of;
      return {code:pass?'pass':'fail',reason:rule.as_of+' 기준 '+rule.years+'년 '+(rule.op==='tenure_lte'?'이내':'이상')+' 조건 '+(pass?'충족':'불충족'),missing:[]};
    }
    let pass;
    if(rule.op==='eq'&&['string','boolean'].includes(typeof rule.value))pass=value===rule.value;
    else if(rule.op==='in'&&Array.isArray(rule.values)&&rule.values.length)pass=rule.values.includes(value);
    else return {code:'unknown',reason:'연산자 또는 비교값 검증 필요',missing:[]};
    return {code:pass?'pass':'fail',reason:FIELDS[field]+' '+(pass?'조건 충족':'조건과 불일치'),missing:[]};
  }
  function evidenceReady(rule,sources,now,depth=0) {
    if(depth>8||!rule||typeof rule!=='object')return false;
    const evidence=sources?.[rule.evidence_id];
    if(rule.status!=='reviewed'||!evidence||!['official_summary_reviewed','full_notice_reviewed'].includes(evidence.level)||!C.sourceURL(evidence.url)||!evidence.excerpt||!evidence.locator||C.stale(evidence.checked_at,now,14*24))return false;
    if(rule.op==='all'||rule.op==='any')return Array.isArray(rule.children)&&rule.children.length>0&&rule.children.every(c=>evidenceReady(c,sources,now,depth+1));
    return true;
  }
  function finish(code,reasons,rows=[],extra={}) {
    return {engine_version:VERSION,code,label:LABELS[code],reasons,rows,...extra,disclaimer:'등록된 조건에 대한 사전 검토입니다. 기관의 적격 판정·선정·지원액을 보장하지 않습니다.'};
  }
  function evaluate(program,condition,input={},context={}) {
    const now=context.now||new Date(), d=C.deadline(program,now), normalizedInput=normalized(input,now);
    const common={program_id:program.id,reception:d.code,missing_fields:[],open_questions:condition?.open_questions||[],evaluated_at:now.toISOString()};
    if(['operator','budget','reference'].includes(program.mode))return finish('not_applicable',['운영기관 모집·예산안·과거 참고조건은 현재 기업 신청 적격성 판정 대상이 아닙니다.'],[],common);
    if(normalizedInput.errors.length)return finish('insufficient',normalizedInput.errors,[],common);
    if(!condition||condition.program_id!==program.id||condition.schema!=='program-conditions/v1')return finish('insufficient',['이 공고의 구조화된 조건이 아직 없습니다.'],[],common);
    const binding=condition.bound_fields;
    const boundKeys=['id','title','source','year','eligibility','amount','opens','deadline'];
    if(!binding||Object.keys(binding).length!==boundKeys.length||boundKeys.some(k=>!Object.hasOwn(binding,k)||JSON.stringify(program[k]??null)!==JSON.stringify(binding[k]??null)))return finish('insufficient',['공고와 조건 자료의 버전이 일치하지 않습니다. 다시 읽고 재검토하십시오.'],[],common);
    if(condition.metadata_state!=='current')return finish('insufficient',['검토 후 공고 정보가 변경되었습니다. 규칙을 다시 검토해야 합니다.'],[],common);
    const ev=context.evidence;
    if(ev&&(ev.review_required||ev.status==='fetch_failed'))return finish('insufficient',['원문 변경 또는 열람 실패로 이전 조건의 최신성을 확인해야 합니다.'],[],common);
    const pending=(context.reviews||[]).filter(r=>r.program_id===program.id&&r.status==='pending'&&['title','eligibility','opens','deadline'].includes(r.field));
    const acknowledged=new Set(condition.reviewed_difference_ids||[]);
    if(pending.some(r=>!acknowledged.has(r.id)))return finish('insufficient',['검토하지 않은 공고 변경 차이가 남아 있습니다.'],[],common);
    if(d.code==='closed')return finish('closed',['기재 마감이 지났습니다. 연장·재공고 여부를 원문에서 확인하십시오.'],[],common);
    const clauses=Array.isArray(condition.clauses)?condition.clauses:[];
    if(!clauses.length)return finish('insufficient',['검증된 기계 판정 규칙이 없습니다. 자동 추출 후보는 판정에 사용하지 않습니다.'],[],common);
    const rows=clauses.map(rule=>{
      const ready=evidenceReady(rule,condition.sources,now);
      const result=ready?observation(rule,normalizedInput.values):{code:'unknown',reason:'조건 근거가 미검증·만료 또는 누락되었습니다.',missing:[]};
      return {id:rule.id,label:rule.label||'조건',...result,source:condition.sources?.[rule.evidence_id]||null};
    });
    common.missing_fields=[...new Set(rows.flatMap(r=>r.missing||[]))];
    if(rows.some(r=>r.code==='fail'))return finish('excluded',['현재 입력이 확인된 필수조건과 일치하지 않습니다. 다른 조건의 통과 여부와는 별개입니다.'],rows,common);
    if(rows.some(r=>r.code==='unknown'))return finish('insufficient',['입력 또는 검증 근거가 부족한 조건이 있습니다. 미입력은 충족으로 간주하지 않습니다.'],rows,common);
    const complete=condition.coverage==='complete'&&condition.attachments_reviewed===true&&condition.exceptions_reviewed===true&&!common.open_questions.length&&Object.values(condition.sources||{}).every(s=>s.level==='full_notice_reviewed');
    if(!complete||!['open','open_date'].includes(d.code)||program.mode==='discovery')return finish('conditional',['등록된 필수조건은 충족하지만 첨부·예외·중복제한·접수 상태를 추가 확인해야 합니다.'],rows,common);
    return finish('eligible',['등록된 전체 조건을 충족했습니다. 제출 서류와 기관의 최종 심사는 별도입니다.'],rows,common);
  }
  const api={VERSION,REGIONS,FIELDS,LABELS,normalized,observation,evidenceReady,evaluate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EligibilityCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
