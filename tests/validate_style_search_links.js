"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {execFileSync} = require("node:child_process");
const root = path.resolve(__dirname,"..");
const read = name => fs.readFileSync(path.join(root,name),"utf8");
const json = name => JSON.parse(read(name));
const base = name => execFileSync("git",["show",`4810868d897e0ab3c999d730cc85e4125be6f3bd:${name}`],{cwd:root,maxBuffer:10*1024*1024});
const linksCode = read("style-links.js");
const context = {window:{}};
vm.runInNewContext(linksCode,context);
const links = context.window.BierKompassStyleLinks;
const getHrefs = html => [...html.matchAll(/<a class="style-reference-link" href="([^"]+)"/g)].map(m=>m[1]);
const known = [...new Set([
  ...json("beer-image-styles.json").flatMap(x=>[x.style,...x.aliases]),
  ...json("blind-tasting.json").scenarios.flatMap(x=>[x.answer,...x.choices]),
])];

async function main() {
  for (const name of known) {
    for (const html of [links.linkStyle(name),links.linkify(name)]) {
      const hrefs = getHrefs(html);
      assert.equal(hrefs.length,1,`full style name links once: ${name}`);
      const url = new URL(hrefs[0]);
      assert.equal(url.origin,"https://www.google.com");
      assert.equal(url.pathname,"/search");
      assert.equal(url.searchParams.get("q"),`${name} ビール スタイル`);
      assert.deepEqual([...url.searchParams.keys()],["q"]);
      assert.match(html,/target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
      assert.match(html,/Googleで検索（新しいタブ）/);
      assert.doesNotMatch(html,/onclick|javascript:|bjcp\.org/);
    }
  }
  assert.equal(links.linkify("xIGA IGAx xESB ESBx NEIPAX"),"xIGA IGAx xESB ESBx NEIPAX");
  assert.equal(links.linkify("ピルスナーウルケルとピルスナー・ウルケル"),"ピルスナーウルケルとピルスナー・ウルケル");
  assert.equal(links.linkify("香りと保存温度を比較する"),"香りと保存温度を比較する");
  assert.equal(getHrefs(links.linkify("ダブルIPA／ダブル／ヘレスボック／ヘレス")).length,4);
  for (const name of ['<img src=x onerror="bad()">&\'ヘレス',"A/B + C? & D#",""]) {
    const html=links.linkStyle(name);
    assert.doesNotMatch(html,/<img|<script|<iframe/);
    if (name) assert.equal(new URL(getHrefs(html)[0]).searchParams.get("q"),`${name} ビール スタイル`);
    else assert.equal(html,"");
  }
  const escaped = links.linkify('<script>ヘレス</script> & "試験"');
  assert.doesNotMatch(escaped,/<script>/);
  assert.match(escaped,/&lt;script&gt;/);
  assert.match(escaped,/&amp; &quot;試験&quot;/);
  assert.equal(getHrefs(links.linkify("ヘレス、ヘレス")).length,2,"repeated rendering has no regex state leak");

  // Load the real feedback helper into the app harness. It is never used inside answer labels.
  const h=require("./runtime_harness")();
  vm.runInContext(linksCode,h.context);
  h.context.q=json("questions.json").questions.find(q=>q.id==="A-100");
  h.run('session={mode:"study",questionIds:[q.id],questionSnapshots:{[q.id]:q},optionOrders:{[q.id]:[3,0,2,1]},answers:{},answered:{},checked:{},current:0,completed:false};renderQuestion();');
  const before=h.element("#choiceList").innerHTML;
  assert.doesNotMatch(before,/<a\b|google\.com|style-reference-link/);
  h.run('session.answers[q.id]=[...q.correct];checkStudyAnswer();');
  assert.ok(getHrefs(h.element("#feedbackExplanation").innerHTML).length>0);
  assert.ok(getHrefs(h.element("#choiceReasons").innerHTML).length>0);
  assert.doesNotMatch(h.element("#choiceList").innerHTML,/<a\b|style-reference-link/);
  const history = [...h.storage];
  h.run('renderFeedback(q);renderFeedback(q);');
  assert.deepEqual([...h.storage],history,"rendering or re-rendering links never records answers");
  h.run('session={mode:"mock",questionIds:[q.id],questionSnapshots:{[q.id]:q},optionOrders:{[q.id]:[3,0,2,1]},answers:{[q.id]:[...q.correct]},answered:{[q.id]:true},checked:{},current:0,completed:false};renderQuestion();');
  assert.equal(h.element("#feedbackPanel").hidden,true,"mock links stay hidden until grading");
  assert.doesNotMatch(h.element("#choiceList").innerHTML,/<a\b|style-reference-link/);
  h.run('session.result={review:[{id:q.id,selected:[0],points:0,max:q.correct.length,exact:false,answered:true}]};renderReview();');
  assert.ok(getHrefs(h.element("#reviewList").innerHTML).length>0,"review links work for incorrect answers too");

  // All real-photo and illustration captions link the actual displayed style without nesting anchors.
  const imageContext={window:{BierKompassStyleLinks:links},fetch:async url=>({ok:true,json:async()=>json(url.split("?")[0])})};
  vm.runInNewContext(read("beer-photos.js"),imageContext);
  await imageContext.window.BierKompassPhotos.ready;
  const pictures=[...json("beer-photos.json"),...json("beer-illustrations.json")];
  for(const item of pictures) {
    const html=imageContext.window.BierKompassPhotos.forId(item.id);
    assert.equal(getHrefs(html).length,1);
    assert.equal(new URL(getHrefs(html)[0]).searchParams.get("q"),`${item.style} ビール スタイル`);
    let depth=0;
    for(const tag of html.matchAll(/<a\b[^>]*>|<\/a>/g)) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      assert.ok(depth>=0 && depth<=1,"image links and style links are siblings, never nested");
    }
    assert.equal(depth,0);
  }

  // Render the real guide and result views; no network, history writes or browser navigation in this test.
  const elements=new Map();
  const byId=id=>{if(!elements.has(id))elements.set(id,{addEventListener(){},style:{}});return elements.get(id);};
  const blindContext={window:{BierKompassStyleLinks:links,BierKompass:{escapeHtml:s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),goHome(){},showView(){},shuffle:x=>x,sameSet:(a,b)=>JSON.stringify(a)===JSON.stringify(b)}},document:{getElementById:byId}};
  vm.runInNewContext(read("blind-quiz.js").replace("window.BierKompassBlind =", "window.testViews={setData:x=>blindData=x,setState:x=>state=x,renderBeerGuide,renderScenarioResult};window.BierKompassBlind ="),blindContext);
  const views=blindContext.window.testViews,blind=json("blind-tasting.json");
  views.setData(blind);views.renderBeerGuide();
  const headings=[...byId("beerGuideBody").innerHTML.matchAll(/<h3>(.*?)<\/h3>/g)].map(m=>m[1]);
  assert.equal(headings.length,58);
  for(const heading of headings)assert.equal(getHrefs(heading).length,1);
  for(const q of blind.scenarios) {
    views.setState({currentScore:{total:10,ingredients:3,family:1,country:1,shortlist:1,final:3,decisive:1},answers:{country:q.country,family:q.fermentationFamily,ingredients:q.step3IngredientsProcess,exclusions:[0,1,2,3].filter(i=>i!==q.correctChoice),final:q.correctChoice,decisive:"test"},options:{decisive:[{id:"test",label:q.decisiveEvidence}]}});
    const html=views.renderScenarioResult(q);
    assert.ok(getHrefs(html).length>=9,`result and incorrect alternatives have search links: ${q.id}`);
    const queries=getHrefs(html).map(href=>new URL(href).searchParams.get("q"));
    for(const item of q.exclusions) assert.ok(queries.includes(`${item.style} ビール スタイル`),`whole comparison style: ${item.style}`);
  }

  // Exact scope guard: answers, source permissions, sampling, scoring and every other app function stay intact.
  for(const file of ["questions.json","choice-variants.json","source-links.json","source-passages.json","blind-tasting.json","beer-image-styles.json","beer-photos.json","beer-illustrations.json"])
    assert.deepEqual(fs.readFileSync(path.join(root,file)),base(file),file);
  // Preserve style-related render paths without freezing unrelated home layout or cache versions.
  for (const name of ["renderQuestion","renderFeedback","renderReviewChoiceReasons","renderReview"]) {
    const pattern=new RegExp(`^function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`,"m");
    assert.equal(read("app.js").match(pattern)[0],base("app.js").toString().match(pattern)[0],name);
  }
  const version=read("app.js").match(/const APP_VERSION = "(v\d+)";/)[1];
  assert.ok(read("index.html").includes(`class="version-badge">${version}</small>`));
  for (const name of ["style-links.js","beer-photos.js","blind-quiz.js"])
    assert.ok(read("index.html").includes(`src="${name}?v=${version.slice(1)}"`));
  let expectedPhotos=base("beer-photos.js").toString().replace('    const caption = illustration','    const style = window.BierKompassStyleLinks?.linkStyle(item.style) || escape(item.style);\n    const caption = illustration').replace('${escape(item.style)}</strong>','${style}</strong>').replace('${escape(item.style)} · 実物写真','${style} · 実物写真');
  assert.equal(read("beer-photos.js"),expectedPhotos,"image source, license and fallback behavior unchanged");
  const expectedBlind=base("blind-quiz.js").toString()
    .replace('  const styleAnswerHtml = (value) => window.BierKompassStyleLinks?.linkify(value) || escapeHtml(value);','  const styleAnswerHtml = (value) => window.BierKompassStyleLinks?.linkify(value) || escapeHtml(value);\n  const styleNameHtml = (value) => window.BierKompassStyleLinks?.linkStyle(value) || escapeHtml(value);')
    .replaceAll('styleAnswerHtml(scenario.answer)','styleNameHtml(scenario.answer)')
    .replaceAll('styleAnswerHtml(target.answer)','styleNameHtml(target.answer)')
    .replaceAll('styleAnswerHtml(item.style)','styleNameHtml(item.style)');
  assert.equal(read("blind-quiz.js"),expectedBlind,"only known style-only labels change; selection/scoring/history/links unchanged");
  assert.ok(read("styles.css").startsWith(base("styles.css").toString().split("/* Local-only source PDF viewer.")[0]),"pre-existing learning layout styles remain unchanged");
  assert.match(read("styles.css"),/\.style-reference-link:focus-visible/);
  assert.match(read("styles.css"),/\.style-reference-link\{overflow-wrap:anywhere\}/);
  console.log(`PASS ${known.length} style labels; Google queries/escaping/new tabs; 58 guide and result views; ${pictures.length} image captions; pre-answer isolation, review, unchanged answers/history/source access`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
