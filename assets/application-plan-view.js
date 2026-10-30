/* P0.14 view: escaped HTML only. */
(function(root){
'use strict';
function panel(a,c,C,esc){
const aid=esc(a.program_id),p=a.plan;
const attrs=(field,section='')=>' data-app="'+aid+'" data-field="plan:'+field+'" data-section="'+esc(section)+'"';
const button=(act,label,extra='')=>'<button type="button" class="btn btn-secondary" data-app="'+aid+'" data-act="'+act+'" '+extra+'>'+label+'</button>';
const textField=(label,field,value,max,section='',multi=false)=>'<label>'+label+(multi?'<textarea rows="5" maxlength="'+max+'"'+attrs(field,section)+'>'+esc(value)+'</textarea>':'<input maxlength="'+max+'"'+attrs(field,section)+' value="'+esc(value)+'">')+'</label>';
function links(s,kind,rows){
const doc=kind==='doc',ids=doc?s.evidence_ids:s.requirement_ids;
return '<div class="draft-links"><b>'+(doc?'자료 참조':'요구사항 대응')+'</b><div>'+ids.map(id=>'<span class="dossier-chip">'+esc(id+' · '+(rows.find(x=>x.id===id)?.title||''))+' '+button('plan_unlink_'+kind,'연결 해제','data-section="'+esc(s.id)+'" data-code="'+esc(id)+'"')+'</span>').join('')+'</div><div class="dossier-add"><label>'+(doc?'연결할 자료':'연결할 요구사항')+'<select id="plan-'+kind+'-'+aid+'-'+esc(s.id)+'"><option value="">참조코드 선택</option>'+rows.filter(x=>!ids.includes(x.id)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.id+' · '+x.title)+'</option>').join('')+'</select></label>'+button('plan_link_'+kind,'연결','data-section="'+esc(s.id)+'"'+(ids.length>=5?' disabled':''))+'</div></div>';
}
const sections=p.sections.map((s,i)=>{const check=c.rows[i];return '<details class="draft-section" data-panel="plan-'+aid+'-'+esc(s.id)+'"><summary>'+(i+1)+'. '+esc(C.SECTIONS[i].title)+' <span id="plan-section-state-'+aid+'-'+esc(s.id)+'">'+esc(check.written?'문안 작성됨':'미입력')+'</span></summary><p class="boundary">'+esc(C.SECTIONS[i].prompt)+'</p><div class="draft-fields">'+
textField('실제 양식 항목명 · 직접 대조 입력','form_heading',s.form_heading,180,s.id)+textField('양식 위치 · 첨부명/쪽/항목','form_locator',s.form_locator,240,s.id)+
textField('자체입력 관찰·실적 · 외부 검증 안 함','facts',s.facts,C.LIMITS.section_facts,s.id,true)+textField('앞으로의 계획·목표·가정','proposal',s.proposal,C.LIMITS.section_proposal,s.id,true)+
textField('추가 확인·보완할 내용','questions',s.questions,C.LIMITS.section_questions,s.id,true)+
'<label>글자수 상한 가정 · 공식 양식에서 직접 확인<input type="number" min="1" max="20000" step="1"'+attrs('char_limit',s.id)+' value="'+esc(s.char_limit??'')+'"><small>관찰·계획 본문의 공백·줄바꿈 포함 Unicode 문자 수입니다. 제목·메모·근거목록은 제외하며 실제 제출 편집기의 분량 계산과 다를 수 있습니다.</small></label></div>'+links(s,'doc',a.dossier.documents)+links(s,'req',a.dossier.requirements)+
'<p id="plan-check-'+aid+'-'+esc(s.id)+'" class="boundary">본문 '+check.characters+'자 · '+esc(check.issues.join(' / ')||'입력 범위에서만 점검 항목 미발견')+'</p></details>';
}).join('');
return '<details class="draft-panel" data-panel="plan-'+aid+'"><summary>사업계획서 초안 작업대 <span id="plan-written-'+aid+'">문안 작성 '+c.written+' / 8 · 공식 양식 아님</span></summary><div class="dossier-content"><p class="boundary">기본 항목은 내부 작성 가이드입니다. 해당 공고의 공식 양식·평가표를 자동 판정하지 않습니다. 사용자 문안을 항목별로 조립하며 AI 문장 생성·모델 호출·자동 수치 생성은 하지 않습니다.</p><div class="draft-fields">'+textField('사업명 · 개인정보 입력 금지','project_title',p.project_title,160)+textField('한 줄 설명','one_line',p.one_line,500)+'</div><p>위의 <b>제출요구·자료 연결</b>에 기록한 참조코드를 각 문안에 연결하십시오. 자료 보유 상태나 파일 별칭만으로 주장이 검증되지는 않습니다.</p>'+sections+'<div id="plan-status-'+aid+'" class="alert-list">'+c.warnings.map(x=>'<p>'+esc(x)+'</p>').join('')+'</div><p class="boundary">입력 시 현재 메모리의 초안만 바뀝니다. 파일로 보존하려면 상단의 ‘준비 파일 저장’을 누르십시오. 이전 미리보기는 입력 변경 시 해제하며, 내보내기는 항상 현재 값으로 생성합니다.</p><div class="dossier-actions">'+button('plan_preview','현재 초안·누락 미리보기')+button('plan_export','사업계획서 작업 초안(.txt) 저장')+'</div><pre id="draft-output-'+aid+'" class="draft-preview" aria-live="polite" hidden></pre></div></details>';
}
const api={panel};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FundingPlanView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
