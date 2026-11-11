"use strict";
const assert = require("node:assert/strict");
const runtime = require("./runtime_harness.js");
const r = runtime({initialStorage: new Map([["bierkompass-history-v23", JSON.stringify({old:{attempts:209,correctCount:100,incorrectCount:109,mastered:true}})]])});
const {run, element, storage, complete, click} = r;
run("updateStats();");
assert.equal(element("#accuracyStat").textContent, "—", "cumulative history cannot reconstruct recent answers");
assert.equal(element("#attemptStat").textContent, "209");
run("startSession(); session.answers[currentQuestion().id] = [...currentQuestion().correct]; checkStudyAnswer(); checkStudyAnswer();");
assert.equal(run("recentAnswers.length"), 1);
assert.equal(element("#accuracyStat").textContent, "100%");
assert.equal(element("#recentAccuracyDetail").textContent, "直近1回答・完全正解1問");
run("moveQuestion(1); session.answers[currentQuestion().id] = []; checkStudyAnswer();");
assert.equal(element("#accuracyStat").textContent, "50%");
run("for (let i = 0; i < 58; i++) recordHistory(currentQuestion(), false);");
assert.equal(run("recentAnswers.length"), 50);
assert.equal(element("#accuracyStat").textContent, "0%");
run("recordHistory(currentQuestion(), true);");
assert.equal(element("#accuracyStat").textContent, "2%");
assert.equal(JSON.parse(storage.get("bierkompass-recent-answers-v1")).length, 50);
const reloaded = runtime({initialStorage: storage}); reloaded.run("updateStats();");
assert.equal(reloaded.element("#accuracyStat").textContent, "2%");
run("requestHistoryReset();"); element("#confirmDialog").close("cancel");
assert.equal(run("recentAnswers.length"), 50);
run("requestHistoryReset();"); element("#confirmDialog").close("confirm");
assert.equal(element("#accuracyStat").textContent, "—");
assert.equal(storage.has("bierkompass-recent-answers-v1"), false);
// Result redraw/reload is not an additional answer; a second set rolls the window.
run("startSession();"); complete(); click("#nextButton");
assert.equal(run("recentAnswers.length"), 50);
assert.equal(element("#accuracyStat").textContent, "100%");
run("showSession(); showResult();");
assert.equal(run("recentAnswers.length"), 50);
click("#nextStudyButton");
run("session.answers[currentQuestion().id] = []; checkStudyAnswer();");
assert.equal(element("#accuracyStat").textContent, "98%");
// Partial credit is not complete correctness. Mock uses the same truth definition.
run('mode="mock"; createSession(data.questions.filter(q=>q.correct.length===2).slice(0,50), "mock"); session.answers[currentQuestion().id] = [currentQuestion().correct[0]]; session.answered[currentQuestion().id] = true; submitExam();');
assert.equal(run("session.result.earned"), 1);
assert.equal(element("#accuracyStat").textContent, "0%");
assert.equal(run("recentAnswers.length"), 50);
run("submitExam(); updateTimer();");
assert.equal(run("recentAnswers.length"), 50);
// Exact 49/50/51% weighted mock score boundaries, without rounding to pass.
for (const earned of [49,50,51]) {
  run(`const pool${earned} = data.questions.filter(q=>q.correct.length===2).slice(0,50); createSession(pool${earned}, "mock"); let left${earned}=${earned}; for (const id of session.questionIds) {const q = sessionQuestion(id); session.answers[id] = q.correct.slice(0, Math.min(2,left${earned})); session.answered[id] = true; left${earned} = Math.max(0,left${earned}-2);} submitExam();`);
  assert.equal(run("session.result.maximum"), 100);
  assert.equal(run("session.result.earned"), earned);
  assert.equal(run("session.result.passed"), earned >= 50);
  assert.equal(element("#resultTitle").textContent, earned >= 50 ? "合格" : "不合格");
}
const invalid = runtime({initialStorage:new Map([["bierkompass-recent-answers-v1", JSON.stringify([null,{correct:true},{correct:"yes"}])]])});
invalid.run("updateStats();"); assert.equal(invalid.run("recentAnswers.length"),1);
console.log("OK: genuine last-50 complete-correctness window, old-history migration, small windows, rollover, reload, reset/cancel, partial credit, duplicate scoring and mock 49/50/51% boundaries");
