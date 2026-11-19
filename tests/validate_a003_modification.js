"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/v72-a003.json'));
const bank=JSON.parse(fs.readFileSync('questions.json'));
const old=JSON.parse(execFileSync('git',['show',`${fixture.baseCommit}:questions.json`],{maxBuffer:20*1024*1024}));
const expected=structuredClone(old);const q=expected.questions.find(q=>q.id==='A-003');assert.deepEqual(q,fixture.before);
Object.assign(q,fixture.after);assert.deepEqual(bank,expected,'Exactly A-003 wording changes; all other data preserved');
assert.deepEqual(fixture.after.correct,[0,1,2]);assert.deepEqual(fixture.after.sources,fixture.before.sources);
for(const i of [0,2,3])assert.equal(fixture.after.choices[i],fixture.before.choices[i]);
assert.match(fixture.after.choices[1],/発芽中.*細胞壁.*タンパク質.*酵素.*溶け/);
assert.match(fixture.after.explanation,/麦粒そのものが水に溶けて液体になるという意味ではありません/);
assert.match(fixture.after.choiceReasons[1],/麦粒そのものが溶けてなくなる/);
assert.match(fixture.after.choiceReasons[0],/新しく.*もともと/);
assert.match(fixture.after.choiceReasons[2],/発芽中にも一部のデンプン/);
assert(!JSON.parse(fs.readFileSync('choice-variants.json')).questions.some(q=>q.questionId==='A-003'),'No separate variant to leave stale');
const runtime=require('./runtime_harness'),prediction=require('../prediction-set');
for(const mode of ['study','mock','prediction']){
 const r=runtime();r.context.window.BierKompassPrediction=prediction;
 if(mode==='prediction')r.run('setMode("prediction");startSession();session.current=session.questionIds.indexOf("A-003");renderQuestion();');
 else r.run(`createSession([questionsById.get("A-003")],"${mode}");`);
 assert.deepEqual(r.snapshot('currentQuestion().choices'),fixture.after.choices);
 assert.match(r.element('#choiceList').innerHTML,/発芽中に/);assert.equal(r.element('#feedbackPanel').hidden,true);
 if(mode==='mock'){r.run('session.answers["A-003"]=[0,1,2];session.answered["A-003"]=true;submitExam();');assert.match(r.element('#reviewList').innerHTML,/麦粒そのものが水に溶けて/);}
 else {r.run('session.answers["A-003"]=[0,1,2];checkStudyAnswer();');assert.match(r.element('#choiceReasons').innerHTML,/麦粒そのものが溶けてなくなる/);assert.equal(r.run('history["A-003"].correctCount'),1);}
 for(let mask=0;mask<16;mask++){r.context.selected=[0,1,2,3].filter(i=>mask&(1<<i));assert.equal(r.run('scoreQuestion(questionsById.get("A-003"),selected,true)'),Math.max(0,r.context.selected.filter(i=>i<3).length-r.context.selected.filter(i=>i===3).length));}
}
// Old saved attempts keep the exact question they showed; new retry uses corrected wording.
{
 const r=runtime();r.context.oldQ=fixture.before;r.context.window.BierKompassPrediction=prediction;
 r.run('createSession([oldQ],"study");session.answers["A-003"]=[0,1];persistSession();');
 const saved=r.snapshot('session');
 r.run('session=restoreSavedSession(loadJson(STORAGE.session,null));showSession();');assert.deepEqual(r.snapshot('currentQuestion()'),saved.questionSnapshots['A-003']);
 assert.deepEqual(r.snapshot('session.answers["A-003"]'),[0,1]);
 r.run('restartSession();');assert.deepEqual(r.snapshot('currentQuestion().choices'),fixture.after.choices);
}
// Runtime, auth and source-link machinery have no changes other than the release/cache marker.
const oldApp=execFileSync('git',['show',`${fixture.baseCommit}:app.js`],{encoding:'utf8'});
assert.equal(fs.readFileSync('app.js','utf8'),oldApp.replace('const APP_VERSION = "v71";','const APP_VERSION = "v72";').replace('choice-variants.json?v=71','choice-variants.json?v=72'));
const oldHtml=execFileSync('git',['show',`${fixture.baseCommit}:index.html`],{encoding:'utf8'});
assert.equal(fs.readFileSync('index.html','utf8'),oldHtml.replaceAll('?v=71','?v=72').replace('version-badge">v71','version-badge">v72'));
for(const n of ['prediction-set.js','styles.css','source-links.json','source-passages.json','choice-variants.json']) assert(fs.readFileSync(n).equals(execFileSync('git',['show',`${fixture.baseCommit}:${n}`],{maxBuffer:20*1024*1024})),n);
console.log('PASS A-003-only wording, unchanged answer content and keys, study/prediction/mock explanations, all 16 answer sets, no alternate variants, old snapshot preserved/new retry corrected, runtime/auth/ACL unchanged.');
