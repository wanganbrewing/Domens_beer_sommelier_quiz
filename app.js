"use strict";

// 問題文と回答形式を全面更新したため、旧版の回答履歴を混在させない。
const APP_VERSION = "v64";
const STORAGE = { history: "bierkompass-history-v23", session: "bierkompass-session-v24", settings: "bierkompass-settings-v14" };
const ACCESS_KEY = "bierkompass-access-v1";
const ACCESS_PASSWORD_HASH = "1d8b4cf854cd42f4868849c4ce329da72c406cc11983b4bf45acdae0805f7a72";
const TIER_NAMES = { A: "最頻出予想", B: "頻出予想", C: "補強・周辺知識" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const answerHtml = (value) => window.BierKompassStyleLinks?.linkify(value) || escapeHtml(value);
const choiceKnowledgeHtml = (choice) => (window.BierKompassChoiceGuide?.note(choice) || []).map((note) => `<p class="choice-knowledge"><strong>選択肢の知識：</strong>${escapeHtml(note)}</p>`).join("");
const sourceHtml = (source) => `${escapeHtml(source.filename)}、${escapeHtml(source.locator)}${source.section ? `、「${escapeHtml(source.section)}」` : ""}${source.status ? `<br><small>出典確認：${escapeHtml(source.status)}</small>` : ""}`;
const questionHtml = (value) => escapeHtml(value).replace(
  /(誤っているものを1つ選べ|誤っている|正しくない|適切でない|該当しない|当てはまらない|含まれない)/g,
  '<span class="negative-cue">$1</span>',
);

let data;
let questionsById = new Map();
let variantCatalog = new Map();
const VARIANT_STORAGE = "bierkompass-choice-variants-v1";
let variantUsage = loadJson(VARIANT_STORAGE, {});
if (!variantUsage || typeof variantUsage !== "object" || Array.isArray(variantUsage)) variantUsage = {};
let history = loadJson(STORAGE.history, {});
const RECENT_STORAGE = "bierkompass-recent-answers-v1";
const RECENT_ANSWER_LIMIT = 50;
const STREAK_STORAGE = "bierkompass-study-streak-v1";
let studyCorrectStreak = loadJson(STREAK_STORAGE, 0);
if (!Number.isSafeInteger(studyCorrectStreak) || studyCorrectStreak < 0) studyCorrectStreak = 0;
let recentAnswers = loadJson(RECENT_STORAGE, []);
if (!Array.isArray(recentAnswers)) recentAnswers = [];
recentAnswers = recentAnswers.filter((item) => typeof item?.correct === "boolean").slice(-RECENT_ANSWER_LIMIT);
let session = null;
let mode = "study";
let timerHandle = null;
let pendingConfirm = null;

// The mock exam is an app practice setting, not a current Japanese certification rule.
const MOCK_EXAM = Object.freeze({ questionCount: 50, minutes: 40, passingRate: 0.5 });
const isTimedMode = (value) => value === "mock";
const sessionLabel = (value) => value === "mock" ? "模試モード" : "学習モード";

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function unlockAccess() {
  document.body.classList.remove("access-locked");
  $("#accessGate").hidden = true;
  $(".site-header").removeAttribute("aria-hidden");
  $("#app").removeAttribute("aria-hidden");
}
async function startAccessControl() {
  if (localStorage.getItem(ACCESS_KEY) === "granted") {
    unlockAccess();
    await init();
    return;
  }
  const form = $("#accessForm");
  const input = $("#accessPassword");
  const message = $("#accessMessage");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (await sha256(input.value) !== ACCESS_PASSWORD_HASH) {
      message.textContent = "パスワードが違います。";
      input.select();
      return;
    }
    localStorage.setItem(ACCESS_KEY, "granted");
    unlockAccess();
    await init();
  });
  input.focus();
}
function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function sameSet(a, b) { return a.length === b.length && [...a].sort((x, y) => x - y).every((value, index) => value === [...b].sort((x, y) => x - y)[index]); }
function sessionQuestion(id) { return session?.questionSnapshots?.[id] || questionsById.get(id); }
function currentQuestion() { return sessionQuestion(session.questionIds[session.current]); }
function selectedValues(id = currentQuestion().id) { return session.answers[id] || []; }
function categoryName(id) { return data.metadata.categories.find((category) => category.id === id)?.name || id; }

async function init() {
  try {
    const response = await fetch(`questions.json?${APP_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`問題データを取得できませんでした (${response.status})`);
    data = await response.json();
    await window.BierKompassPhotos?.ready;
    questionsById = new Map(data.questions.map((question) => [question.id, question]));
    if (window.BierKompassChoiceVariants) {
      try {
        const variantsResponse = await fetch("choice-variants.json?v=64", { cache: "no-store" });
        if (!variantsResponse.ok) throw new Error("選択肢セットを読み込めませんでした。");
        variantCatalog = window.BierKompassChoiceVariants.createCatalog(data.questions, await variantsResponse.json());
      } catch (error) {
        console.warn("別セットを読み込めなかったため、通常の選択肢で学習できます。", error.message);
      }
    }
    await window.BierKompassSources?.init({questions: data.questions, variants: variantCatalog, version: APP_VERSION});
    renderFilters();
    restoreSettings();
    bindEvents();
    updateHome();
    const saved = restoreSavedSession(loadJson(STORAGE.session, null));
    if (saved) {
      session = saved;
      showSession();
    }
  } catch (error) {
    $("#app").innerHTML = `<section class="dashboard"><h1>読み込みエラー</h1><p>${escapeHtml(error.message)}</p><p>WebサーバーまたはGitHub Pagesから開いてください。</p></section>`;
  }
}

// Retired exam attempts become untimed study without losing answers or order.
// Study and mock attempts keep their original state, including mock deadlines.
function restoreSavedSession(saved) {
  if (!saved || !["study", "mock", "exam"].includes(saved.mode)
      || !Array.isArray(saved.questionIds) || !saved.questionIds.length
      || (saved.completed && (saved.mode !== "study" || !saved.questionIds.every((id) => saved.checked?.[id])))
      || !saved.questionIds.every((id) => questionsById.has(id))) return null;
  if (saved.questionSnapshots) {
    const engine = window.BierKompassChoiceVariants;
    if (saved.choiceVariantSchema !== 1 || !engine || !saved.questionIds.every((id) => {
      const q = saved.questionSnapshots[id];
      const order = saved.optionOrders?.[id];
      return q?.id === id && engine.validQuestion(q) && Array.isArray(order)
        && order.length === 4 && new Set(order).size === 4 && order.every((i) => Number.isInteger(i) && i >= 0 && i < 4);
    })) return null;
  }
  if (saved.mode !== "exam") return saved;
  return { ...saved, mode: "study", durationSeconds: null, restoredFromRetiredExam: true };
}

function renderFilters() {
  $("#frequencyFilters").innerHTML = data.metadata.frequencyTiers.map((tier) => `<div class="frequency-option"><input type="checkbox" id="tier-${tier.id}" value="${tier.id}" ${tier.id === "A" ? "checked" : ""}><label for="tier-${tier.id}"><b>${tier.id}</b><span><strong>${escapeHtml(tier.name)}</strong><small>${tier.count.toLocaleString()}問</small></span><i>✓</i></label></div>`).join("");
  $("#categoryFilters").innerHTML = data.metadata.categories.map((category) => `<div class="category-option"><input type="checkbox" id="category-${category.id}" value="${category.id}" checked><label for="category-${category.id}">${escapeHtml(category.name)} <small>${category.count}</small></label></div>`).join("");
}

function bindEvents() {
  $$(".mode-tab").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("#frequencyFilters").addEventListener("change", updatePoolCount);
  $("#categoryFilters").addEventListener("change", updatePoolCount);
  $("#historyFilter").addEventListener("change", updatePoolCount);
  $("#toggleCategories").addEventListener("click", toggleCategories);
  $("#startButton").addEventListener("click", startSession);
  $("#homeLink").addEventListener("click", (event) => { event.preventDefault(); requestExit(); });
  $("#backHomeButton").addEventListener("click", requestExit);
  $("#resultHomeButton").addEventListener("click", goHome);
  $("#clearSelectionButton").addEventListener("click", clearSelection);
  $("#noSelectionButton").addEventListener("click", markNoSelection);
  $("#prevButton").addEventListener("click", () => moveQuestion(-1));
  $("#nextButton").addEventListener("click", advanceQuestion);
  $("#nextStudyButton").addEventListener("click", startNextStudySession);
  $("#checkButton").addEventListener("click", checkStudyAnswer);
  $("#submitExamButton").addEventListener("click", requestSubmitExam);
  $("#finishSessionButton").addEventListener("click", requestFinishSession);
  $("#luckyAnswerButton").addEventListener("click", markLuckyAnswer);
  $("#restartSessionButton").addEventListener("click", requestRestart);
  $("#retryButton").addEventListener("click", restartSession);
  $("#reviewFilter").addEventListener("change", renderReview);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateTimer(); });
  window.addEventListener("pageshow", updateTimer);
  $("#resetHistoryButton").addEventListener("click", requestHistoryReset);
  $("#openNavigator").addEventListener("click", () => setNavigatorOpen(true));
  $("#openNavigatorMobile").addEventListener("click", () => setNavigatorOpen(true));
  $("#closeNavigator").addEventListener("click", () => setNavigatorOpen(false));
  $("#confirmDialog").addEventListener("close", () => { const action = pendingConfirm; pendingConfirm = null; if ($("#confirmDialog").returnValue === "confirm" && action && !expireIfNeeded()) action(); });
}

function setMode(nextMode) {
  mode = ["study", "mock"].includes(nextMode) ? nextMode : "study";
  $$(".mode-tab").forEach((button) => { const active = button.dataset.mode === mode; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
  $("#historyFilterCard").hidden = mode !== "study";
  $("#mockExamGuide").hidden = mode !== "mock";
  $("#studyConfig").hidden = mode === "mock";
  $("#modeSummary").textContent = mode === "mock" ? "全分野から50問・40分・終了後に合否と解説を表示" : "50問ずつ回答・解説と出典を表示";
  $("#startButton span").textContent = mode === "mock" ? "40分の模試を始める" : "学習を始める";
  updatePoolCount();
}

function setNavigatorOpen(open) {
  $("#navigator").classList.toggle("open", open);
  $("#openNavigatorMobile").setAttribute("aria-expanded", String(open));
}

function selectedFilters() {
  return {
    tiers: $$("#frequencyFilters input:checked").map((input) => input.value),
    categories: $$("#categoryFilters input:checked").map((input) => input.value),
    historyFilter: $("#historyFilter").value,
  };
}

function filteredPool(filters = selectedFilters(), poolMode = mode) {
  return data.questions.filter((question) => {
    if (question.active === false) return false;
    if (poolMode === "mock") return true;
    if (!filters.tiers.includes(question.frequencyTier) || !filters.categories.includes(question.category)) return false;
    if (poolMode !== "study" || filters.historyFilter === "all") return true;
    const item = history[question.id];
    if (filters.historyFilter === "unanswered") return !item?.attempts;
    if (filters.historyFilter === "wrong") return Boolean(item?.incorrectCount);
    if (filters.historyFilter === "not-mastered") return !item?.mastered;
    return true;
  });
}

function updatePoolCount() {
  if (!data) return;
  const count = filteredPool().length;
  const requestedCount = mode === "mock" ? MOCK_EXAM.questionCount : data.metadata.studyQuestionCount;
  const sessionCount = Math.min(requestedCount, count);
  $("#poolCount").textContent = count ? `出題 ${sessionCount.toLocaleString()}問（対象 ${count.toLocaleString()}問）` : "対象 0問";
  const message = isTimedMode(mode) && count < requestedCount ? `${sessionLabel(mode)}には${requestedCount}問以上の対象問題が必要です（現在${count}問）。` : count === 0 ? "条件に合う問題がありません。" : "";
  $("#configMessage").textContent = message;
  $("#startButton").disabled = Boolean(message);
  saveJson(STORAGE.settings, { mode, ...selectedFilters() });
}

function toggleCategories() {
  const inputs = $$("#categoryFilters input");
  const allChecked = inputs.every((input) => input.checked);
  inputs.forEach((input) => { input.checked = !allChecked; });
  $("#toggleCategories").textContent = allChecked ? "すべて選択" : "すべて解除";
  updatePoolCount();
}

function restoreSettings() {
  const settings = loadJson(STORAGE.settings, null);
  if (settings) {
    for (const input of $$("#frequencyFilters input")) input.checked = settings.tiers?.includes(input.value) ?? true;
    for (const input of $$("#categoryFilters input")) input.checked = settings.categories?.includes(input.value) ?? true;
    if (settings.historyFilter) $("#historyFilter").value = settings.historyFilter;
  }
  setMode(settings?.mode || "study");
}

function startSession() {
  const pool = filteredPool();
  const requestedCount = mode === "mock" ? MOCK_EXAM.questionCount : data.metadata.studyQuestionCount;
  if (!pool.length || (isTimedMode(mode) && pool.length < requestedCount)) return;
  const count = Math.min(requestedCount, pool.length);
  const selectedQuestions = mode === "mock" ? mockExamSample(pool, count) : studyQuestionSample(pool, count);
  createSession(selectedQuestions, mode);
}

function createSession(selectedQuestions, nextMode, prototype = false, previous = null) {
  const engine = window.BierKompassChoiceVariants;
  const questionIds = selectedQuestions.map((question) => question.id);
  const questionSnapshots = engine ? Object.fromEntries(selectedQuestions.map((base) => {
    const previousId = previous?.questionSnapshots?.[base.id]?.choiceVariantId
      || (previous?.questionIds?.includes(base.id) ? "base" : null)
      || variantUsage[base.id] || (history[base.id]?.attempts ? "base" : null);
    const q = engine.chooseQuestion(base, variantCatalog, previousId);
    if (q.choiceVariantId) variantUsage[base.id] = q.choiceVariantId;
    return [base.id, q];
  })) : null;
  const optionOrders = Object.fromEntries(questionIds.map((id) => [id, shuffle([0, 1, 2, 3])]));
  session = { mode: nextMode, questionIds, optionOrders, answers: {}, answered: {}, checked: {}, current: 0,
    startedAt: Date.now(), durationSeconds: nextMode === "mock" ? MOCK_EXAM.minutes * 60 : null, completed: false };
  if (questionSnapshots) Object.assign(session, { choiceVariantSchema: 1, questionSnapshots });
  if (prototype) session.choiceVariantPrototype = true;
  if (nextMode === "study") {
    session.studyFilters = previous?.studyFilters || selectedFilters();
    session.studySeenIds = [...new Set([...(previous?.studySeenIds || previous?.questionIds || []), ...questionIds])];
  }
  if (engine) saveJson(VARIANT_STORAGE, variantUsage);
  persistSession();
  showSession();
}

function startVariantPrototype() {
  if (!variantCatalog.size) return;
  setMode("study");
  createSession([...variantCatalog.keys()].map((id) => questionsById.get(id)), "study", true);
}

// Allocate evenly across 1–4 correct choices, redistributing only exhausted groups.
function answerCountSample(pool, count, sampleGroup) {
  const groups = [1, 2, 3, 4].map((n) => pool.filter((q) => q.correct.length === n));
  const quotas = [0, 0, 0, 0];
  const limit = Math.min(count, pool.length);
  while (quotas.reduce((a, b) => a + b, 0) < limit) {
    const available = shuffle([0, 1, 2, 3].filter((i) => quotas[i] < groups[i].length));
    const minimum = Math.min(...available.map((i) => quotas[i]));
    for (const i of available.filter((i) => quotas[i] === minimum)) {
      if (quotas.reduce((a, b) => a + b, 0) >= limit) break;
      quotas[i] += 1;
    }
  }
  return spreadAnswerCounts(groups.flatMap((group, i) => sampleGroup(group, quotas[i])));
}

function studyQuestionSample(pool, count) {
  return answerCountSample(pool, count, (group, quota) => shuffle(group).slice(0, quota));
}


// Keep the answer-count quotas, while sampling every available field without
// frequency/ranking bias. Topic distribution is this app's practice design.
function mockExamSample(pool, count) {
  return answerCountSample(pool, count, (group, quota) => balancedQuestionSample(group, quota));
}

function spreadAnswerCounts(questions) {
  const fourAnswerQuestions = shuffle(questions.filter((question) => question.correct.length === 4));
  const otherQuestions = shuffle(questions.filter((question) => question.correct.length !== 4));
  const slots = Array.from({ length: otherQuestions.length + 1 }, () => []);
  const slotOrder = shuffle(slots.map((_, index) => index));
  fourAnswerQuestions.forEach((question, index) => slots[slotOrder[index % slotOrder.length]].push(question));
  const result = [];
  for (let index = 0; index < slots.length; index += 1) {
    result.push(...slots[index]);
    if (index < otherQuestions.length) result.push(otherQuestions[index]);
  }
  return result;
}

function balancedQuestionSample(pool, count) {
  const groups = new Map();
  for (const question of shuffle(pool)) {
    if (!groups.has(question.category)) groups.set(question.category, []);
    groups.get(question.category).push(question);
  }
  let categories = shuffle([...groups.keys()]);
  const selected = [];
  while (selected.length < count && categories.length) {
    const nextRound = [];
    for (const category of categories) {
      const group = groups.get(category);
      if (group.length && selected.length < count) selected.push(group.pop());
      if (group.length) nextRound.push(category);
    }
    categories = nextRound;
  }
  return selected;
}


function showView(name) {
  ["home", "session", "result", "blindQuiz", "beerGuide"].forEach((view) => { $(`#${view}View`).hidden = view !== name; });
  $("#homeSupplementLinks").hidden = name !== "home";
  window.scrollTo({ top: 0, behavior: "instant" });
  $("#app").focus({ preventScroll: true });
}

function showSession() {
  if (!session) return;
  if (session.completed) { if (session.mode === "study") finishStudySession(); else if (session.result) showResult(); return; }
  session.answered ||= Object.fromEntries(Object.keys(session.answers || {}).map((id) => [id, true]));
  showView("session");
  $("#sessionModeBadge").textContent = sessionLabel(session.mode);
  $("#sessionRecoveryMessage").hidden = !session.restoredFromRetiredExam;
  $("#timer").hidden = !isTimedMode(session.mode);
  $("#checkButton").hidden = session.mode !== "study";
  $("#submitExamButton").hidden = !isTimedMode(session.mode);
  $("#restartSessionButton").textContent = isTimedMode(session.mode) ? "今回の試験を最初から" : "今回の学習を最初から";
  renderQuestion();
  startTimer();
}

function choiceAnswerStatus(question, originalIndex, selected) {
  const correct = question.correct.includes(originalIndex);
  return `<span class="choice-status"><strong class="choice-answer-label ${correct ? "is-correct" : "is-incorrect"}">${correct ? "✓ 正解" : "✕ 不正解"}</strong><span class="choice-selection-label">${selected.includes(originalIndex) ? "あなたの選択" : "未選択"}</span></span>`;
}

function renderQuestion() {
  if (!session || session.completed) return;
  const question = currentQuestion();
  const checked = Boolean(session.checked[question.id]);
  $("#questionCounter").textContent = `${session.current + 1} / ${session.questionIds.length}`;
  $("#progressBar").style.width = `${((session.current + 1) / session.questionIds.length) * 100}%`;
  $("#frequencyTag").textContent = `${question.frequencyTier} · ${TIER_NAMES[question.frequencyTier]}`;
  $("#frequencyTag").hidden = session.mode === "mock";
  $("#categoryTag").textContent = categoryName(question.category);
  $("#typeTag").textContent = "複数選択";
  $("#questionText").innerHTML = questionHtml(question.question);
  $("#answerHint").textContent = checked ? "各選択肢に正解・不正解と、あなたの選択状況を表示しています。" : "問題文の条件に当てはまるものをすべて選択してください。選択数は決まっていません。";
  const selected = selectedValues(question.id);
  const inputType = "checkbox";
  $("#choiceList").innerHTML = session.optionOrders[question.id].map((originalIndex, displayIndex) => {
    const stateClass = checked ? (question.correct.includes(originalIndex) ? "correct" : selected.includes(originalIndex) ? "wrong" : "") : "";
    return `<div class="choice ${stateClass}"><input type="${inputType}" name="answer" id="choice-${displayIndex}" value="${originalIndex}" ${selected.includes(originalIndex) ? "checked" : ""} ${checked ? "disabled" : ""}><label for="choice-${displayIndex}"><span class="choice-key">${String.fromCharCode(65 + displayIndex)}</span><span class="choice-content"><span>${escapeHtml(question.choices[originalIndex])}</span>${checked ? choiceAnswerStatus(question, originalIndex, selected) : ""}</span></label></div>`;
  }).join("");
  $$("#choiceList input").forEach((input) => input.addEventListener("change", captureAnswer));
  $("#feedbackPanel").hidden = !checked;
  if (checked) renderFeedback(question);
  $("#luckyAnswerButton").hidden = !checked || session.mode !== "study" || !sameSet(selected, question.correct);
  $("#luckyAnswerButton").disabled = Boolean(session.luckyAnswers?.[question.id]);
  $("#luckyAnswerButton").textContent = session.luckyAnswers?.[question.id] ? "再出題する問題に登録済み" : "偶然正解したので、もう一度出題する";
  $("#prevButton").disabled = session.current === 0;
  const studyFinished = session.mode === "study" && session.questionIds.every((id) => session.checked[id]);
  const lastQuestion = session.current === session.questionIds.length - 1;
  $("#nextButton").textContent = studyFinished ? "結果を見る →" : session.mode === "study" && lastQuestion ? "未回答へ →" : "次へ →";
  $("#nextButton").disabled = session.mode !== "study" && lastQuestion;
  $("#nextButton").hidden = session.mode === "study" && !checked;
  $("#checkButton").textContent = question.type === "multiple" && selected.length === 0 ? "該当する選択肢はない（0個）として回答" : "回答する";
  $("#checkButton").disabled = (question.type === "single" && selected.length === 0) || checked;
  $("#noSelectionButton").hidden = !(isTimedMode(session.mode) && question.type === "multiple" && selected.length === 0);
  $("#noSelectionButton").disabled = checked || (Boolean(session.answered[question.id]) && selected.length === 0);
  $("#clearSelectionButton").disabled = (!session.answered[question.id] && selected.length === 0) || checked;
  renderNavigator();
  persistSession();
}

function captureAnswer() {
  if (!session || session.completed || expireIfNeeded()) return;
  const question = currentQuestion();
  session.answers[question.id] = $$("#choiceList input:checked").map((input) => Number(input.value));
  session.answered[question.id] = true;
  renderQuestion();
}

function clearSelection() {
  if (!session || session.completed || expireIfNeeded()) return;
  const question = currentQuestion();
  if (session.checked[question.id]) return;
  delete session.answers[question.id];
  delete session.answered[question.id];
  renderQuestion();
}

function markNoSelection() {
  if (!session || session.completed || expireIfNeeded()) return;
  const question = currentQuestion();
  session.answers[question.id] = [];
  session.answered[question.id] = true;
  renderQuestion();
}

function moveQuestion(delta) {
  if (!session || session.completed || expireIfNeeded()) return;
  session.current = Math.max(0, Math.min(session.questionIds.length - 1, session.current + delta));
  setNavigatorOpen(false);
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToQuestion(index) { if (!session || session.completed || expireIfNeeded()) return; session.current = index; setNavigatorOpen(false); renderQuestion(); window.scrollTo({ top: 0, behavior: "smooth" }); }

// Keep the last explanation visible until the learner chooses the result screen.
function advanceQuestion() {
  if (!session || session.completed) return;
  if (session.mode !== "study") return moveQuestion(1);
  if (!session.checked[currentQuestion().id]) return;
  if (session.questionIds.every((id) => session.checked[id])) return finishStudySession();
  if (session.current === session.questionIds.length - 1) {
    return goToQuestion(session.questionIds.findIndex((id) => !session.checked[id]));
  }
  moveQuestion(1);
}

function remainingStudyPool() {
  if (!session || session.mode !== "study" || session.choiceVariantPrototype) return [];
  const seen = new Set([...(session.studySeenIds || []), ...session.questionIds]);
  return filteredPool(session.studyFilters || selectedFilters(), "study").filter((question) => !seen.has(question.id));
}

function startNextStudySession() {
  if (!session?.completed || session.mode !== "study" || session.choiceVariantPrototype) return;
  const pool = remainingStudyPool();
  if (!pool.length) return;
  const previous = session;
  createSession(studyQuestionSample(pool, Math.min(data.metadata.studyQuestionCount, pool.length)), "study", false, previous);
}

function finishStudySession(allowPartial = false) {
  if (!session || session.completed || session.mode !== "study" || (!allowPartial && !session.questionIds.every((id) => session.checked[id]))) return;
  const newlyCompleted = !session.completed;
  // Answer checks already record study history. Summarising/reloading never records it again.
  session.completed = true;
  session.finishedAt ||= Date.now();
  clearInterval(timerHandle);
  timerHandle = null;
  setNavigatorOpen(false);
  let earned = 0; let maximum = 0;
  const categories = {};
  const review = session.questionIds.map((id) => {
    const question = sessionQuestion(id), selected = session.answers[id] || [];
    const answered = Boolean(session.checked[id]);
    const points = scoreQuestion(question, selected, answered), max = Math.max(1, question.correct.length);
    earned += points; maximum += max;
    categories[question.category] ||= { earned: 0, maximum: 0, count: 0 };
    categories[question.category].earned += points;
    categories[question.category].maximum += max;
    categories[question.category].count += 1;
    return { id, selected, points, max, exact: answered && sameSet(selected, question.correct), answered };
  });
  session.result = { earned, maximum, rate: maximum ? earned / maximum : 0, categories, review };
  saveJson(STORAGE.session, session);
  showResult();
  if (newlyCompleted) window.BierKompassSound?.play("complete");
}

function markLuckyAnswer() {
  if (!session || session.completed || session.mode !== "study") return;
  const question = currentQuestion();
  if (!session.checked[question.id] || !sameSet(selectedValues(), question.correct)) return;
  session.luckyAnswers ||= {};
  session.luckyAnswers[question.id] = true;
  if (history[question.id]) { history[question.id].mastered = false; saveJson(STORAGE.history, history); }
  updateStats(); renderQuestion();
}

function requestFinishSession() {
  if (!session || session.completed || expireIfNeeded()) return;
  if (isTimedMode(session.mode)) return requestSubmitExam();
  const count = session.questionIds.filter(id => !session.checked[id]).length;
  confirmAction("学習を終了して採点しますか？", count ? `未回答・未採点が${count}問あります。これらは0点として結果を表示します。学習履歴には回答した問題だけを記録します。` : "結果と解説を表示します。", () => finishStudySession(true));
}

function renderNavigator() {
  const answered = session.questionIds.filter((id) => session.answered[id]).length;
  $("#questionMap").innerHTML = session.questionIds.map((id, index) => `<button type="button" data-index="${index}" class="${session.answered[id] ? "answered" : ""} ${index === session.current ? "current" : ""}" aria-label="問題${index + 1}${session.answered[id] ? " 回答済み" : " 未回答"}">${index + 1}</button>`).join("");
  $$("#questionMap button").forEach((button) => button.addEventListener("click", () => goToQuestion(Number(button.dataset.index))));
  $("#unansweredBadge").textContent = session.questionIds.length - answered;
  $("#unansweredBadgeMobile").textContent = session.questionIds.length - answered;
}

function checkStudyAnswer() {
  if (!session || session.completed || session.mode !== "study") return;
  const question = currentQuestion();
  if (session.checked[question.id]) return;
  if (question.type === "single" && !selectedValues().length) return;
  session.answered[question.id] = true;
  session.checked[question.id] = true;
  const correct = sameSet(selectedValues(), question.correct);
  recordHistory(question, correct);
  renderQuestion();
  studyCorrectStreak = correct ? studyCorrectStreak + 1 : 0;
  saveJson(STREAK_STORAGE, studyCorrectStreak);
  window.BierKompassSound?.play(correct && studyCorrectStreak % 5 === 0 ? "streak" : correct ? "correct" : "incorrect");
}

function renderFeedback(question) {
  const correct = sameSet(selectedValues(question.id), question.correct);
  $("#feedbackPanel").classList.toggle("incorrect", !correct);
  $("#feedbackVerdict").textContent = correct ? "✓ 正解" : "✕ 不正解";
  $("#feedbackExplanation").innerHTML = answerHtml(question.explanation) + (window.BierKompassPhotos?.forQuestion(question, session.optionOrders[question.id]) || "");
  $("#choiceReasons").innerHTML = session.optionOrders[question.id].map((originalIndex, displayIndex) => {
    const choice = question.choices[originalIndex];
    const reason = question.choiceReasons[originalIndex].trim();
    const isCorrect = question.correct.includes(originalIndex);
    const displayKey = String.fromCharCode(65 + displayIndex);
    const verdict = `${displayKey}｜${isCorrect ? "✓ 正解" : "✕ 不正解"}：${answerHtml(choice)}`;
    return reason
      ? `<details open><summary>${verdict}</summary>${choiceKnowledgeHtml(choice)}<p>${answerHtml(reason)}</p>${window.BierKompassSources?.choiceLinks(question, originalIndex) || ""}</details>`
      : `<div class="choice-verdict">${verdict}</div>`;
  }).join("");
  $("#sourceList").innerHTML = `<strong>出典</strong>${question.sources.map((source) => `<p>${sourceHtml(source)}</p>`).join("")}`;
}

function renderReviewChoiceReasons(question, order) {
  return order.map((originalIndex, displayIndex) => {
    const choice = question.choices[originalIndex];
    const reason = question.choiceReasons[originalIndex].trim();
    const isCorrect = question.correct.includes(originalIndex);
    const displayKey = String.fromCharCode(65 + displayIndex);
    const verdict = `${displayKey}｜${isCorrect ? "✓ 正解" : "✕ 不正解"}：${answerHtml(choice)}`;
    return reason
      ? `<details open><summary>${verdict}</summary>${choiceKnowledgeHtml(choice)}<p>${answerHtml(reason)}</p>${window.BierKompassSources?.choiceLinks(question, originalIndex) || ""}</details>`
      : `<div class="choice-verdict">${verdict}</div>`;
  }).join("");
}

function recordHistory(question, correct) {
  const item = history[question.id] || { attempts: 0, correctCount: 0, incorrectCount: 0, lastAnsweredAt: null, mastered: false };
  item.attempts += 1;
  item.correctCount += correct ? 1 : 0;
  item.incorrectCount += correct ? 0 : 1;
  item.lastAnsweredAt = new Date().toISOString();
  item.mastered = item.mastered || correct;
  if (question.choiceVariantId) {
    item.variants ||= {};
    const record = item.variants[question.choiceVariantId] || { attempts: 0, correctCount: 0 };
    record.attempts += 1; record.correctCount += correct ? 1 : 0;
    item.variants[question.choiceVariantId] = record;
  }
  history[question.id] = item;
  saveJson(STORAGE.history, history);
  recentAnswers.push({ correct });
  recentAnswers = recentAnswers.slice(-RECENT_ANSWER_LIMIT);
  saveJson(RECENT_STORAGE, recentAnswers);
  updateStats();
}

function scoreQuestion(question, selected, answered = true) {
  if (!answered) return 0;
  if (question.correct.length === 0) return selected.length === 0 ? 1 : 0;
  const correctSelections = selected.filter((index) => question.correct.includes(index)).length;
  const wrongSelections = selected.filter((index) => !question.correct.includes(index)).length;
  return Math.max(0, correctSelections - wrongSelections);
}

function requestSubmitExam() {
  if (!session || session.completed || expireIfNeeded()) return;
  const unanswered = session.questionIds.filter((id) => !session.answered[id]).length;
  confirmAction("試験を終了しますか？", unanswered ? `未回答が${unanswered}問あります。終了後に採点と解説を表示します。` : "回答を採点し、結果を表示します。", submitExam);
}

function submitExam(reason = "submitted") {
  if (!session || session.completed || !isTimedMode(session.mode)) return;
  // Lock before scoring: a timeout, confirmation and restored session must not
  // record the same attempt twice or allow a stale dialog to restart the clock.
  session.completed = true;
  session.finishedAt = Date.now();
  pendingConfirm = null;
  if ($("#confirmDialog").open) $("#confirmDialog").close("cancel");
  setNavigatorOpen(false);
  clearInterval(timerHandle);
  timerHandle = null;
  let earned = 0; let maximum = 0;
  const categories = {};
  const review = [];
  for (const id of session.questionIds) {
    const question = sessionQuestion(id); const selected = session.answers[id] || []; const answered = Boolean(session.answered[id]);
    const points = scoreQuestion(question, selected, answered); const max = Math.max(1, question.correct.length); const exact = answered && sameSet(selected, question.correct);
    earned += points; maximum += max;
    categories[question.category] ||= { earned: 0, maximum: 0, count: 0 };
    categories[question.category].earned += points; categories[question.category].maximum += max; categories[question.category].count += 1;
    review.push({ id, selected, points, max, exact, answered });
    recordHistory(question, exact);
  }
  const rate = maximum ? earned / maximum : 0;
  const passingRate = MOCK_EXAM.passingRate;
  session.result = { earned, maximum, rate, passingRate, passed: rate >= passingRate, categories, review, reason };
  localStorage.removeItem(STORAGE.session);
  showResult();
  window.BierKompassSound?.play(session.result.passed ? "pass" : "fail");
}

function showResult() {
  const result = session.result;
  showView("result");
  const study = session.mode === "study";
  $(".result-hero").classList.toggle("fail", !study && !result.passed);
  $("#resultIcon").textContent = study || result.passed ? "✓" : "!";
  $("#resultTitle").textContent = study ? `${session.questionIds.length}問の学習完了` : result.passed ? "合格" : "不合格";
  if (study) {
    $("#resultLead").textContent = `${session.questionIds.length}問の学習が終わりました。続けるか、ここで終わるか選べます。`;
    $("#resultScope").textContent = "学習の得点率です。模試の合否判定ではありません。";
    $("#resultSummary").textContent = `全${result.review.length}問 · 完全正解 ${result.review.filter((item) => item.exact).length}問 · 学習履歴は保存済みです。`;
  } else {
    const threshold = Math.round(result.passingRate * 100);
    $("#resultLead").textContent = `${result.reason === "timeout" ? "40分の制限時間になったため、自動採点しました。" : ""}${result.passed ? `模試の合格基準${threshold}%をクリアしました。` : `模試の合格基準${threshold}%に届きませんでした。解説を確認して、もう一度チャレンジしましょう。`}`;
    $("#resultScope").textContent = "この結果は非公式の筆記練習の判定です。公式試験・資格取得の合否を示すものではありません。";
    const unanswered = result.review.filter((item) => !item.answered).length;
    $("#resultSummary").textContent = `全${result.review.length}問 · 完全正解 ${result.review.filter((item) => item.exact).length}問 · 未回答 ${unanswered}問（0点） · 合格に必要な点数 ${Math.ceil(result.maximum * result.passingRate)}点`;
  }
  const remaining = study ? remainingStudyPool().length : 0;
  const nextCount = Math.min(data.metadata.studyQuestionCount, remaining);
  $("#nextStudyButton").hidden = !study || Boolean(session.choiceVariantPrototype);
  $("#nextStudyButton").disabled = !remaining;
  $("#nextStudyButton").textContent = remaining ? `次の${nextCount}問へ →` : "次の問題はありません";
  $("#studyContinuationNote").hidden = !study;
  $("#studyContinuationNote").textContent = session.choiceVariantPrototype
    ? "別セット対応問題の学習が終わりました。同じ問題でもう一度学ぶと、選択肢の内容が変わります。"
    : remaining
      ? `同じ絞り込み条件で、今回の連続学習でまだ出していない残り${remaining}問から出題します。${nextCount < data.metadata.studyQuestionCount ? `次は残り${nextCount}問です。` : ""}`
      : "同じ絞り込み条件で、今回の連続学習の未出題問題はすべて終了しました。「終わる」で条件選択へ戻れます。";
  $("#resultHomeButton").textContent = study ? "終わる" : "条件選択へ戻る";
  $("#scoreRate").textContent = `${Math.floor(result.rate * 1000) / 10}%`;
  $("#scorePoints").textContent = `${result.earned} / ${result.maximum}点`;
  $("#categoryResults").innerHTML = Object.entries(result.categories).map(([id, item]) => { const rate = item.maximum ? item.earned / item.maximum : 0; return `<div class="category-result"><strong>${escapeHtml(categoryName(id))}</strong><div class="bar"><i style="width:${rate * 100}%"></i></div><span>${item.earned}/${item.maximum}点</span></div>`; }).join("");
  $("#reviewFilter").value = "all";
  renderReview();
}

function renderReview() {
  if (!session?.result) return;
  const result = session.result;
  const reviewItems = result.review.map((item, index) => ({ ...item, index })).filter((item) => $("#reviewFilter").value !== "incorrect" || !item.exact);
  $("#reviewCount").textContent = `${reviewItems.length}問を表示`;
  $("#reviewList").innerHTML = reviewItems.length ? reviewItems.map((item) => {
    const index = item.index;
    const question = sessionQuestion(item.id);
    const order = session.optionOrders[item.id];
    const answers = question.correct.length
      ? order.map((originalIndex, displayIndex) => ({ originalIndex, displayIndex }))
        .filter(({ originalIndex }) => question.correct.includes(originalIndex))
        .map(({ originalIndex, displayIndex }) => `${String.fromCharCode(65 + displayIndex)}：${question.choices[originalIndex]}`).join("／")
      : "該当なし（0個）";
    const selectedAnswer = !item.answered ? "未回答" : item.selected.length ? order.map((originalIndex, displayIndex) => ({ originalIndex, displayIndex }))
      .filter(({ originalIndex }) => item.selected.includes(originalIndex))
      .map(({ originalIndex, displayIndex }) => `${String.fromCharCode(65 + displayIndex)}：${question.choices[originalIndex]}`).join("／") : "該当なし（0個）";
    const choiceReasons = renderReviewChoiceReasons(question, order);
    const sources = question.sources.map((source) => sourceHtml(source)).join("／");
    const reviewLabel = "自分の回答・正答・解説・出典を見る";
    return `<article class="review-item"><span class="review-status ${item.exact ? "ok" : "ng"}">${item.exact ? "✓ 完全正解" : item.answered ? "✕ 要復習" : "未回答"}・${item.points}/${item.max}点</span><h3>Q${index + 1}. ${escapeHtml(question.question)}</h3><details><summary>${reviewLabel}</summary><p><strong>自分の回答：</strong>${escapeHtml(selectedAnswer)}</p><p><strong>正答：</strong>${answerHtml(answers)}</p><p>${answerHtml(question.explanation)}</p>${window.BierKompassPhotos?.forQuestion(question, order) || ""}${choiceReasons ? `<div class="choice-reasons review-choice-reasons">${choiceReasons}</div>` : ""}<p><strong>出典：</strong>${sources}</p></details></article>`;
  }).join("") : '<p class="review-empty">要復習の問題はありません。全問で完全正解です。</p>';
}

function restartSession() {
  if (!session) return;
  if (window.BierKompassChoiceVariants) {
    const previous = session;
    createSession(previous.questionIds.map((id) => questionsById.get(id)), previous.mode,
      Boolean(previous.choiceVariantPrototype), previous);
  } else {
    session.answers = {}; session.answered = {}; session.checked = {}; session.current = 0; session.startedAt = Date.now(); session.completed = false; delete session.result; delete session.finishedAt;
    persistSession(); showSession();
  }
}

function requestRestart() { if (!session || session.completed || expireIfNeeded()) return; confirmAction("最初からやり直しますか？", "現在の選択・回答を消去し、同じ問題を1問目から開始します。別セットがある問題では、選択肢の内容も変わります。", restartSession); }
function requestHistoryReset() { confirmAction("全学習履歴を削除しますか？", "正解済み・不正解・回答回数・最終回答日時を削除します。この操作は元に戻せません。", () => { history = {}; variantUsage = {}; recentAnswers = []; studyCorrectStreak = 0; localStorage.removeItem(STREAK_STORAGE); localStorage.removeItem(STORAGE.history); localStorage.removeItem(VARIANT_STORAGE); localStorage.removeItem(RECENT_STORAGE); updateHome(); }); }
function requestExit() { if (!session || session.completed) return goHome(); if (expireIfNeeded()) return; confirmAction("セッションを終了しますか？", "現在のセッションの回答状態を破棄して、条件選択へ戻ります。", goHome); }
function confirmAction(title, text, action) { $("#dialogTitle").textContent = title; $("#dialogText").textContent = text; pendingConfirm = action; $("#confirmDialog").showModal(); }

function goHome() { clearInterval(timerHandle); session = null; localStorage.removeItem(STORAGE.session); showView("home"); updateHome(); }
function persistSession() { if (session && !session.completed) saveJson(STORAGE.session, session); }

function remainingSeconds(now = Date.now()) {
  if (!session || !isTimedMode(session.mode)) return null;
  return Math.max(0, Math.ceil((session.startedAt + session.durationSeconds * 1000 - now) / 1000));
}

function expireIfNeeded() {
  if (!session || session.completed || !isTimedMode(session.mode)) return false;
  if (remainingSeconds() > 0) return false;
  submitExam("timeout");
  return true;
}

function updateTimer() {
  if (!session || session.completed || !isTimedMode(session.mode)) return;
  const remaining = remainingSeconds();
  $("#timer").textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  $("#timer").classList.toggle("timer-warning", remaining <= 300);
  $("#timer").setAttribute("aria-label", `残り${Math.floor(remaining / 60)}分${remaining % 60}秒`);
  expireIfNeeded();
}

function startTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
  if (!session || session.completed || !isTimedMode(session.mode)) return;
  updateTimer();
  if (!session.completed) timerHandle = setInterval(updateTimer, 1000);
}

function updateStats() {
  const values = Object.values(history); const attempts = values.reduce((sum, item) => sum + item.attempts, 0); const mastered = values.filter((item) => item.mastered).length;
  const correct = recentAnswers.filter((item) => item.correct).length;
  $("#accuracyStat").textContent = recentAnswers.length ? `${Math.floor(correct / recentAnswers.length * 1000) / 10}%` : "—";
  $("#recentAccuracyDetail").textContent = recentAnswers.length
    ? `直近${recentAnswers.length}回答・完全正解${correct}問`
    : "新しく回答すると集計します（直近50回答）";
  const activeQuestionCount = data.metadata.activeQuestionCount || data.metadata.questionCount;
  $("#headerProgress").textContent = `学習記録 ${mastered.toLocaleString()} / ${activeQuestionCount.toLocaleString()}`;
  $("#masteredStat").textContent = mastered.toLocaleString(); $("#attemptStat").textContent = attempts.toLocaleString();
  $("#questionBankStat").textContent = activeQuestionCount.toLocaleString();
}
function updateHome() { updateStats(); updatePoolCount(); }

window.BierKompass = { scoreQuestion, sameSet, filteredPool, studyQuestionSample, mockExamSample, spreadAnswerCounts, escapeHtml, goHome, showView, shuffle };
startAccessControl();
