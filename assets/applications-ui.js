/* All applicant edits remain in memory; file I/O is explicit and local. */
(function(){
  'use strict';
  const C=globalThis.FundingApplicationPlan.attach(globalThis.FundingApplicationDossier.attach(globalThis.FundingApplications)),W=globalThis.FundingPlanView,V=globalThis.FundingDossierView,R=globalThis.RadarCore,$=id=>document.getElementById(id),esc=R.esc;
  let state=C.empty(),catalog={items:[]},monitor=null,dirty=false,pending=null,importToken=0,loadToken=0,linkedNoticeApplied=false;
  const titles={title:'공고명',year:'사업연도',mode:'공고 구분',source_level:'확인 수준',opens:'접수 시작',deadline:'기재 마감',amount:'지원규모 표시',eligibility:'신청대상 요약'};
  function say(s,error=false){$('message').textContent=s;$('message').className='message'+(error?' error':'');}
  function cancelPending(){pending=null;importToken++;$('importPreview').hidden=true;$('importFile').value='';}
  function touch(next){state=C.validate(next);dirty=true;cancelPending();render();}
  function current(id){return catalog.items.find(p=>p.id===id);}
  const options=(obj,val)=>Object.entries(obj).map(([k,v])=>'<option value="'+esc(k)+'"'+(val===k?' selected':'')+'>'+esc(v)+'</option>').join('');
  function renderPicker(){
    const keep=$('noticeSelect').value,q=$('noticeSearch').value.trim().toLocaleLowerCase('ko-KR');
    const items=catalog.items.filter(p=>!['operator','budget'].includes(p.mode)&&(!q||String(p.title).toLocaleLowerCase('ko-KR').includes(q)));
    $('noticeSelect').innerHTML='<option value="">공고를 선택하십시오</option>'+items.map(p=>'<option value="'+esc(p.id)+'">['+esc(p.year)+' · '+esc(p.mode==='reference'?'이전 참고':p.mode==='discovery'?'발견 후보':'수혜 모집 분류')+'] '+esc(p.title)+'</option>').join('');
    if(items.some(p=>p.id===keep))$('noticeSelect').value=keep;
    $('addNotice').disabled=!$('noticeSelect').value||state.items.length>=C.LIMITS.applications;
  }
  function taskHTML(t,a){const attrs=' data-app="'+esc(a.program_id)+'" data-task="'+esc(t.id)+'"';return '<div class="task-row"><p>'+esc(t.title)+'<small>'+esc(t.kind==='template'?'공통 준비 예시 · 공식 필수서류 아님':'사용자가 추가한 내부 작업')+'</small></p><label>진행 상태<select data-field="task_status"'+attrs+' aria-label="'+esc(t.title)+' 상태">'+options(C.STATUSES,t.status)+'</select></label><label>내부 목표일<input type="date" min="2000-01-01" max="2099-12-31" data-field="task_due"'+attrs+' value="'+esc(t.due_date||'')+'" aria-label="'+esc(t.title)+' 목표일"></label><button type="button" class="btn btn-secondary" data-act="remove_task"'+attrs+' aria-label="'+esc(t.title)+' 삭제">삭제</button></div>';}
  function card(row){
    const a=row.application,p=row.program,ref=p||a.reference,aid=esc(a.program_id),url=p?R.sourceURL(p.source):null;
    const warnings=row.issues.map(s=>'<p>'+esc(s)+'</p>');
    if(row.reception.code==='expired')warnings.push('<p>기재 마감이 지났습니다. 현재 접수 가능으로 간주하지 않습니다.</p>');
    if(row.overdue)warnings.push('<p>내부 목표일이 지난 미완료 작업 '+row.overdue+'개가 있습니다.</p>');
    let diffs='';
    if(p&&row.differences.length){const next=C.snapshot(p);diffs='<details><summary>저장 당시와 현재 표시 정보 비교 ('+row.differences.length+')</summary><table class="change-table"><thead><tr><th>항목</th><th>저장 당시</th><th>현재 공개값</th></tr></thead><tbody>'+row.differences.map(k=>'<tr><th>'+esc(titles[k]||k)+'</th><td>'+esc(a.reference[k]??'없음')+'</td><td>'+esc(next[k]??'없음')+'</td></tr>').join('')+'</tbody></table><button class="btn btn-secondary" type="button" data-act="sync" data-app="'+aid+'">변경 확인 후 현재 표시값으로 기준 갱신</button><p class="boundary">표시값 기준만 갱신합니다. 원문·자격·첨부를 검증했다는 뜻은 아닙니다.</p></details>';}
    return '<article class="application-card" data-program="'+aid+'"><div class="card-heading"><div><div class="source-badges"><span>'+esc(ref.year)+'년</span><span>'+esc(row.reception.text)+'</span></div><h3>'+esc(ref.title)+'</h3>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">공식 공고 확인 ↗</a>':'<span class="boundary">공식 링크는 현재 공개 목록에서 확인할 수 없습니다.</span>')+'</div><button class="btn btn-secondary" type="button" data-act="remove" data-app="'+aid+'" aria-label="'+esc(ref.title)+' 보드에서 삭제">보드에서 삭제</button></div><div class="stage-fields"><label>내부 진행 상태 · 자체기록<select data-field="stage" data-app="'+aid+'">'+options(C.STAGES,a.stage)+'</select></label><label>이 공고의 내부 준비 목표일<input type="date" min="2000-01-01" max="2099-12-31" data-field="internal_due" data-app="'+aid+'" value="'+esc(a.internal_due||'')+'"></label></div><p class="readiness-label">작업 '+a.tasks.length+'개 중 '+row.done+'개 준비 완료 · '+row.notApplicable+'개 해당 없음(자체판단)</p>'+(warnings.length?'<div class="alert-list">'+warnings.join('')+'</div>':'')+diffs+'<p class="task-context">다음 준비: '+esc(row.next?row.next.title+(row.next.due_date?' / '+row.next.due_date:' / 목표일 미입력'):'남은 작업이 없습니다. 공식 제출요건은 별도 확인하십시오.')+'</p><div class="tasks">'+a.tasks.map(t=>taskHTML(t,a)).join('')+'</div><div class="new-task"><input type="text" maxlength="180" id="task-'+aid+'" aria-label="추가할 내부 작업" placeholder="내부 작업 추가 · 민감정보 입력 금지"><button class="btn btn-secondary" type="button" data-act="add_task" data-app="'+aid+'"'+(a.tasks.length>=C.LIMITS.tasks?' disabled':'')+'>작업 추가</button></div>'+V.panel(a,row.dossier_check,C,esc)+W.panel(a,row.plan_check,C,esc)+'</article>';
  }
  function render(){
    const opened=new Set(Array.from(document.querySelectorAll?.('details[data-panel][open]')||[]).map(x=>x.dataset.panel));
    const rows=C.board(state,catalog,monitor),sum=[['준비 공고',rows.length],['내부 미완료 작업',rows.reduce((n,r)=>n+r.open,0)],['내부 기한 경과 작업',rows.reduce((n,r)=>n+r.overdue,0)],['표시 정보 재확인',rows.filter(r=>r.differences.length).length]];
    $('summary').innerHTML=sum.map(([t,n])=>'<div><strong>'+n+'</strong><span>'+esc(t)+'</span></div>').join('');
    $('board').innerHTML=rows.length?rows.map(card).join(''):'<p class="empty">준비할 공고를 담거나 이전 준비 파일을 불러오십시오.</p>';
    for(const el of document.querySelectorAll?.('details[data-panel]')||[])if(opened.has(el.dataset.panel))el.open=true;
    $('saveBoard').disabled=!rows.length;$('calendarExport').disabled=!rows.length;renderPicker();
  }
  async function load(){
    const token=++loadToken;$('reloadPublic').disabled=true;
    try{
      const [p,m]=await Promise.all(['data/programs.json','data/monitor.json'].map(async path=>{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('공개 자료 HTTP 오류');return r.json();}));
      if(token!==loadToken)return;
      if(p.schema!=='public-funding-radar/v1'||!Array.isArray(p.items)||p.items.length>10000||m.schema!=='public-funding-monitor/v1')throw new Error('공개 자료 형식 오류');
      const ids=new Set();for(const v of p.items){if(typeof v.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v.id)||ids.has(v.id))throw new Error('공고 식별자 오류');ids.add(v.id);C.snapshot(v);}
      catalog=p;monitor=m;
      $('sourceStatus').textContent='공개 공고 '+p.items.length+'개 · 마지막 수집 성공 '+(m.sources?.bizinfo_api?.last_success_at||m.last_success_at||'없음')+' · '+(C.freshness(m)?'목록 수집 최신 성공 (원문 전체 검증과 다름)':'수집 실패·부분 확인 또는 오래된 상태: 기재 마감 일정 내보내기 보류');
    }catch(e){if(token!==loadToken)return;monitor=null;$('sourceStatus').textContent='공개 자료 확인 실패. 현재 입력과 마지막으로 읽은 목록은 보존합니다. 기재 마감은 원문에서 다시 확인하십시오.';say('공개 자료를 읽지 못했습니다. '+String(e.message||e),true);}
    finally{if(token===loadToken){$('reloadPublic').disabled=false;render();if(!linkedNoticeApplied&&catalog.items.length){const linked=new URLSearchParams(globalThis.location?.hash?.slice(1)||'').get('notice');if(linked&&current(linked)&&!['operator','budget'].includes(current(linked).mode)){$('noticeSelect').value=linked;$('addNotice').disabled=false;}linkedNoticeApplied=true;}}}
  }
  function download(content,mime,filename){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  $('noticeSearch').addEventListener('input',renderPicker);
  $('noticeSelect').addEventListener('change',()=>{$('addNotice').disabled=!$('noticeSelect').value||state.items.length>=C.LIMITS.applications;});
  $('addNotice').addEventListener('click',()=>{try{const p=current($('noticeSelect').value);if(!p)throw new Error('공고를 선택하십시오.');touch(C.add(state,p));say('준비 보드에 추가했습니다. 실제 신청이나 적격 판정은 하지 않았습니다.');}catch(e){say(e.message,true);}});
  $('reloadPublic').addEventListener('click',load);
  // Update model on every input without replacing the focused textarea/IME selection.
  function planInput(t){
    if(!t.dataset?.field?.startsWith('plan:'))return false;
    const id=t.dataset.app,section=t.dataset.section||null,field=t.dataset.field.slice(5);
    const old=state.items.find(a=>a.program_id===id)?.plan;
    try{
      let value=t.value;
      if(field==='char_limit'){if(value!==''&&!/^[1-9]\d{0,4}$/.test(value))throw new Error('글자수 가정은 1~20,000 정수로 입력하십시오.');value=value===''?null:Number(value);}
      state=C.editPlan(state,id,section,field,value);dirty=true;cancelPending();
      const a=state.items.find(a=>a.program_id===id),check=C.inspectPlan(a,current(id),monitor);
      const preview=$('draft-output-'+id);if(preview){preview.textContent='문안이 변경되었습니다. 현재 초안 미리보기를 다시 누르십시오.';preview.hidden=true;}
      const count=$('plan-written-'+id);if(count)count.textContent='문안 작성 '+check.written+' / 8 · 공식 양식 아님';
      const warnings=$('plan-status-'+id);if(warnings)warnings.textContent=check.warnings.join('\n');
      if(section){const row=check.rows.find(x=>x.id===section),status=$('plan-check-'+id+'-'+section),tag=$('plan-section-state-'+id+'-'+section);if(tag)tag.textContent=row.written?'문안 작성됨':'미입력';if(status)status.textContent='본문 '+row.characters+'자 · '+(row.issues.join(' / ')||'입력 범위에서만 점검 항목 미발견');}
    }catch(e){const row=section?old?.sections.find(x=>x.id===section):old;t.value=row?.[field]??'';say('초안 입력을 반영하지 않았습니다. '+e.message,true);}
    return true;
  }
  $('board').addEventListener('input',e=>{planInput(e.target);});
  $('board').addEventListener('change',e=>{
    const t=e.target,id=t.dataset?.app,field=t.dataset?.field;if(!id||!field)return;if(planInput(t))return;
    try{if(field.startsWith('dossier_')){const [group,key]=field.split(':');let updated;if(group==='dossier_document')updated=C.editDocument(state,id,t.dataset.doc,key,['issued_on','valid_until'].includes(key)?t.value||null:t.value);else if(group==='dossier_requirement')updated=C.editRequirement(state,id,t.dataset.req,key,t.value);else return;touch(updated);say('문서 준비 기록을 바꿨습니다. 공고 대조는 다시 기록하십시오.');return;}const n=C.validate(state),a=n.items.find(x=>x.program_id===id);if(!a)throw new Error('준비 공고 없음');
      if(field==='stage')a.stage=t.value;else if(field==='internal_due')a.internal_due=t.value||null;
      else{const task=a.tasks.find(x=>x.id===t.dataset.task);if(!task)throw new Error('작업 없음');if(field==='task_status')task.status=t.value;else if(field==='task_due')task.due_date=t.value||null;else return;}
      touch(n);say('현재 메모리의 준비 기록을 변경했습니다. 계속하려면 준비 파일을 저장하십시오.');
    }catch(err){say(err.message,true);render();}
  });
  $('board').addEventListener('click',e=>{
    const b=e.target.closest?.('button[data-act]');if(!b)return;const {act,app,task}=b.dataset;
    try{let n=C.validate(state),a=n.items.find(x=>x.program_id===app);if(!a)throw new Error('준비 공고 없음');
      if(act.startsWith('plan_')){
        const section=b.dataset.section,kind=act.endsWith('_doc')?'evidence_ids':'requirement_ids';
        if(act==='plan_preview'||act==='plan_export'){
          const out=C.draft(n,app,catalog,monitor);
          if(act==='plan_preview'){const pre=$('draft-output-'+app);pre.textContent=out.text;pre.hidden=false;say('현재 입력으로 작업 초안을 조립했습니다. AI 생성·공식 양식 변환·내용 검증은 하지 않았습니다.');}
          else {download(out.text,'text/plain;charset=utf-8','AI_Funding_Private_Draft_'+app+'_'+C.kstDay()+'.txt');say('현재 문안·가정·참조·확인사항을 담은 비공개 초안 다운로드를 요청했습니다. 준비파일 저장은 별도로 하십시오.');}
          return;
        }
        if(act==='plan_link_doc'||act==='plan_link_req')n=C.linkPlan(n,app,section,kind,$('plan-'+(kind==='evidence_ids'?'doc':'req')+'-'+app+'-'+section).value);
        else if(act==='plan_unlink_doc'||act==='plan_unlink_req')n=C.linkPlan(n,app,section,kind,b.dataset.code,true);
        else return;
        touch(n);say('문안과 자료·요구사항 연결을 바꿨습니다. 실제 내용 검증이나 문서 업로드는 하지 않았습니다.');return;
      }
      if(act.startsWith('dossier_')){
        const rid=b.dataset.req,eid=b.dataset.doc;
        if(act==='dossier_add_document')n=C.addDocument(n,app,$('document-'+app).value);
        else if(act==='dossier_add_requirement')n=C.addRequirement(n,app,$('requirement-'+app).value);
        else if(act==='dossier_link')n=C.link(n,app,rid,$('link-'+app+'-'+rid).value);
        else if(act==='dossier_unlink')n=C.unlink(n,app,rid,eid);
        else if(act==='dossier_remove_document'){if(!confirm('자료 참조와 요구사항·초안의 연결을 삭제합니까? 실제 파일은 삭제하지 않습니다.'))return;n=C.removeDocument(n,app,eid);}
        else if(act==='dossier_remove_requirement'){if(!confirm('이 요구사항 기록과 초안의 연결을 삭제합니까? 공식 제출요건이 사라지는 것은 아닙니다.'))return;n=C.removeRequirement(n,app,rid);}
        else if(act==='dossier_review'){if(!confirm('현재 요구사항·조건을 공고와 직접 대조했다고 기록합니까? 자체기록이며 공식 검증이나 제출 승인이 아닙니다.'))return;n=C.review(n,app,current(app));}
        else if(act==='dossier_export'){const report=C.preflight(n,app,catalog,monitor);download(report.text,'text/plain;charset=utf-8','AI_Funding_Private_Preflight_'+app+'_'+C.kstDay()+'.txt');say('현재 입력과 공개값으로 내부 점검표 다운로드를 요청했습니다. 실제 제출·문서 업로드는 하지 않았습니다.');return;}
        else return;touch(n);say('문서 준비 참조목록을 변경했습니다. JSON 준비 파일을 저장하면 다음에 이어갈 수 있습니다.');return;
      }
      if(act==='remove'){if(!confirm('이 공고의 현재 준비 입력을 보드에서 삭제합니까? 저장한 파일은 변경되지 않습니다.'))return;n.items=n.items.filter(x=>x.program_id!==app);}
      else if(act==='remove_task'){if(!confirm('이 준비 작업을 삭제합니까? 공식 제출서류가 없어지는 것은 아닙니다.'))return;a.tasks=a.tasks.filter(x=>x.id!==task);}
      else if(act==='add_task'){const title=$('task-'+app).value.trim();if(!title)throw new Error('내부 작업명을 입력하십시오.');let i=1;while(a.tasks.some(t=>t.id==='custom-'+i))i++;a.tasks.push({id:'custom-'+i,title,status:'todo',due_date:null,kind:'custom'});}
      else if(act==='sync'){if(!confirm('차이를 확인한 뒤 현재 공개 표시값으로 비교 기준을 바꿉니까? 자격·원문 검증으로 처리하지 않습니다.'))return;n=C.acknowledge(n,app,current(app));}
      else return;touch(n);say('준비 기록을 변경했습니다. 저장한 파일은 자동으로 변경되지 않습니다.');
    }catch(err){say(err.message,true);}
  });
  $('saveBoard').addEventListener('click',()=>{try{download(C.serialize(state),'application/json;charset=utf-8','AI_Funding_Private_Preparation_'+C.kstDay()+'.json');dirty=false;say('준비 파일 다운로드를 요청했습니다. 파일 저장 완료 여부는 브라우저에서 확인하십시오. 암호화되지 않은 비공개 파일입니다.');}catch(e){say(e.message,true);}});
  $('calendarExport').addEventListener('click',()=>{try{const out=C.calendar(state,catalog,monitor);if(!out.count)throw new Error('내보낼 일정이 없습니다. 내부 작업일을 입력하거나 공식 마감 정보를 재확인하십시오.');if(!confirm('일정 파일을 저장합니까? 캘린더 서비스로 가져오면 그 서비스에 내용이 저장될 수 있으며 이 파일은 자동 갱신되지 않습니다.'))return;download(out.text,'text/calendar;charset=utf-8','AI_Funding_Private_Dates_'+C.kstDay()+'.ics');say('일정 '+out.count+'건 다운로드 요청 · 기재 마감/보류 등 제외 '+out.skipped.length+'건. 자동 갱신·실제 신청·알림 예약은 하지 않았습니다.');}catch(e){say(e.message,true);}});
  $('clearBoard').addEventListener('click',()=>{if(!state.items.length)return;if(confirm('현재 입력을 모두 비웁니까? 저장하지 않은 변경은 사라집니다.')){touch(C.empty());say('현재 메모리의 입력을 비웠습니다. 저장 파일은 삭제하지 않았습니다.');}});
  // Capture the user-selected File before resetting the picker. No upload API is used.
  $('importFile').addEventListener('change',async()=>{
    const file=$('importFile').files?.[0];if(!file)return;$('importFile').value='';const token=++importToken;pending=null;$('importPreview').hidden=true;
    try{if(file.size>C.LIMITS.bytes)throw new Error('준비 파일은 512 KiB 이하여야 합니다.');const raw=await file.text();if(token!==importToken)return;const parsed=C.parseFile(raw);pending=parsed;$('importSummary').textContent='불러오기 검증 완료: 공고 '+parsed.items.length+'개 · 저장시각 '+parsed.saved_at;$('importPreview').hidden=false;say('파일을 읽었습니다. 확인 버튼을 누르기 전에는 현재 보드를 바꾸지 않습니다.');}
    catch(e){if(token===importToken){pending=null;say('파일 불러오기 거부: '+String(e.message||e),true);}}
  });
  $('applyImport').addEventListener('click',()=>{if(!pending)return;state=C.validate(pending);dirty=false;cancelPending();render();say('파일의 입력을 현재 메모리에 불러왔습니다. 공고 변경과 확인 수준은 최신 목록에 다시 대조합니다.');});
  $('cancelImport').addEventListener('click',()=>{cancelPending();say('불러오기를 취소했습니다. 기존 입력은 보존됩니다.');});
  globalThis.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  render();load();
})();
