"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const elements = new Map();
const storage = new Map();
const intervals = new Map();
let now = 1_800_000_000_000;
let nextInterval = 0;
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    hidden: false, value: "all", style: {}, events: {}, classList: { toggle() {}, remove() {} },
    addEventListener(event, callback) { this.events[event] = callback; },
    setAttribute() {}, removeAttribute() {}, focus() {},
    showModal() { this.open = true; },
    close(value) { this.open = false; this.returnValue = value; this.events.close?.(); },
  });
  return elements.get(selector);
}
const context = vm.createContext({
  fixture, console, TextEncoder, crypto: globalThis.crypto,
  Date: class extends Date { static now() { return now; } },
  document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} },
  window: { scrollTo() {}, addEventListener() {} },
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  setInterval(callback) { const id = ++nextInterval; intervals.set(id, callback); return id; },
  clearInterval(id) { intervals.delete(id); },
});
vm.runInContext(source, context);
const run = (code) => vm.runInContext(code, context);
const snapshot = (code) => JSON.parse(run(`JSON.stringify(${code})`));
run("data = fixture; questionsById = new Map(data.questions.map(q => [q.id, q])); bindEvents();");
// Source status is visible after answering and is HTML-escaped, not executable markup.
assert.equal(run('sourceHtml({filename:"<file>",locator:"p1",status:"<script>bad</script>"})'), '&lt;file&gt;、p1<br><small>出典確認：&lt;script&gt;bad&lt;/script&gt;</small>');
const { mockExamSample, scoreQuestion } = context.window.BierKompass;
const active = fixture.questions.filter(q => q.active !== false);
for (let i = 0; i < 100; i++) {
  const sample = mockExamSample(active, 50);
  assert.equal(sample.length, 50);
  assert.equal(new Set(sample.map(q => q.id)).size, 50);
  assert.equal(new Set(sample.map(q => q.category)).size, 11, "all current curriculum fields must be represented");
  for (let n = 1; n <= 4; n++) assert.ok([12, 13].includes(sample.filter(q => q.correct.length === n).length));
}
assert.equal(mockExamSample([], 50).length, 0);
assert.equal(mockExamSample(active.slice(0, 3), 50).length, 3);
assert.equal(scoreQuestion({ correct: [0, 1] }, [0, 1]), 2);
assert.equal(scoreQuestion({ correct: [0, 1] }, [0]), 1);
assert.equal(scoreQuestion({ correct: [0, 1] }, [0, 2]), 0);
assert.equal(scoreQuestion({ correct: [0] }, [1, 2, 3]), 0);
assert.equal(scoreQuestion({ correct: [0, 1] }, [0, 1], false), 0);

// Mock ignores all study filters, has exactly 50 questions and starts at 40:00.
run('mode = "mock"; startSession();');
assert.equal(run("filteredPool().length"), active.length);
assert.equal(run("session.questionIds.length"), 50);
assert.equal(run("session.durationSeconds"), 2400);
assert.equal(element("#timer").textContent, "40:00");
assert.equal(element("#feedbackPanel").hidden, true);
assert.equal(element("#checkButton").hidden, true);
assert.equal(element("#frequencyTag").hidden, true);
assert.equal(intervals.size, 1);
now += 2100_000;
run("updateTimer();");
assert.equal(element("#timer").textContent, "05:00");
const startedAt = run("session.startedAt");
run("session = JSON.parse(localStorage.getItem(STORAGE.session)); showSession();");
assert.equal(run("session.startedAt"), startedAt);
assert.equal(element("#timer").textContent, "05:00", "restoring must not reset the deadline");
assert.equal(intervals.size, 1);

// Expiry while a restart dialog is open closes it, scores once and clears timers.
run("requestRestart();");
assert.equal(element("#confirmDialog").open, true);
now += 300_000;
run("updateTimer();");
assert.equal(run("session.result.reason"), "timeout");
assert.equal(run("session.result.earned"), 0);
assert.equal(run("session.result.passed"), false);
assert.equal(element("#resultTitle").textContent, "不合格");
assert.match(element("#resultLead").textContent, /自動採点/);
assert.equal(element("#confirmDialog").open, false);
assert.equal(intervals.size, 0);
assert.equal(run("pendingConfirm"), null);
assert.equal(storage.has("bierkompass-session-v24"), false);
assert.equal(element("#resultView").hidden, false);
assert.equal(element("#sessionView").hidden, true);
const attempts = run("Object.values(history).reduce((sum, h) => sum + h.attempts, 0)");
run("submitExam(); updateTimer(); captureAnswer(); markNoSelection();");
assert.equal(run("Object.values(history).reduce((sum, h) => sum + h.attempts, 0)"), attempts);

// Retry resets the clock; restoring an already-expired attempt scores once.
run("restartSession();");
assert.equal(element("#timer").textContent, "40:00");
assert.equal(run("session.completed"), false);
now += 2401_000;
run("session = JSON.parse(localStorage.getItem(STORAGE.session)); showSession();");
assert.equal(intervals.size, 0, "expired restores must not leave a live timer");
assert.equal(run("session.result.reason"), "timeout");
assert.equal(run("Object.values(history).reduce((sum, h) => sum + h.attempts, 0)"), attempts + 50);
run("showSession(); updateTimer(); submitExam();");
assert.equal(run("Object.values(history).reduce((sum, h) => sum + h.attempts, 0)"), attempts + 50);

// A late answer cannot sneak in before the next interval callback.
run("restartSession();");
now += 2400_000;
run("markNoSelection();");
assert.equal(run("session.result.reason"), "timeout");
assert.equal(run("Object.keys(session.answers).length"), 0);

// Confirming a stale restart at the deadline must not restart an expired test.
run("restartSession(); requestRestart();");
now += 2400_000;
element("#confirmDialog").close("confirm");
assert.equal(run("session.completed"), true);
assert.equal(run("session.result.reason"), "timeout");
assert.equal(intervals.size, 0);

// Aggregate threshold: exactly 50% passes, below it fails. Full-credit answers
// can be fewer than half of the questions because the denominator is points.
run(`session = { mode: "mock", questionIds: data.questions.slice(0, 2).map(q => q.id), optionOrders: {}, answers: {}, answered: {}, checked: {}, current: 0, startedAt: Date.now(), durationSeconds: 2400, completed: false };
  for (const id of session.questionIds) { const q = questionsById.get(id); q.correct = [0, 1]; session.optionOrders[id] = [0, 1, 2, 3]; }
  session.answers[session.questionIds[0]] = [0, 1]; session.answered[session.questionIds[0]] = true; submitExam();`);
assert.equal(run("session.result.maximum"), 4);
assert.equal(run("session.result.earned"), 2);
assert.equal(run("session.result.passed"), true);
assert.equal(element("#resultTitle").textContent, "合格");
assert.match(element("#reviewList").innerHTML, /自分の回答/);
assert.match(element("#reviewList").innerHTML, /未回答/);
element("#reviewFilter").value = "incorrect";
run("renderReview();");
assert.equal(element("#reviewCount").textContent, "1問を表示");
run("restartSession(); session.answers[session.questionIds[0]] = [0]; session.answered[session.questionIds[0]] = true; submitExam();");
assert.equal(run("session.result.passed"), false);

// Study is still untimed; old final-exam sessions keep their timer behavior.
run('session = null; mode = "study"; startTimer();');
assert.equal(intervals.size, 0);
run('mode = "mock"; startSession(); session.mode = "exam"; showSession();');
assert.equal(element("#timer").hidden, false);
assert.equal(element("#sessionModeBadge").textContent, "最終試験");
run('session.mode = "study"; showSession();');
assert.equal(element("#timer").hidden, true);
assert.equal(element("#checkButton").hidden, false);
assert.equal(intervals.size, 0);
console.log("OK: mock coverage, quotas, scoring, threshold, filters, deadline persistence, timeout races, review and old modes");
