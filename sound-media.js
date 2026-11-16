"use strict";

// Use the normal media playback path on iPhone/iPad, not an ambient Web Audio
// session. All short WAV clips are generated locally from the same cue notes.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BierKompassMediaSound = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function supported(host) {
    return Boolean(host.Audio && host.Blob && host.URL?.createObjectURL);
  }

  function wav(notes, rate = 24000) {
    const duration = notes.length ? Math.max(...notes.map(n => n.offset + n.duration + .03)) : .02;
    const samples = new Float32Array(Math.ceil(duration * rate));
    for (const { frequency, offset, duration, type, level, sustain } of notes) {
      for (let i = Math.floor(offset * rate); i < Math.min(samples.length, Math.ceil((offset + duration + .02) * rate)); i++) {
        const t = i / rate - offset;
        if (t < 0) continue;
        let gain;
        if (t < .008) gain = level * t / .008;
        else if (sustain) gain = t < duration - .1 ? level : Math.max(0, level * (duration - t) / .1);
        else if (t <= duration) gain = level * Math.pow(.001 / level, (t - .008) / (duration - .008));
        else gain = .001 * Math.max(0, 1 - (t - duration) / .02);
        const phase = (frequency * t) % 1;
        const wave = type === "sine" ? Math.sin(phase * 2 * Math.PI) : type === "square" ? (phase < .5 ? 1 : -1) : 2 * phase - 1;
        samples[i] += gain * wave;
      }
    }
    const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
    const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-.95, Math.min(.95, sample)) * 32767), true));
    return bytes;
  }

  function create(cues, host) {
    if (!supported(host)) return null;
    const player = new host.Audio(), urls = new Map();
    player.preload = "auto";
    player.loop = false;
    let generation = 0, stopped = true, unlocked = false;
    function url(name) {
      if (!urls.has(name)) urls.set(name, host.URL.createObjectURL(new host.Blob([wav(name === "unlock" ? [] : cues[name])], { type: "audio/wav" })));
      return urls.get(name);
    }
    function stop() {
      generation += 1;
      stopped = true;
      player.pause();
      try { player.currentTime = 0; } catch { /* No decoded source yet. */ }
    }
    function play(name) {
      if (name !== "unlock" && !cues[name]) return;
      stop();
      const ticket = generation, startedAt = Date.now();
      stopped = false;
      try {
        player.src = url(name);
        // Keep play() in the original tap handler: no fetch, canplay or await.
        const result = player.play();
        Promise.resolve(result).then(() => {
          unlocked = true;
          // An old Promise must not pause a newer cue on this reused element.
          if (stopped || (ticket === generation && Date.now() - startedAt > 1000)) {
            player.pause();
            if (ticket === generation) stopped = true;
          }
        }).catch(() => { /* The next explicit gesture may retry; the quiz keeps working. */ });
      } catch { /* Unsupported playback must not break answering or scoring. */ }
    }
    function unlock() {
      // One 20 ms silent clip within an explicit gesture also enables a later
      // timed-exam result. Never loop silence or start anything on page load.
      if (!unlocked && player.paused) play("unlock");
    }
    return Object.freeze({ play, stop, unlock });
  }
  return Object.freeze({ supported, create, wav });
});
