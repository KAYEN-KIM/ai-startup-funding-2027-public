/* P0.12: private, explicit-file application preparation. No I/O in this module. */
(function(root) {
  'use strict';
  const VERSION='0.12.0', SCHEMA='private-funding-applications/v1';
  const LIMITS=Object.freeze({applications:12,tasks:20,bytes:262144});
  const STAGES=Object.freeze({watch:'관심',review:'검토',preparing:'준비',submitted:'제출했다고 기록',selected:'선정됐다고 기록',not_selected:'미선정 기록',paused:'보류'});
  const STATUSES=Object.freeze({todo:'미착수',working:'진행',done:'준비 완료(자체기록)',not_applicable:'해당 없음(자체판단)'});
  const TEMPLATES=Object.freeze([
    ['source','최신 공고·첨부·수정공고 직접 확인'],
    ['eligibility','대표·법인·업력·지역·기수혜 조건 확인'],
    ['product','고객 문제·제품 데모·실증 근거 정리'],
    ['budget','자부담·월별 현금·다른 과제 중복 점검'],
    ['documents','공고별 제출 양식·증빙 목록 대조'],
    ['submission','접수 포털·마감시각·최종 제출 확인 방법 점검']
  ].map(x=>Object.freeze(x)));
  const SNAP_KEYS=['title','year','mode','source_level','opens','deadline','amount','eligibility'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const utf8=s=>new TextEncoder().encode(s).length;
  function fail(message){throw new Error(message);}
  function text(v,max,label){if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))fail(label+' 형식/길이 오류');return v;}
  function keys(o,allowed,required=allowed){
    if(!o||Array.isArray(o)||typeof o!=='object')fail('객체 형식 오류');
    for(const k of Object.keys(o))if(!allowed.includes(k))fail('허용하지 않는 필드: '+k);
    for(const k of required)if(!Object.hasOwn(o,k))fail('필수 필드 누락: '+k);
  }
  function id(v){text(v,160,'ID');if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(v))fail('ID 문자 오류');return v;}
  function day(v){
    if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))return false;
    const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;
  }
  function stamp(v){
    if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!day(v.slice(0,10)))return false;
    const m=v.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);if(+m[1]>23||+m[2]>59||+(m[3]||0)>59)return false;
    const z=v.match(/([+-])(\d{2}):(\d{2})$/);if(z&&(+z[2]>14||+z[3]>59||(+z[2]===14&&+z[3]!==0)))return false;
    return Number.isFinite(Date.parse(v));
  }
  function dateValue(v){return v===null||day(v)||stamp(v);}
  function kstDay(now=new Date()){if(!Number.isFinite(+now))fail('기준시각 오류');return new Date(+now+32400000).toISOString().slice(0,10);}
  function snapshot(p){
    const s={};
    for(const k of SNAP_KEYS){
      let v=p[k]??null;
      if(k==='year') {if(!Number.isInteger(v)||v<2000||v>2099)fail('공고 연도 오류');}
      else if(k==='opens'||k==='deadline') {if(!dateValue(v))v=null;}
      else if(v!==null) {v=text(v,k==='title'?500:3000,'공고 '+k);}
      s[k]=v;
    }
    if(!s.title||!['beneficiary','discovery','reference','operator','budget'].includes(s.mode))fail('공고 표시 정보 오류');
    return s;
  }
  function validateSnapshot(s){keys(s,SNAP_KEYS);const x=snapshot(s);if(JSON.stringify(x)!==JSON.stringify(Object.fromEntries(SNAP_KEYS.map(k=>[k,s[k]]))))fail('공고 날짜/표시 정보 오류');return x;}
  function validate(state){
    keys(state,['schema','saved_at','items']);
    if(state.schema!==SCHEMA||!stamp(state.saved_at))fail('지원하지 않는 저장파일 버전/시각');
    if(!Array.isArray(state.items)||state.items.length>LIMITS.applications)fail('준비 공고는 최대 12개');
    const seen=new Set();
    for(const a of state.items){
      keys(a,['program_id','stage','internal_due','reference','tasks']);id(a.program_id);
      if(seen.has(a.program_id))fail('같은 공고의 중복 준비 기록');seen.add(a.program_id);
      if(!Object.hasOwn(STAGES,a.stage))fail('진행 상태 오류');
      if(a.internal_due!==null&&!day(a.internal_due))fail('내부 목표일 오류');
      validateSnapshot(a.reference);
      if(!Array.isArray(a.tasks)||a.tasks.length>LIMITS.tasks)fail('공고별 준비 항목은 최대 20개');
      const tids=new Set();
      for(const t of a.tasks){
        keys(t,['id','title','status','due_date','kind']);id(t.id);text(t.title,180,'준비 항목');if(!t.title.trim())fail('준비 항목명 필요');
        if(tids.has(t.id))fail('중복 준비 항목 ID');tids.add(t.id);
        if(!Object.hasOwn(STATUSES,t.status)||!['template','custom'].includes(t.kind))fail('준비 항목 상태/구분 오류');
        if(t.kind==='template'&&!TEMPLATES.some(([i,title])=>i===t.id&&title===t.title))fail('기본 준비 항목 변조');
        if(t.due_date!==null&&!day(t.due_date))fail('준비 항목 목표일 오류');
      }
    }
    if(utf8(JSON.stringify(state))>LIMITS.bytes)fail('저장파일 크기 한도 256 KiB');
    return clone(state);
  }
  function empty(now=new Date()){return {schema:SCHEMA,saved_at:now.toISOString(),items:[]};}
  function add(state,p,now=new Date()){
    const out=validate(state);id(p.id);
    if(['operator','budget'].includes(p.mode))fail('운영기관 모집·예산안은 기업 신청 준비 대상으로 추가할 수 없습니다.');
    if(out.items.some(a=>a.program_id===p.id))fail('이미 준비 보드에 있습니다.');
    out.items.push({program_id:p.id,stage:'watch',internal_due:null,reference:snapshot(p),tasks:TEMPLATES.map(([i,title])=>({id:i,title,status:'todo',due_date:null,kind:'template'}))});
    out.saved_at=now.toISOString();return validate(out);
  }
  function parseFile(raw){
    if(typeof raw!=='string'||utf8(raw)>LIMITS.bytes)fail('저장파일은 UTF-8 JSON 256 KiB 이하여야 합니다.');
    let depth=0,nodes=0;
    const data=JSON.parse(raw,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))fail('금지된 필드');return v;});
    function scan(v,d){if(d>9||++nodes>12000)fail('저장파일 구조 한도 초과');if(v&&typeof v==='object')for(const x of Object.values(v))scan(x,d+1);}
    scan(data,depth);return validate(data);
  }
  function serialize(state,now=new Date()){const out=validate(state);out.saved_at=now.toISOString();const compact=JSON.stringify(validate(out)),pretty=JSON.stringify(out,null,2);return utf8(pretty)<=LIMITS.bytes?pretty:compact;}
  function changed(a,p){if(!p)return ['공고 목록에서 찾을 수 없음'];const s=snapshot(p);return SNAP_KEYS.filter(k=>JSON.stringify(a.reference[k])!==JSON.stringify(s[k]));}
  function acknowledge(state,programId,p){
    const out=validate(state), a=out.items.find(x=>x.program_id===programId);
    if(!a||!p||p.id!==programId)fail('공고 대응 오류');
    a.reference=snapshot(p);return validate(out);
  }
  function freshness(m,now=new Date()){
    const a=m?.sources?.bizinfo_api||m,ms=Date.parse(a?.last_success_at||'');
    return !!a&&a.coverage_complete!==false&&['ok_changed','ok_no_change'].includes(a.status)&&Number.isFinite(ms)&&ms<=+now+300000&&+now-ms<=36*3600000;
  }
  function reception(p,now=new Date()){
    if(!p)return {code:'missing',text:'현재 목록에서 찾을 수 없음',days:null};
    if(['reference','budget','operator'].includes(p.mode))return {code:'not_current',text:p.mode==='reference'?'이전 연도 준비 참고 · 현재 신청 공고 아님':'기업 신청 공고 아님',days:null};
    const v=p.deadline;if(!v||!dateValue(v))return {code:'unknown',text:'마감일·시각 확인 필요',days:null};
    const d=v.length===10?v:kstDay(new Date(v)),today=kstDay(now), days=Math.round((Date.parse(d)-Date.parse(today))/86400000);
    if((v.length>10&&Date.parse(v)<=+now)||d<today)return {code:'expired',text:'기재 마감 경과 · 연장 확인 필요',days};
    if(v.length===10&&d===today)return {code:'today_unknown',text:'오늘 마감 · 정확한 시각 미확인',days:0};
    if(p.opens&&dateValue(p.opens)&&Date.parse(p.opens.length===10?p.opens+'T00:00:00+09:00':p.opens)>+now)return {code:'scheduled',text:'기재 접수 예정 · 원문 확인',days};
    return {code:'upcoming',text:v.length===10?'기재 마감 '+days+'일 전 · 시각 미확인':'기재 마감 '+days+'일 전',days};
  }
  function inspect(a,p,monitor,now=new Date()){
    const differences=changed(a,p), r=reception(p,now),today=kstDay(now);
    const open=a.tasks.filter(t=>!['done','not_applicable'].includes(t.status));
    const overdue=open.filter(t=>t.due_date&&t.due_date<today);
    const next=open.slice().sort((x,y)=>(x.due_date||'9999').localeCompare(y.due_date||'9999'))[0]||null;
    const issues=[];
    if(!p)issues.push('현재 공고가 없어 원문 재확인이 필요합니다. 저장 작업은 보존됩니다.');
    else if(differences.length)issues.push('저장 이후 공고 표시 정보가 달라졌습니다. 변경값을 대조하십시오.');
    if(!freshness(monitor,now))issues.push('수집 상태가 최신 성공으로 확인되지 않았습니다. 공식 마감 일정 내보내기를 보류합니다.');
    if(p?.mode==='discovery')issues.push('자동 수집 발견 후보입니다. 실제 신청자격·첨부를 검토하지 않았습니다.');
    if(p?.mode==='reference')issues.push('이전 연도 조건은 다음 연도의 확정 자격·금액·일정이 아닙니다.');
    if(a.internal_due&&p?.deadline&&dateValue(p.deadline)&&a.internal_due>(day(p.deadline)?p.deadline:kstDay(new Date(p.deadline))))issues.push('내부 목표일이 기재 마감일 뒤입니다.');
    return {differences,reception:r,issues,open:open.length,done:a.tasks.filter(t=>t.status==='done').length,notApplicable:a.tasks.filter(t=>t.status==='not_applicable').length,overdue:overdue.length,next,
      permission:'not_determined',submission_verified:false,
      priority:!p||differences.length?0:overdue.length?1:['today_unknown'].includes(r.code)||(r.days!==null&&r.days>=0&&r.days<=3)?2:3};
  }
  function board(state,catalog,monitor,now=new Date()){
    validate(state);const map=new Map(catalog.items.map(p=>[p.id,p]));
    return state.items.map(a=>({application:a,program:map.get(a.program_id)||null,...inspect(a,map.get(a.program_id),monitor,now)}))
      .sort((a,b)=>a.priority-b.priority||(a.next?.due_date||'9999').localeCompare(b.next?.due_date||'9999')||a.application.program_id.localeCompare(b.application.program_id));
  }
  function icsText(v){return String(v).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
  function fold(line){let out='',bytes=0;for(const c of line){const n=utf8(c);if(bytes+n>75){out+='\r\n ';bytes=1;}out+=c;bytes+=n;}return out;}
  const utc=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  function event(uid,label,when,description,now){
    const lines=['BEGIN:VEVENT','UID:'+uid+'@funding-radar.invalid','DTSTAMP:'+utc(now),'CLASS:PRIVATE','STATUS:TENTATIVE'];
    if(day(when)) {const next=new Date(Date.parse(when+'T00:00:00Z')+86400000).toISOString().slice(0,10);lines.push('DTSTART;VALUE=DATE:'+when.replace(/-/g,''),'DTEND;VALUE=DATE:'+next.replace(/-/g,''));}
    else lines.push('DTSTART:'+utc(when));
    lines.push('SUMMARY:'+icsText(label),'DESCRIPTION:'+icsText(description),'END:VEVENT');return lines;
  }
  function calendar(state,catalog,monitor,now=new Date()){
    const rows=board(state,catalog,monitor,now),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AI Funding Radar//Private Preparation 0.12//KO','CALSCALE:GREGORIAN'],skipped=[];let count=0;
    for(const r of rows){
      const a=r.application,p=r.program,title=p?.title||a.reference.title;
      if(['paused','not_selected','selected'].includes(a.stage)){skipped.push({id:a.program_id,reason:'보류·결과 기록 단계는 일정 내보내기 제외'});continue;}
      if(a.stage!=='submitted'){
        if(p?.mode==='beneficiary'&&p.deadline&&dateValue(p.deadline)&&!r.differences.length&&freshness(monitor,now)&&r.reception.code!=='expired'){
          lines.push(...event(a.program_id+'-notice','[기재 마감'+(day(p.deadline)?'·시각 미확인':'')+'] '+title,p.deadline,'신청 허용이나 최신 원문 확인을 보장하지 않습니다. 공식 원문을 직접 확인하십시오. 이 파일은 자동 갱신되지 않습니다.',now));count++;
        }else skipped.push({id:a.program_id,reason:'기재 마감 제외: 후보/참고/변경/시각 자료/최신 수집/마감 경과 중 확인 필요'});
      }
      if(a.internal_due){lines.push(...event(a.program_id+'-internal','[내부 목표·자체입력] '+title,a.internal_due,'정부의 공식 마감이 아닙니다. 원문 변경은 이 파일에 자동 반영되지 않습니다.',now));count++;}
      for(const t of a.tasks.filter(t=>t.due_date&&!['done','not_applicable'].includes(t.status))){lines.push(...event(a.program_id+'-task-'+t.id,'[준비작업·자체입력] '+t.title+' / '+title,t.due_date,'내부 작업 계획이며 공식 필수서류 판정이 아닙니다.',now));count++;}
    }
    lines.push('END:VCALENDAR');return {text:lines.map(fold).join('\r\n')+'\r\n',count,skipped};
  }
  const api={VERSION,SCHEMA,LIMITS,STAGES,STATUSES,TEMPLATES,SNAP_KEYS,day,stamp,kstDay,snapshot,empty,validate,add,parseFile,serialize,changed,acknowledge,freshness,reception,inspect,board,calendar,icsText,fold};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FundingApplications=api;
})(typeof globalThis!=='undefined'?globalThis:this);
