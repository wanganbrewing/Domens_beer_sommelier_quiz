"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    hidden: false, innerHTML: "", value: "all", style: {}, classList: { toggle() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
  });
  return elements.get(selector);
}
const context = vm.createContext({fixture, window: {scrollTo() {}, addEventListener() {}},
  document: {querySelector: element, querySelectorAll: () => []},
  localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
  TextEncoder, crypto: globalThis.crypto, setInterval, clearInterval, console,
});
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);
run("data = fixture; questionsById = new Map(data.questions.map(q => [q.id,q]));");
for (const q of fixture.questions.filter(q => q.id.startsWith("DH-"))) {
  run(`session = {mode:"study",questionIds:[${JSON.stringify(q.id)}],optionOrders:{[${JSON.stringify(q.id)}]:[3,1,0,2]},answers:{},answered:{},checked:{},current:0,startedAt:Date.now(),durationSeconds:null,completed:false}; renderQuestion();`);
  assert.equal(element("#feedbackPanel").hidden, true);
  assert.doesNotMatch(element("#choiceList").innerHTML, /✓ 正解|✕ 不正解/);
  run(`session.checked[${JSON.stringify(q.id)}] = true; renderQuestion();`);
  assert.equal(element("#feedbackPanel").hidden, false);
  assert.equal((element("#choiceList").innerHTML.match(/✓ 正解/g) || []).length, q.correct.length);
  assert.equal((element("#choiceList").innerHTML.match(/✕ 不正解/g) || []).length, 4-q.correct.length);
  assert.ok(element("#sourceList").innerHTML.includes(`PDF表示ページ${q.sources[0].page}`));
  assert.ok(element("#sourceList").innerHTML.includes("飲酒を勧めるものではない"));
  assert.ok(element("#sourceList").innerHTML.includes("作成年・改訂版は未確認"));
}
console.log("OK: all 12 health questions render, shuffled correctness labels match, source page and health caveat appear only after answering");
