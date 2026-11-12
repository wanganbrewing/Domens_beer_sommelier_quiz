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
  // Additive chimes and a sustained buzzer are intentionally more recognisable
  // than plain sine beeps. Keep individual levels modest when partials overlap.
  const bell = (frequency, offset, duration, level = .22) => [
    { frequency, offset, duration, type: "sine", level },
    { frequency: frequency * 2.76, offset, duration: duration * .48, type: "sine", level: level * .24 },
    { frequency: frequency * 5.4, offset, duration: duration * .24, type: "sine", level: level * .08 },
  ];
  const buzz = (frequency, offset, duration, level = .18) => [
    { frequency, offset, duration, type: "sawtooth", level, sustain: true },
    { frequency: frequency * 1.012, offset, duration, type: "square", level: level * .38, sustain: true },
  ];
  const cues = {
    // A clear two-part "pin-pon": high strike, then a lower ringing answer.
    correct: [...bell(1046.5, 0, .36), ...bell(783.99, .27, .74)],
    // One low, sustained "boo", with a little beating between the two voices.
    incorrect: buzz(130.81, 0, .58),
    // Rapid alternating bell strikes, followed by a brighter final ring.
    streak: [...Array.from({ length: 7 }, (_, i) => bell(i % 2 ? 1760 : 1567.98, i * .14, .43, .18)).flat(), ...bell(2093, 1.02, .68, .22)],
    complete: [...bell(523.25, 0, .24, .18), ...bell(659.25, .19, .24, .18), ...bell(783.99, .38, .55, .20)],
    pass: [...bell(523.25, 0, .26), ...bell(659.25, .19, .26), ...bell(783.99, .38, .26), ...bell(1046.5, .62, .85), ...bell(659.25, .62, .85, .12)],
    fail: [...buzz(196, 0, .24, .13), ...buzz(164.81, .29, .24, .13), ...buzz(130.81, .58, .48, .14)],
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
        for (const { frequency, offset, duration, type, level, sustain } of cues[name]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const voice = { oscillator, gain };
          voices.add(voice);
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency, start + offset);
          gain.gain.setValueAtTime(0, start + offset);
          gain.gain.linearRampToValueAtTime(level, start + offset + .008);
          if (sustain) {
            gain.gain.setValueAtTime(level, start + offset + duration - .10);
            gain.gain.linearRampToValueAtTime(0, start + offset + duration);
          } else {
            gain.gain.exponentialRampToValueAtTime(.001, start + offset + duration);
          }
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
