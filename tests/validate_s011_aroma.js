"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='6323a2e24c3b0cabd48b622c816d83e38df18914';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const old=p=>execFileSync('git',['show',`${base}:${p}`],{cwd:root,maxBuffer:10*1024*1024}).toString();
const original='完熟バナナ・桃・クローブのスパイシーなエステル';
const aroma='完熟バナナ・桃を思わせるエステル系の果実香と、クローブを思わせるフェノール系のスパイス香';
const before=JSON.parse(old('questions.json')),after=JSON.parse(read('questions.json'));
const expected=JSON.parse(JSON.stringify(before));const target=expected.questions.find(q=>q.id==='S-011');
target.question=target.question.replace(original,aroma);target.choiceReasons[2]=target.choiceReasons[2].replace(original,aroma);
assert.deepEqual(after,expected,'only the S-011 question and correct-option reason change');
assert.deepEqual(target.correct,[2]);assert.equal(target.choices[2],'トラピスト・トリプル');
assert.equal(read('choice-guide.js'),old('choice-guide.js').replace(original,aroma));
const guide=require('../choice-guide.js');assert.ok(guide.note('トラピスト・トリプル').some(x=>x.includes(aroma)));
const blindOld=JSON.parse(old('blind-tasting.json')),blind=JSON.parse(read('blind-tasting.json'));
const b=blindOld.scenarios.find(s=>s.id==='B-04');b.blindCard.aroma=aroma;b.step1ObservationsJa[1]='香り：'+aroma;
assert.deepEqual(blind,blindOld,'only the duplicate B-04 aroma and observation change');
for(const p of ['questions.json','choice-guide.js','blind-tasting.json']) assert.ok(!read(p).includes('完熟バナナ・桃・クローブ'));
for(const p of ['choice-variants.json','source-links.json','source-passages.json','styles.css','sound.js','blind-quiz.js','style-links.js'])assert.equal(read(p),old(p),p);
assert.equal(read('app.js'),old('app.js').replace('const APP_VERSION = "v64";','const APP_VERSION = "v65";').replaceAll('choice-variants.json?v=64','choice-variants.json?v=65'));
assert.equal(read('index.html'),old('index.html').replaceAll('?v=64','?v=65').replace('class="version-badge">v64</small>','class="version-badge">v65</small>'));
const h=require('./runtime_harness')();h.context.q=target;h.context.window.BierKompassChoiceGuide=guide;
h.run('createSession([q],"study");');
assert.ok(h.element('#questionText').innerHTML.includes(aroma));
assert.equal(h.run('scoreQuestion(q,[2])'),1);assert.equal(h.run('scoreQuestion(q,[0])'),0);
h.run('session.answers[q.id]=[2];checkStudyAnswer();');
assert.ok(h.element('#choiceReasons').innerHTML.includes(aroma));
assert.ok(!h.element('#choiceReasons').innerHTML.includes(original));
assert.equal(h.run('history[q.id].attempts'),1);assert.equal(h.run('history[q.id].correctCount'),1);
const saved=[...h.storage];h.run('renderFeedback(q);renderFeedback(q);');assert.deepEqual([...h.storage],saved);
h.run('session.result={review:[{id:q.id,selected:[2],points:1,max:1,exact:true,answered:true}]};renderReview();');
assert.ok(h.element('#reviewList').innerHTML.includes(aroma));
execFileSync('python',['-B','-c',`import sys,json,subprocess,copy
sys.path.insert(0,'tools')
from correct_s011_aroma import apply_to_questions
from build_blind_tasting import apply_ui_overrides
q=json.loads(subprocess.check_output(['git','show','${base}:questions.json']))
apply_to_questions(q['questions']);apply_to_questions(q['questions'])
assert q==json.load(open('questions.json'))
probe=copy.deepcopy(q['questions']);next(x for x in probe if x['id']=='S-011')['question']='unexpected source edit'
try: apply_to_questions(probe)
except ValueError: pass
else: raise AssertionError('unreviewed text must fail')
b=json.loads(subprocess.check_output(['git','show','${base}:blind-tasting.json']))
apply_ui_overrides(b['scenarios'])
assert b==json.load(open('blind-tasting.json'))
`],{cwd:root});
console.log('PASS S-011 aroma classification; exact two-field question scope; shared note/B-04 consistency; unchanged answers, scoring, history and permissions; feedback/review; safe idempotent correction and blind regeneration');
