"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const photos = read("beer-photos.json");
const illustrations = read("beer-illustrations.json");
const styles = read("beer-image-styles.json");
const questions = read("questions.json").questions;
async function main() {
  const requested = [];
  const sandbox = { window: {}, fetch: async url => {
    requested.push(url);
    return { ok: true, json: async () => read(url.split("?")[0]) };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "beer-photos.js"), "utf8").replace("window.BierKompassPhotos =", "window.testMatchingIds = matchingIds; window.BierKompassPhotos ="), sandbox);
  const images = sandbox.window.BierKompassPhotos;
  assert.equal(images.forText("ウィンナーラガー"), "", "must wait for catalog readiness");
  await images.ready;
  assert.equal(requested.length, 3);
  assert.equal(new Set([...photos, ...illustrations].map(x => x.id)).size, photos.length + illustrations.length, "one image per style; no duplicate photography replacements");
  for (const item of [...photos, ...illustrations]) {
    assert.ok(fs.existsSync(path.join(root, item.image)), `missing ${item.image}`);
    assert.ok(fs.statSync(path.join(root, item.image)).size > 1000, `empty ${item.image}`);
    assert.ok(styles.some(style => style.id === item.id));
    const html = images.forId(item.id);
    assert.match(html, /<img /);
    if (item.kind === "illustration") {
      assert.match(html, /AI参考イラスト/);
      assert.match(html, /実在銘柄の写真ではありません/);
      assert.doesNotMatch(html, /写真：/);
    } else { assert.ok(html.includes(item.source.replace(/&/g,"&amp;"))); assert.match(html, /実物写真/); }
  }
  const vienna = questions.find(q => q.id === "A-100");
  assert.match(images.forQuestion(vienna, [3,2,0,1]), /vienna-lager.webp/);
  assert.equal((images.forQuestion(vienna).match(/data-beer-style-id="O-03"/g) || []).length, 1, "same beer repeated in explanations must be shown once");
  const comparison = images.forQuestion(questions.find(q => q.id === "C-076"));
  assert.match(comparison, /O-03/); assert.match(comparison, /D-06/); assert.match(comparison, /B-05/);
  assert.match(comparison, /誤答の選択肢・解説で参照/);
  const synthetic = { question:"参考", explanation:"", choices:["シュヴァルツビア", "ウィンナーラガー", "ゴールデンストロング", "ヘーフェヴァイツェン"], correct:[1], choiceReasons:["","","",""] };
  assert.equal((images.forQuestion(synthetic, [1,0,3,2]).match(/<figure/g)||[]).length,4,"no two-image cap on wrong options");
  assert.match(images.forQuestion(synthetic,[1,0,3,2]), /A｜正答/);
  assert.match(images.forQuestion(synthetic,[1,0,3,2]), /B｜誤答/);
  assert.doesNotMatch(images.forText("クリスタルヴァイツェン"), /data-beer-style-id="D-12"/, "clear wheat must not use cloudy wheat photo");
  assert.doesNotMatch(images.forText("ダークヴァイツェン"), /data-beer-style-id="D-12"/);
  assert.doesNotMatch(images.forText("ヴァイツェンボック"), /data-beer-style-id="D-12"/);
  assert.match(images.forText("ミュンヘナー・ヘレス"), /D-02/);
  assert.match(images.forText("ミュンヘナー ヘレス"), /D-02/);
  assert.equal(images.forText("写真と無関係な醸造工程"), "");
  const choices = images.forChoices(["ウィンナーラガー","シュヴァルツビア"],[0],1);
  assert.match(choices,/正答のビール/);assert.match(choices,/誤答の候補（あなたの回答）/);
  // Gallery output never executes question text.
  assert.doesNotMatch(images.forQuestion({...synthetic, question:'<script>alert(1)</script>ウィンナーラガー'}), /<script>/);
  const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
  assert.match(app,/forQuestion\(question, session.optionOrders\[question.id\]\)/);
  assert.match(app,/forQuestion\(question, order\)/);
  assert.doesNotMatch(app.slice(app.indexOf("function renderQuestion()"),app.indexOf("function captureAnswer()")),/forQuestion\(/,"question rendering itself must not reveal images");
  // Exercise the actual app render paths, not only the image helper.
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:"all",classList:{toggle(){},remove(){}},addEventListener(){},focus(){},setAttribute(){},removeAttribute(){}});
    return elements.get(selector);
  };
  const appContext = vm.createContext({
    fixture:read("questions.json"), document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
    window:{BierKompassPhotos:images,scrollTo(){},addEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setInterval(){},clearInterval(){},console,
  });
  vm.runInContext(app, appContext);
  vm.runInContext(`data=fixture;questionsById=new Map(data.questions.map(q=>[q.id,q]));
    session={mode:"study",questionIds:["A-100"],current:0,answers:{"A-100":[3]},optionOrders:{"A-100":[3,2,0,1]}};
    renderFeedback(questionsById.get("A-100"));`, appContext);
  assert.match(element("#feedbackExplanation").innerHTML,/vienna-lager.webp/);
  assert.equal(element("#feedbackVerdict").textContent,"✕ 不正解");
  vm.runInContext('session.answers["A-100"]=[0,1,2];renderFeedback(questionsById.get("A-100"));',appContext);
  assert.match(element("#feedbackExplanation").innerHTML,/vienna-lager.webp/);
  assert.equal(element("#feedbackVerdict").textContent,"✓ 正解");
  vm.runInContext(`session.optionOrders["C-076"]=[0,1,2,3];
    session.result={review:[{id:"C-076",selected:[0],points:0,max:2,exact:false,answered:true}]};renderReview();`,appContext);
  const review = element("#reviewList").innerHTML;
  for (const id of ["O-03","D-06","B-05"]) assert.ok(review.includes(`data-beer-style-id="${id}"`));
  element("#reviewFilter").value="incorrect";
  vm.runInContext('renderReview();renderReview();',appContext);
  assert.equal(element("#reviewList").innerHTML,review,"repeated review filtering must not duplicate or lose images");
  const scenarios = read("blind-tasting.json").scenarios;
  const expectedIds = new Set(scenarios.map(s => s.id));
  for (const question of questions) {
    for (const id of sandbox.window.testMatchingIds([question.question,question.explanation,...question.choices,...question.choiceReasons].join("\n"))) expectedIds.add(id);
  }
  const suppliedIds = new Set([...photos,...illustrations].map(image => image.id));
  for (const id of expectedIds) assert.ok(suppliedIds.has(id), `No image for referenced style ${id}`);
  for (const scenario of scenarios) assert.match(images.forId(scenario.id),/<img /,`No guide image for ${scenario.id}`);
  const covered = questions.filter(q => images.forQuestion(q)).length;
  console.log(`OK: ${photos.length} documented photographs + ${illustrations.length} AI reference illustrations; ${covered}/${questions.length} questions contain available image references.`);
  console.log("OK: Vienna question, wrong-answer comparisons, shuffled labels, no two-image cap, clear/dark wheat matching, assets, provenance and review wiring.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
