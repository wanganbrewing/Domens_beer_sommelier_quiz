"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const rt = require("./runtime_harness")();
const bank = JSON.parse(fs.readFileSync("questions.json"));
const variants = JSON.parse(fs.readFileSync("choice-variants.json"));
const all = [...bank.questions, ...variants.questions.flatMap(g => g.variants.map(v => ({...v, id:g.questionId})))];
let reasons = 0;
for (const q of all) {
  rt.context.q = q;
  const before = JSON.stringify(q);
  const order = q.choices.map((_,i) => i).reverse();
  rt.context.order = order;
  const html = rt.run("renderReviewChoiceReasons(q, order)");
  assert(!/(?:誤答|正答)[：:]/.test(html));
  order.forEach((i, display) => {
    assert(html.includes(`${String.fromCharCode(65+display)}｜${q.correct.includes(i) ? "✓ 正解の選択肢" : "✕ 不正解の選択肢"}`));
  });
  assert.equal((html.match(/class="choice-explanation"/g)||[]).length, q.choiceReasons.filter(x=>x.trim()).length);
  rt.run("session = {answers:{}, optionOrders:{[q.id]:order}}; renderFeedback(q)");
  assert.equal(rt.element("#choiceReasons").innerHTML, html);
  assert(!/(?:誤答|正答)[：:]/.test(rt.element("#feedbackExplanation").innerHTML));
  assert.equal(JSON.stringify(q), before);
  reasons += q.choiceReasons.length;
}
assert.equal(rt.run('choiceReasonHtml("誤答：p12は Phenols + sweetness = buffer / harmony とする。")'), '<p class="choice-explanation"><strong>解説：</strong>p12は Phenols + sweetness = buffer / harmony とする。</p>');
console.log(`PASS: ${all.length} questions/variants, ${reasons} reasons, reversed display order, feedback/review parity, immutable data`);
