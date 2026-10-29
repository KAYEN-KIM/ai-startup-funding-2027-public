/* Public JSON reads only. No applicant input leaves this page. */
(function(){
'use strict';
const $=id=>document.getElementById(id),C=window.RadarCore,S=window.StartupCore,E=C.esc;
let data=null,programs=null,sources=null,last=null;
const money=v=>v===null?'미입력 · 판단 보류':BigInt(v).toLocaleString('ko-KR')+'원';
const ctx=()=>({programs,sources,now:new Date()});
const selected=()=>data?.records.find(r=>r.id===$('startupRoute').value);
const link=(url,label)=>C.sourceURL(url)?'<a href="'+E(C.sourceURL(url))+'" target="_blank" rel="noopener noreferrer">'+E(label)+' ↗</a>':'출처 확인 보류';
function invalidate(){last=null;$('startupExport').hidden=true;$('startupExportWarning').hidden=true;$('startupResult').innerHTML='<div class="assessment-empty">입력 또는 자료가 변경되었습니다. 다시 계산하십시오.</div>';}
function inputs(){return {business_state:$('businessState').value,completed_tasks:(selected()?.tasks||[]).filter(t=>$('task_'+t.id)?.checked).map(t=>t.id),scenario_id:$('startupScenario').value,support_won:$('startupSupport').value,inkind_won:$('startupInkind').value,extra_cash_won:$('startupExtra').value,available_cash_won:$('startupAvailable').value,reference_ack:$('referenceAck').checked,region_confirmed:$('regionAck').checked};}
function financial(i){return {support_won:i.support_won,inkind_won:i.inkind_won,extra_cash_won:i.extra_cash_won,available_cash_won:i.available_cash_won,reference_ack:i.reference_ack,region_confirmed:i.region_confirmed};}
function showScenario(){
 const r=selected(),s=r?.scenarios.find(s=>s.id===$('startupScenario').value);
 $('scenarioHint').textContent=s?'2026 해당 단계·유형 상한 '+money(String(s.max_support_won))+' · 평균액은 한도가 아닙니다.':'시나리오를 선택하십시오.';
 $('regionAckRow').hidden=r?.stage==='pre';invalidate();
}
function showRoute(){
 const r=selected();invalidate();
 if(!r){$('startupScenario').disabled=true;$('startupRun').disabled=true;return;}
 $('startupScenario').innerHTML=(r.stage==='pre'?'':'<option value="">지역 확인 후 선택</option>')+r.scenarios.map(s=>'<option value="'+E(s.id)+'">'+E(s.label)+'</option>').join('');
 $('startupScenario').value=r.stage==='pre'?r.scenarios[0].id:'';$('startupScenario').disabled=false;$('startupRun').disabled=false;
 $('referenceAck').checked=false;$('regionAck').checked=false;
 $('startupTasks').innerHTML=r.tasks.map(t=>'<label class="check-row" for="task_'+E(t.id)+'"><input type="checkbox" id="task_'+E(t.id)+'"><span>'+E(t.label)+'<small>'+E(t.basis)+'</small></span></label>').join('');
 const s=sources.records[r.id],gate=S.gate(r,ctx());
 $('startupSummary').innerHTML='<article class="startup-source"><span class="tag s-gold">2026 종료 공고 · 2027 미확정</span><h3>'+E(r.label)+'</h3><p>'+link(r.source.url,'검토한 원문 파일')+'</p><p class="startup-muted">'+E(r.source.locator)+'</p><p class="startup-muted">원본 마지막 성공 확인: '+E(s?.last_success_at||'미확인')+'</p>'+(gate.length?'<p class="startup-danger">'+gate.map(E).join('<br>')+'</p>':'')+'<h4>확인한 조건의 범위</h4><ul>'+r.conditions.map(x=>'<li>'+E(x)+'</li>').join('')+'</ul><details><summary>추가 유의사항·수행 제한</summary><ul>'+[...r.notes,...r.restrictions].map(x=>'<li>'+E(x)+'</li>').join('')+'</ul></details></article>';
 showScenario();
}
function renderComparison(){
 $('startupComparison').innerHTML='<div class="startup-table-wrap"><table class="startup-table"><thead><tr><th>대안 경로</th><th>2026 참고 규모</th><th>범위</th></tr></thead><tbody>'+data.records.map(r=>'<tr><td>'+E(r.label)+'</td><td>'+money(String(Math.max(...r.scenarios.map(s=>s.max_support_won))))+'</td><td>'+(r.stage==='pre'?'1단계만 · 2단계 금액 제외':'선택한 1개 유형 · 실제 선정액 아님')+'</td></tr>').join('')+'</tbody></table></div><p>'+E(S.compareExecution(data.records.map(r=>r.id),2027,'execution').reasons[0])+'</p>';
 const candidate=data.new_notice_candidates||[];
 $('newNotices').innerHTML=candidate.length?'<p><strong>2027 관련 제목 후보 '+candidate.length+'건 · 이 화면의 규칙으로 자동 전환하지 않습니다.</strong></p>'+candidate.map(p=>'<p>'+link(p.source,p.title)+' <span class="tag s-purple">새 공고 재검토 필요</span></p>').join(''):'<p class="startup-muted">현재 연결된 데이터에서 예비·초기 2027 수혜 공고 후보를 찾지 못했습니다. 전체 기관에 공고가 없다는 뜻은 아닙니다.</p>';
}
async function load(){
 invalidate();$('startupRun').disabled=true;$('startupRoute').disabled=true;$('startupReload').disabled=true;
 $('startupStatus').textContent='공개 참고 자료를 다시 읽고 있습니다.';
 try{
  const files=['data/startup_routes.json','data/programs.json','data/startup_sources.json'];
  const rows=await Promise.all(files.map(async path=>{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('공개 자료 연결 실패');return r.json();}));
  if(rows[0].schema!=='public-startup-preparation/v1'||rows[0].version!=='0.6.0'||rows[0].scope!=='historical_preparation_only'||!Array.isArray(rows[0].records)||!rows[0].records.length||rows[1].schema!=='public-funding-radar/v1'||rows[2].schema!=='public-startup-source-checks/v1')throw new Error('공개 자료 형식이 올바르지 않습니다.');
  [data,programs,sources]=rows;
  $('startupRoute').innerHTML=data.records.map(r=>'<option value="'+E(r.id)+'">'+E(r.label)+'</option>').join('');$('startupRoute').value=data.records[0].id;$('startupRoute').disabled=false;
  const held=data.records.filter(r=>S.gate(r,ctx()).length).length;
  $('startupStatus').textContent='2026 참고 경로 '+data.records.length+'개 · 계산식 '+data.records.reduce((n,r)=>n+r.scenarios.length,0)+'개 · 근거 보류 '+held+'개. 2027 확정 조건은 아닙니다.';
  showRoute();renderComparison();
 }catch(e){data=null;programs=null;sources=null;$('startupStatus').textContent='자료 확인 실패: '+e.message;$('startupRun').disabled=true;$('startupScenario').disabled=true;$('startupSummary').textContent='이전 화면의 근거로 계산하지 않습니다.';}
 finally{$('startupReload').disabled=false;}
}
function run(){
 const r=selected();if(!r)return;const i=inputs(),context=ctx();
 const preparation=S.prepare(r,{business_state:i.business_state,completed_tasks:i.completed_tasks},context),calculation=S.estimate(r,i.scenario_id,financial(i),context);
 last={schema:'private-startup-preparation-export/v1',at:new Date().toISOString(),reference_year:2026,target_year:2027,input:i,route_id:r.id,preparation,calculation};
 let html='<h3>준비 항목</h3><p>'+preparation.reasons.map(E).join('<br>')+'</p>';
 if(preparation.tasks)html+='<p><strong>내부 준비 체크 '+preparation.completed+' / '+preparation.total+'</strong> · 적격성 또는 선정 확률이 아닙니다.</p><ul>'+preparation.tasks.filter(t=>!t.done).map(t=>'<li>'+E(t.label)+'</li>').join('')+'</ul>';
 html+='<h3>2026 참고 자부담 · 2027 미확정</h3><p>'+calculation.reasons.map(E).join('<br>')+'</p>';
 if(calculation.amounts){
  const names={support_won:'요청 지원액 가정',total_minimum_won:'최소 총사업비',own_total_won:'기업부담 합계',minimum_cash_won:'현금 하한',inkind_cap_won:'현물 사용 상한',inkind_used_won:'계산에 반영한 현물',unused_inkind_won:'상한 초과·미사용 현물',own_cash_won:'필요 자부담 현금',extra_cash_won:'별도 운영·선지출 현금',cash_need_won:'총 필요 현금',available_cash_won:'가용 자기 현금',shortfall_won:'가정상 부족액'};
  html+='<dl class="startup-amounts">'+Object.entries(names).map(([k,label])=>'<div><dt>'+E(label)+'</dt><dd>'+E(money(calculation.amounts[k]))+'</dd></div>').join('')+'</dl>';
 }
 html+='<p class="export-warning">'+E(S.DISCLAIMER)+'</p>';$('startupResult').innerHTML=html;$('startupExport').hidden=false;$('startupExportWarning').hidden=false;
}
function clear(){
 $('businessState').value='unknown';$('startupSupport').value='';$('startupInkind').value='0';$('startupExtra').value='0';$('startupAvailable').value='';showRoute();
}
function save(){
 if(!last||JSON.stringify(last.input)!==JSON.stringify(inputs())||S.gate(selected(),ctx()).length){invalidate();return;}
 const blob=new Blob([JSON.stringify(last,null,2)],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=u;a.download='AI_Funding_Private_Preparation_2026_Reference.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),500);
}
$('startupForm').addEventListener('submit',e=>e.preventDefault());
$('startupForm').addEventListener('input',invalidate);$('startupForm').addEventListener('change',invalidate);
$('startupRoute').addEventListener('change',showRoute);$('startupScenario').addEventListener('change',showScenario);
$('startupRun').addEventListener('click',run);$('startupClear').addEventListener('click',clear);$('startupReload').addEventListener('click',load);$('startupExport').addEventListener('click',save);
load();
})();
