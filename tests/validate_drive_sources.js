"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {webcrypto,createHash} = require("node:crypto");
const source = require("../source-viewer");
const bank = require("../questions.json");
const variants = require("../choice-variants").createCatalog(bank.questions, require("../choice-variants.json"));
const clone = x => JSON.parse(JSON.stringify(x));
async function main() {
  const pageHtml = fs.readFileSync(require("node:path").join(__dirname,"../index.html"),"utf8");
  const notice = pageHtml.match(/<aside id="sourceDeletionNotice"[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(notice,"home must show the planned shared-image deletion notice");
  assert.match(notice,/共有教材画像は受講者限定です。/);
  assert.match(notice,/2026年11月24日に削除予定です。問題と学習履歴は削除対象ではありません。/);
  assert.match(notice,/端末内のご自身のPDFも削除されません。/);
  assert.doesNotMatch(notice,/自動|日本語も全対応/);
  assert.equal((pageHtml.match(/id="sourceDeletionNotice"/g)||[]).length,1);
  assert.ok(pageHtml.indexOf('id="homeView"') < pageHtml.indexOf('id="sourceDeletionNotice"'));
  assert.ok(pageHtml.indexOf('id="sourceDeletionNotice"') < pageHtml.indexOf('class="dashboard"'));
  assert.doesNotMatch(fs.readFileSync(require("node:path").join(__dirname,"../source-viewer.js"),"utf8"),/2026年11月24日/,
    "the full notice is not repeated beneath each answer");
  const catalog = await source.createCatalog(require("../source-links.json"), bank.questions, variants, webcrypto);
  const question = variants.get("BP26-002")[1];
  const group = catalog.groups.get(JSON.stringify([question.id,question.choiceVariantId]));
  const ref = group.choices.get(0)[0];
  const pdfSha256 = catalog.documents.get(ref.documentId).sha256;
  const key = createHash("sha256").update(JSON.stringify([pdfSha256, ref.page, ref.rects]),"utf8").digest("hex");
  assert.equal(ref.passageKey,key);
  // These IDs are deliberately fake and never shipped in the live mapping.
  const entry = {key,pdfSha256,page:ref.page,rects:ref.rects,imageSha256:"a".repeat(64),driveFileId:"FAKE_TEST_ONLY_123",webViewLink:"https://drive.google.com/file/d/FAKE_TEST_ONLY_123/view?usp=drivesdk"};
  const manifest = {version:1,linkSource:"google_drive.get_file_metadata.webViewLink",passages:[entry]};
  const livePassages = await source.createPassageCatalog(require("../source-passages.json"),catalog,webcrypto);
  assert.ok(!JSON.stringify(require("../source-passages.json")).includes("FAKE_TEST_ONLY"),"test IDs must not ship in live mapping");
  catalog.passages = livePassages;
  catalog.driveStatus = livePassages.size ? "available" : "unconfigured";
  const canonical = new Map(bank.questions.map(q => [JSON.stringify([q.id,"base"]),q]));
  for (const sets of variants.values()) for (const q of sets)
    canonical.set(JSON.stringify([q.id,q.choiceVariantId || "base"]),q);
  let liveLinkCount = 0;
  for (const [groupKey, liveGroup] of catalog.groups) for (const [index, refs] of liveGroup.choices) {
    const rendered = source.renderChoiceLinks(catalog,canonical.get(groupKey),index);
    const expected = refs.filter(r => livePassages.has(r.passageKey));
    assert.equal((rendered.match(/<a class="source-link" /g)||[]).length,expected.length,
      `each live choice renders exactly its own Drive links: ${groupKey}/${index}`);
    assert.equal((rendered.match(/<button type="button" class="source-link source-local-link"/g)||[]).length,refs.length,
      "every reviewed reference retains its local PDF fallback");
    assert.equal((rendered.match(/class="source-drive-status"/g)||[]).length,refs.length-expected.length,
      "only missing image mappings are described as preparing");
    for (const liveRef of expected)
      assert.ok(rendered.includes(`href="${livePassages.get(liveRef.passageKey).webViewLink}"`));
    if (!refs.length) assert.equal(rendered,"","unmapped choices do not imply evidence");
    liveLinkCount += expected.length;
  }
  console.log(`PASS shipped mapping renders ${liveLinkCount} protected Drive links across ${catalog.groups.size} question sets (metadata-only test)`);
  const emptyManifest = {version:1,linkSource:manifest.linkSource,passages:[]};
  catalog.passages = await source.createPassageCatalog(manifest,catalog,webcrypto); catalog.driveStatus="available";
  let html = source.renderChoiceLinks(catalog,question,0);
  assert.match(html,/target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.match(html,/href="https:\/\/drive.google.com\/file\/d\/FAKE_TEST_ONLY_123\/view\?usp=drivesdk"/);
  assert.match(html,/端末のPDFで確認/); assert.doesNotMatch(html,/<img|<iframe|準備中/);
  const descriptor = catalog.documents.get(ref.documentId);
  const originalFilename = descriptor.filename;
  assert.ok(html.includes(originalFilename), "source filename is visible beside the label");
  descriptor.filename = '長い日本語資料名<&>"\'試験資料.pdf';
  const escaped = source.renderChoiceLinks(catalog,question,0);
  assert.equal((escaped.match(/長い日本語資料名&lt;&amp;&gt;&quot;&#39;試験資料.pdf/g)||[]).length,2,
    "Drive and local PDF links both show the HTML-escaped full filename");
  assert.doesNotMatch(escaped, /長い日本語資料名<&>/);
  descriptor.filename = originalFilename;
  const old=clone(question); old.explanation+="old snapshot";
  assert.equal(source.renderChoiceLinks(catalog,old,0),"");
  assert.equal(source.renderChoiceLinks(catalog,variants.get(question.id)[0],0).includes("FAKE_TEST_ONLY"),false);
  for (const url of [
    "http://drive.google.com/file/d/FAKE_TEST_ONLY_123/view",
    "https://evil.test/file/d/FAKE_TEST_ONLY_123/view",
    "https://drive.google.com.evil.test/file/d/FAKE_TEST_ONLY_123/view",
    "https://drive.google.com@evil.test/file/d/FAKE_TEST_ONLY_123/view",
    "https://drive.google.com/uc?export=download&id=FAKE_TEST_ONLY_123",
    "https://drive.google.com/file/d/FAKE_TEST_ONLY_123/preview",
    "https://drive.google.com/file/d/FAKE_TEST_ONLY_123/view?token=secret",
    "https://drive.google.com/file/d/FAKE_TEST_ONLY_123/view?resourcekey=secret",
    "https://drive.google.com/file/d/FAKE_TEST_ONLY_123/view#token",
    "https://drive.google.com/file/d/OTHER_FAKE_TEST_123/view",
    "https://drive.google.com/file/d/FAKE_TEST_ONLY_123/view\n",
    "javascript:alert(1)", "//drive.google.com/file/d/FAKE_TEST_ONLY_123/view",
    "https://lh3.googleusercontent.com/secret", "https://drive.google.com/thumbnail?id=FAKE_TEST_ONLY_123"
  ]) { const bad=clone(manifest);bad.passages[0].webViewLink=url;await assert.rejects(source.createPassageCatalog(bad,catalog,webcrypto),undefined,url); }
  for (const mutate of [
    m=>m.passages.push(m.passages[0]), m=>m.passages[0].key="b".repeat(64),
    m=>m.passages[0].page++, m=>m.passages[0].pdfSha256="b".repeat(64),
    m=>m.passages[0].rects[0][0]+=.001, m=>m.passages[0].imageSha256="invalid",
    m=>m.passages[0].token="secret", m=>m.passages[0].text="source text",
    m=>m.passages[0].rects=[], m=>m.passages[0].driveFileId="bad/123",
    m=>m.linkSource="unverified",m=>m.version=2,m=>m.extra="unexpected"
  ]) {const bad=clone(manifest);mutate(bad);await assert.rejects(source.createPassageCatalog(bad,catalog,webcrypto));}
  // Real app gating, original indexes, and direct-link rendering for both correct/incorrect outcomes.
  const h=require("./runtime_harness")(); const calls=[];
  h.context.window.BierKompassSources={choiceLinks(q,i){calls.push(i);return source.renderChoiceLinks(catalog,q,i);}};
  h.context.q=question;
  const session = mode => `session={mode:"${mode}",questionIds:[q.id],questionSnapshots:{[q.id]:q},choiceVariantSchema:1,optionOrders:{[q.id]:[3,1,0,2]},answers:{},answered:{},checked:{},current:0,startedAt:Date.now(),durationSeconds:null,completed:false};renderQuestion();`;
  for(const answer of [question.correct, [0,1,2,3].filter(i=>!question.correct.includes(i))]) {
    calls.length=0;h.run(session("study"));assert.equal(calls.length,0);
    h.context.answer=answer;h.run('session.answers[q.id]=answer;checkStudyAnswer();');
    assert.deepEqual(calls,[3,1,0,2]);assert.match(h.element("#choiceReasons").innerHTML,/FAKE_TEST_ONLY/);
  }
  calls.length=0;h.run(session("mock"));assert.equal(calls.length,0);
  h.run('session.answers[q.id]=[0];renderQuestion();');assert.equal(calls.length,0,"mock answers do not reveal sources before grading");
  h.run('renderReviewChoiceReasons(q,[2,0,3,1]);');assert.deepEqual(calls,[2,0,3,1]);
  const fetches=[];
  const fetcher=async url=>{fetches.push(url);return {ok:true,json:async()=>manifest};};
  assert.equal(await source.loadPassages(catalog,"v54",fetcher,webcrypto),"available");
  assert.deepEqual(fetches,["source-passages.json?v54"],"never fetch Drive content or authentication");
  for(const fetcher of [async()=>{throw Error("offline");},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error("bad JSON");}}),async()=>({ok:true,json:async()=>({...manifest,version:9})})]) {
    assert.equal(await source.loadPassages(catalog,"test",fetcher,webcrypto),"unavailable");
    assert.equal(catalog.passages.size,0);html=source.renderChoiceLinks(catalog,question,0);
    assert.match(html,/共有画像を読み込めません/);assert.match(html,/端末のPDFで確認/);assert.doesNotMatch(html,/href=/);
  }
  assert.equal(await source.loadPassages(catalog,"test",async()=>({ok:true,json:async()=>emptyManifest}),webcrypto),"unconfigured");
  assert.match(source.renderChoiceLinks(catalog,question,0),/準備中/);
  console.log("PASS restricted Drive schema, identities, unsafe URLs, failure fallback, snapshot/variant/order, pre-answer gating and no remote content fetch");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
