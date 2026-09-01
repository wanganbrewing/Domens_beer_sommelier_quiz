"use strict";

(() => {
  const { escapeHtml, goHome, showView, shuffle, sameSet } = window.BierKompass;
  const HISTORY_KEY = "bierkompass-blind-history-v3";
  const STAGES = ["観察整理", "特徴定義", "原材料・工程", "発酵系統", "候補除外", "スタイル結論"];
  const FAMILY_LABELS = { Lager: "下面発酵（ラガー）", Ale: "上面発酵（エール）", Spontaneous: "自然発酵", Farmhouse: "農家醸造系" };
  const byId = (id) => document.getElementById(id);
  let blindData = null;
  let dataPromise = null;
  let state = null;
  let timerHandle = null;

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function loadData() {
    dataPromise ||= fetch("blind-tasting.json?v35", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`判定データを取得できませんでした (${response.status})`);
      return response.json();
    });
    return dataPromise;
  }

  function scenarioById(id) { return blindData.scenarios.find((scenario) => scenario.id === id); }
  function currentScenario() { return scenarioById(state.queue[state.queueIndex]); }
  function currentHistory() { return loadJson(HISTORY_KEY, {}); }
  function setMessage(message = "") { byId("blindQuizMessage").textContent = message; }

  function startBlindQuiz() {
    const message = byId("blindCornerMessage");
    message.textContent = "判定データを読み込んでいます…";
    loadData().then((payload) => {
      blindData = payload;
      state = { screen: "setup" };
      message.textContent = "";
      showView("blindQuiz");
      render();
    }).catch((error) => { message.textContent = error.message; });
  }

  function closeBlindQuiz() {
    clearInterval(timerHandle);
    state = null;
    goHome();
  }

  function renderSetup() {
    const countries = blindData.metadata.countries.map((country) => `
      <label class="blind-filter"><input type="checkbox" name="blind-country" value="${escapeHtml(country.id)}" checked><span>${escapeHtml(country.label)} <small>${country.count}件</small></span></label>`).join("");
    return `<div class="style-step-heading"><p class="eyebrow">BLIND TASTING · SETUP</p><h1>判定トレーニングを選ぶ</h1><p>添付仕様の全58シナリオから、国・難易度を指定して出題します。</p></div>
      <div class="blind-setup-grid">
        <fieldset class="blind-setup-card"><legend>モード</legend>
          <label class="blind-mode"><input type="radio" name="blind-mode" value="practice" checked><span><b>練習モード</b><small>1問ずつ・ヒントあり</small></span></label>
          <label class="blind-mode"><input type="radio" name="blind-mode" value="exam"><span><b>試験モード</b><small>ランダム10問・1問3分</small></span></label>
          <label class="blind-mode"><input type="radio" name="blind-mode" value="weak"><span><b>弱点モード</b><small>除外操作を誤った問題を優先</small></span></label>
        </fieldset>
        <fieldset class="blind-setup-card"><legend>国・地域</legend><div class="blind-filter-grid">${countries}</div></fieldset>
        <fieldset class="blind-setup-card"><legend>難易度</legend><div class="blind-filter-grid">
          <label class="blind-filter"><input type="checkbox" name="blind-difficulty" value="1" checked><span>★ 基本</span></label>
          <label class="blind-filter"><input type="checkbox" name="blind-difficulty" value="2" checked><span>★★ 識別</span></label>
          <label class="blind-filter"><input type="checkbox" name="blind-difficulty" value="3" checked><span>★★★ 微差</span></label>
        </div></fieldset>
      </div>`;
  }

  function selectedSetupValues(name) {
    return [...byId("blindQuizBody").querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  function startConfiguredSession() {
    const mode = byId("blindQuizBody").querySelector('input[name="blind-mode"]:checked')?.value || "practice";
    const countries = selectedSetupValues("blind-country");
    const difficulties = selectedSetupValues("blind-difficulty").map(Number);
    let pool = blindData.scenarios.filter((scenario) => countries.includes(scenario.country) && difficulties.includes(scenario.difficulty));
    if (!pool.length) return setMessage("条件に合うシナリオがありません。国・難易度を選び直してください。");
    if (mode === "weak") {
      const history = currentHistory();
      pool = pool.filter((scenario) => (history[scenario.id]?.weakExclusion || 0) > 0);
      if (!pool.length) return setMessage("この条件には除外操作の弱点記録がありません。練習モードで回答すると記録されます。");
      pool.sort((a, b) => (history[b.id]?.weakExclusion || 0) - (history[a.id]?.weakExclusion || 0));
    } else {
      pool = shuffle(pool);
    }
    if (mode === "exam" && pool.length < 10) return setMessage(`試験モードには10件以上必要です（現在${pool.length}件）。条件を広げてください。`);
    const count = mode === "exam" ? 10 : 1;
    state = { screen: "question", mode, queue: pool.slice(0, count).map((scenario) => scenario.id), queueIndex: 0, results: [] };
    beginScenario();
  }

  function uniqueOptions(correct, pool, extraCount) {
    const result = [...new Set(correct)];
    for (const item of shuffle(pool)) {
      if (result.length >= correct.length + extraCount) break;
      if (item && !result.includes(item)) result.push(item);
    }
    return shuffle(result);
  }

  function beginScenario() {
    clearInterval(timerHandle);
    const target = currentScenario();
    const others = blindData.scenarios.filter((scenario) => scenario.id !== target.id);
    state.stage = 0;
    state.finished = false;
    state.hintOpen = false;
    state.answers = { step1: [], step2: "", step3: [], family: "", exclusions: [], reasons: [], final: null };
    state.options = {
      step1: uniqueOptions(target.step1InterpretationsJa, others.flatMap((scenario) => scenario.step1InterpretationsJa), 3),
      step2: shuffle([{ id: target.id, label: target.step2Characteristic }, ...shuffle(others).slice(0, 3).map((scenario) => ({ id: scenario.id, label: scenario.step2Characteristic }))]),
      step3: uniqueOptions(target.step3IngredientsProcess, others.flatMap((scenario) => scenario.step3IngredientsProcess), 3),
      choices: shuffle(target.choices.map((label, index) => ({ index, label }))),
      reasons: uniqueOptions(target.exclusions.map((item) => item.reason), others.flatMap((scenario) => scenario.exclusions.map((item) => item.reason)), 1),
    };
    if (state.mode === "exam") {
      state.deadline = Date.now() + blindData.metadata.secondsPerScenario * 1000;
      timerHandle = setInterval(tickTimer, 1000);
    }
    render();
  }

  function tickTimer() {
    if (!state || byId("blindQuizView").hidden || state.finished) return clearInterval(timerHandle);
    const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    updateStepLabel(remaining);
    if (!remaining) finishScenario(true);
  }

  function updateStepLabel(remaining = null) {
    if (!state || state.screen === "setup") return byId("blindQuizStepLabel").textContent = "SETUP";
    if (state.screen === "summary") return byId("blindQuizStepLabel").textContent = "EXAM RESULT";
    if (state.finished) return byId("blindQuizStepLabel").textContent = state.mode === "exam" ? `RESULT ${state.queueIndex + 1} / ${state.queue.length}` : "RESULT";
    const prefix = state.mode === "exam" ? `${state.queueIndex + 1} / ${state.queue.length} · ` : "";
    const timer = remaining === null || state.mode !== "exam" ? "" : ` · ${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    byId("blindQuizStepLabel").textContent = `${prefix}${STAGES[state.stage]}${timer}`;
  }

  function blindCard(target, compact = false) {
    const card = target.blindCard;
    return `<section class="blind-card ${compact ? "compact" : ""}"><div class="blind-card-head"><span>${escapeHtml(target.id)}</span><b>${"★".repeat(target.difficulty)}</b></div><dl>
      <div><dt>外観</dt><dd>${escapeHtml(card.appearance)}</dd></div><div><dt>アロマ</dt><dd>${escapeHtml(card.aroma)}</dd></div>
      <div><dt>味</dt><dd>${escapeHtml(card.taste)}</dd></div><div><dt>マウスフィール</dt><dd>${escapeHtml(card.mouthfeel)}</dd></div>
    </dl></section>`;
  }

  function checks(name, options, selected, className = "") {
    return `<div class="blind-option-grid ${className}">${options.map((option, index) => {
      const value = typeof option === "object" ? option.value : option;
      const label = typeof option === "object" ? option.label : option;
      return `<label class="blind-option"><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${selected.includes(String(value)) ? "checked" : ""}><span>${String.fromCharCode(65 + index)}</span><b>${escapeHtml(label)}</b></label>`;
    }).join("")}</div>`;
  }

  function radios(name, options, selected, className = "") {
    return `<div class="blind-option-grid ${className}">${options.map((option, index) => {
      const value = typeof option === "object" ? option.value : option;
      const label = typeof option === "object" ? option.label : option;
      return `<label class="blind-option"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${String(selected) === String(value) ? "checked" : ""}><span>${String.fromCharCode(65 + index)}</span><b>${escapeHtml(label)}</b></label>`;
    }).join("")}</div>`;
  }

  function hint(target) {
    if (state.mode === "exam") return "";
    const hints = ["観察語を、外観・香り・味の順に整理します。", `決定軸は「${target.step2Characteristic}」です。`, "香味の原因を麦芽・ホップ・酵母・水・特殊工程へ逆算します。", "エステルやフェノール、野生香の有無を先に確認します。", "正答候補以外の3スタイルを、観察情報と矛盾する理由で除外します。", "除外せず残した候補から最終スタイルを選びます。"][state.stage];
    return `<div class="blind-hint"><button type="button" class="text-button" id="blindHintButton">${state.hintOpen ? "ヒントを閉じる" : "ヒントを見る"}</button>${state.hintOpen ? `<p>${escapeHtml(hints)}</p>` : ""}</div>`;
  }

  function renderStage(target) {
    const compactCard = state.stage > 0;
    let content = "";
    if (state.stage === 0) content = `<div class="style-step-heading"><p class="eyebrow">STEP 1 · 観察整理</p><h1>観察から方向性を判断する</h1><p>カードの文章を手掛かりに、スタイル識別に使える方向性をすべて選んでください。選択肢は観察文の言い換えではなく、香味・外観の判断軸です。</p></div>${blindCard(target)}${checks("blind-step1", state.options.step1, state.answers.step1)}`;
    if (state.stage === 1) content = `<div class="style-step-heading"><p class="eyebrow">STEP 2 · 特徴定義</p><h1>最大の特徴を定義する</h1><p>このビールを最も強く決定づける特徴を1つ選んでください。</p></div>${blindCard(target, compactCard)}${radios("blind-step2", state.options.step2.map((item) => ({ value: item.id, label: item.label })), state.answers.step2)}`;
    if (state.stage === 2) content = `<div class="style-step-heading"><p class="eyebrow">STEP 3 · 原材料・工程</p><h1>原材料・工程を逆算する</h1><p>観察情報から考えられる原材料・工程をすべて選んでください。</p></div>${blindCard(target, compactCard)}${checks("blind-step3", state.options.step3, state.answers.step3)}`;
    if (state.stage === 3) content = `<div class="style-step-heading"><p class="eyebrow">STEP 4.1 · 発酵系統</p><h1>発酵系統を判定する</h1><p>クリーンさだけで即断せず、例外も考慮して1つ選んでください。</p></div>${blindCard(target, compactCard)}${radios("blind-family", Object.entries(FAMILY_LABELS).map(([value, label]) => ({ value, label })), state.answers.family)}`;
    if (state.stage === 4) {
      const wrongIndexes = target.choices.map((_, index) => index).filter((index) => index !== target.correctChoice);
      content = `<div class="style-step-heading"><p class="eyebrow">STEP 4.2 · 候補除外</p><h1>候補を理由とともに除外する</h1><p>除外できるスタイル3つと、成立する除外理由3つを選んでください。</p></div>${blindCard(target, true)}
        <h2 class="blind-subheading">除外するスタイル</h2>${checks("blind-exclusions", state.options.choices.map((item) => ({ value: item.index, label: item.label })), state.answers.exclusions.map(String))}
        <h2 class="blind-subheading">除外理由</h2>${checks("blind-reasons", state.options.reasons, state.answers.reasons)}
        <p class="blind-selection-note">正しい除外対象は${wrongIndexes.length}件です。理由も観察情報と照合してください。</p>`;
    }
    if (state.stage === 5) {
      const remaining = state.options.choices.filter((item) => !state.answers.exclusions.includes(item.index));
      content = `<div class="style-step-heading"><p class="eyebrow">STEP 4.3 · スタイル結論</p><h1>最終スタイルを選ぶ</h1><p>除外せず残した候補から、最も合致するスタイルを1つ選んでください。</p></div>${blindCard(target, true)}
        <section class="blind-reasoning-summary"><div><span>特徴</span><b>${escapeHtml(state.options.step2.find((item) => item.id === state.answers.step2)?.label || "未回答")}</b></div><div><span>発酵系統</span><b>${escapeHtml(FAMILY_LABELS[state.answers.family] || "未回答")}</b></div><div><span>残った候補</span><b>${remaining.length}件</b></div></section>
        ${remaining.length ? radios("blind-final", remaining.map((item) => ({ value: item.index, label: item.label })), state.answers.final) : `<div class="no-style-candidates"><strong>候補をすべて除外しています</strong><p>「前へ戻る」から除外対象を見直してください。</p></div>`}`;
    }
    return content + hint(target);
  }

  function selectionPoints(selected, correct, maximum) {
    const selectedSet = new Set(selected);
    const correctSet = new Set(correct);
    const truePositive = [...selectedSet].filter((item) => correctSet.has(item)).length;
    const falsePositive = [...selectedSet].filter((item) => !correctSet.has(item)).length;
    return Math.round(Math.max(0, maximum * (truePositive - falsePositive) / Math.max(1, correctSet.size)) * 10) / 10;
  }

  function sameStringSet(left, right) {
    return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
  }

  function scoreScenario(target) {
    const wrongIndexes = target.choices.map((_, index) => index).filter((index) => index !== target.correctChoice);
    const correctReasons = target.exclusions.map((item) => item.reason);
    const step1 = selectionPoints(state.answers.step1, target.step1InterpretationsJa, 2);
    const step2 = state.answers.step2 === target.id ? 2 : 0;
    const step3 = selectionPoints(state.answers.step3, target.step3IngredientsProcess, 2);
    const family = state.answers.family === target.fermentationFamily ? 1 : 0;
    const exclusionStyles = sameSet(state.answers.exclusions, wrongIndexes) ? 1 : 0;
    const exclusionReasons = sameStringSet(state.answers.reasons, correctReasons) ? 1 : 0;
    const final = state.answers.final !== null && Number(state.answers.final) === target.correctChoice ? 1 : 0;
    return { step1, step2, step3, family, exclusionStyles, exclusionReasons, final, total: step1 + step2 + step3 + family + exclusionStyles + exclusionReasons + final };
  }

  function finishScenario(timedOut = false) {
    if (state.finished) return;
    clearInterval(timerHandle);
    const target = currentScenario();
    const score = scoreScenario(target);
    state.finished = true;
    state.timedOut = timedOut;
    state.currentScore = score;
    state.results.push({ id: target.id, score: score.total, exclusionCorrect: score.exclusionStyles + score.exclusionReasons === 2 });
    const history = currentHistory();
    const item = history[target.id] || { attempts: 0, totalPoints: 0, best: 0, weakExclusion: 0 };
    item.attempts += 1;
    item.totalPoints += score.total;
    item.best = Math.max(item.best, score.total);
    if (score.exclusionStyles + score.exclusionReasons < 2) item.weakExclusion += 1;
    else item.weakExclusion = Math.max(0, item.weakExclusion - 1);
    item.lastAnsweredAt = new Date().toISOString();
    history[target.id] = item;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    render();
  }

  function resultRow(label, points, maximum, answer) {
    return `<li class="${points === maximum ? "ok" : "ng"}"><span>${points === maximum ? "✓" : "△"}</span><div><small>${escapeHtml(label)} · ${points}/${maximum}点</small><b>${escapeHtml(answer)}</b></div></li>`;
  }

  function renderScenarioResult(target) {
    const score = state.currentScore;
    const exclusionText = target.exclusions.map((item) => `${item.style}：${item.reason}`).join("／");
    return `<div class="style-result ${score.total >= 5 ? "correct" : "incorrect"}"><p class="eyebrow">BLIND TASTING RESULT</p><div class="style-result-mark">${score.total >= 5 ? "✓" : "△"}</div>
      <h1>${score.total} / 10点</h1><p class="style-result-name">正答：<strong>${escapeHtml(target.answer)}</strong>${state.timedOut ? "（時間切れ）" : ""}</p>
      <ul class="style-answer-breakdown">
        ${resultRow("Step 1 観察整理", score.step1, 2, target.step1InterpretationsJa.join("／"))}
        ${resultRow("Step 2 特徴定義", score.step2, 2, target.step2Characteristic)}
        ${resultRow("Step 3 原材料・工程", score.step3, 2, target.step3IngredientsProcess.join("／"))}
        ${resultRow("Step 4.1 発酵系統", score.family, 1, FAMILY_LABELS[target.fermentationFamily])}
        ${resultRow("Step 4.2 除外", score.exclusionStyles + score.exclusionReasons, 2, exclusionText)}
        ${resultRow("Step 4.3 結論", score.final, 1, target.answer)}
      </ul>
      <section class="blind-memory-card"><p class="eyebrow">記憶の軸</p><h2>このスタイルはこれで覚える</h2><strong>${escapeHtml(target.answer)}</strong><p>${escapeHtml(target.step2Characteristic)}</p><ul>${target.exclusions.map((item) => `<li><b>${escapeHtml(item.style)}との違い：</b>${escapeHtml(item.reason)}</li>`).join("")}</ul></section>
      <section class="style-answer-detail"><h2>模範分析</h2>${blindCard(target, true)}<dl><div><dt>特徴定義</dt><dd>${escapeHtml(target.step2Characteristic)}</dd></div><div><dt>原材料・工程</dt><dd>${escapeHtml(target.step3IngredientsProcess.join("・"))}</dd></div><div><dt>結論</dt><dd>${escapeHtml(target.answer)}</dd></div></dl><p class="style-source">出典：${escapeHtml(target.source.filename)}、${escapeHtml(target.source.locator)}</p></section>
    </div>`;
  }

  function advanceAfterResult() {
    if (state.queueIndex + 1 < state.queue.length) {
      state.queueIndex += 1;
      beginScenario();
    } else if (state.mode === "exam") {
      state.screen = "summary";
      render();
    } else {
      state.screen = "setup";
      render();
    }
  }

  function renderSummary() {
    const total = state.results.reduce((sum, item) => sum + item.score, 0);
    const maximum = state.results.length * 10;
    return `<div class="style-result ${total >= maximum * .5 ? "correct" : "incorrect"}"><p class="eyebrow">BLIND TASTING EXAM</p><div class="style-result-mark">${total >= maximum * .5 ? "✓" : "△"}</div><h1>${total} / ${maximum}点</h1><p>10シナリオの総合結果です。除外操作を誤ったシナリオは弱点モードへ記録しました。</p>
      <div class="blind-summary-list">${state.results.map((item, index) => `<div><span>${index + 1}. ${escapeHtml(item.id)}</span><b>${item.score}/10点</b><small>${item.exclusionCorrect ? "除外 ✓" : "除外 要復習"}</small></div>`).join("")}</div></div>`;
  }

  function captureAnswers() {
    const body = byId("blindQuizBody");
    if (state.stage === 0) state.answers.step1 = [...body.querySelectorAll('input[name="blind-step1"]:checked')].map((input) => input.value);
    if (state.stage === 1) state.answers.step2 = body.querySelector('input[name="blind-step2"]:checked')?.value || "";
    if (state.stage === 2) state.answers.step3 = [...body.querySelectorAll('input[name="blind-step3"]:checked')].map((input) => input.value);
    if (state.stage === 3) state.answers.family = body.querySelector('input[name="blind-family"]:checked')?.value || "";
    if (state.stage === 4) {
      state.answers.exclusions = [...body.querySelectorAll('input[name="blind-exclusions"]:checked')].map((input) => Number(input.value));
      state.answers.reasons = [...body.querySelectorAll('input[name="blind-reasons"]:checked')].map((input) => input.value);
    }
    if (state.stage === 5) {
      const value = body.querySelector('input[name="blind-final"]:checked')?.value;
      state.answers.final = value === undefined ? null : Number(value);
    }
  }

  function hasCurrentAnswer() {
    return [state.answers.step1.length, state.answers.step2, state.answers.step3.length, state.answers.family, state.answers.exclusions.length && state.answers.reasons.length, state.answers.final !== null][state.stage];
  }

  function next() {
    if (state.screen === "setup") return startConfiguredSession();
    if (state.screen === "summary") { state.screen = "setup"; return render(); }
    if (state.finished) return advanceAfterResult();
    captureAnswers();
    if (!hasCurrentAnswer()) return setMessage("選択してから次へ進んでください。");
    if (state.stage === 5) return finishScenario(false);
    state.stage += 1;
    state.hintOpen = false;
    render();
  }

  function back() {
    if (state.screen === "setup") return closeBlindQuiz();
    if (state.screen === "summary" || state.finished) { state.screen = "setup"; return render(); }
    captureAnswers();
    if (state.stage === 0) return closeBlindQuiz();
    state.stage -= 1;
    state.hintOpen = false;
    render();
  }

  function bindDynamic() {
    byId("blindQuizBody").querySelectorAll("input").forEach((input) => input.addEventListener("change", () => { if (state.screen === "question" && !state.finished) captureAnswers(); setMessage(); }));
    byId("blindHintButton")?.addEventListener("click", () => { state.hintOpen = !state.hintOpen; render({ preserveScroll: true }); });
  }

  function render({ preserveScroll = false } = {}) {
    const previousScrollY = preserveScroll ? window.scrollY : 0;
    const body = byId("blindQuizBody");
    const backButton = byId("blindQuizBackButton");
    const nextButton = byId("blindQuizNextButton");
    setMessage();
    if (state.screen === "setup") {
      clearInterval(timerHandle);
      body.innerHTML = renderSetup();
      byId("blindQuizProgress").style.width = "0%";
      backButton.textContent = "← ホームへ";
      nextButton.textContent = "この条件で始める →";
    } else if (state.screen === "summary") {
      body.innerHTML = renderSummary();
      byId("blindQuizProgress").style.width = "100%";
      backButton.textContent = "← ホームへ";
      nextButton.textContent = "条件を変えて再挑戦 →";
    } else if (state.finished) {
      body.innerHTML = renderScenarioResult(currentScenario());
      byId("blindQuizProgress").style.width = "100%";
      backButton.textContent = "← 条件選択へ";
      nextButton.textContent = state.queueIndex + 1 < state.queue.length ? "次のシナリオへ →" : state.mode === "exam" ? "総合結果を見る →" : "別の条件で挑戦 →";
    } else {
      body.innerHTML = renderStage(currentScenario());
      byId("blindQuizProgress").style.width = `${((state.stage + 1) / STAGES.length) * 100}%`;
      backButton.textContent = state.stage === 0 ? "← ホームへ" : "← 前へ戻る";
      nextButton.textContent = state.stage === 5 ? "判定する →" : "次へ →";
    }
    updateStepLabel(state?.mode === "exam" && state?.deadline ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) : null);
    bindDynamic();
    if (preserveScroll) requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, behavior: "instant" }));
    else window.scrollTo({ top: 0, behavior: "instant" });
  }

  byId("startBlindQuizButton").addEventListener("click", startBlindQuiz);
  byId("blindQuizHomeButton").addEventListener("click", closeBlindQuiz);
  byId("blindQuizBackButton").addEventListener("click", back);
  byId("blindQuizNextButton").addEventListener("click", next);
  window.BierKompassBlind = { scoreScenario, selectionPoints, startBlindQuiz };
})();
