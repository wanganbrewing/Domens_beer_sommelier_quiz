"use strict";

(() => {
  const { escapeHtml, goHome, showView, shuffle, sameSet } = window.BierKompass;
  const HISTORY_KEY = "bierkompass-blind-history-v4";
  const STAGES = ["観察", "原材料・工程", "発酵系統", "国・地域", "候補絞り込み", "最終判定", "決め手"];
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
    dataPromise ||= fetch("blind-tasting.json?v38", { cache: "no-store" }).then((response) => {
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
    return `<div class="style-step-heading"><p class="eyebrow">BLIND TASTING · SETUP</p><h1>判定トレーニングを選ぶ</h1><p>全58シナリオを、観察から原因・発酵・文化圏・スタイルへ段階的に推理します。</p></div>
      <div class="blind-setup-grid">
        <fieldset class="blind-setup-card"><legend>モード</legend>
          <label class="blind-mode"><input type="radio" name="blind-mode" value="practice" checked><span><b>練習モード</b><small>1問ずつ・ヒントあり</small></span></label>
          <label class="blind-mode"><input type="radio" name="blind-mode" value="exam"><span><b>試験モード</b><small>ランダム10問・1問3分</small></span></label>
          <label class="blind-mode"><input type="radio" name="blind-mode" value="weak"><span><b>弱点モード</b><small>候補絞り込みを誤った問題を優先</small></span></label>
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
      pool = pool.filter((scenario) => (history[scenario.id]?.weakShortlist || 0) > 0);
      if (!pool.length) return setMessage("この条件には候補絞り込みの弱点記録がありません。練習モードで回答すると記録されます。");
      pool.sort((a, b) => (history[b.id]?.weakShortlist || 0) - (history[a.id]?.weakShortlist || 0));
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

  function uniqueLabeledOptions(target, others, count = 4) {
    const result = [{ id: target.id, label: target.decisiveEvidence }];
    const labels = new Set([target.decisiveEvidence]);
    for (const scenario of shuffle(others)) {
      if (result.length >= count) break;
      if (!labels.has(scenario.decisiveEvidence)) {
        result.push({ id: scenario.id, label: scenario.decisiveEvidence });
        labels.add(scenario.decisiveEvidence);
      }
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
    state.answers = { ingredients: [], family: "", country: "", exclusions: [], final: null, decisive: "" };
    state.options = {
      ingredients: uniqueOptions(target.step3IngredientsProcess, others.flatMap((scenario) => scenario.step3IngredientsProcess), 3),
      families: shuffle(Object.entries(FAMILY_LABELS).map(([value, label]) => ({ value, label }))),
      countries: shuffle(blindData.metadata.countries.map((country) => ({ value: country.id, label: country.label }))),
      styles: shuffle(target.choices.map((label, index) => ({ index, label }))),
      decisive: uniqueLabeledOptions(target, others),
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
    byId("blindQuizStepLabel").textContent = `${prefix}STEP ${state.stage + 1} · ${STAGES[state.stage]}${timer}`;
  }

  function blindCard(target, compact = false) {
    const card = target.blindCard;
    return `<section class="blind-card ${compact ? "compact" : ""}"><div class="blind-card-head"><span>${escapeHtml(target.id)}</span><b>${"★".repeat(target.difficulty)}</b></div><dl>
      <div><dt>外観</dt><dd>${escapeHtml(card.appearance)}</dd></div><div><dt>アロマ</dt><dd>${escapeHtml(card.aroma)}</dd></div>
      <div><dt>味</dt><dd>${escapeHtml(card.taste)}</dd></div><div><dt>マウスフィール</dt><dd>${escapeHtml(card.mouthfeel)}</dd></div>
    </dl></section>`;
  }

  function checks(name, options, selected) {
    return `<div class="blind-option-grid">${options.map((option, index) => {
      const value = typeof option === "object" ? option.value : option;
      const label = typeof option === "object" ? option.label : option;
      return `<label class="blind-option"><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${selected.includes(String(value)) ? "checked" : ""}><span>${String.fromCharCode(65 + index)}</span><b>${escapeHtml(label)}</b></label>`;
    }).join("")}</div>`;
  }

  function radios(name, options, selected) {
    return `<div class="blind-option-grid">${options.map((option, index) => {
      const value = typeof option === "object" ? option.value : option;
      const label = typeof option === "object" ? option.label : option;
      return `<label class="blind-option"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${String(selected) === String(value) ? "checked" : ""}><span>${String.fromCharCode(65 + index)}</span><b>${escapeHtml(label)}</b></label>`;
    }).join("")}</div>`;
  }

  function hint() {
    if (state.mode === "exam" || state.stage === 0) return "";
    const target = currentScenario();
    const card = target.blindCard;
    const selectedIngredients = state.answers.ingredients.length ? state.answers.ingredients.join("／") : "まだ選択していません";
    const selectedFamily = FAMILY_LABELS[state.answers.family] || "まだ選択していません";
    const hints = [
      "",
      `まずアロマの「${card.aroma}」に注目し、麦芽・ホップ・酵母・副原料・熟成のどれが原因かを分けてください。次に味の「${card.taste}」と同じ原因で説明できるか確認します。`,
      `アロマの「${card.aroma}」に、果実香・スパイス香・野生香・クリーンさのどれが表れているか確認してください。味の終わり方も合わせると、発酵系統を絞れます。`,
      `現在の推理は「${selectedIngredients}」＋「${selectedFamily}」です。この組み合わせが歴史的に定着した地域を考えてください。単独の特徴ではなく、組み合わせで判断します。`,
      `各候補を、①発酵系統、②外観、③選択した原材料・工程の順に照合してください。1項目でも明確に矛盾する候補は除外できます。`,
      `残した候補が、アロマの「${card.aroma}」と味の「${card.taste}」を同時に説明できるか確認してください。広い共通点より、候補間の違いを優先します。`,
      `最終候補と最後まで迷った候補を1対1で比べてください。両方に共通する特徴ではなく、一方だけを特定できる特徴が決め手です。`,
    ];
    return `<div class="blind-hint"><button type="button" class="text-button" id="blindHintButton">${state.hintOpen ? "ヒントを閉じる" : "ヒントを見る"}</button>${state.hintOpen ? `<p>${escapeHtml(hints[state.stage])}</p>` : ""}</div>`;
  }

  function reasoningSummary() {
    const family = FAMILY_LABELS[state.answers.family] || "未回答";
    const country = blindData.metadata.countries.find((item) => item.id === state.answers.country)?.label || "未回答";
    const ingredients = state.answers.ingredients.length
      ? `<ul>${state.answers.ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "<em>未回答</em>";
    return `<section class="blind-reasoning-summary"><div><span>発酵系統</span><b>${escapeHtml(family)}</b></div><div><span>国・地域</span><b>${escapeHtml(country)}</b></div><div class="blind-selected-details"><span>原材料・工程 · ${state.answers.ingredients.length}件選択</span>${ingredients}</div></section>`;
  }

  function renderStage(target) {
    const card = blindCard(target, state.stage > 0);
    let content = "";
    if (state.stage === 0) content = `<div class="style-step-heading"><p class="eyebrow">STEP 1 · 観察</p><h1>ブラインド情報を観察する</h1><p>この画面では回答しません。外観・香り・味・口当たりを確認し、原因を考えてから次へ進んでください。</p></div>${card}<section class="blind-observation-note"><strong>観察は入力情報です</strong><p>次の画面から、観察結果を生む原材料・工程を推理します。</p></section>`;
    if (state.stage === 1) content = `<div class="style-step-heading"><p class="eyebrow">STEP 2 · 原材料・工程</p><h1>香味の原因を逆算する</h1><p>観察情報を生む可能性が高い原材料・醸造工程をすべて選んでください。</p></div>${card}${checks("blind-ingredients", state.options.ingredients, state.answers.ingredients)}`;
    if (state.stage === 2) content = `<div class="style-step-heading"><p class="eyebrow">STEP 3 · 発酵系統</p><h1>発酵の系統を判定する</h1><p>原材料・工程の推測と香味を踏まえ、最も適切な発酵系統を1つ選んでください。</p></div>${card}${radios("blind-family", state.options.families, state.answers.family)}`;
    if (state.stage === 3) content = `<div class="style-step-heading"><p class="eyebrow">STEP 4 · 国・地域</p><h1>醸造文化圏を判定する</h1><p>原材料、工程、発酵系統から、このスタイルが属する国・地域区分を1つ選んでください。</p></div>${card}${reasoningSummary()}${radios("blind-country", state.options.countries, state.answers.country)}`;
    if (state.stage === 4) content = `<div class="style-step-heading"><p class="eyebrow">STEP 5 · 候補絞り込み</p><h1>成立しない候補を外す</h1><p>これまでの推理と矛盾し、候補から除外できるスタイルをすべて選んでください。</p></div>${card}${reasoningSummary()}${checks("blind-exclusions", state.options.styles.map((item) => ({ value: item.index, label: item.label })), state.answers.exclusions.map(String))}`;
    if (state.stage === 5) {
      const remaining = state.options.styles.filter((item) => !state.answers.exclusions.includes(item.index));
      content = `<div class="style-step-heading"><p class="eyebrow">STEP 6 · 最終判定</p><h1>スタイルを1つ選ぶ</h1><p>除外せず残した候補から、観察情報を最も無理なく説明できるスタイルを選んでください。</p></div>${card}${reasoningSummary()}
        ${remaining.length ? radios("blind-final", remaining.map((item) => ({ value: item.index, label: item.label })), state.answers.final) : `<div class="no-style-candidates"><strong>候補をすべて除外しています</strong><p>「前へ戻る」から候補の絞り込みを見直してください。</p></div>`}`;
    }
    if (state.stage === 6) content = `<div class="style-step-heading"><p class="eyebrow">STEP 7 · 決め手</p><h1>特定の決め手を選ぶ</h1><p>最終スタイルを他の候補から区別するうえで、最も重要な特徴を1つ選んでください。</p></div>${card}${reasoningSummary()}${radios("blind-decisive", state.options.decisive.map((item) => ({ value: item.id, label: item.label })), state.answers.decisive)}`;
    return content + hint();
  }

  function selectionPoints(selected, correct, maximum) {
    const selectedSet = new Set(selected);
    const correctSet = new Set(correct);
    const truePositive = [...selectedSet].filter((item) => correctSet.has(item)).length;
    const falsePositive = [...selectedSet].filter((item) => !correctSet.has(item)).length;
    return Math.round(Math.max(0, maximum * (truePositive - falsePositive) / Math.max(1, correctSet.size)) * 10) / 10;
  }

  function scoreScenario(target) {
    const wrongIndexes = target.choices.map((_, index) => index).filter((index) => index !== target.correctChoice);
    const ingredients = selectionPoints(state.answers.ingredients, target.step3IngredientsProcess, 3);
    const family = state.answers.family === target.fermentationFamily ? 1 : 0;
    const country = state.answers.country === target.country ? 1 : 0;
    const shortlist = sameSet(state.answers.exclusions, wrongIndexes) ? 1 : 0;
    const final = state.answers.final !== null && Number(state.answers.final) === target.correctChoice ? 3 : 0;
    const decisive = state.answers.decisive === target.id ? 1 : 0;
    return { ingredients, family, country, shortlist, final, decisive, total: ingredients + family + country + shortlist + final + decisive };
  }

  function finishScenario(timedOut = false) {
    if (state.finished) return;
    clearInterval(timerHandle);
    const target = currentScenario();
    const score = scoreScenario(target);
    state.finished = true;
    state.timedOut = timedOut;
    state.currentScore = score;
    state.results.push({ id: target.id, score: score.total, shortlistCorrect: score.shortlist === 1 });
    const history = currentHistory();
    const item = history[target.id] || { attempts: 0, totalPoints: 0, best: 0, weakShortlist: 0 };
    item.attempts += 1;
    item.totalPoints += score.total;
    item.best = Math.max(item.best, score.total);
    if (!score.shortlist) item.weakShortlist = (item.weakShortlist || 0) + 1;
    else item.weakShortlist = Math.max(0, (item.weakShortlist || 0) - 1);
    item.lastAnsweredAt = new Date().toISOString();
    history[target.id] = item;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    render();
  }

  function resultRow(label, points, maximum, correctAnswer, userAnswer) {
    const complete = points === maximum;
    return `<li class="${complete ? "ok" : "ng"}"><span class="result-status-label">${complete ? "正解" : "要確認"}</span><div><small>${escapeHtml(label)} · ${points}/${maximum}点</small><b>正答：${escapeHtml(correctAnswer)}</b><em class="user-answer">あなたの回答：${escapeHtml(userAnswer || "未選択")}</em></div></li>`;
  }

  function renderScenarioResult(target) {
    const score = state.currentScore;
    const excludedStyles = target.choices.filter((_, index) => index !== target.correctChoice).join("／");
    const selectedCountry = blindData.metadata.countries.find((item) => item.id === state.answers.country)?.label || "未選択";
    const selectedExclusions = state.answers.exclusions.map((index) => target.choices[index]).filter(Boolean).join("／");
    const selectedFinal = state.answers.final === null ? "未選択" : target.choices[Number(state.answers.final)];
    const selectedDecisive = state.options.decisive.find((item) => item.id === state.answers.decisive)?.label || "未選択";
    const achieved = score.total >= 5;
    return `<div class="style-result ${achieved ? "correct" : "incorrect"}"><p class="eyebrow">BLIND TASTING RESULT</p><div class="style-result-mark result-status-mark">${achieved ? "目標達成" : "要復習"}</div>
      <h1>${score.total} / 10点</h1><p class="style-result-name">正答：<strong>${escapeHtml(target.answer)}</strong>${state.timedOut ? "（時間切れ）" : ""}</p>
      <ul class="style-answer-breakdown">
        ${resultRow("Step 2 原材料・工程", score.ingredients, 3, target.step3IngredientsProcess.join("／"), state.answers.ingredients.join("／"))}
        ${resultRow("Step 3 発酵系統", score.family, 1, FAMILY_LABELS[target.fermentationFamily], FAMILY_LABELS[state.answers.family] || "未選択")}
        ${resultRow("Step 4 国・地域", score.country, 1, target.countryLabel, selectedCountry)}
        ${resultRow("Step 5 候補絞り込み", score.shortlist, 1, excludedStyles, selectedExclusions)}
        ${resultRow("Step 6 最終判定", score.final, 3, target.answer, selectedFinal)}
        ${resultRow("Step 7 決め手", score.decisive, 1, target.decisiveEvidence, selectedDecisive)}
      </ul>
      <section class="blind-memory-card"><p class="eyebrow">記憶の軸</p><h2>このスタイルはこれで覚える</h2><strong>${escapeHtml(target.answer)}</strong><p>${escapeHtml(target.decisiveEvidence)}</p><ul>${target.exclusions.map((item) => `<li><b>${escapeHtml(item.style)}との違い：</b>${escapeHtml(item.reason)}</li>`).join("")}</ul></section>
      <section class="style-answer-detail"><h2>正しい推理経路</h2>${blindCard(target, true)}<dl><div><dt>原材料・工程</dt><dd>${escapeHtml(target.step3IngredientsProcess.join("・"))}</dd></div><div><dt>発酵系統</dt><dd>${escapeHtml(FAMILY_LABELS[target.fermentationFamily])}</dd></div><div><dt>国・地域</dt><dd>${escapeHtml(target.countryLabel)}</dd></div><div><dt>最終判定</dt><dd>${escapeHtml(target.answer)}</dd></div></dl><p class="style-source">出典：${escapeHtml(target.source.filename)}、${escapeHtml(target.source.locator)}</p></section>
      <section class="representative-beers"><p class="eyebrow">COMMERCIAL EXAMPLES</p><h2>代表的なビール銘柄</h2><ul>${target.representativeBeers.map((beer) => `<li>${escapeHtml(beer)}</li>`).join("")}</ul><small>学習用の代表例です。製品仕様や流通状況は変更される場合があります。</small></section>
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
    const achieved = total >= maximum * .5;
    return `<div class="style-result ${achieved ? "correct" : "incorrect"}"><p class="eyebrow">BLIND TASTING EXAM</p><div class="style-result-mark result-status-mark">${achieved ? "目標達成" : "要復習"}</div><h1>${total} / ${maximum}点</h1><p>10シナリオの総合結果です。候補絞り込みを誤ったシナリオは弱点モードへ記録しました。</p>
      <div class="blind-summary-list">${state.results.map((item, index) => `<div><span>${index + 1}. ${escapeHtml(item.id)}</span><b>${item.score}/10点</b><small>${item.shortlistCorrect ? "絞り込み ✓" : "絞り込み 要復習"}</small></div>`).join("")}</div></div>`;
  }

  function captureAnswers() {
    const body = byId("blindQuizBody");
    if (state.stage === 1) state.answers.ingredients = [...body.querySelectorAll('input[name="blind-ingredients"]:checked')].map((input) => input.value);
    if (state.stage === 2) state.answers.family = body.querySelector('input[name="blind-family"]:checked')?.value || "";
    if (state.stage === 3) state.answers.country = body.querySelector('input[name="blind-country"]:checked')?.value || "";
    if (state.stage === 4) state.answers.exclusions = [...body.querySelectorAll('input[name="blind-exclusions"]:checked')].map((input) => Number(input.value));
    if (state.stage === 5) {
      const value = body.querySelector('input[name="blind-final"]:checked')?.value;
      state.answers.final = value === undefined ? null : Number(value);
    }
    if (state.stage === 6) state.answers.decisive = body.querySelector('input[name="blind-decisive"]:checked')?.value || "";
  }

  function hasCurrentAnswer() {
    return [true, state.answers.ingredients.length, state.answers.family, state.answers.country, state.answers.exclusions.length, state.answers.final !== null, state.answers.decisive][state.stage];
  }

  function next() {
    if (state.screen === "setup") return startConfiguredSession();
    if (state.screen === "summary") { state.screen = "setup"; return render(); }
    if (state.finished) return advanceAfterResult();
    captureAnswers();
    if (!hasCurrentAnswer()) return setMessage("選択してから次へ進んでください。");
    if (state.stage === STAGES.length - 1) return finishScenario(false);
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
      nextButton.textContent = state.stage === 0 ? "推理を始める →" : state.stage === STAGES.length - 1 ? "判定する →" : "次へ →";
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
