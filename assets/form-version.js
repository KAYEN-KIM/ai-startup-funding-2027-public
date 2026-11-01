/* P0.22: local candidate-form comparison only. Never certifies official source/rules. */
(function(root){
'use strict';
const VERSION='0.22.0',MAX=40;
function fail(m){throw new Error(m);}
const F=typeof module!=='undefined'&&module.exports?require('./form-mapping.js'):root.FundingFormMapping;
const I=typeof module!=='undefined'&&module.exports?require('./form-outline-import.js'):root.FundingFormOutlineImport;
function safeFile(v){
 if(!v||!I||typeof I.validate!=='function')fail('후보 파일 검증 모듈이 필요합니다.');
 const parsed=I.validate(JSON.stringify(v));
 const candidates=parsed.candidates;
 if([parsed.document.file_label,parsed.document.source_url,...candidates.map(x=>x.locator)]
   .some(s=>/[\x00-\x1f\x7f]/.test(s)))fail('출처·파일명·위치에 허용하지 않는 제어문자');
 return parsed;
}
function canonical(heading){
 const h=F.headings(heading);
 return h[0].title.normalize('NFKC').toLowerCase().replace(/\s+/gu,'');
}
function indexed(file){
 const index=new Map();
 for(let i=0;i<file.candidates.length;i++){
  const h=file.candidates[i],key=canonical(h.heading);
  if(!index.has(key))index.set(key,[]);
  index.get(key).push({position:i+1,heading:h.heading,locator:h.locator});
 }
 return index;
}
function compare(oldInput,newInput){
 const older=safeFile(oldInput),newer=safeFile(newInput);
 const keys1=indexed(older),keys2=indexed(newer);
 const names=[...new Set([...keys1.keys(),...keys2.keys()])];
 const rows=[];
 for(const name of names){
  const before=keys1.get(name)||[],after=keys2.get(name)||[];
  let status='unchanged';
  const flags=[];
  if(before.length>1||after.length>1){status='ambiguous_duplicate';flags.push('중복 제목: 자동 대응 금지');}
  else if(!before.length){status='added';flags.push('새 후보');}
  else if(!after.length){status='removed';flags.push('현재 후보에서 미발견 — 실제 삭제는 미확정');}
  else{
   if(before[0].heading!==after[0].heading)flags.push('heading_notation_changed');
   if(before[0].position!==after[0].position)flags.push('order_changed');
   if(before[0].locator!==after[0].locator)flags.push('locator_changed');
   if(flags.length)status='recheck';
  }
  rows.push({key:name,status,flags,old:before,new:after});
 }
 const oldDocument=older.document,newDocument=newer.document;
 const shaUnchanged=oldDocument.sha256===newDocument.sha256;
 const sameSource=!!oldDocument.source_url&&!!newDocument.source_url&&oldDocument.source_url===newDocument.source_url;
 const equalFormat=oldDocument.format===newDocument.format;
 const candidateChanges=rows.some(r=>r.status!=='unchanged');
 // Duplicate titles can be ambiguous even in two identical extractions.
 const manifest=x=>x.candidates.map(c=>[c.heading,c.locator,c.reason]);
 const metadataConflict=shaUnchanged&&JSON.stringify(manifest(older))!==JSON.stringify(manifest(newer));
 const warnings=[];
 if(!shaUnchanged)warnings.push('원본 바이너리 SHA-256 변경. 제목 후보가 같아도 본문·조건 변경 여부 확인이 필요합니다.');
 if(!sameSource)warnings.push('공식 링크가 비어 있거나 사용자 입력 출처가 다릅니다. 같은 공고 양식인지 원문 대조가 필요합니다.');
 if(!equalFormat)warnings.push('파일 형식이 달라졌습니다. 추출 위치·순서만으로 문서 변경을 확정할 수 없습니다.');
 if(older.truncated_candidates||newer.truncated_candidates)warnings.push('후보가 40개 한도에 도달했습니다. 목차 전체 비교가 아닙니다.');
 if(oldDocument.partial_text||newDocument.partial_text)warnings.push('부분 추출 자료가 포함됐습니다. 누락된 표·이미지·항목이 있을 수 있습니다.');
 if(metadataConflict)warnings.push('동일 원본 SHA-256인데 후보 목록/위치가 다릅니다. 생성기·추출기 차이나 파일 변조를 점검하십시오.');
 if(!older.candidates.length||!newer.candidates.length)warnings.push('후보가 없는 파일이 있습니다. 변경 없음이나 삭제를 확정할 수 없습니다.');
 warnings.push('목차 후보 비교는 공식 서식·접수자격·필수서류 완비를 검증하지 않습니다.');
 const counts={unchanged:0,recheck:0,added:0,removed:0,ambiguous_duplicate:0};
 for(const row of rows)counts[row.status]++;
 const requiresReview=!shaUnchanged||!sameSource||!equalFormat||candidateChanges||
  oldDocument.partial_text||newDocument.partial_text||
  older.truncated_candidates||newer.truncated_candidates||!older.candidates.length||!newer.candidates.length;
 return {schema:'local-form-version-comparison/v1',old_sha256:oldDocument.sha256,
  new_sha256:newDocument.sha256,old_label:oldDocument.file_label,new_label:newDocument.file_label,
  old_source:oldDocument.source_url,new_source:newDocument.source_url,
  sha_unchanged:shaUnchanged,source_same_self_reported:sameSource,metadata_conflict:metadataConflict,
  requires_review:requiresReview,counts,rows,warnings};
}
function report(result){
 if(!result||result.schema!=='local-form-version-comparison/v1')fail('비교 결과 없음');
 const lines=[
  'AI FUNDING RADAR P0.22 — 비공개 양식 후보 변경 대조표',
  '모든 항목은 사용자 제공 파일의 미검증 추출 후보입니다. 공식 원문 변경·심사 요건·접수 가능 상태를 확정하지 않습니다.',
  '이 보고서는 서명·승인 증명서가 아니며 실제 기관 접수 전에 원문 파일과 새 양식 전체를 확인해야 합니다.',
  '이전 파일 SHA-256: '+result.old_sha256,
  '현재 파일 SHA-256: '+result.new_sha256,
  '이전 파일 표기: '+result.old_label,
  '현재 파일 표기: '+result.new_label,
  '이전 출처(자체입력): '+(result.old_source||'미기재'),
  '현재 출처(자체입력): '+(result.new_source||'미기재'),
  '문서 바이너리 동일 여부: '+(result.sha_unchanged?'동일 지문(추출본 기준)':'다른 지문'),
  '입력 범위의 재대조: '+(result.requires_review?'필요':'후보 목록상 차이 미검출 — 원문 전체 검토 아님'),
  '',
  '[후보별 변화]'
 ];
 for(const row of result.rows){
  lines.push(row.status+' / '+row.key,'  변경 요소: '+(row.flags.join(', ')||'후보에 기재된 범위에서 차이 없음'));
  for(const item of row.old)lines.push('  이전: '+item.heading+' / '+item.locator);
  for(const item of row.new)lines.push('  현재: '+item.heading+' / '+item.locator);
 }
 lines.push('','[직접 확인해야 할 사항]',...result.warnings.map(w=>'- '+w),'','AI 호출·파일 업로드·공식 제출은 실행하지 않았습니다.');
 return lines.join('\r\n')+'\r\n';
}
const api=Object.freeze({VERSION,canonical,compare,report});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.FundingFormVersion=api;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let before=null,after=null,diff=null,readToken=0;
function status(message){$('versionStatus').textContent=message;}
function render(){
 if(!diff){$('versionSummary').textContent='아직 비교하지 않았습니다.';$('versionRows').innerHTML='';return;}
 $('versionSummary').textContent='문서 SHA-256 '+(diff.sha_unchanged?'동일':'변경')+
  ' · 재대조 '+(diff.requires_review?'필요':'원문 직접 검토')+
  ' · 새 후보 '+diff.counts.added+
  ' · 미발견 '+diff.counts.removed+
  ' · 제목/순서/위치 재확인 '+diff.counts.recheck+
  ' · 중복 모호 '+diff.counts.ambiguous_duplicate;
 const warningHTML=diff.warnings.map(w=>'<li>'+escape(w)+'</li>').join('');
 const list=diff.rows.map(row=>{
  const show=rows=>(rows.length?rows.map(x=>escape(x.heading)+' <small>'+escape(x.locator)+'</small>').join(' / '):'없음');
  return '<div class="version-diff-row"><b>'+escape(row.status)+' · '+escape(row.key)+'</b>'+
  '<small>이전: '+show(row.old)+'</small><small>현재: '+show(row.new)+'</small></div>';
 }).join('');
 $('versionRows').innerHTML='<ul>'+warningHTML+'</ul>'+list;
}
function invalidate(reason){
 diff=null;readToken++;
 $('versionAck').checked=false;
 $('completeVersionReview').disabled=true;
 $('downloadVersionReport').disabled=true;
 render();
 root.FundingFormMappingUI?.requireSourceReview?.(reason);
}
async function load(which,file,nonce){
 try{
  if(!file)return;
  if(file.size>100000)fail('후보 JSON은 100KB 이하여야 합니다.');
  const content=await file.text();
  const parsed=I.validate(content);
  if(nonce!==readToken)return;
  if(which==='before')before=parsed;else after=parsed;
  status('이전/현재 후보를 모두 선택한 뒤 비교하십시오. 미검증 추출 결과입니다.');
 }catch(err){if(nonce!==readToken)return;status('파일 거부: '+String(err?.message||err));}
}
$('oldFormCandidate').addEventListener('change',e=>{
 const f=e.target.files?.[0];before=null;invalidate('비교자료를 변경했습니다.');
 const token=readToken;void load('before',f,token);
});
$('newFormCandidate').addEventListener('change',e=>{
 const f=e.target.files?.[0];after=null;invalidate('비교자료를 변경했습니다.');
 const token=readToken;void load('after',f,token);
});
$('compareVersionFiles').addEventListener('click',()=>{
 try{
  if(!before||!after)fail('이전/현재 파일을 모두 유효하게 불러오십시오.');
  diff=compare(before,after);render();
  $('downloadVersionReport').disabled=false;
  status(diff.metadata_conflict?'동일 해시의 추출목록 불일치: 두 파일의 원본과 생성기를 다시 확인하십시오.':
   '비교 완료. 결과는 미검증 후보의 차이이며, 초안 대응을 다시 검토해야 합니다.');
 }catch(err){diff=null;render();status('비교 실패: '+String(err.message||err));}
});
$('versionAck').addEventListener('change',()=>{$('completeVersionReview').disabled=!(diff&&$('versionAck').checked);});
$('completeVersionReview').addEventListener('click',()=>{
 if(!diff||!$('versionAck').checked)return;
 try{
  if(diff.metadata_conflict)fail('동일 SHA-256에 상충된 후보 목록이 있습니다. 원본과 추출기를 재검증하기 전에는 보류를 해제할 수 없습니다.');
  root.FundingFormMappingUI?.completeSourceReview?.();
  $('versionAck').checked=false;$('completeVersionReview').disabled=true;
  status('수동 재대조를 자체기록했습니다. 공식 승인이나 원문 변경 없음 판정이 아닙니다. 현재 초안 미리보기를 다시 생성하십시오.');
 }catch(err){status('재대조 미완료: '+String(err?.message||err));}
});
$('downloadVersionReport').addEventListener('click',()=>{
 if(!diff)return;
 const body=report(diff);
 const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='funding-form-version-diff-private.txt';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
});
})(typeof globalThis!=='undefined'?globalThis:this);
