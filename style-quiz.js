"use strict";

(() => {
  const { escapeHtml, goHome, showView, shuffle } = window.BierKompass;
  const FAMILY_LABELS = { lager: "ラガー", ale: "エール" };
  const CLARITY_LABELS = { clear: "クリア", hazy: "濁りあり", soft: "外観説明を参照" };
  const FOAM_LABELS = { rich: "豊か・持続的", medium: "中程度", thin: "少ない・薄い" };
  let styleData = null;
  let styleDataPromise = null;
  let state = null;
  let lastStyleId = null;

  const byId = (id) => document.getElementById(id);

  function loadStyleData() {
    styleDataPromise ||= fetch("style-quiz.json?v27", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`スタイルデータを取得できませんでした (${response.status})`);
      return response.json();
    });
    return styleDataPromise;
  }

  function styleById(id) {
    return styleData.styles.find((style) => style.id === id);
  }

  function buildIngredientOptions(target) {
    const pool = shuffle(styleData.styles.filter((style) => style.id !== target.id));
    const selected = [];
    for (const candidate of pool) {
      if (selected.length >= 3) break;
      if (candidate.group === target.group || selected.some((style) => style.group === candidate.group)) continue;
      selected.push(candidate);
    }
    for (const candidate of pool) {
      if (selected.length >= 3) break;
      if (!selected.some((style) => style.id === candidate.id)) selected.push(candidate);
    }
    return shuffle([target, ...selected]).map((style) => ({ id: style.id, label: style.ingredients }));
  }

  async function startStyleQuiz() {
    const message = byId("styleCornerMessage");
    message.textContent = "スタイルデータを読み込んでいます…";
    try {
      styleData = await loadStyleData();
      const available = styleData.styles.filter((style) => style.id !== lastStyleId);
      const target = shuffle(available.length ? available : styleData.styles)[0];
      lastStyleId = target.id;
      state = {
        targetId: target.id,
        step: 1,
        answers: { family: "", country: "", ingredientStyleId: "", styleId: "" },
        ingredientOptions: buildIngredientOptions(target),
        finished: false,
      };
      message.textContent = "";
      showView("styleQuiz");
      renderStyleQuiz();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  function beerVisual(style) {
    const appearance = style.appearance;
    return `<div class="style-appearance">
      <div class="beer-glass glass-${escapeHtml(appearance.glass)}" style="--beer-color:${escapeHtml(appearance.colorHex)}" aria-label="${escapeHtml(appearance.colorLabel)}、泡は${escapeHtml(FOAM_LABELS[appearance.foam])}">
        <span class="beer-liquid clarity-${escapeHtml(appearance.clarity)}"></span>
        <span class="beer-foam foam-${escapeHtml(appearance.foam)}"><i></i><b></b></span>
      </div>
      <dl class="appearance-facts">
        <div><dt>色</dt><dd>${escapeHtml(appearance.colorLabel)}</dd></div>
        <div><dt>透明度</dt><dd>${escapeHtml(CLARITY_LABELS[appearance.clarity])}</dd></div>
        <div><dt>泡</dt><dd>${escapeHtml(FOAM_LABELS[appearance.foam])}</dd></div>
      </dl>
    </div>`;
  }

  function optionCards(name, options, selected, className = "") {
    return `<div class="style-option-grid ${className}">${options.map((option, index) => `
      <div class="style-option">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(name)}-${index}" value="${escapeHtml(option.value)}" ${selected === option.value ? "checked" : ""}>
        <label for="${escapeHtml(name)}-${index}"><span>${String.fromCharCode(65 + index)}</span><b>${escapeHtml(option.label)}</b></label>
      </div>`).join("")}</div>`;
  }

  function candidates() {
    return styleData.styles
      .filter((style) => style.family === state.answers.family && style.country === state.answers.country)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  function renderStep(target) {
    if (state.step === 1) {
      return `<div class="style-step-heading"><p class="eyebrow">STEP 1 · APPEARANCE</p><h1>ラガーか、エールか</h1><p>グラスの色・透明度・泡と詳細説明から、発酵タイプを推測してください。</p></div>
        <div class="style-clue-card appearance-clue">${beerVisual(target)}<div><h2>外観・香味・口当たり</h2><p class="appearance-summary">${escapeHtml(target.appearance.summary)}</p><p>${escapeHtml(target.appearance.detail)}</p></div></div>
        ${optionCards("style-family", [
          { value: "lager", label: "ラガー" },
          { value: "ale", label: "エール" },
        ], state.answers.family, "two-column")}`;
    }
    if (state.step === 2) {
      const options = styleData.metadata.countries.map((country) => ({ value: country.id, label: country.label }));
      return `<div class="style-step-heading"><p class="eyebrow">STEP 2 · DEFINITION</p><h1>国を選ぶ</h1><p>特徴定義から、このスタイルが属する国・地域区分を選んでください。</p></div>
        <div class="style-clue-card"><h2>特徴定義</h2><p>${escapeHtml(target.definition)}</p></div>
        ${optionCards("style-country", options, state.answers.country, "country-grid")}`;
    }
    if (state.step === 3) {
      const options = state.ingredientOptions.map((option) => ({ value: option.id, label: option.label }));
      return `<div class="style-step-heading"><p class="eyebrow">STEP 3 · INGREDIENTS & PROCESS</p><h1>原材料・工程を選ぶ</h1><p>ここまでの外観と特徴定義に合う原材料・醸造工程を選んでください。</p></div>
        <div class="style-clue-card compact"><h2>特徴定義を再確認</h2><p>${escapeHtml(target.definition)}</p></div>
        ${optionCards("style-ingredients", options, state.answers.ingredientStyleId, "ingredient-grid")}`;
    }
    const matching = candidates();
    if (!matching.length) {
      return `<div class="style-step-heading"><p class="eyebrow">STEP 4 · STYLE</p><h1>スタイルを選ぶ</h1></div>
        <div class="no-style-candidates"><strong>条件に合うスタイルがありません</strong><p>「${escapeHtml(FAMILY_LABELS[state.answers.family] || "未選択")}」と「${escapeHtml(styleData.metadata.countries.find((item) => item.id === state.answers.country)?.label || "未選択")}」の組み合わせを見直してください。</p><p>「前へ戻る」から国または発酵タイプを変更できます。</p></div>`;
    }
    return `<div class="style-step-heading"><p class="eyebrow">STEP 4 · STYLE</p><h1>最後にスタイルを選ぶ</h1><p>選択条件に一致するスタイルを、全${matching.length}件表示しています。</p></div>
      <div class="candidate-filter"><span>${escapeHtml(FAMILY_LABELS[state.answers.family])}</span><b>×</b><span>${escapeHtml(matching[0].countryLabel)}</span><strong>${matching.length}候補</strong></div>
      ${optionCards("style-final", matching.map((style) => ({ value: style.id, label: style.name })), state.answers.styleId, "candidate-grid")}`;
  }

  function resultLine(label, selected, correct, isCorrect) {
    return `<li class="${isCorrect ? "ok" : "ng"}"><span>${isCorrect ? "✓" : "✕"}</span><div><small>${escapeHtml(label)}</small><b>${escapeHtml(selected || "未回答")}</b>${isCorrect ? "" : `<em>正答：${escapeHtml(correct)}</em>`}</div></li>`;
  }

  function renderResult(target) {
    const selectedStyle = styleById(state.answers.styleId);
    const selectedIngredient = styleById(state.answers.ingredientStyleId);
    const familyCorrect = state.answers.family === target.family;
    const countryCorrect = state.answers.country === target.country;
    const ingredientCorrect = state.answers.ingredientStyleId === target.id;
    const styleCorrect = state.answers.styleId === target.id;
    const selectedCountry = styleData.metadata.countries.find((item) => item.id === state.answers.country)?.label;
    return `<div class="style-result ${styleCorrect ? "correct" : "incorrect"}">
      <p class="eyebrow">STYLE RESULT</p><div class="style-result-mark">${styleCorrect ? "✓" : "✕"}</div>
      <h1>${styleCorrect ? "スタイル正解" : "スタイル不正解"}</h1>
      <p class="style-result-name">正答：<strong>${escapeHtml(target.name)}</strong></p>
      <ul class="style-answer-breakdown">
        ${resultLine("Step 1 発酵タイプ", FAMILY_LABELS[state.answers.family], FAMILY_LABELS[target.family], familyCorrect)}
        ${resultLine("Step 2 国", selectedCountry, target.countryLabel, countryCorrect)}
        ${resultLine("Step 3 原材料・工程", selectedIngredient?.ingredients, target.ingredients, ingredientCorrect)}
        ${resultLine("Step 4 スタイル", selectedStyle?.name, target.name, styleCorrect)}
      </ul>
      <section class="style-answer-detail"><h2>このスタイルを整理</h2>
        <dl><div><dt>詳細説明</dt><dd>${escapeHtml(target.detail)}</dd></div><div><dt>特徴定義</dt><dd>${escapeHtml(target.definition)}</dd></div><div><dt>原材料・工程</dt><dd>${escapeHtml(target.ingredients)}</dd></div></dl>
        <p class="style-source">出典：${escapeHtml(target.source.filename)}、${escapeHtml(target.source.locator)}、「${escapeHtml(target.source.section)}」</p>
      </section>
      <div class="style-result-actions"><button type="button" class="secondary" id="retryStyleQuizButton">別のスタイルに挑戦</button><button type="button" class="primary" id="styleResultHomeButton">ホームへ戻る</button></div>
    </div>`;
  }

  function renderStyleQuiz() {
    const target = styleById(state.targetId);
    byId("styleQuizProgress").style.width = `${Math.min(state.step, 4) * 25}%`;
    byId("styleQuizStepLabel").textContent = state.finished ? "RESULT" : `STEP ${state.step} / 4`;
    byId("styleQuizBody").innerHTML = state.finished ? renderResult(target) : renderStep(target);
    byId("styleQuizMessage").textContent = "";
    byId("styleQuizBackButton").hidden = state.finished;
    byId("styleQuizNextButton").hidden = state.finished;
    byId("styleQuizBackButton").textContent = state.step === 1 ? "← ホームへ" : "← 前へ戻る";
    byId("styleQuizNextButton").textContent = state.step === 4 ? "スタイルを判定" : "次のStepへ →";
    byId("styleQuizNextButton").disabled = state.step === 4 && candidates().length === 0;
    bindDynamicEvents();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function bindDynamicEvents() {
    byId("styleQuizBody").querySelectorAll('input[type="radio"]').forEach((input) => input.addEventListener("change", () => {
      if (input.name === "style-family") {
        state.answers.family = input.value;
        if (state.answers.styleId && !candidates().some((style) => style.id === state.answers.styleId)) state.answers.styleId = "";
      } else if (input.name === "style-country") {
        state.answers.country = input.value;
        if (state.answers.styleId && !candidates().some((style) => style.id === state.answers.styleId)) state.answers.styleId = "";
      } else if (input.name === "style-ingredients") {
        state.answers.ingredientStyleId = input.value;
      } else if (input.name === "style-final") {
        state.answers.styleId = input.value;
      }
      byId("styleQuizMessage").textContent = "";
    }));
    byId("retryStyleQuizButton")?.addEventListener("click", startStyleQuiz);
    byId("styleResultHomeButton")?.addEventListener("click", goHome);
  }

  function selectedForCurrentStep() {
    return { 1: state.answers.family, 2: state.answers.country, 3: state.answers.ingredientStyleId, 4: state.answers.styleId }[state.step];
  }

  function nextStep() {
    if (!selectedForCurrentStep()) {
      byId("styleQuizMessage").textContent = state.step === 4 && candidates().length === 0
        ? "候補がないため、前へ戻って条件を変更してください。"
        : "選択肢を1つ選んでください。";
      return;
    }
    if (state.step === 4) {
      state.finished = true;
    } else {
      state.step += 1;
    }
    renderStyleQuiz();
  }

  function previousStep() {
    if (state.step === 1) return goHome();
    state.step -= 1;
    renderStyleQuiz();
  }

  byId("startStyleQuizButton").addEventListener("click", startStyleQuiz);
  byId("styleQuizHomeButton").addEventListener("click", goHome);
  byId("styleQuizBackButton").addEventListener("click", previousStep);
  byId("styleQuizNextButton").addEventListener("click", nextStep);

  window.BierKompassStyleQuiz = { candidates, startStyleQuiz };
})();
