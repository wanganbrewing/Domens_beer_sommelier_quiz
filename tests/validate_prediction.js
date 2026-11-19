"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const runtime = require('./runtime_harness');
const collection = require('../prediction-set');
const variants = require('../choice-variants');
const bank = JSON.parse(fs.readFileSync('questions.json'));
const originalBank = JSON.stringify(bank);
const byId = new Map(bank.questions.map(q=>[q.id,q]));
const coverage = JSON.parse(fs.readFileSync('data/recent-prediction-coverage.json'));
const create = opts => { const rt=runtime(opts);rt.context.window.BierKompassPrediction=collection;return rt; };
assert.equal(collection.ids.length,50);assert.equal(new Set(collection.ids).size,50);
assert.deepEqual(collection.chapters,coverage.chapters);
assert.deepEqual(coverage.chapters.map(c=>c.items.length),[7,12,17,14]);
assert.deepEqual(collection.ids.slice(0,3),['B-207','A-185','PL26-002']);
const mandatory=collection.ids.slice(0,7);
for(let run=0;run<80;run++) {
 const rt=create();rt.filters.tiers=[];rt.filters.categories=[];rt.element('#historyFilter').value='not-mastered';
 rt.run('history=Object.fromEntries(data.questions.map(q=>[q.id,{attempts:1,mastered:true}]));setMode("prediction");startSession();');
 assert.deepEqual(rt.snapshot('session.questionIds.slice(0,7)'),mandatory);
 assert.equal(rt.run('session.questionIds.length'),50);
 assert.deepEqual([...rt.snapshot('session.questionIds')].sort(),[...collection.ids].sort());
 assert.equal(rt.run('session.mode'),'study');assert.equal(rt.run('isPredictionSession()'),true);
 assert.equal(rt.run('session.durationSeconds'),null);assert.equal(rt.element('#timer').hidden,true);
 assert.equal(rt.element('#studyConfig').hidden,true);assert.equal(rt.element('#predictionGuide').hidden,false);
 assert.equal(rt.element('#sessionModeBadge').textContent,'直近予想問題集');
 for(const q of Object.values(rt.snapshot('session.questionSnapshots'))) {
  assert(variants.validQuestion(q));assert.deepEqual(q.correct,byId.get(q.id).correct);
  assert(q.choices.length===4 && q.choiceReasons.length===4);
 }
}
assert.equal(JSON.stringify(bank),originalBank,'Collection never changes shared bank');
assert.equal(collection.questions(new Map([...byId].filter(([id])=>id!=='A-185'))).length,0);
for (const q of collection.questions(byId)) {
 const patched=collection.prepareQuestion(q);assert.deepEqual(collection.prepareQuestion(patched),patched);
}
assert(collection.prepareQuestion(byId.get('A-185')).choices[3].includes('酵母の記載がない'));
assert(collection.prepareQuestion(byId.get('A-073')).choices[2].startsWith('DMSを'));
assert(!collection.prepareQuestion(byId.get('C-231')).explanation.includes('濃度を表します'));
// Real variant catalog still works, and selected topics/IDs do not leave the 50-question collection.
{
 const rt=create();rt.context.variantDocument=JSON.parse(fs.readFileSync('choice-variants.json'));
 rt.run('variantCatalog=window.BierKompassChoiceVariants.createCatalog(data.questions,variantDocument);setMode("prediction");startSession();');
 const before=rt.snapshot('session');
 rt.run('session.answers[currentQuestion().id]=[...currentQuestion().correct];checkStudyAnswer();checkStudyAnswer();session.current=8;persistSession();');
 assert.equal(rt.run('Object.values(history).reduce((n,h)=>n+h.attempts,0)'),1);
 const active=create({initialStorage:rt.storage});
 active.run('session=restoreSavedSession(loadJson(STORAGE.session,null));showSession();');
 assert.equal(active.run('session.current'),8);assert.equal(active.run('isPredictionSession()'),true);
 assert.deepEqual(active.snapshot('session.optionOrders'),before.optionOrders);
 active.complete();active.click('#nextButton');
 assert.equal(active.element('#resultView').hidden,false);assert.equal(active.element('#nextStudyButton').hidden,true);
 assert.equal(active.run('session.result.rate'),1);
 assert.equal(active.run('Object.values(history).reduce((n,h)=>n+h.attempts,0)'),50);
 active.click('#nextStudyButton');assert.equal(active.run('session.completed'),true,'Cannot leak to the ordinary pool');
 const done=create({initialStorage:active.storage});
 done.run('session=restoreSavedSession(loadJson(STORAGE.session,null));showSession();');
 assert.equal(done.element('#resultView').hidden,false,'Result visible after a genuine fresh runtime reload');
 assert.equal(done.run('Object.values(history).reduce((n,h)=>n+h.attempts,0)'),50);
 const ids=done.snapshot('session.questionIds');done.click('#retryButton');
 assert.equal(done.run('isPredictionSession()'),true);assert.deepEqual(done.snapshot('session.questionIds'),ids);
 assert(done.run('session.questionSnapshots["A-185"].choices[3]').includes('酵母の記載がない'));
 done.run('requestExit();');done.element('#confirmDialog').close('cancel');assert(done.run('session'));
 done.run('requestExit();');done.element('#confirmDialog').close('confirm');assert.equal(done.run('session'),null);
 done.filters.tiers=['A'];done.filters.categories=['raw_materials'];done.element('#historyFilter').value='all';
 done.run('setMode("study");startSession();');assert.equal(done.run('isPredictionSession()'),false);
 assert(done.snapshot('session.questionIds').every(id=>byId.get(id).frequencyTier==='A'&&byId.get(id).category==='raw_materials'));
 done.run('goHome();setMode("mock");startSession();');assert.equal(done.run('session.mode'),'mock');
 assert.equal(done.run('session.durationSeconds'),2400);assert.equal(done.element('#checkButton').hidden,true);
}
// Partial prediction results reload without duplicate history; corrupt results fail closed.
{
 const rt=create();rt.run('setMode("prediction");startSession();session.answers[currentQuestion().id]=[...currentQuestion().correct];checkStudyAnswer();finishStudySession(true);');
 assert.equal(rt.element('#resultTitle').textContent,'直近予想問題集の途中結果');
 const fresh=create({initialStorage:rt.storage});fresh.run('session=restoreSavedSession(loadJson(STORAGE.session,null));showSession();');
 assert.equal(fresh.element('#resultView').hidden,false);assert.equal(fresh.run('session.result.review.filter(x=>x.answered).length'),1);
 assert.equal(fresh.run('Object.values(history).reduce((n,h)=>n+h.attempts,0)'),1);
 assert.equal(fresh.run('restoreSavedSession({...session,result:null})'),null);
 assert.equal(fresh.run('restoreSavedSession({...session,result:{...session.result,earned:999}})'),null);
 // Ordinary completed snapshots retain the pre-v71 restoration rules, with or without a result.
 for(const withResult of [true,false]) {
  fresh.run(`legacy={...session,collection:undefined,checked:Object.fromEntries(session.questionIds.map(id=>[id,true]))};if(!${withResult})delete legacy.result;`);
  assert.equal(fresh.run('restoreSavedSession(legacy)===legacy'),true);
 }
 fresh.run('legacy.checked={};');assert.equal(fresh.run('restoreSavedSession(legacy)'),null);
}
// Missing optional scripts fail closed for the collection without disabling normal study.
{
 const rt=runtime();rt.run('setMode("prediction");startSession();');assert.equal(rt.run('session'),null);assert.equal(rt.element('#startButton').disabled,true);
 rt.run('setMode("study");startSession();');assert(rt.run('session'));
}
// All 24 choice orders, all 16 answer masks, all 50 questions preserve scoring and explanation mapping.
const permute=a=>a.length?a.flatMap((x,i)=>permute(a.filter((_,j)=>j!==i)).map(p=>[x,...p])):[[]];
{
 const rt=create();
 for(const base of collection.questions(byId)) {
  const q=collection.prepareQuestion(base);rt.context.q=q;
  for(const order of permute([0,1,2,3])) {
   rt.context.order=order;
   const html=rt.run('renderReviewChoiceReasons(q,order)');
   order.forEach((original,display)=>assert(html.includes(`${String.fromCharCode(65+display)}｜${q.correct.includes(original)?'✓ 正解の選択肢':'✕ 不正解の選択肢'}`)));
   for(let mask=0;mask<16;mask++) {
    const selected=order.filter((_,i)=>mask&(1<<i));rt.context.selected=selected;
    assert.equal(rt.run('scoreQuestion(q,selected,true)'),variants.score(q,selected));
   }
  }
 }
}
console.log('PASS: 50/50 required coverage; first 7 fixed; 80 shuffles; bank immutable; correct keys; 24×16 grading; variants; active/result reload; retry/cancel/exit; history once; study/mock isolation; missing scripts fail closed.');
