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
const api=require(path.join(root,"source-viewer.js"));
const manifest=JSON.parse(fs.readFileSync(path.join(root,"source-links.json")));
const paths=JSON.parse(fs.readFileSync(process.argv[2]));
const output=process.argv[3];
if(output) fs.mkdirSync(output,{recursive:true});
const base=pathToFileURL(path.join(root,"vendor/pdfjs/") + path.sep);
const Factory=api.createResourceFactory(base,async url=>{
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
  const bytes=await api.verifyFile({size:raw.length,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)},descriptor,crypto.webcrypto);
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
