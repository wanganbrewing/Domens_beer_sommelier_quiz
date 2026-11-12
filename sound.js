"use strict";

// Short, locally generated cues: no audio downloads, tracking or speech.
(() => {
  const STORAGE_KEY = "bierkompass-sound-v1";
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const button = document.querySelector("#soundToggle");
  const testButton = document.querySelector("#testSoundButton");
  const status = document.querySelector("#soundStatus");
  let previousAudioSessionType = null;
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

  function showStatus(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  // iOS Web Audio defaults to an ambient session, which can follow the silent
  // switch even when the AudioContext says "running". Supported Safari versions
  // can select the normal media playback category instead. Older browsers keep
  // working and may still require turning off the device's silent mode.
  function usePlaybackSession() {
    try {
      const session = window.navigator?.audioSession;
      if (!session || session.type === "playback") return;
      previousAudioSessionType ??= session.type;
      session.type = "playback";
    } catch { /* Experimental API may be absent or controlled by the host app. */ }
  }
  function releasePlaybackSession() {
    try {
      const session = window.navigator?.audioSession;
      if (session && previousAudioSessionType !== null && session.type === "playback") session.type = previousAudioSessionType;
    } catch { /* Do not let an unsupported session API break quiz controls. */ }
    previousAudioSessionType = null;
  }
  function showPlaybackHelp() {
    showStatus("音を開始できませんでした。「音を試す」をもう一度タップしてください。アプリ内で開いている場合はSafariで開いてください。");
  }

  function render() {
    if (!button) return;
    button.disabled = !AudioContext;
    if (testButton) testButton.disabled = !AudioContext || !enabled;
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

  // Retry on each new usable gesture, including touchend/pointerup on iPhone.
  // An earlier resume() can remain pending; it must not block a later tap.
  function unlock(showHelp = false) {
    if (!enabled || !AudioContext || document.hidden) return;
    try {
      usePlaybackSession();
      if (!context || context.state === "closed") context = new AudioContext();
      if (context.state !== "running") {
        const attempt = Promise.resolve(context.resume()).catch(() => {
          if (showHelp && enabled && !document.hidden && ready === attempt && context.state !== "running") showPlaybackHelp();
        }).finally(() => { if (ready === attempt) ready = null; });
        ready = attempt;
      }
    } catch { if (showHelp) showPlaybackHelp(); }
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
    else { stop(); releasePlaybackSession(); showStatus(""); }
  });
  testButton?.addEventListener("click", () => {
    if (!enabled || !AudioContext) return;
    showStatus("テスト音が聞こえない場合は、iPhoneのメディア音量とBluetooth等の出力先を確認してください。消音モードの解除や、Safariでの再表示もお試しください。");
    unlock(true);
    play("correct");
  });
  for (const event of ["touchend", "pointerup", "keydown", "click"]) {
    document.addEventListener(event, (event) => { if (event.isTrusted) unlock(); }, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { stop(); releasePlaybackSession(); } });
  window.addEventListener("pagehide", () => { stop(); releasePlaybackSession(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    enabled = event.newValue !== "off";
    render();
    stop();
    if (!enabled) { releasePlaybackSession(); showStatus(""); }
  });
  render();
  window.BierKompassSound = Object.freeze({ play, stop });
})();
