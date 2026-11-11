"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const engine = require(path.join(root, "choice-variants.js"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const document = JSON.parse(fs.readFileSync(path.join(root, "choice-variants.json"), "utf8"));
const catalog = engine.createCatalog(fixture.questions, document);
assert.equal(catalog.size, 8);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const version = app.match(/const APP_VERSION = "v(\d+)";/)[1];
assert.ok(html.includes(`choice-variants.js?v=${version}`));
assert.ok(app.includes(`choice-variants.json?v=${version}`));
assert.ok(html.indexOf("choice-variants.js?") < html.indexOf("app.js?"));
assert.ok(!html.includes('variantPrototypeButton'), 'the dedicated eight-question promo was removed; catalog remains active');
assert.doesNotMatch(html, /LOCAL PROTOTYPE|未公開/);
const allNew = [...catalog.values()].flatMap((sets) => sets.slice(1));
assert.equal(allNew.length, 16);
for (const [id, sets] of catalog) {
  assert.equal(sets.length, 3);
  assert.equal(new Set(sets.map(engine.signature)).size, 3, `${id}: content must change, not merely order`);
  assert.equal(new Set(sets.map((q) => q.correct.length)).size, 1);
  for (const q of sets.slice(1)) {
    assert.equal(q.choices.length, 4);
    q.choiceReasons.forEach((r, i) => assert.ok(r.startsWith(q.correct.includes(i) ? "正答：" : "誤答：")));
    q.sources.forEach((s) => assert.ok(s.page >= 1 && s.page <= 28 && s.language === "en" && s.status));
  }
  let previous = "base";
  for (let i = 0; i < 30; i++) {
    const q = engine.chooseQuestion(sets[0], catalog, previous, () => (i % 10) / 10);
    assert.notEqual(q.choiceVariantId, previous);
    previous = q.choiceVariantId;
  }
  // A repeated statement must never change truth between variants of one prompt.
  const truths = new Map();
  for (const q of sets) q.choices.forEach((c, i) => {
    if (truths.has(c)) assert.equal(truths.get(c), q.correct.includes(i));
    truths.set(c, q.correct.includes(i));
  });
}
const invalid = JSON.parse(JSON.stringify(document));
invalid.questions[0].variants[0].correct = [0];
assert.throws(() => engine.createCatalog(fixture.questions, invalid));
const duplicate = JSON.parse(JSON.stringify(document));
duplicate.questions[0].variants[1].choices = [...duplicate.questions[0].variants[0].choices].reverse();
assert.throws(() => engine.createCatalog(fixture.questions, duplicate));

const elements = new Map(), storage = new Map(), intervals = new Map();
let nextInterval = 0, now = 1_800_000_000_000;
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    hidden: false, value: "all", style: {}, events: {}, classList: {toggle() {}, remove() {}},
    addEventListener(event, cb) { this.events[event] = cb; }, setAttribute() {}, removeAttribute() {}, focus() {},
    showModal() { this.open = true; }, close(value) { this.open = false; this.returnValue = value; this.events.close?.(); },
  });
  return elements.get(selector);
}
const context = vm.createContext({
  fixture: JSON.parse(JSON.stringify(fixture)), variantDocument: document, console, TextEncoder, crypto: globalThis.crypto,
  Date: class extends Date { static now() { return now; } },
  window: { BierKompassChoiceVariants: engine, scrollTo() {}, addEventListener() {} },
  document: {querySelector: element, querySelectorAll: () => [], addEventListener() {}},
  localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: (k) => storage.delete(k) },
  setInterval(cb) { const id = ++nextInterval; intervals.set(id, cb); return id; }, clearInterval(id) { intervals.delete(id); },
});
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context);
const run = (code) => vm.runInContext(code, context);
const snapshot = (code) => JSON.parse(run(`JSON.stringify(${code})`));
run("data = fixture; questionsById = new Map(data.questions.map(q => [q.id,q])); variantCatalog = window.BierKompassChoiceVariants.createCatalog(data.questions, variantDocument); bindEvents();");
run('setMode("mock"); startVariantPrototype();');
assert.equal(element("#startButton span").textContent, "学習を始める");
assert.equal(element("#mockExamGuide").hidden, true);
assert.equal(element("#studyConfig").hidden, false);
assert.equal(run("session.questionIds.length"), 8);
assert.equal(run("session.choiceVariantPrototype"), true);
assert.equal(run("session.mode"), "study");
assert.equal(element("#feedbackPanel").hidden, true);
assert.doesNotMatch(element("#choiceList").innerHTML, /✓ 正解|✕ 不正解/);
const first = snapshot("session");
run("session.answers[currentQuestion().id] = [1]; persistSession();");
const interrupted = snapshot("session");
run("session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();");
assert.deepEqual(snapshot("session"), interrupted);
assert.deepEqual(snapshot("session.questionSnapshots"), first.questionSnapshots);
assert.deepEqual(snapshot("session.optionOrders"), first.optionOrders);

// Dismissing a restart does not change content, answers, order, or usage.
const usageBeforeCancel = run("JSON.stringify(variantUsage)");
run("requestRestart();"); element("#confirmDialog").close("cancel");
assert.deepEqual(snapshot("session"), interrupted);
assert.equal(run("JSON.stringify(variantUsage)"), usageBeforeCancel);

// Answer feedback, all 16 response masks and history use the instantiated set.
for (const [id, sets] of catalog) for (const q of sets) {
  context.testQuestion = q;
  run(`session = {mode:"study",questionIds:[testQuestion.id],questionSnapshots:{[testQuestion.id]:JSON.parse(JSON.stringify(testQuestion))},choiceVariantSchema:1,optionOrders:{[testQuestion.id]:[3,1,0,2]},answers:{},answered:{},checked:{},current:0,startedAt:Date.now(),durationSeconds:null,completed:false}; renderQuestion();`);
  for (let mask = 0; mask < 16; mask++) {
    const selected = [0,1,2,3].filter((i) => mask & 1 << i);
    context.testSelected = selected;
    assert.equal(run("scoreQuestion(currentQuestion(), testSelected)"), engine.score(q, selected));
  }
  run("session.answers[currentQuestion().id] = [...currentQuestion().correct]; checkStudyAnswer();");
  assert.equal(element("#feedbackVerdict").textContent, "✓ 正解");
  assert.equal((element("#choiceList").innerHTML.match(/✓ 正解/g) || []).length, q.correct.length);
  q.choices.forEach((choice) => assert.ok(element("#choiceReasons").innerHTML.includes(run(`escapeHtml(${JSON.stringify(choice)})`))));
  const attempts = run("history[currentQuestion().id].attempts");
  run("checkStudyAnswer();");
  assert.equal(run("history[currentQuestion().id].attempts"), attempts, "double check must not duplicate history");
}
assert.ok(run('history["BP26-002"].variants["alt-a"].attempts > 0'));

// Actual retry replaces every supported set, preserves topic IDs, resets answers.
run("startVariantPrototype();");
const beforeRetry = snapshot("session");
run("restartSession();");
const afterRetry = snapshot("session");
assert.deepEqual(afterRetry.questionIds, beforeRetry.questionIds);
assert.deepEqual(afterRetry.answers, {});
for (const id of afterRetry.questionIds) {
  assert.notEqual(afterRetry.questionSnapshots[id].choiceVariantId, beforeRetry.questionSnapshots[id].choiceVariantId);
  assert.notEqual(engine.signature(afterRetry.questionSnapshots[id]), engine.signature(beforeRetry.questionSnapshots[id]));
  assert.equal(afterRetry.questionSnapshots[id].correct.length, beforeRetry.questionSnapshots[id].correct.length);
}
// A new session after reload/go-home also avoids the last stored set.
run("goHome(); variantUsage = loadJson(VARIANT_STORAGE, {}); startVariantPrototype();");
const afterHome = snapshot("session");
for (const id of afterHome.questionIds) assert.notEqual(afterHome.questionSnapshots[id].choiceVariantId, afterRetry.questionSnapshots[id].choiceVariantId);

// Snapshots survive catalog or bank edits during an in-progress attempt.
const intact = snapshot("session");
run('variantCatalog = new Map(); questionsById.get(session.questionIds[0]).choices[0] = "UPDATED BANK TEXT"; session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); renderQuestion();');
assert.deepEqual(snapshot("session.questionSnapshots"), intact.questionSnapshots);
assert.doesNotMatch(element("#choiceList").innerHTML, /UPDATED BANK TEXT/);
const malformed = JSON.parse(JSON.stringify(intact)); delete malformed.questionSnapshots[malformed.questionIds[0]];
context.badSession = malformed; assert.equal(run("restoreSavedSession(badSession)"), null);
context.fixture = JSON.parse(JSON.stringify(fixture));
run("data = JSON.parse(JSON.stringify(fixture)); questionsById = new Map(data.questions.map(q=>[q.id,q])); variantCatalog = window.BierKompassChoiceVariants.createCatalog(data.questions, variantDocument);");

// Existing active attempts have no snapshots: retain their original order/answers.
run(`legacy = {mode:"study",questionIds:["BP26-002"],optionOrders:{"BP26-002":[2,0,3,1]},answers:{"BP26-002":[2]},answered:{"BP26-002":true},checked:{},current:0,startedAt:123,durationSeconds:null,completed:false}; session = restoreSavedSession(legacy);`);
assert.equal(run("session === legacy"), true);
assert.equal(run("currentQuestion().choiceVariantId"), undefined);
assert.deepEqual(snapshot("session.answers"), {"BP26-002":[2]});
run("variantUsage = {}; history = {}; restartSession();");
assert.notEqual(run("currentQuestion().choiceVariantId"), "base", "legacy retries must not repeat the old base set even before an answer");

// Mock selection quotas remain unchanged before/after selecting a choice set.
for (let n = 0; n < 40; n++) {
  run('mode = "mock"; startSession();');
  assert.equal(run("session.questionIds.length"), 50);
  for (let count = 1; count <= 4; count++) assert.ok([12,13].includes(run(`Object.values(session.questionSnapshots).filter(q => q.correct.length === ${count}).length`)));
}
// Force all eight variant questions into a timed attempt to verify grading/review.
run('createSession([...variantCatalog.keys()].map(id=>questionsById.get(id)), "mock"); for (const id of session.questionIds) { session.answers[id] = [...sessionQuestion(id).correct]; session.answered[id] = true; }');
const graded = snapshot("session");
run("submitExam();");
assert.equal(run("session.result.rate"), 1);
assert.equal(run("session.result.earned"), Object.values(graded.questionSnapshots).reduce((sum,q)=>sum+q.correct.length,0));
for (const q of Object.values(graded.questionSnapshots)) {
  q.choices.forEach(c=>assert.ok(element("#reviewList").innerHTML.includes(run(`escapeHtml(${JSON.stringify(c)})`))));
  assert.ok(element("#reviewList").innerHTML.includes(run(`escapeHtml(${JSON.stringify(q.explanation)})`)));
}
// Timed snapshot restore keeps deadline, scores once, and retry starts a new clock.
run('restartSession();'); const deadlineStart = run("session.startedAt");
now += 2_401_000;
run('session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();');
assert.equal(run("session.startedAt"), deadlineStart);
assert.equal(run("session.result.reason"), "timeout");
assert.equal(intervals.size, 0);
const attemptsAfterTimeout = run("Object.values(history).reduce((s,h)=>s+h.attempts,0)");
run("submitExam(); updateTimer();");
assert.equal(run("Object.values(history).reduce((s,h)=>s+h.attempts,0)"), attemptsAfterTimeout);
run("restartSession();");
assert.equal(element("#timer").textContent, "40:00");
console.log("OK: 8 families / 16 reviewed alternatives; nonrepeat contents, immutable reloads, all answer masks, feedback, history, legacy sessions, quotas, review and timeout races");
