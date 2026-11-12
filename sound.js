"use strict";

// Short, locally generated cues: no audio downloads, tracking or speech.
(() => {
  const STORAGE_KEY = "bierkompass-sound-v1";
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const button = document.querySelector("#soundToggle");
  let enabled = true;
  try { enabled = localStorage.getItem(STORAGE_KEY) !== "off"; } catch { /* Private browsing can block storage. */ }
  let context = null;
  let ready = null;
  let generation = 0;
  const voices = new Set();
  // [frequency (Hz), start (seconds), duration (seconds)]
  const cues = {
    correct: [[659.25, 0, .12], [880, .13, .22]],
    incorrect: [[220, 0, .16], [164.81, .18, .23]],
    streak: [[783.99, 0, .10], [1046.5, .11, .10], [1318.51, .22, .10], [1567.98, .33, .12], [1046.5, .49, .32], [1567.98, .49, .32]],
    complete: [[523.25, 0, .13], [659.25, .15, .13], [783.99, .30, .28]],
    pass: [[523.25, 0, .14], [659.25, .16, .14], [783.99, .32, .14], [1046.5, .50, .44], [659.25, .50, .44]],
    fail: [[349.23, 0, .22], [293.66, .25, .22], [261.63, .50, .38]],
  };

  function render() {
    if (!button) return;
    button.disabled = !AudioContext;
    button.textContent = !AudioContext ? "音 非対応" : enabled ? "🔊 音 ON" : "🔇 音 OFF";
    button.setAttribute("aria-pressed", String(Boolean(AudioContext && enabled)));
    button.setAttribute("aria-label", !AudioContext ? "このブラウザーは効果音に対応していません" : `効果音 ${enabled ? "オン。オフにする" : "オフ。オンにする"}`);
    button.title = !AudioContext ? "効果音なしで学習できます" : "正解・不正解・5問ごとの連続正解・学習完了・模試の合否を効果音でお知らせします";
  }

  function stop() {
    generation += 1;
    for (const voice of voices) {
      try { voice.oscillator.stop(); } catch { /* Already ended. */ }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
  }

  // Called inside a real pointer/keyboard/click gesture, never on page load.
  function unlock() {
    if (!enabled || !AudioContext || document.hidden) return;
    try {
      if (!context || context.state === "closed") context = new AudioContext();
      if (context.state !== "running" && !ready) {
        ready = Promise.resolve(context.resume()).catch(() => {}).finally(() => { ready = null; });
      }
    } catch { /* Audio must never prevent answering or scoring. */ }
  }

  function play(name) {
    if (!enabled || !cues[name] || !context || document.hidden) return;
    stop();
    const ticket = generation;
    const startedAt = Date.now();
    const schedule = () => {
      // Do not replay old cues after a mute, backgrounding, or delayed resume.
      if (ticket !== generation || !enabled || document.hidden || context.state !== "running" || Date.now() - startedAt > 1000) return;
      try {
        const start = context.currentTime + .01;
        for (const [frequency, offset, duration] of cues[name]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const voice = { oscillator, gain };
          voices.add(voice);
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start + offset);
          gain.gain.setValueAtTime(0, start + offset);
          gain.gain.linearRampToValueAtTime(.09, start + offset + .012);
          gain.gain.exponentialRampToValueAtTime(.001, start + offset + duration);
          gain.gain.linearRampToValueAtTime(0, start + offset + duration + .02);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices.delete(voice); };
          oscillator.start(start + offset);
          oscillator.stop(start + offset + duration + .03);
        }
      } catch { stop(); }
    };
    if (context.state === "running") schedule();
    else if (ready) ready.then(schedule);
  }

  button?.addEventListener("click", () => {
    enabled = !enabled;
    try { localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off"); } catch { /* Keep the switch usable without storage. */ }
    render();
    if (enabled) { unlock(); play("correct"); }
    else stop();
  });
  for (const event of ["pointerdown", "keydown", "click"]) {
    document.addEventListener(event, (event) => { if (event.isTrusted) unlock(); }, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("pagehide", stop);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    enabled = event.newValue !== "off";
    render();
    stop();
  });
  render();
  window.BierKompassSound = Object.freeze({ play, stop });
})();
