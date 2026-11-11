"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const elements = new Map();
const storage = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    hidden: false, value: "all", style: {}, classList: { toggle() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
  });
  return elements.get(selector);
}
const context = vm.createContext({
  fixture, window: { scrollTo() {}, addEventListener() {} },
  document: { querySelector: element, querySelectorAll: () => [] },
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  TextEncoder, crypto: globalThis.crypto, setInterval, clearInterval, console,
});
vm.runInContext(source, context);
const run = (s) => vm.runInContext(s, context);
const snapshot = (s) => JSON.parse(run(`JSON.stringify(${s})`));
run("data = fixture; questionsById = new Map(data.questions.map(q => [q.id, q]));");
assert.doesNotMatch(html, /最終試験|finalExamGuide|data-mode="exam"|class="style-corner"|class="beer-guide-corner"/);
assert.deepEqual([...html.matchAll(/data-mode="(.*?)"/g)].map(m => m[1]), ["study", "mock"]);
const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
assert.match(footer, /<a id="startBlindQuizButton" href="#blindQuizView">ブラインドテイスティング<\/a>/);
assert.match(footer, /<a id="openBeerGuideButton" href="#beerGuideView">代表ビール購入ガイド<\/a>/);
assert.ok(footer.indexOf('homeSupplementLinks') > footer.indexOf('>GitHub</a>'));
assert.equal((html.match(/id="startBlindQuizButton"/g) || []).length, 1);
assert.equal((html.match(/id="openBeerGuideButton"/g) || []).length, 1);
assert.doesNotMatch(source, /broadExamSample|broadQuestionScore|finalExamGuide/);
// Removed settings cannot select or start a new final exam.
run('setMode("exam");');
assert.equal(run("mode"), "study");
assert.equal(JSON.parse(storage.get("bierkompass-settings-v14")).mode, "study");
// Preserve every field of an interrupted legacy attempt except its retired mode/timer.
run(`legacy = { mode: "exam", questionIds: data.questions.slice(0, 2).map(q => q.id),
  optionOrders: {}, answers: {}, answered: {}, checked: {}, current: 1,
  startedAt: 1234567890, durationSeconds: 2400, completed: false };
  for (const id of legacy.questionIds) legacy.optionOrders[id] = [3, 1, 0, 2];
  legacy.answers[legacy.questionIds[1]] = [1, 3]; legacy.answered[legacy.questionIds[1]] = true;
  session = restoreSavedSession(legacy);`);
for (const field of ["questionIds", "optionOrders", "answers", "answered", "checked", "current", "startedAt", "completed"]) {
  assert.deepEqual(snapshot(`session.${field}`), snapshot(`legacy.${field}`));
}
assert.equal(run("session.mode"), "study");
assert.equal(run("session.durationSeconds"), null);
assert.equal(run("remainingSeconds()"), null);
assert.equal(run("session.restoredFromRetiredExam"), true);
run("showSession();");
assert.equal(element("#sessionRecoveryMessage").hidden, false);
assert.equal(element("#timer").hidden, true);
assert.equal(element("#homeSupplementLinks").hidden, true);
assert.equal(element("#checkButton").hidden, false);
assert.equal(element("#submitExamButton").hidden, true);
assert.equal(run("session.current"), 1);
assert.deepEqual(snapshot("history"), {});
run("session = restoreSavedSession(JSON.parse(localStorage.getItem(STORAGE.session))); showSession();");
assert.equal(run("session.mode"), "study");
assert.deepEqual(snapshot("session.answers"), snapshot("legacy.answers"));
// Active study and mock sessions are not migrated or given a new deadline.
for (const mode of ["study", "mock"]) {
  run(`legacy.mode = "${mode}";`);
  assert.equal(run("restoreSavedSession(legacy) === legacy"), true);
  assert.equal(run("restoreSavedSession(legacy).startedAt"), 1234567890);
}
assert.equal(run("restoreSavedSession(null)"), null);
assert.equal(run('restoreSavedSession({mode:"exam", questionIds:[]})'), null);
assert.equal(run('restoreSavedSession({mode:"exam", questionIds:["removed"]})'), null);
run('goHome();');
assert.equal(element("#homeSupplementLinks").hidden, false);
for (const view of ["session", "result", "blindQuiz", "beerGuide"]) {
  run(`showView("${view}");`);
  assert.equal(element("#homeSupplementLinks").hidden, true);
}
console.log("OK: two-mode home, footer-only links, retired settings, answer-preserving migration, existing sessions and view visibility");
// Screenshot regression S-022: green selected wrong options must not imply correctness.
run(`const pictured = questionsById.get("S-022");
  session = { mode: "study", questionIds: [pictured.id], optionOrders: {[pictured.id]:[3,1,2,0]},
    answers: {[pictured.id]:[1,0]}, answered: {[pictured.id]:true}, checked: {}, current:0,
    startedAt:Date.now(),durationSeconds:null,completed:false }; renderQuestion();`);
assert.doesNotMatch(element("#choiceList").innerHTML, /choice-answer-label|✓ 正解|✕ 不正解/);
run('session.checked["S-022"] = true; renderQuestion();');
let choices = element("#choiceList").innerHTML;
assert.equal((choices.match(/✓ 正解/g) || []).length, 1);
assert.equal((choices.match(/✕ 不正解/g) || []).length, 3);
assert.equal((choices.match(/あなたの選択/g) || []).length, 2);
assert.equal((choices.match(/未選択/g) || []).length, 2);
assert.match(choices, /アイリッシュ・ドライスタウト<\/span><span class="choice-status"><strong class="choice-answer-label is-correct">✓ 正解/);
assert.match(choices, /シュヴァルツビア<\/span><span class="choice-status"><strong class="choice-answer-label is-incorrect">✕ 不正解/);
assert.match(choices, /ロンドン・ポーター<\/span><span class="choice-status"><strong class="choice-answer-label is-incorrect">✕ 不正解/);
// Correctness uses original indices after shuffling, for zero-to-four-correct cases.
for (let n = 0; n <= 4; n++) {
  run(`questionsById.get("S-022").correct = [0,1,2,3].slice(0,${n}); renderQuestion();`);
  choices = element("#choiceList").innerHTML;
  assert.equal((choices.match(/✓ 正解/g) || []).length, n);
  assert.equal((choices.match(/✕ 不正解/g) || []).length, 4-n);
}
console.log("OK: screenshot S-022, per-choice correctness/selection labels, hidden before checking, shuffled indices and 0–4 correct choices");
