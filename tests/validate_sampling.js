"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

const element = {
  addEventListener() {},
  focus() {},
  classList: { add() {}, remove() {}, toggle() {} },
};
const context = {
  window: {},
  document: { querySelector: () => element, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  TextEncoder,
  crypto: globalThis.crypto,
  setInterval,
  clearInterval,
  console,
};
vm.runInNewContext(appSource, context, { filename: "app.js" });

const { studyQuestionSample, broadExamSample, formatQuestionText } = context.window.BierKompass;
const tierAPool = data.questions.filter((question) => question.frequencyTier === "A");

assert.equal(formatQuestionText("正しいものを選ぶ。"), "正しいものを選ぶ。");
assert.equal(formatQuestionText("誤っているものを選ぶ。"), '<span class="negative-cue">誤っている</span>ものを選ぶ。');
assert.equal(formatQuestionText("<script>正しくない</script>"), '&lt;script&gt;<span class="negative-cue">正しくない</span>&lt;/script&gt;');

for (let run = 0; run < 25; run += 1) {
  const sample = studyQuestionSample(tierAPool, 50);
  assert.equal(sample.length, 50);
  assert.equal(new Set(sample.map((question) => question.id)).size, 50);
}
assert.equal(studyQuestionSample(tierAPool.slice(0, 17), 50).length, 17);

for (let run = 0; run < 25; run += 1) {
  const sample = broadExamSample(tierAPool, 50);
  assert.equal(sample.length, 50);
  assert.equal(new Set(sample.map((question) => question.id)).size, 50);
  assert.equal(sample.filter((question) => question.correct.length >= 2).length, 35);
  assert.equal(sample.filter((question) => question.correct.length < 2).length, 15);
}

console.log("OK: study mode returns 50 questions; final exam returns 35 multi-answer and 15 other questions");
