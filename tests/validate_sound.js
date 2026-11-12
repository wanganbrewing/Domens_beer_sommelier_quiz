"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("./runtime_harness");
const source = fs.readFileSync(path.join(__dirname, "../sound.js"), "utf8");
const KEY = "bierkompass-sound-v1";
function audioRuntime({supported = true, stored, blockedStorage = false, resumeFails = false, delayedResume = false, throwConstructor = false, firstResumePending = false, sessionApi = true, sessionThrows = false} = {}) {
  const events = {}, windowEvents = {}, button = {attrs: {}, setAttribute(k,v) {this.attrs[k]=v;}, addEventListener(n,f) {this[n]=f;}};
  const testButton={attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(n,f){this[n]=f;}}, status={hidden:true,textContent:""};
  const storage = new Map(stored ? [[KEY, stored]] : []);
  let sessionType="auto", resumeCalls=0;
  const audioSession={get type(){return sessionType;},set type(v){if(sessionThrows)throw Error("unavailable");sessionType=v;}};
  const nodes = [], contexts = [];
  let resolveResume, rejectResume;
  class Context {
    constructor() {if(throwConstructor) throw Error("blocked"); this.state="suspended"; this.currentTime=10; this.destination={}; contexts.push(this);}
    resume() { resumeCalls++; if(firstResumePending && resumeCalls===1)return new Promise(()=>{}); if(resumeFails) return Promise.reject(Error("blocked")); if(delayedResume) return new Promise((resolve, reject) => {rejectResume = reject; resolveResume = () => {this.state="running"; resolve();};}); this.state="running"; return Promise.resolve(); }
    createGain() {return {gain: {setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator() {const n={frequency:{setValueAtTime(f){n.frequencyValue=f;}},connect(){},disconnect(){n.disconnected=true;},start(t){n.startTime=t;},stop(t){n.stopTime=t;}}; nodes.push(n); return n;}
  }
  const document={hidden:false,querySelector:selector=>selector==="#soundToggle"?button:selector==="#testSoundButton"?testButton:status,addEventListener(n,f){events[n]=f;}};
  const window={navigator:sessionApi?{audioSession}:{},...(supported ? {AudioContext:Context}:{}),addEventListener(n,f){windowEvents[n]=f;}};
  vm.runInNewContext(source,{window,document,console,Date,Promise,localStorage:{getItem(k){if(blockedStorage)throw Error();return storage.get(k)??null;},setItem(k,v){if(blockedStorage)throw Error();storage.set(k,v);}}});
  return {window, document, button, testButton, status, audioSession, storage, nodes, contexts, events, windowEvents, resumeCount:()=>resumeCalls, unlock:()=>events.pointerup({isTrusted:true}), resolve:()=>resolveResume?.(), reject:()=>rejectResume?.(Error("interrupted")), play:window.BierKompassSound.play};
}
const flush = async () => {for(let i=0;i<6;i++)await Promise.resolve();};
(async () => {
  const a=audioRuntime();
  assert.equal(a.contexts.length,0,"no AudioContext/autoplay on page load");
  a.play("pass"); assert.equal(a.nodes.length,0);
  a.events.pointerup({isTrusted:false}); assert.equal(a.contexts.length,0);
  a.unlock(); await flush();
  assert.equal(a.audioSession.type,"playback","supported iOS uses media playback category, not ambient");
  const signatures=[], rendered={};
  for(const name of ["correct","incorrect","streak","complete","pass","fail"]){const n=a.nodes.length; a.play(name); const notes=a.nodes.slice(n); rendered[name]=notes.map(x=>({frequency:x.frequencyValue,start:x.startTime,stop:x.stopTime,type:x.type}));signatures.push(notes.map(x=>[x.frequencyValue,x.startTime,x.stopTime]));}
  const onsets=notes=>[...new Set(notes.map(x=>x.start))];
  assert.equal(onsets(rendered.correct).length,2,"pin-pon has two clear strikes");
  assert.ok(rendered.correct[0].frequency > rendered.correct[3].frequency,"pin-pon descends to the longer second chime");
  assert.ok(rendered.correct[3].stop-rendered.correct[3].start > .7,"second chime rings out");
  assert.equal(onsets(rendered.incorrect).length,1,"boo is one sustained buzz");
  assert.ok(rendered.incorrect.every(x=>x.frequency<150 && ["sawtooth","square"].includes(x.type) && x.stop-x.start>.5));
  assert.ok(onsets(rendered.streak).length>=7,"streak is a rapid series of bell strikes");
  assert.ok(rendered.streak.every(x=>x.type==="sine"),"bells use additive ringing partials instead of buzzer waves");
  assert.equal(new Set(signatures.map(x=>JSON.stringify(x))).size,6,"six distinct sound cues");
  assert.ok(signatures.every(notes=>notes.every(([,start,stop])=>stop>start)));
  const n=a.nodes.length; a.button.click(); assert.equal(a.storage.get(KEY),"off"); assert.equal(a.button.attrs["aria-pressed"],"false"); assert.equal(a.audioSession.type,"auto","mute releases the playback category"); assert.equal(a.testButton.disabled,true);
  assert.ok(a.nodes.every(n=>n.disconnected),"mute disconnects scheduled and playing notes");
  a.play("pass"); assert.equal(a.nodes.length,n);
  const b=audioRuntime({stored:"off"}); b.unlock(); assert.equal(b.contexts.length,0,"OFF persists");
  b.button.click(); await flush(); assert.equal(b.storage.get(KEY),"on"); assert.equal(b.nodes.length,6,"enabling previews a two-chime cue");
  b.document.hidden=true; b.events.visibilitychange(); const hiddenCount=b.nodes.length; b.play("fail"); assert.equal(b.nodes.length,hiddenCount);
  b.document.hidden=false; b.events.visibilitychange(); assert.equal(b.nodes.length,hiddenCount,"no old cue on foregrounding");
  b.windowEvents.storage({key:KEY,newValue:"off"}); assert.equal(b.button.attrs["aria-pressed"],"false");
  b.windowEvents.storage({key:null,newValue:null}); assert.equal(b.button.attrs["aria-pressed"],"true");
  for(const options of [{supported:false},{blockedStorage:true},{resumeFails:true},{throwConstructor:true}]){const t=audioRuntime(options); t.unlock(); t.play("correct"); t.button.click(); await flush();}
  const c=audioRuntime({delayedResume:true}); c.unlock(); c.play("correct"); c.button.click(); c.resolve(); await flush(); assert.equal(c.nodes.length,0,"mute cancels pending resume sound");
  const d=audioRuntime({delayedResume:true}); d.unlock(); d.play("correct"); d.play("incorrect"); d.resolve(); await flush(); assert.equal(d.nodes.length,2,"latest cue replaces pending cue"); assert.equal(d.nodes[0].frequencyValue,130.81);

  // Reproduce an early iOS resume() left pending, then a later valid tap.
  const pending=audioRuntime({firstResumePending:true});pending.unlock();pending.events.click({isTrusted:true});pending.play("correct");await flush();
  assert.equal(pending.resumeCount(),2,"a pending resume must not block a new user activation");assert.equal(pending.nodes.length,6);
  pending.contexts[0].state="interrupted";pending.events.touchend({isTrusted:true});await flush();assert.equal(pending.contexts[0].state,"running","next touch resumes interruption");
  const preview=audioRuntime();preview.testButton.click();await flush();assert.equal(preview.nodes.length,6,"test button creates/resumes and plays inside its direct click handler");assert.ok(preview.status.textContent.includes("iPhone"));assert.equal(preview.status.hidden,false);
  const denied=audioRuntime({resumeFails:true});denied.testButton.click();await flush();assert.equal(denied.nodes.length,0);assert.ok(denied.status.textContent.includes("開始できません"));
  for(const options of [{sessionApi:false},{sessionThrows:true}]){const fallback=audioRuntime(options);fallback.testButton.click();await flush();assert.equal(fallback.nodes.length,6,"unsupported Audio Session API does not break existing browsers");}
  preview.windowEvents.pagehide();assert.equal(preview.audioSession.type,"auto");
  const late=audioRuntime({delayedResume:true});late.testButton.click();late.button.click();late.reject();await flush();assert.equal(late.status.hidden,true,"late rejected preview cannot display help after mute");
  const background=audioRuntime({delayedResume:true});background.testButton.click();const beforeHidden=background.status.textContent;background.document.hidden=true;background.events.visibilitychange();background.reject();await flush();assert.equal(background.status.textContent,beforeHidden,"late rejection does not change hidden-page guidance");

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
  assert.ok(fs.readFileSync(path.join(__dirname,"../index.html"),"utf8").includes('sound.js?v=61'));
  console.log("PASS: distinct cues, gesture unlock, mute/persistence, failures, delayed resume, study and mock integration");
})().catch(error=>{console.error(error);process.exitCode=1;});
