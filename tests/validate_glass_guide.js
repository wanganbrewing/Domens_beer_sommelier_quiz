'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const guide=require('../glass-guide.js');
const bank=JSON.parse(read('questions.json')),byId=new Map(bank.questions.map(q=>[q.id,q]));
assert.ok(Array.isArray(guide.entries)&&guide.entries.length===24);
assert.equal(new Set(guide.entries.map(e=>e.id)).size,guide.entries.length);
const ids=q=>guide.matching(q).map(e=>e.id);
const teku=guide.matching(byId.get('B-332'));
assert.ok(teku.length && teku.some(e=>/テク|Teku/i.test(e.name)),'B-332 must explain Teku');
for(const id of ['B-262','C-172'])assert.deepEqual(ids(byId.get(id)),[],id);
for(const word of ['テクニック','ディテクター','マスター','マスト','マグネシウム','ノイシュヴァンシュタイン'])assert.deepEqual(ids({question:word,choices:[]}),[],word);
assert.deepEqual(ids({question:'麦芽',choices:[],explanation:'テクというグラス',choiceReasons:['シュタンゲ']}),[],'reasons and explanation do not trigger matching');
const twice={question:byId.get('B-332').question,choices:['テクというグラス','テクというグラス']};
assert.equal(new Set(ids(twice)).size,ids(twice).length,'no duplicate shapes');
const allowedHosts=new Set(['rastal.com','www.sahmgastro.de','www.spiegelau.com','king-werk.de','stoelzle-lausitz.com','www.perfectdraft.com','www.bosteelsbrewery.com','shop.schlenkerla.de']);
for(const entry of guide.entries){
 assert.ok(entry.name&&entry.description&&entry.source,entry.id);
 assert.ok(entry.paths.length && entry.paths.every(p=>typeof p==='string'&&p.length>3));
 for(const link of [entry.url,entry.extraUrl].filter(Boolean)){const u=new URL(link);assert.equal(u.protocol,'https:');assert.ok(allowedHosts.has(u.hostname),u.hostname);}
}
for(const q of bank.questions){
 const before=JSON.stringify(q),html=guide.forQuestion(q);
 assert.equal(JSON.stringify(q),before,'guide never mutates questions');
 assert.equal(new Set(ids(q)).size,ids(q).length,q.id);
 if(html){assert.match(html,/グラスの形/);assert.match(html,/参考/);assert.match(html,/模式図/);assert.match(html,/<svg/);}
 assert.doesNotMatch(html,/<(?:img|image|script|iframe)\b|\son\w+=|(?:src|href)=["'](?:javascript:|data:)/i);
}
assert.equal(guide.forQuestion({question:'麦芽について',choices:[]}), '');
const h=require('./runtime_harness')();h.context.window.BierKompassGlassGuide=guide;
h.run('createSession([questionsById.get("B-332")],"study");');
assert.equal(h.element('#feedbackPanel').hidden,true);
assert.doesNotMatch(h.element('#questionText').innerHTML,/グラスの形/);
assert.doesNotMatch(h.element('#choiceList').innerHTML,/グラスの形|<svg/);
h.run('session.answers["B-332"]=[...currentQuestion().correct];checkStudyAnswer();');
assert.equal(h.element('#feedbackPanel').hidden,false);
assert.match(h.element('#feedbackExplanation').innerHTML,/グラスの形/);
assert.match(h.element('#feedbackExplanation').innerHTML,/<svg/);
const saved=[...h.storage];h.run('renderFeedback(currentQuestion());renderFeedback(currentQuestion());');assert.deepEqual([...h.storage],saved,'repeat rendering never records answers');
h.run('session.result={review:[{id:"B-332",selected:[...currentQuestion().correct],points:1,max:1,exact:true,answered:true}]}; renderReview();');
assert.match(h.element('#reviewList').innerHTML,/グラスの形/);assert.deepEqual([...h.storage],saved,'review never records answers');
// A wrong answer still receives the same neutral, independent reference section.
h.run('session.answers["B-332"]=[];renderFeedback(currentQuestion());');assert.match(h.element('#feedbackExplanation').innerHTML,/グラスの形/);
h.run('createSession([questionsById.get("B-332")],"mock");');assert.equal(h.element('#feedbackPanel').hidden,true);assert.doesNotMatch(h.element('#choiceList').innerHTML,/<svg|グラスの形/);
// Guide loading is optional: failure does not prevent feedback or scoring.
delete h.context.window.BierKompassGlassGuide;h.run('renderFeedback(currentQuestion());');assert.equal(h.run('scoreQuestion(currentQuestion(),currentQuestion().correct)'),h.run('currentQuestion().correct.length'));
for(const name of ['questions.json','choice-variants.json','source-links.json','source-passages.json','blind-tasting.json']){
 const base=JSON.parse(execFileSync('git',['show',`362a97e1d844ead1292e628feb710aa81a277cd4:${name}`],{cwd:root,maxBuffer:20*1024*1024}));
 assert.equal(JSON.stringify(JSON.parse(read(name))),JSON.stringify(base),name+' unchanged');
}
console.log('PASS glass references: matching, no false positives/duplicates, safe original SVG, after-answer/review only, immutable data/scoring/history and optional-module fallback');
