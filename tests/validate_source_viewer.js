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
const fakeFile = data => ({size:data.byteLength, arrayBuffer: async () => data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});

async function main() {
  if (fs.existsSync(path.join(root,"source-links.json"))) {
    const actual=JSON.parse(fs.readFileSync(path.join(root,"source-links.json")));
    const checked=await source.createCatalog(actual,bank.questions,variants,webcrypto);
    assert.equal(checked.groups.size,actual.questions.length,"all shipped content hashes match current question variants");
  }
  const catalog = await source.createCatalog(manifest, bank.questions, variants, webcrypto);
  assert.equal(catalog.groups.size, 1);
  for (const i of [3,1,0,2]) assert.match(source.renderChoiceLinks(catalog, question, i), new RegExp(`data-source-choice="${i}"`));
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
  assert.deepEqual(await source.verifyFile(fakeFile(bytes), manifest.documents[0], webcrypto),bytes);
  await assert.rejects(source.verifyFile(fakeFile(new Uint8Array([1,2])),manifest.documents[0],webcrypto),/版が一致/);
  await assert.rejects(source.verifyFile({size:101*1024*1024},manifest.documents[0],webcrypto),/100MB/);
  for (const zoom of [.75,1,3]) {
    const size = source.renderSize(595,842,366,zoom,3);
    assert.ok(size.width*size.height*size.outputScale**2 <= 4_000_001);
    assert.ok(Math.max(size.width,size.height)*size.outputScale <= 8192);
  }
  const fetches=[];
  const resources=JSON.parse(fs.readFileSync(path.join(root,"vendor/pdfjs/resources.json")));
  const binary=fs.readFileSync(path.join(root,"vendor/pdfjs/resources.bin"));
  const Factory=source.createResourceFactory(new URL("https://example.test/vendor/pdfjs/"), async url => {
    fetches.push(url.href);
    return {ok:true,json:async()=>resources,arrayBuffer:async()=>binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength)};
  });
  const factory=new Factory();
  const cm=await factory.fetch({kind:"cMapUrl",filename:"Adobe-Japan1-UCS2.bcmap"});
  assert.ok(cm.length>100);
  await factory.fetch({kind:"standardFontDataUrl",filename:"LiberationSans-Regular.ttf"});
  assert.equal(fetches.length,2,"pack is fetched only once");
  await assert.rejects(factory.fetch({kind:"wasmUrl",filename:"https://evil.test/leak"}));
  await assert.rejects(factory.fetch({kind:"cMapUrl",filename:"../../secret"}));
  assert.equal(fetches.length,2,"unknown PDF resource never causes a URL fetch");
  for (const [file, expected] of Object.entries(JSON.parse(fs.readFileSync(path.join(root,"vendor/pdfjs/SHA256SUMS.json"))))) assert.equal(sha(fs.readFileSync(path.join(root,"vendor/pdfjs",file))),expected,file);

  // Real app feedback/review integration: never call source link rendering before grading.
  const harness=require("./runtime_harness")();
  const calls=[];
  harness.context.window.BierKompassSources={choiceLinks(q,i){calls.push([q.id,q.choiceVariantId||"base",i]); return source.renderChoiceLinks(catalog,q,i);}};
  harness.context.q=question;
  harness.run('session = {mode:"study",questionIds:[q.id],questionSnapshots:{[q.id]:q},choiceVariantSchema:1,optionOrders:{[q.id]:[3,1,0,2]},answers:{},answered:{},checked:{},current:0,startedAt:Date.now(),durationSeconds:null,completed:false}; renderQuestion();');
  assert.equal(calls.length,0);
  harness.run('session.answers[q.id]=[0]; checkStudyAnswer();');
  assert.deepEqual(calls.map(x=>x[2]),[3,1,0,2]);
  assert.equal((harness.element("#choiceReasons").innerHTML.match(/data-source-choice=/g)||[]).length,4);
  calls.length=0;
  harness.run('renderReviewChoiceReasons(q,[2,0,3,1]);');
  assert.deepEqual(calls.map(x=>x[2]),[2,0,3,1]);
  assert.ok(calls.every(x=>x[1]===question.choiceVariantId));

  // Browser-like lifecycle with deterministic, cancellable PDF rendering (no browser sockets).
  const elements=new Map(), documentEvents={}, windowEvents={}, pdfCalls=[], uiFetches=[];
  class Element {
    constructor(id){this.id=id;this.events={};this.style={};this.hidden=false;this.disabled=false;this.value="";this.children=[];this.isConnected=true;this.clientWidth=390;this.classList={add(){},remove(){},toggle(){}};}
    addEventListener(name,cb){this.events[name]=cb;}
    setAttribute(){} focus(){this.focused=true;} click(){return this.events.click?.({});}
    showModal(){this.open=true;} close(){this.open=false;this.events.close?.();}
    replaceChildren(){this.children=[];} append(x){this.children.push(x);} scrollTo(x){this.scroll=x;}
    getContext(){return {};}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  let cancelled=0,destroyed=0,cleaned=0;
  const page={cleanup(){cleaned++;},getViewport:({scale})=>({width:595*scale,height:842*scale}),render:options=>{assert.equal(options.annotationMode,0);return {promise:Promise.resolve(),cancel(){cancelled++;}};}};
  const pdf={numPages:8,getPage:async()=>page,destroy:async()=>{destroyed++;}};
  const fakePdfjs={GlobalWorkerOptions:{},getDocument(options){pdfCalls.push(options);return {promise:Promise.resolve(pdf),destroy:async()=>{destroyed++;}};}};
  const fakeWindow={crypto:webcrypto,console,AbortController,scrollY:720,devicePixelRatio:3,
    scrollTo(x){this.scroll=x;},setTimeout,clearTimeout,
    addEventListener(name,cb){windowEvents[name]=cb;},
    history:{state:{app:true},pushState(s){this.state=s;},back(){this.state={app:true};windowEvents.popstate?.();}},
    document:{baseURI:"https://example.test/app/",body:el("body"),querySelector:s=>el(s.slice(1)),addEventListener(n,cb){documentEvents[n]=cb;},createElement:tag=>new Element(tag)},
    fetch:async(url,options)=>{uiFetches.push([url,options]);return {ok:true,json:async()=>String(url).startsWith("source-passages") ? {version:1,linkSource:"google_drive.get_file_metadata.webViewLink",passages:[]} : manifest};},
  };
  const context=vm.createContext({window:fakeWindow,globalThis:fakeWindow,TextEncoder,Uint8Array,URL,console,fakePdfjs});
  const code=fs.readFileSync(path.join(root,"source-viewer.js"),"utf8").replace('import(new URL("pdf.min.mjs", assetURL).href)','Promise.resolve(fakePdfjs)');
  vm.runInContext(code,context);
  await fakeWindow.BierKompassSources.init({questions:bank.questions,variants,version:"v-test"});
  const button=new Element("button");button.dataset={sourceQuestion:question.id,sourceVariant:question.choiceVariantId,sourceChoice:"1",sourceRef:"0"};
  const open=()=>documentEvents.click({target:{closest:()=>button}});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  open(); assert.equal(el("sourceViewer").open,true);assert.equal(el("sourceTools").hidden,true);
  el("sourceFile").files=[fakeFile(new Uint8Array([0]))];await el("sourceFile").events.change();
  assert.equal(pdfCalls.length,0);assert.match(el("sourceStatus").textContent,/版が一致/);
  el("sourceFile").files=[];await el("sourceFile").events.change();assert.equal(pdfCalls.length,0);
  el("sourceFile").files=[fakeFile(bytes)];await el("sourceFile").events.change();
  assert.equal(pdfCalls.length,1);assert.equal(pdfCalls[0].isEvalSupported,false);assert.equal(pdfCalls[0].enableXfa,false);assert.equal(pdfCalls[0].useSystemFonts,false);assert.equal(pdfCalls[0].useWorkerFetch,false);
  assert.ok(!("url" in pdfCalls[0]));assert.equal(el("sourceHighlights").children.length,1);
  assert.equal(el("sourcePage").value,"3");
  el("sourceNext").click();await tick();assert.equal(el("sourcePage").value,"4");assert.equal(el("sourceHighlights").children.length,0);
  el("sourceReference").click();await tick();assert.equal(el("sourcePage").value,"3");assert.equal(el("sourceHighlights").children.length,1);
  el("sourceZoomIn").click();await tick();assert.equal(el("sourceZoomLabel").textContent,"125%");
  // A later link wins over a pending old page, and identical files share the loaded PDF by SHA.
  let releaseOldPage;
  pdf.getPage=number=>number===4?new Promise(resolve=>releaseOldPage=resolve):Promise.resolve(page);
  el("sourceNext").click();
  button.dataset.sourceChoice="2";open();await tick();
  assert.equal(el("sourcePage").value,"5");assert.equal(pdfCalls.length,1);
  releaseOldPage(page);await tick();assert.equal(el("sourcePage").value,"5");
  pdf.getPage=async()=>page;
  button.dataset.sourceChoice="1";open();await tick();
  el("sourcePage").value="99";el("sourcePageForm").events.submit({preventDefault(){}});assert.equal(el("sourcePage").value,"3");
  el("sourceBack").click();assert.equal(el("sourceViewer").open,false);assert.equal(fakeWindow.scroll.top,720);assert.equal(button.focused,true);
  open();await tick();assert.equal(pdfCalls.length,1,"same PDF reused in memory");
  fakeWindow.history.back();assert.equal(el("sourceViewer").open,false,"browser Back dismisses viewer");
  // Native close and Back can finish later: reopening is queued until both have settled.
  open();await tick();let queuedClose,queuedPop;
  const savedClose=el("sourceViewer").close,savedBack=fakeWindow.history.back;
  el("sourceViewer").close=function(){this.open=false;queuedClose=()=>this.events.close();};
  fakeWindow.history.back=function(){queuedPop=()=>{this.state={app:true};windowEvents.popstate();};};
  el("sourceBack").click();open();assert.equal(el("sourceViewer").open,false);
  queuedClose();assert.equal(el("sourceViewer").open,false);queuedPop();await tick();assert.equal(el("sourceViewer").open,true);
  el("sourceViewer").close=savedClose;fakeWindow.history.back=savedBack;
  // Closing a rendering page must not let its late resolution show old pixels or highlights.
  let finishRender;
  const savedRender=page.render;
  page.render=()=>({promise:new Promise(resolve=>finishRender=resolve),cancel(){cancelled++;}});
  el("sourceZoomIn").click();await tick();el("sourceBack").click();finishRender();await tick();
  assert.equal(el("sourceViewer").open,false);assert.equal(el("sourceCanvas").width,1);assert.equal(el("sourceHighlights").children.length,0);
  page.render=savedRender;
  open();await tick();el("sourceForget").click();assert.equal(el("sourceTools").hidden,true);assert.ok(destroyed>0);assert.ok(cleaned>0);
  // Closing during a File read prevents late rendering and controls being re-enabled in a newer modal.
  let finishRead;el("sourceFile").files=[{size:bytes.length,arrayBuffer:()=>new Promise(r=>finishRead=r)}];
  const pending=el("sourceFile").events.change();el("sourceBack").click();finishRead(bytes.buffer);await pending;
  assert.equal(pdfCalls.length,1);assert.equal(el("sourceViewer").open,false);
  assert.equal(uiFetches.length,2,"PDF bytes, text and filenames never sent; only two metadata manifests fetched in this flow");
  assert.equal(uiFetches[0][0],"source-links.json?v-test");
  // The old document's asynchronous destroy must not reset a reopened viewer's page or zoom.
  open();el("sourceFile").files=[fakeFile(bytes)];await el("sourceFile").events.change();
  const savedDestroy=pdf.destroy;let finishDestroy;
  pdf.destroy=()=>new Promise(resolve=>finishDestroy=resolve);
  el("sourceFile").files=[fakeFile(bytes)];const reselecting=el("sourceFile").events.change();
  while(!finishDestroy) await tick();
  el("sourceBack").click();open();await tick();el("sourceZoomIn").click();await tick();
  assert.equal(el("sourceZoomLabel").textContent,"125%");finishDestroy();await reselecting;
  assert.equal(el("sourceZoomLabel").textContent,"125%","old load must not reset a newer viewer");
  pdf.destroy=savedDestroy;el("sourceBack").click();
  fakeWindow.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted"))));
  fakeWindow.setTimeout=callback=>{setImmediate(callback);return 1;};fakeWindow.clearTimeout=()=>{};
  assert.equal(await fakeWindow.BierKompassSources.init({questions:bank.questions,variants,version:"timeout"}),false,"optional metadata timeout must not block ordinary study");
  console.log("PASS local PDF source catalog, snapshot/variant mapping, app integration, SHA validation, privacy, canvas limits, navigation, cancellation and asset integrity");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
