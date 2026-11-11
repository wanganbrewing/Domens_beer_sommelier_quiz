"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const base=name=>execFileSync("git",["show",`6fcd16407bd2260f7c4a48280cc68cfa4637c4f7:${name}`],{cwd:root,maxBuffer:10*1024*1024});
const first="共有教材画像は受講者限定です。2026年11月24日に削除予定です。問題と学習履歴は削除対象ではありません。";
async function main(){
  const html=read("index.html");
  for(const text of ["CHOICE VARIATIONS","同じ問題を、別の選択肢で","対応する8問を学ぶ","variantPrototypeButton","variantPrototypeStatus","variantPrototypeCount"])
    assert.ok(!html.includes(text),`remove the pictured promotional card: ${text}`);
  const notice=html.match(/<aside id="sourceDeletionNotice"[^>]*>(.*?)<\/aside>/s);
  assert.ok(notice);
  assert.equal(notice[1],`<p>${first}</p>`,"the user's wording is exact");
  assert.equal((html.match(/id="sourceDeletionNotice"/g)||[]).length,1);
  const home=html.slice(html.indexOf('<section id="homeView"'),html.indexOf('<section id="blindQuizView"'));
  assert.ok(home.indexOf('class="dashboard"')<home.indexOf('class="stats"'));
  assert.ok(home.indexOf('class="stats"')<home.indexOf('id="sourceDeletionNotice"'));
  assert.match(home,/<\/aside>\s*<\/section>\s*$/,"the notice is at the bottom of home, after stats");
  assert.doesNotMatch(notice[1],/自動|削除しました|削除済み/);
  assert.match(read("styles.css"),/\.stats \+ \.source-deletion-notice \{ margin: 24px 0 0; \}/);

  // Real initialization with removed DOM nodes: successful and failed variant loading both remain usable.
  for(const failure of [false,true]){
    const h=require("./runtime_harness")();
    const query=h.context.document.querySelector;
    const removed=[];
    h.context.document.querySelector=selector=>{
      if(selector.startsWith("#variantPrototype")){removed.push(selector);return null;}
      return query(selector);
    };
    const warnings=[];
    h.context.console={...console,warn:(...args)=>warnings.push(args)};
    h.context.fetch=async url=>{
      if(url.startsWith("choice-variants")&&failure)throw Error("simulated offline");
      return {ok:true,json:async()=>JSON.parse(read(url.split("?")[0]))};
    };
    await h.run("init()");
    assert.deepEqual(removed,[],"initialization never accesses removed UI");
    assert.equal(h.run("questionsById.size"),1080);
    assert.equal(h.run("variantCatalog.size"),failure?0:8);
    assert.equal(warnings.length,failure?1:0);
    assert.ok(!String(h.element("#configMessage").textContent).includes("エラー"));
    h.run('createSession([questionsById.get("BP26-002")],"study");');
    assert.equal(h.run("session.mode"),"study");
    if(!failure){
      const before=h.snapshot("session");h.context.prior=before;
      h.run('createSession([questionsById.get("BP26-002")],"study",false,prior);');
      assert.notEqual(h.run('currentQuestion().choiceVariantId'),before.questionSnapshots["BP26-002"].choiceVariantId);
      assert.equal(h.run("session.choiceVariantPrototype"),undefined,"normal study remains normal study");
    }
  }

  // Only home promotion/status code and version markers change; old sessions and core behavior stay intact.
  let expected=base("app.js").toString()
    .replace('const APP_VERSION = "v55";','const APP_VERSION = "v56";')
    .replace('choice-variants.json?v=55','choice-variants.json?v=56')
    .replace('        $("#variantPrototypeStatus").textContent = "別セットを読み込めなかったため、通常の選択肢で学習できます。";\n','        console.warn("別セットを読み込めなかったため、通常の選択肢で学習できます。", error.message);\n');
  for(const line of ['      $("#variantPrototypeButton").disabled = !variantCatalog.size;\n','      $("#variantPrototypeCount").textContent = String(variantCatalog.size);\n','  $("#variantPrototypeButton")?.addEventListener("click", startVariantPrototype);\n'])expected=expected.replace(line,"");
  assert.equal(read("app.js"),expected);
  for(const name of ["questions.json","choice-variants.js","choice-variants.json","style-links.js","beer-photos.js","blind-quiz.js","source-links.json","source-passages.json"])
    assert.deepEqual(fs.readFileSync(path.join(root,name)),base(name),name);
  assert.ok(read("styles.css").startsWith(base("styles.css").toString().split("/* Local-only source PDF viewer.")[0]),"pre-existing learning layout styles remain unchanged");
  assert.match(html,/class="version-badge">v56<\/small>/);
  console.log("PASS pictured card removed; exact notice at home bottom; DOM-null and offline initialization; variants, history, answers, Google links and source access preserved");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
