"use strict";
// Validate metadata only. This never contacts Drive or uploads any source files.
const fs = require("node:fs");
const path = require("node:path");
const {webcrypto} = require("node:crypto");
const root = path.resolve(__dirname,"..");
const source = require(path.join(root,"source-viewer"));
async function main() {
  const args=process.argv.slice(2), strict=args.includes("--require-complete");
  const input=args.find(x=>x!=="--require-complete") || path.join(root,"source-passages.json");
  const bank=require(path.join(root,"questions.json"));
  const variants=require(path.join(root,"choice-variants")).createCatalog(bank.questions,require(path.join(root,"choice-variants.json")));
  const catalog=await source.createCatalog(require(path.join(root,"source-links.json")),bank.questions,variants,webcrypto);
  const passages=await source.createPassageCatalog(JSON.parse(fs.readFileSync(input,"utf8")),catalog,webcrypto);
  const refs=[...catalog.groups.values()].flatMap(g=>[...g.choices.values()].flat());
  const keys=new Set(refs.map(r=>r.passageKey));
  const covered=refs.filter(r=>passages.has(r.passageKey)).length;
  console.log(`Valid metadata: ${passages.size}/${keys.size} unique images; ${covered}/${refs.length} reference links.`);
  console.log("This check does not verify Drive existence, image bytes, permission ACLs, or connector readback provenance. Verify those separately before deployment.");
  if(passages.size<keys.size){console.log("NOT READY: Drive image mappings are incomplete; unmapped image links remain unavailable.");if(strict)process.exitCode=1;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
