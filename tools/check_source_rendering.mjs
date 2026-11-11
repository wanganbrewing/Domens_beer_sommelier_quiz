// Optional local QA. Input JSON maps manifest document IDs to local PDF paths.
// No PDF data or rendered output is written into the repository or sent anywhere.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import crypto from "node:crypto";
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const canvas=require(process.env.PDF_CANVAS_MODULE || "@napi-rs/canvas");
for (const key of ["DOMMatrix","ImageData","Path2D"]) globalThis[key] ||= canvas[key];
const pdfjs=await import(pathToFileURL(path.join(root,"vendor/pdfjs/pdf.min.mjs")));
pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(root,"vendor/pdfjs/pdf.worker.min.mjs")).href;
const manifest=JSON.parse(fs.readFileSync(path.join(root,"source-links.json")));
const paths=JSON.parse(fs.readFileSync(process.argv[2]));
const output=process.argv[3];
if(output) fs.mkdirSync(output,{recursive:true});
function createResourceFactory(baseURL, fetcher = globalThis.fetch.bind(globalThis)) {
  let resources;
  const wasm = new Set(["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"]);
  return class LocalBinaryDataFactory {
    async fetch({kind, filename}) {
      if (kind === "wasmUrl" && wasm.has(filename)) {
        const response = await fetcher(new URL(`wasm/${filename}`, baseURL));
        if (!response.ok) throw new Error("PDF描画部品を読み込めませんでした。");
        return new Uint8Array(await response.arrayBuffer());
      }
      const folder = {cMapUrl: "cmaps", standardFontDataUrl: "standard_fonts"}[kind];
      if (!folder || typeof filename !== "string") throw new Error("未対応のPDF描画部品です。");
      if (!resources) resources = Promise.all([fetcher(new URL("resources.json", baseURL)), fetcher(new URL("resources.bin", baseURL))]).then(async ([index, bytes]) => {
        if (!index.ok || !bytes.ok) throw new Error("PDFの文字データを読み込めませんでした。");
        return [await index.json(), await bytes.arrayBuffer()];
      }).catch(error => { resources = null; throw error; });
      const [index, buffer] = await resources;
      const entry = index[`${folder}/${filename}`];
      if (!Array.isArray(entry) || entry.length !== 2) throw new Error("未対応のPDF文字データです。");
      return new Uint8Array(buffer.slice(entry[0], entry[0] + entry[1]));
    }
  };
}

const base=pathToFileURL(path.join(root,"vendor/pdfjs/") + path.sep);
const Factory=createResourceFactory(base,async url=>{
  const location=fileURLToPath(url);
  if(!location.startsWith(fileURLToPath(base))) throw new Error("Unexpected asset path");
  const data=fs.readFileSync(location);
  return {ok:true,json:async()=>JSON.parse(data),arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
});
class CanvasFactory {
  create(width,height){const item=canvas.createCanvas(width,height);return {canvas:item,context:item.getContext("2d")};}
  reset(item,width,height){item.canvas.width=width;item.canvas.height=height;}
  destroy(item){item.canvas.width=0;item.canvas.height=0;item.canvas=null;item.context=null;}
}
const byHash=new Map();
for(const descriptor of manifest.documents){
  const refs=manifest.questions.flatMap(q=>q.choices.flatMap(c=>c.refs.filter(r=>r.documentId===descriptor.id)));
  const group=byHash.get(descriptor.sha256)||{descriptor,pages:new Set()};
  refs.forEach(r=>group.pages.add(r.page));byHash.set(descriptor.sha256,group);
}
let count=0;
for(const {descriptor,pages} of byHash.values()){
  const raw=fs.readFileSync(paths[descriptor.id]);
  if (!raw.length || raw.length > 100*1024*1024) throw new Error("Invalid source PDF size");
  if (crypto.createHash("sha256").update(raw).digest("hex") !== descriptor.sha256) throw new Error(`Source PDF does not match: ${descriptor.id}`);
  const bytes=new Uint8Array(raw);
  const task=pdfjs.getDocument({data:bytes.slice(),CanvasFactory,BinaryDataFactory:Factory,useWorkerFetch:false,
    cMapUrl: new URL("cmaps/",base).href,standardFontDataUrl:new URL("standard_fonts/",base).href,wasmUrl:new URL("wasm/",base).href,
    cMapPacked:true,isEvalSupported:false,enableXfa:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true});
  const pdf=await task.promise;
  if(bytes.byteLength!==raw.byteLength) throw new Error("Verification buffer was detached");
  if(pdf.numPages!==descriptor.pageCount) throw new Error(`${descriptor.id}: page count mismatch`);
  let saved=false;
  for(const number of [...pages].sort((a,b)=>a-b)){
    const page=await pdf.getPage(number), natural=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:900/natural.width});
    const surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvasContext:surface.getContext("2d"),viewport,annotationMode:0}).promise;
    const image=surface.getContext("2d").getImageData(0,0,surface.width,surface.height).data;
    let dark=0;for(let i=0;i<image.length;i+=4) if(image[i]+image[i+1]+image[i+2]<600) dark++;
    if(dark<20) throw new Error(`${descriptor.id} page ${number}: unexpectedly blank rendering`);
    if(output&&!saved){fs.writeFileSync(path.join(output,`${descriptor.id}-p${number}.png`),surface.toBuffer("image/png"));saved=true;}
    page.cleanup();count++;
  }
  await pdf.destroy();console.log(`PASS ${descriptor.id}: ${pages.size} referenced pages`);
}
console.log(`PASS ${count} referenced pages across ${byHash.size} unique PDF files; local-only rendering`);
