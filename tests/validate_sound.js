"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("./runtime_harness");
const source = fs.readFileSync(path.join(__dirname, "../sound.js"), "utf8");
const KEY = "bierkompass-sound-v1";
function audioRuntime({supported = true, stored, blockedStorage = false, resumeFails = false, delayedResume = false, throwConstructor = false} = {}) {
  const events = {}, windowEvents = {}, button = {attrs: {}, setAttribute(k,v) {this.attrs[k]=v;}, addEventListener(n,f) {this[n]=f;}};
  const storage = new Map(stored ? [[KEY, stored]] : []);
  const nodes = [], contexts = [];
  let resolveResume;
  class Context {
    constructor() {if(throwConstructor) throw Error("blocked"); this.state="suspended"; this.currentTime=10; this.destination={}; contexts.push(this);}
    resume() { if(resumeFails) return Promise.reject(Error("blocked")); if(delayedResume) return new Promise(resolve => {resolveResume = () => {this.state="running"; resolve();};}); this.state="running"; return Promise.resolve(); }
    createGain() {return {gain: {setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator() {const n={frequency:{setValueAtTime(f){n.frequencyValue=f;}},connect(){},disconnect(){n.disconnected=true;},start(t){n.startTime=t;},stop(t){n.stopTime=t;}}; nodes.push(n); return n;}
  }
  const document={hidden:false,querySelector:()=>button,addEventListener(n,f){events[n]=f;}};
  const window={...(supported ? {AudioContext:Context}:{}),addEventListener(n,f){windowEvents[n]=f;}};
  vm.runInNewContext(source,{window,document,console,Date,Promise,localStorage:{getItem(k){if(blockedStorage)throw Error();return storage.get(k)??null;},setItem(k,v){if(blockedStorage)throw Error();storage.set(k,v);}}});
  return {window, document, button, storage, nodes, contexts, events, windowEvents, unlock:()=>events.pointerdown({isTrusted:true}), resolve:()=>resolveResume?.(), play:window.BierKompassSound.play};
}
const flush = async () => {for(let i=0;i<6;i++)await Promise.resolve();};
(async () => {
  const a=audioRuntime();
  assert.equal(a.contexts.length,0,"no AudioContext/autoplay on page load");
  a.play("pass"); assert.equal(a.nodes.length,0);
  a.events.pointerdown({isTrusted:false}); assert.equal(a.contexts.length,0);
  a.unlock(); await flush();
  const signatures=[];
  for(const name of ["correct","incorrect","streak","complete","pass","fail"]){const n=a.nodes.length; a.play(name); signatures.push(a.nodes.slice(n).map(x=>[x.frequencyValue,x.startTime,x.stopTime]));}
  assert.equal(new Set(signatures.map(x=>JSON.stringify(x))).size,6,"six distinct sound cues");
  assert.ok(signatures.every(notes=>notes.every(([,start,stop])=>stop>start)));
  const n=a.nodes.length; a.button.click(); assert.equal(a.storage.get(KEY),"off"); assert.equal(a.button.attrs["aria-pressed"],"false");
  assert.ok(a.nodes.every(n=>n.disconnected),"mute disconnects scheduled and playing notes");
  a.play("pass"); assert.equal(a.nodes.length,n);
  const b=audioRuntime({stored:"off"}); b.unlock(); assert.equal(b.contexts.length,0,"OFF persists");
  b.button.click(); await flush(); assert.equal(b.storage.get(KEY),"on"); assert.equal(b.nodes.length,2,"enabling previews a short cue");
  b.document.hidden=true; b.events.visibilitychange(); const hiddenCount=b.nodes.length; b.play("fail"); assert.equal(b.nodes.length,hiddenCount);
  b.document.hidden=false; b.events.visibilitychange(); assert.equal(b.nodes.length,hiddenCount,"no old cue on foregrounding");
  b.windowEvents.storage({key:KEY,newValue:"off"}); assert.equal(b.button.attrs["aria-pressed"],"false");
  b.windowEvents.storage({key:null,newValue:null}); assert.equal(b.button.attrs["aria-pressed"],"true");
  for(const options of [{supported:false},{blockedStorage:true},{resumeFails:true},{throwConstructor:true}]){const t=audioRuntime(options); t.unlock(); t.play("correct"); t.button.click(); await flush();}
  const c=audioRuntime({delayedResume:true}); c.unlock(); c.play("correct"); c.button.click(); c.resolve(); await flush(); assert.equal(c.nodes.length,0,"mute cancels pending resume sound");
  const d=audioRuntime({delayedResume:true}); d.unlock(); d.play("correct"); d.play("incorrect"); d.resolve(); await flush(); assert.equal(d.nodes.length,2,"latest cue replaces pending cue"); assert.equal(d.nodes[0].frequencyValue,220);

  const r=runtime(), sounds=[]; r.context.window.BierKompassSound={play:n=>sounds.push(n)};
  r.run('startSession(); session.answers[currentQuestion().id]=[...currentQuestion().correct]; checkStudyAnswer();');
  assert.deepEqual(sounds,["correct"]); r.run('checkStudyAnswer(); renderQuestion();'); assert.deepEqual(sounds,["correct"],"no repeated cue when revisiting answer");
  r.run('moveQuestion(1); session.answers[currentQuestion().id]=[0,1,2,3].filter(i=>!currentQuestion().correct.includes(i)); checkStudyAnswer();');
  assert.equal(sounds.at(-1),"incorrect"); r.complete(); r.click("#nextButton"); assert.equal(sounds.at(-1),"complete");
  const count=sounds.length; r.run('finishStudySession(); showResult(); session=restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();'); assert.equal(sounds.length,count,"completion not repeated on restored results");
  sounds.length=0; r.run('mode="mock"; startSession(); checkStudyAnswer();'); assert.deepEqual(sounds,[],"hidden study action cannot reveal mock answer");
  r.run('for(const id of session.questionIds){session.answers[id]=[...sessionQuestion(id).correct]; session.answered[id]=true;} submitExam(); submitExam(); showResult();'); assert.deepEqual(sounds,["pass"]);
  sounds.length=0; r.run('restartSession(); submitExam();'); assert.deepEqual(sounds,["fail"]);
  sounds.length=0; r.run('restartSession();'); r.advanceTime(2401_000); r.run('updateTimer(); updateTimer();'); assert.deepEqual(sounds,["fail"],"timeout scores/sounds once");
  // Consecutive study correctness: every multiple of five, saved over reload/continuation.
  const streak=runtime(), streakSounds=[]; streak.context.window.BierKompassSound={play:n=>streakSounds.push(n)};
  streak.run('startSession();');
  for(let i=0;i<15;i++) {
    streak.run(`session.current=${i};session.answers[currentQuestion().id]=[...currentQuestion().correct];checkStudyAnswer();`);
    assert.equal(streakSounds.at(-1),(i+1)%5===0?"streak":"correct",`milestone ${i+1}`);
  }
  assert.equal(streak.run('studyCorrectStreak'),15);
  const restored=runtime({initialStorage:streak.storage}); assert.equal(restored.run('studyCorrectStreak'),15);
  const after=streakSounds.length;streak.run('checkStudyAnswer(); renderQuestion();');assert.equal(streakSounds.length,after);
  streak.run('session.current=15;session.answers[currentQuestion().id]=[0,1,2,3].filter(i=>!currentQuestion().correct.includes(i));checkStudyAnswer();');assert.equal(streak.run('studyCorrectStreak'),0);assert.equal(streakSounds.at(-1),"incorrect");
  streak.run('session.current=16;session.answers[currentQuestion().id]=[...currentQuestion().correct];checkStudyAnswer();');assert.equal(streak.run('studyCorrectStreak'),1);
  streak.complete(); const previousStreak=streak.run('studyCorrectStreak');streak.click('#nextButton');streak.click('#nextStudyButton');assert.equal(streak.run('studyCorrectStreak'),previousStreak);
  streak.run('mode="mock";startSession();for(const id of session.questionIds){session.answers[id]=[...sessionQuestion(id).correct];session.answered[id]=true;}submitExam();');assert.equal(streak.run('studyCorrectStreak'),previousStreak,"mock results do not silently build study streaks");
  streak.run('requestHistoryReset();document.querySelector("#confirmDialog").close("confirm");');assert.equal(streak.run('studyCorrectStreak'),0);assert.equal(streak.storage.has('bierkompass-study-streak-v1'),false);
  for(const value of ['-1','null','"oops"','1.2']){const broken=runtime({initialStorage:new Map([['bierkompass-study-streak-v1',value]])});assert.equal(broken.run('studyCorrectStreak'),0);}
  assert.ok(fs.readFileSync(path.join(__dirname,"../index.html"),"utf8").includes('sound.js?v=59'));
  console.log("PASS: distinct cues, gesture unlock, mute/persistence, failures, delayed resume, study and mock integration");
})().catch(error=>{console.error(error);process.exitCode=1;});
