'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const B=require('../assets/portfolio-bilateral.js'),C=require('../assets/portfolio-core.js'),{context,plan}=require('./portfolio_fixture.cjs');
function pair(a='pre',b='early-general',year='2026',status='active'){
 return {review_year:Number(year),phase:'execution',projects:[
 {id:'A',route_id:'manual',notice_code:a,award_year:year,selection_status:status},
 {id:'B',route_id:'manual',notice_code:b,award_year:year,selection_status:status}]};
}
function integration(){const p=plan();p.review_year=2026;
 Object.assign(p.projects[0],{route_id:'manual',scenario_id:'manual',own_cash_won:'3000000',notice_code:'pre',award_year:'2026',selection_status:'active'});
 Object.assign(p.projects[1],{notice_code:'early-general',award_year:'2026',selection_status:'active'});return p;}
for(const target of ['early-general','early-deep'])test('pre and '+target+' use two independent partial source directions',()=>{
 const r=B.audit(pair('pre',target),context()),q=r.pairs[0];
 assert.equal(q.coverage,'both_directions_partial');assert.equal(q.reviewed_directions,2);
 assert.equal(q.severity,'conflict');assert.equal(q.permission,'not_determined');
 assert.equal(q.directions[0].source.sha256,B.PRE.sha256);
 assert.notEqual(q.directions[0].source.sha256,q.directions[1].source.sha256);
 assert.ok(q.directions.every(d=>d.scope==='partial_historical_clause_only'));
});
test('reversing project order reverses source direction without changing coverage',()=>{
 const p=pair(),x=B.audit(p,context()).pairs[0];p.projects.reverse();const y=B.audit(p,context()).pairs[0];
 assert.equal(x.coverage,y.coverage);assert.deepEqual(x.directions.map(d=>d.source.sha256).reverse(),y.directions.map(d=>d.source.sha256));
});
test('pre target subset never imports all 38 early-notice entries',()=>{
 assert.deepEqual(B.PRE_TARGETS,['early-general','early-deep']);
 const r=B.audit(pair('pre','tips-business'),context());assert.equal(r.pairs[0].reviewed_directions,0);assert.equal(r.pairs[0].directions[0].code,'outside_reviewed_targets');
});
for(const other of ['tips-rd','other-rd','local','other','unknown'])test(other+' has no manufactured reverse rule',()=>{
 const r=B.audit(pair('early-general',other),context()).pairs[0];
 assert.equal(r.permission,'not_determined');assert.equal(r.directions[1].code,'missing_direction');
 assert.equal(r.directions[0].code,'outside_reviewed_targets');assert.equal(r.reviewed_directions,0);
});
test('TIPS business is listed but TIPS R&D is not that business',()=>{
 const a=B.audit(pair('early-general','tips-business'),context()).pairs[0],b=B.audit(pair('early-general','tips-rd'),context()).pairs[0];
 assert.equal(a.coverage,'one_direction_partial');assert.equal(a.severity,'conflict');assert.equal(b.severity,'review');
});
for(const code of B.KNOWN)test('manual '+code+' source hash mismatch holds even a single project',()=>{
 const p=pair(code);p.projects=p.projects.slice(0,1);const c=context();c.routes.records.find(r=>r.id===code).source.sha256='a'.repeat(64);
 assert.ok(B.audit(p,c).holds.length);
});
for(const mutation of ['stale','failed','changed','missing','url','metadata','future'])test('manual known source '+mutation+' fails closed',()=>{
 const c=context(),p=pair();
 if(mutation==='stale')c.now=new Date('2026-11-10T20:00:00+09:00');
 if(mutation==='failed')c.sources.records.pre.status='failed';
 if(mutation==='changed')c.sources.records.pre.review_required=true;
 if(mutation==='missing')delete c.sources.records.pre;
 if(mutation==='url')c.routes.records.find(r=>r.id==='pre').source.url='https://www.mss.go.kr/unknown.pdf';
 if(mutation==='metadata')c.programs.items.find(x=>x.id==='PRE-STARTUP-2026').amount='changed';
 if(mutation==='future')c.sources.records.pre.last_success_at='2026-11-10T20:00:00+09:00';
 const r=B.audit(p,c);assert.ok(r.holds.length);assert.equal(r.pairs[0].coverage,'source_hold');assert.equal(r.permission,'not_determined');
});
for(const year of ['2027','2028'])test(year+' never inherits 2026 conflict or permission',()=>{
 const r=B.audit(pair('pre','early-general',year),context()).pairs[0];assert.equal(r.reviewed_directions,0);assert.equal(r.severity,'review');assert.equal(r.permission,'not_determined');
 assert.ok(r.directions.every(d=>d.code==='new_year_unconfirmed'));
});
test('future counterparty year alone disables historical application',()=>{
 const p=pair();p.projects[1].award_year='2027';const r=B.audit(p,context()).pairs[0];assert.equal(r.reviewed_directions,0);assert.equal(r.severity,'review');
});
for(const key of ['award_year','selection_status'])test('unknown '+key+' holds not approves',()=>{
 const p=pair();p.projects[1][key]='unknown';const r=B.audit(p,context());assert.ok(r.issues.some(i=>i.severity==='hold'));assert.equal(r.permission,'not_determined');
});
test('completed status is not universal historical exception',()=>{
 const p=pair('pre','early-general','2026','completed'),r=B.audit(p,context());assert.ok(r.pairs[0].directions.every(d=>d.code==='history_needs_review'));assert.equal(r.pairs[0].severity,'hold');
});
test('different award years are out of scoped clause not approved',()=>{
 const p=pair();p.projects[1].award_year='2025';const r=B.audit(p,context()).pairs[0];assert.equal(r.reviewed_directions,0);assert.equal(r.severity,'review');assert.equal(r.permission,'not_determined');
});
for(const stage of ['planned','applied','selected'])test('application '+stage+' cannot sum both hypothetical awards',()=>{
 const p=pair('pre','early-general','2026',stage);p.phase='application';const r=B.audit(p,context());assert.ok(r.pairs[0].directions.every(d=>d.code==='application_requires_choice'));assert.equal(r.pairs[0].severity,'hold');
});
for(const stage of ['pledged','active'])test(stage+' creates scoped conflict even in application plan',()=>{
 const p=pair('pre','early-general','2026',stage);p.phase='application';assert.equal(B.audit(p,context()).pairs[0].severity,'conflict');
});
test('same manual known notice and year budget duplicate blocks',()=>{
 const r=B.audit(pair('early-general','early-general'),context());assert.ok(r.issues.some(i=>i.code==='same_notice_budget_duplicate'));
});
for(const code of ['other-rd','local','other','unknown'])test('generic '+code+' does not conflate distinct notices',()=>{
 assert.ok(!B.audit(pair(code,code),context()).issues.some(i=>i.code==='same_notice_budget_duplicate'));
});
test('same named notice different years is not same budget identity',()=>{
 const p=pair('tips-rd','tips-rd');p.projects[1].award_year='2025';assert.ok(!B.audit(p,context()).issues.some(i=>i.code==='same_notice_budget_duplicate'));
});
test('three projects expose exactly three pairs and six directional cells',()=>{
 const p=pair();p.projects.push({id:'C',route_id:'manual',notice_code:'early-deep',award_year:'2026',selection_status:'active'});const r=B.audit(p,context());assert.equal(r.pairs.length,3);assert.equal(r.pairs.flatMap(p=>p.directions).length,6);
});
test('manual budget bypass is blocked by integration with original cash model',()=>{
 const r=C.review(integration(),context());assert.equal(r.can_simulate,false);assert.equal(r.code,'blocked');assert.equal(r.bilateral.pairs[0].coverage,'both_directions_partial');assert.ok(!r.scenarios);assert.equal(r.permission,'not_determined');
});
test('manual selected known notice stale source prevents export',()=>{
 const c=context();c.sources.records.pre.status='failed';const r=C.review(integration(),c);assert.equal(r.code,'source_hold');assert.equal(r.can_export,false);assert.equal(r.can_simulate,false);
});
test('changing source after a valid result requires fresh review',()=>{
 const c=context(),p=integration();assert.equal(C.review(p,c).code,'blocked');c.sources.records.pre.review_required=true;assert.equal(C.review(p,c).code,'source_hold');
});
test('known route alternative guard remains regardless of source matrix',()=>{
 const p=plan();p.projects[1]={...p.projects[0],id:'P2',route_id:'early-deep'};const r=C.review(p,context());assert.ok(r.issues.some(i=>i.code==='alternative_sum_blocked'));assert.equal(r.can_simulate,false);
});
test('ordinary other-R&D hypothetical amounts still compute without permission',()=>{
 const p=plan(),r=C.review(p,context());assert.equal(r.can_simulate,true);assert.equal(r.permission,'not_determined');assert.equal(r.bilateral.pairs[0].reviewed_directions,0);
 assert.ok(r.questions.some(q=>q.startsWith('P2 → P1:')));
});
test('review never mutates company inputs or public source objects',()=>{
 const p=integration(),c=context(),a=JSON.stringify(p),b=JSON.stringify(c);C.review(p,c);assert.equal(JSON.stringify(p),a);assert.equal(JSON.stringify(c),b);
});
test('matrix rejects inconsistent known route identity',()=>{
 const p=pair();p.projects[0].route_id='pre';p.projects[0].notice_code='early-general';assert.throws(()=>B.audit(p,context()));
});
for(const bad of ['__proto__','constructor','fake'])test('invalid notice code '+bad+' rejected',()=>{assert.throws(()=>B.audit(pair(bad),context()));});
test('browser module registers without reading or sending private data',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/portfolio-bilateral.js'),'utf8');let calls=0;
 const sandbox={StartupCore:require('../assets/startup-core.js'),PortfolioEvidence:require('../assets/portfolio-evidence.js'),fetch(){calls++;throw Error('forbidden');},localStorage:{setItem(){calls++;}},sessionStorage:{setItem(){calls++;}}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);sandbox.PortfolioBilateral.audit(pair(),context());assert.equal(calls,0);
 for(const forbidden of ['fetch(','XMLHttpRequest','sendBeacon','localStorage','sessionStorage','document.cookie','eval('])assert.ok(!source.includes(forbidden),forbidden);
});
test('source references contain the preserved original hashes, no legal approval state',()=>{
 for(const code of B.KNOWN){assert.match(B.SOURCES[code].sha256,/^[a-f0-9]{64}$/);assert.ok(B.SOURCES[code].url.startsWith('https://www.mss.go.kr/'));}
 const out=JSON.stringify(B.audit(pair(),context()));assert.ok(!out.includes('"permission":"approved"'));assert.ok(out.includes('2/2'));
});
