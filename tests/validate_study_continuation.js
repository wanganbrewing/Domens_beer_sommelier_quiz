"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("./runtime_harness.js");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../questions.json"), "utf8"));
fixture.questions = fixture.questions.filter(q => q.active !== false).slice(0, 123);
for (const engine of [true, false]) {
  const {run, snapshot, element, storage, filters, click, complete} = runtime({fixture, engine});
  run("startSession();");
  assert.equal(run("session.questionIds.length"), 50);
  const first = snapshot("session.questionIds");
  // Last question answered first must lead to an unchecked question, not discard it.
  run("goToQuestion(49); session.answers[currentQuestion().id] = [...currentQuestion().correct]; checkStudyAnswer();");
  assert.equal(element("#nextButton").textContent, "未回答へ →");
  click("#nextButton");
  assert.equal(run("session.current"), 0);
  run("finishStudySession();");
  assert.equal(run("session.completed"), false);
  complete();
  assert.equal(element("#feedbackPanel").hidden, false, "last explanation stays readable");
  assert.equal(element("#nextButton").disabled, false);
  assert.equal(element("#nextButton").textContent, "結果を見る →");
  assert.equal(run("Object.values(history).reduce((sum,h)=>sum+h.attempts,0)"), 50);
  click("#nextButton");
  assert.equal(run("session.completed"), true);
  assert.equal(element("#resultView").hidden, false);
  assert.equal(element("#resultHomeButton").textContent, "終わる");
  assert.equal(element("#nextStudyButton").textContent, "次の50問へ →");
  assert.doesNotMatch(element("#resultLead").textContent, /合格|NaN/);
  assert.equal(run("session.result.rate"), 1);
  click("#nextButton");
  run("finishStudySession(); session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();");
  assert.equal(element("#resultView").hidden, false, "completed study result survives reload");
  assert.equal(run("Object.values(history).reduce((sum,h)=>sum+h.attempts,0)"), 50, "result reload must not record again");
  // Changing home controls while results are open must not replace the saved filter.
  filters.tiers = [];
  click("#nextStudyButton");
  const second = snapshot("session.questionIds");
  assert.equal(second.length, 50);
  assert.ok(second.every(id => !first.includes(id)));
  const secondSession = snapshot("session");
  click("#nextStudyButton");
  assert.deepEqual(snapshot("session"), secondSession, "repeated next-set click is ignored");
  run("session.answers[currentQuestion().id] = [0]; persistSession();");
  const saved = snapshot("session");
  run("session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();");
  assert.deepEqual(snapshot("session"), saved, "active restore preserves filters, seen IDs, snapshots and order");
  run("requestRestart();"); element("#confirmDialog").close("cancel");
  assert.deepEqual(snapshot("session"), saved);
  run("restartSession();");
  assert.deepEqual(snapshot("session.studySeenIds"), saved.studySeenIds, "retry keeps earlier set exclusions");
  complete(); click("#nextButton");
  assert.equal(element("#nextStudyButton").textContent, "次の23問へ →");
  assert.match(element("#studyContinuationNote").textContent, /次は残り23問/);
  click("#nextStudyButton");
  const third = snapshot("session.questionIds");
  assert.equal(new Set([...first, ...second, ...third]).size, 123);
  complete(); click("#nextButton");
  assert.equal(element("#nextStudyButton").disabled, true);
  assert.match(element("#studyContinuationNote").textContent, /すべて終了/);
  const exhausted = snapshot("session");
  click("#nextStudyButton");
  assert.deepEqual(snapshot("session"), exhausted);
  assert.equal(run("Object.values(history).reduce((sum,h)=>sum+h.attempts,0)"), 123);
  click("#resultHomeButton");
  assert.equal(run("session"), null);
  assert.equal(storage.has("bierkompass-session-v24"), false);
  assert.equal(element("#homeView").hidden, false);
  assert.equal(run("Object.values(history).reduce((sum,h)=>sum+h.attempts,0)"), 123);
  // Malformed completed attempts do not crash; mock results are never restored as study.
  assert.equal(run('restoreSavedSession({completed:true,mode:"study",questionIds:{}})'), null);
  assert.equal(run('restoreSavedSession({...fixture,completed:true,mode:"mock",questionIds:[fixture.questions[0].id]})'), null);
}
// Respect all study filters, including history, for continuation.
for (const historyFilter of ["unanswered", "wrong", "not-mastered"]) {
  const {run, filters, element, complete, click, snapshot} = runtime();
  filters.tiers = ["A"]; filters.categories = ["beer_styles"];
  element("#historyFilter").value = historyFilter;
  if (historyFilter === "wrong") run("for (const q of data.questions) history[q.id] = {attempts:1,incorrectCount:1,correctCount:0,mastered:false};");
  run("startSession();");
  const first = snapshot("session.questionIds");
  assert.equal(first.length, 50);
  complete(); click("#nextButton"); click("#nextStudyButton");
  assert.equal(run("session.questionIds.length"), 50);
  assert.ok(run('session.questionIds.every(id => {const q = questionsById.get(id); return q.frequencyTier === "A" && q.category === "beer_styles" && q.active !== false;})'));
  assert.ok(snapshot("session.questionIds").every(id => !first.includes(id)));
  assert.equal(run("session.studyFilters.historyFilter"), historyFilter);
}
// Legacy attempts can finish and use their saved home filters without losing answers.
{
  const {run, element, complete, click} = runtime();
  run("startSession(); delete session.studyFilters; delete session.studySeenIds; persistSession(); session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();");
  complete(); click("#nextButton"); click("#nextStudyButton");
  assert.equal(run("session.questionIds.length"), 50);
  assert.equal(run("session.studySeenIds.length"), 100);
  run('session.choiceVariantPrototype = true;'); complete(); click("#nextButton");
  assert.equal(element("#nextStudyButton").hidden, true, "8-question prototype does not enter normal 50-question pool");
  run('mode="mock"; startSession(); submitExam();');
  assert.equal(element("#nextStudyButton").hidden, true);
  assert.equal(element("#resultHomeButton").textContent, "条件選択へ戻る");
}
console.log("OK: 50→50→23 unique questions, exhausted pool, filters/history, last-answer navigation, repeated clicks, result/active reloads, retry/cancel, legacy/prototype/mock separation and unchanged study history counts");
