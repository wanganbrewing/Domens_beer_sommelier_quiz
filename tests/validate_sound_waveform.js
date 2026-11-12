"use strict";
// Render the same oscillator/envelope descriptions as PCM for objective audio QA.
// This is not a substitute for listening on the user's phone or Safari.
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path"), assert = require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../sound.js"),"utf8");
const window={addEventListener(){}}, document={querySelector(){return null;},addEventListener(){}};
vm.runInNewContext(source.replace("  function render() {","  window.testCues = cues;\n  function render() {"),{window,document,localStorage:{getItem(){return null;}},console});
const rate=48000, summaries=[];
for(const [name,notes] of Object.entries(window.testCues)) {
  const duration=Math.max(...notes.map(n=>n.offset+n.duration+.03)), pcm=new Float64Array(Math.ceil(duration*rate));
  for(const {frequency,offset,duration,type,level,sustain} of notes) {
    assert.ok(frequency>0 && frequency<rate/2 && level>0 && level<=.25);
    for(let i=Math.floor(offset*rate);i<Math.min(pcm.length,Math.ceil((offset+duration+.02)*rate));i++) {
      const t=i/rate-offset;if(t<0)continue;
      let gain;
      if(t<.008)gain=level*t/.008;
      else if(sustain)gain=t<duration-.1?level:Math.max(0,level*(duration-t)/.1);
      else if(t<=duration)gain=level*Math.pow(.001/level,(t-.008)/(duration-.008));
      else gain=.001*Math.max(0,1-(t-duration)/.02);
      const phase=(frequency*t)%1;
      const wave=type==="sine"?Math.sin(phase*2*Math.PI):type==="square"?(phase<.5?1:-1):2*phase-1;
      pcm[i]+=gain*wave;
    }
  }
  const peak=pcm.reduce((m,v)=>Math.max(m,Math.abs(v)),0), rms=Math.sqrt(pcm.reduce((s,v)=>s+v*v,0)/pcm.length);
  assert.ok(peak<.9,`${name} has output headroom, not clipped: ${peak}`);
  assert.ok(rms>.035,`${name} has meaningful audible energy: ${rms}`);
  assert.ok(duration<2,`${name} remains brief`);
  assert.ok(Math.abs(pcm[0])<.001 && Math.abs(pcm.at(-1))<.001,`${name} begins and ends without a hard edge`);
  summaries.push({name,duration:Number(duration.toFixed(2)),peak:Number(peak.toFixed(3)),rms:Number(rms.toFixed(3))});
  // Optional local previews, never generated into the public site automatically.
  if(process.env.AUDIO_PREVIEW_DIR){
    fs.mkdirSync(process.env.AUDIO_PREVIEW_DIR,{recursive:true});
    const data=Buffer.alloc(44+pcm.length*2);data.write("RIFF");data.writeUInt32LE(data.length-8,4);data.write("WAVEfmt ",8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write("data",36);data.writeUInt32LE(pcm.length*2,40);pcm.forEach((v,i)=>data.writeInt16LE(Math.round(v*32767),44+i*2));fs.writeFileSync(path.join(process.env.AUDIO_PREVIEW_DIR,`${name}.wav`),data);
  }
}
console.log("PASS PCM cue checks: no clipping, short distinct patterns, stronger levels, smooth edges",JSON.stringify(summaries));
