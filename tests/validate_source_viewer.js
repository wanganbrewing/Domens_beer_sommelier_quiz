"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {webcrypto, createHash} = require("node:crypto");
const root = path.resolve(__dirname, "..");
const source = require(path.join(root, "source-viewer.js"));
const bank = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const variants = require(path.join(root, "choice-variants.js")).createCatalog(bank.questions, JSON.parse(fs.readFileSync(path.join(root, "choice-variants.json"), "utf8")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = new TextEncoder().encode("%PDF-1.7\nSynthetic local-only test PDF\n");
const question = variants.get("BP26-002")[1];
const manifest = {version: 1, documents: [{id: "test", filename: "元の資料.pdf", sha256: sha(bytes), pageCount: 8}], questions: [{questionId: question.id, variantId: question.choiceVariantId, contentHash: sha(source.contentSignature(question)), choices: [0,1,2,3].map(index => ({index, refs: [{documentId:"test",page:3,label:`選択肢 ${index} の根拠`,rects:[[0.1,0.2,0.8,0.4]]}]}))}]};
manifest.documents.push({...manifest.documents[0],id:"alias",filename:"同じ資料の別名.pdf"});
manifest.questions[0].choices[2].refs[0].documentId="alias";
manifest.questions[0].choices[2].refs[0].page=5;
const clone = x => JSON.parse(JSON.stringify(x));

async function main() {
  if (fs.existsSync(path.join(root,"source-links.json"))) {
    const actual=JSON.parse(fs.readFileSync(path.join(root,"source-links.json")));
    const checked=await source.createCatalog(actual,bank.questions,variants,webcrypto);
    assert.equal(checked.groups.size,actual.questions.length,"all shipped content hashes match current question variants");
  }
  const catalog = await source.createCatalog(manifest, bank.questions, variants, webcrypto);
  assert.equal(catalog.groups.size, 1);
  for (const i of [3,1,0,2]) assert.match(source.renderChoiceLinks(catalog, question, i), new RegExp(`選択肢 ${i} の根拠`));
  assert.equal(source.renderChoiceLinks(catalog, variants.get("BP26-002")[0], 0), "");
  const old = clone(question); old.choiceReasons[1] += "旧内容";
  assert.equal(source.renderChoiceLinks(catalog, old, 0), "", "stale snapshot must not use current evidence");
  const stale = clone(manifest); stale.questions[0].contentHash = "0".repeat(64);
  assert.equal((await source.createCatalog(stale, bank.questions, variants, webcrypto)).groups.size, 0);
  const missing = clone(manifest); delete missing.questions[0].contentHash;
  assert.equal((await source.createCatalog(missing, bank.questions, variants, webcrypto)).groups.size, 0);
  const empty = clone(manifest); empty.questions[0].choices[0].refs = [];
  assert.equal(source.renderChoiceLinks(await source.createCatalog(empty, bank.questions, variants, webcrypto), question, 0), "");
  for (const rect of [[-.1,0,1,1], [0,0,2,1], [0,0,0,1], [1,1,0,0], [0,0,1,NaN]]) assert.equal(source.validRect(rect), false);
  for (const change of [m => m.questions[0].choices[0].refs[0].page=9, m => m.questions[0].choices[0].refs[0].rects=[[0,0,2,2]], m => m.documents[0].sha256="bad"]) {
    const invalid=clone(manifest); change(invalid); await assert.rejects(source.createCatalog(invalid,bank.questions,variants,webcrypto));
  }
  // Real app feedback/review integration: never call source link rendering before grading.
  const harness=require("./runtime_harness")();
  const calls=[];
  harness.context.window.BierKompassSources={choiceLinks(q,i){calls.push([q.id,q.choiceVariantId||"base",i]); return source.renderChoiceLinks(catalog,q,i);}};
  harness.context.q=question;
  harness.run('session = {mode:"study",questionIds:[q.id],questionSnapshots:{[q.id]:q},choiceVariantSchema:1,optionOrders:{[q.id]:[3,1,0,2]},answers:{},answered:{},checked:{},current:0,startedAt:Date.now(),durationSeconds:null,completed:false}; renderQuestion();');
  assert.equal(calls.length,0);
  harness.run('session.answers[q.id]=[0]; checkStudyAnswer();');
  assert.deepEqual(calls.map(x=>x[2]),[3,1,0,2]);
  assert.equal((harness.element("#choiceReasons").innerHTML.match(/class="source-drive-status"/g)||[]).length,4);
  calls.length=0;
  harness.run('renderReviewChoiceReasons(q,[2,0,3,1]);');
  assert.deepEqual(calls.map(x=>x[2]),[2,0,3,1]);
  assert.ok(calls.every(x=>x[1]===question.choiceVariantId));

  // The source module needs no DOM, file access, dialog, canvas, or renderer assets.
  const uiFetches = [], warnings = [];
  const emptyPassages = {version:1,linkSource:"google_drive.get_file_metadata.webViewLink",passages:[]};
  const fakeWindow = {crypto:webcrypto,AbortController,setTimeout,clearTimeout,
    console:{warn(...args){warnings.push(args);}},
    fetch:async (url,options)=>{uiFetches.push([url,options]);return {ok:true,json:async()=>url.startsWith("source-passages") ? emptyPassages : manifest};}
  };
  const context = vm.createContext({window:fakeWindow,TextEncoder,Uint8Array});
  const code = fs.readFileSync(path.join(root,"source-viewer.js"),"utf8");
  const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.doesNotMatch(html,/sourceViewer|sourceFile|sourceChoose|sourcePrivacy|LOCAL PDF|端末のPDF|type=["']file["']/);
  assert.doesNotMatch(code,/mountViewer|verifyFile|createResourceFactory|renderSize|vendor\/pdfjs|import\(|getDocument|arrayBuffer|addEventListener|端末のPDF/);
  for (const name of ["verifyFile","createResourceFactory","renderSize"]) assert.equal(source[name],undefined);
  vm.runInContext(code,context);
  const api = fakeWindow.BierKompassSources;
  assert.equal(await api.init({questions:bank.questions,variants,version:"v-test"}),true);
  assert.deepEqual(uiFetches.map(([url])=>url),["source-links.json?v-test","source-passages.json?v-test"]);
  assert.ok(uiFetches.every(([,options])=>options.cache === "no-store" && options.signal));
  assert.match(api.choiceLinks(question,0),/準備中/);
  assert.doesNotMatch(api.choiceLinks(question,0),/<button|<input|href=/);

  // Failure to load optional shared-image metadata preserves citations and study.
  fakeWindow.fetch=async url=> {
    if (url.startsWith("source-passages")) throw Error("offline");
    return {ok:true,json:async()=>manifest};
  };
  assert.equal(await api.init({questions:bank.questions,variants,version:"offline"}),true);
  assert.match(api.choiceLinks(question,0),/共有画像を読み込めません/);
  assert.match(api.choiceLinks(question,0),/元の資料.pdf · PDF 3ページ/);
  assert.doesNotMatch(api.choiceLinks(question,0),/<button|<input|href=/);
  fakeWindow.fetch=async()=>({ok:false});
  assert.equal(await api.init({questions:bank.questions,variants,version:"missing"}),false);
  assert.equal(api.choiceLinks(question,0),"","failed source manifest clears stale links");
  fakeWindow.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted"))));
  fakeWindow.setTimeout=callback=>{setImmediate(callback);return 1;};fakeWindow.clearTimeout=()=>{};
  assert.equal(await api.init({questions:bank.questions,variants,version:"timeout"}),false,"optional metadata timeout must not block ordinary study");
  assert.ok(warnings.length >= 3);
  assert.doesNotMatch(JSON.stringify(warnings),/端末のPDF/);
  console.log("PASS Drive-only source catalog, snapshot/variant mapping, after-answer integration, metadata-only loading, failure handling and absence of local PDF UI/runtime");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
