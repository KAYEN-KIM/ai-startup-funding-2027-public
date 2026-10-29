/* P0.3 browser-local workspace. Public GETs only; no applicant persistence. */
'use strict';
(() => {
  const $=id=>document.getElementById(id), E=window.EligibilityCore, C=window.RadarCore, esc=C.esc;
  const state={ready:false,programs:[],conditions:{records:{}},evidence:{records:{}},reviews:{items:[]},last:null};
  const booleanFields=['is_sme','innovation','digital_capability'];
  const textValue=v=>v===true?'해당·보유':v===false?'비해당·미보유':({not_established:'미설립',sole_proprietor:'개인사업자',corporation:'법인사업자'}[v]||String(v??'미입력'));
  function readInput(){
    const out={};
    for(const name of Object.keys(E.FIELDS)){
      const value=$(name).value;
      if(value==='')continue;
      out[name]=booleanFields.includes(name)?value==='true':value;
    }
    return out;
  }
  function safeLink(url,label){const value=C.sourceURL(url);return value?'<a href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':esc('출처 미확인');}
  function conditionFor(p){return state.conditions.records[p.id]||null;}
  function evaluate(p,input,now){return E.evaluate(p,conditionFor(p),input,{now,evidence:state.evidence.records[p.id],reviews:state.reviews.items});}
  function resetResult(){state.last=null;$('exportReport').hidden=true;$('exportWarning').hidden=true;$('comparisonPanel').hidden=true;$('comparisonResults').replaceChildren();}
  function renderResult(p,r,input){
    const condition=conditionFor(p),d=C.deadline(p);
    const color=r.code==='excluded'||r.code==='closed'?'s-gray':r.code==='eligible'?'s-green':'s-gold';
    const rows=r.rows.map(row=>'<div class="condition-row"><div><strong>'+esc(row.label)+'</strong><span class="tag '+(row.code==='pass'?'s-green':row.code==='fail'?'s-gray':'s-gold')+'">'+esc({pass:'충족',fail:'불충족',unknown:'판정 보류'}[row.code])+'</span></div><p>'+esc(row.reason)+'</p>'+(row.source?'<details><summary>판정 근거</summary><blockquote>'+esc(row.source.excerpt)+'</blockquote><p>'+esc(row.source.locator)+' · 확인 '+esc(row.source.checked_at.slice(0,10))+'</p>'+safeLink(row.source.url,'공식 요약 원문')+'</details>':'')+'</div>').join('');
    const questions=r.open_questions?.length?'<div class="pending-questions"><b>추가 확인이 필요한 사항</b><ul>'+r.open_questions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'';
    const missing=r.missing_fields?.length?'<p class="missing-fields">입력 필요: '+r.missing_fields.map(x=>esc(E.FIELDS[x])).join(' · ')+'</p>':'';
    const facts=(condition?.candidate_facts||[]).slice(0,8);
    const candidates=facts.length?'<details class="candidate-panel"><summary>자동 추출 후보 '+facts.length+'건 — 판정에는 사용하지 않음</summary>'+facts.map(f=>'<p><span class="tag s-purple">미검증</span> '+esc(f.excerpt)+' <small>('+esc(f.origin_field)+')</small></p>').join('')+'</details>':'';
    $('result').innerHTML='<article class="assessment-result"><div class="assessment-heading"><span class="tag '+color+'">'+esc(r.label)+'</span><span class="tag '+d.css+'">'+esc(d.text)+'</span></div><h3>'+esc(p.title)+'</h3><p>'+r.reasons.map(esc).join(' ')+'</p>'+missing+rows+questions+candidates+'<p class="assessment-disclaimer">'+esc(r.disclaimer)+'</p>'+safeLink(p.source,'전체 공고')+'</article>';
    state.last={schema:'local-funding-precheck/v1',created_at:new Date().toISOString(),private_local_input:input,program:{id:p.id,title:p.title,source:p.source},result:r};
    $('exportReport').hidden=false;$('exportWarning').hidden=false;
  }
  function runOne(){
    if(!state.ready)return;
    const p=state.programs.find(x=>x.id===$('programChoice').value);
    if(!p){$('result').textContent='지원사업을 선택하십시오.';return;}
    resetResult();const input=readInput();renderResult(p,evaluate(p,input,new Date()),input);
  }
  function runAll(){
    if(!state.ready)return;
    resetResult();const now=new Date(),input=readInput();
    const order={eligible:0,conditional:1,insufficient:2,excluded:3,closed:4,not_applicable:5};
    const results=state.programs.map(p=>({p,r:evaluate(p,input,now)})).sort((a,b)=>order[a.r.code]-order[b.r.code]||a.p.title.localeCompare(b.p.title,'ko'));
    const counts={};results.forEach(({r})=>counts[r.code]=(counts[r.code]||0)+1);
    $('comparisonSummary').textContent=Object.keys(counts).map(code=>E.LABELS[code]+' '+counts[code]+'건').join(' · ');
    $('comparisonResults').innerHTML=results.map(({p,r})=>'<button type="button" class="comparison-row" data-program="'+esc(p.id)+'"><span>'+esc(p.title)+'</span><b>'+esc(r.label)+'</b><small>'+esc(r.reasons[0])+'</small></button>').join('');
    $('comparisonPanel').hidden=false;
    $('comparisonResults').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{$('programChoice').value=b.dataset.program;runOne();$('assessmentTitle').scrollIntoView({behavior:'smooth',block:'start'});}));
  }
  function clearInput(){
    $('companyFields').reset();resetResult();
    $('result').innerHTML='<div class="assessment-empty"><b>입력과 결과를 지웠습니다.</b><p>회사 조건은 저장하거나 전송하지 않았습니다.</p></div>';
  }
  function exportReport(){
    if(!state.last)return;
    const blob=new Blob([JSON.stringify(state.last,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AI_Funding_Local_Precheck_PRIVATE.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function load(){
    state.ready=false;resetResult();
    for(const id of ['evaluateBtn','compareBtn','programChoice'])$(id).disabled=true;
    $('loadStatus').textContent='공개 공고·조건·변경 이력을 읽는 중입니다. 입력 내용은 전송하지 않습니다.';
    $('result').innerHTML='<div class="assessment-empty">공개 근거를 다시 읽고 있습니다. 이전 판정은 지웠습니다.</div>';
    const stamp=Date.now();
    const get=async name=>{const response=await fetch('data/'+name+'?v='+stamp,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error(name+' HTTP '+response.status);return response.json();};
    try{
      const [p,c,e,r]=await Promise.all(['programs.json','conditions.json','evidence.json','change_reviews.json'].map(get));
      if(p.schema!=='public-funding-radar/v1'||c.schema!=='public-funding-conditions/v1'||e.schema!=='public-funding-evidence/v1'||r.schema!=='public-funding-reviews/v1'||!Array.isArray(p.items)||!c.records||!e.records||!Array.isArray(r.items))throw new Error('공개 자료의 스키마가 일치하지 않습니다.');
      state.programs=p.items;state.conditions=c;state.evidence=e;state.reviews=r;state.ready=true;
      const programs=[...p.items].sort((a,b)=>Number(Boolean(c.records[b.id]?.clauses.length))-Number(Boolean(c.records[a.id]?.clauses.length))||a.title.localeCompare(b.title,'ko'));
      $('programChoice').replaceChildren();
      for(const item of programs){const option=document.createElement('option');option.value=item.id;option.textContent=(c.records[item.id]?.clauses.length?'[부분 규칙 검토] ':'[규칙 미검토] ')+item.title;$('programChoice').append(option);}
      const reviewed=programs.filter(x=>c.records[x.id]?.clauses.length).length;
      $('loadStatus').textContent=p.items.length+'개 공고 · '+reviewed+'개 공고의 일부 조건 구조화 · 나머지는 정보 부족으로 처리합니다. 개인 입력은 서버로 전송하지 않습니다.';
      $('result').innerHTML='<div class="assessment-empty"><b>검토 준비가 되었습니다.</b><p>회사 조건을 입력한 뒤 선택 공고 검토 또는 전체 공고 비교를 누르십시오.</p></div>';
      for(const id of ['evaluateBtn','compareBtn','programChoice'])$(id).disabled=false;
    }catch(error){$('loadStatus').textContent='검토 불가: '+String(error.message)+'. 근거·변경 이력을 모두 읽기 전에는 판정하지 않습니다.';}
  }
  $('companyFields').addEventListener('submit',e=>e.preventDefault());
  $('companyFields').addEventListener('change',()=>{resetResult();$('result').innerHTML='<div class="assessment-empty">입력이 바뀌었습니다. 다시 검토하십시오.</div>';});
  $('programChoice').addEventListener('change',()=>{resetResult();$('result').innerHTML='<div class="assessment-empty">선택 공고를 검토하십시오.</div>';});
  $('evaluateBtn').addEventListener('click',runOne);$('compareBtn').addEventListener('click',runAll);$('clearInput').addEventListener('click',clearInput);$('exportReport').addEventListener('click',exportReport);$('reloadData').addEventListener('click',load);
  $('founded_on').max=C.kstDay(new Date());
  load();
})();
