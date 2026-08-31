"use strict";

// 問題文と回答形式を全面更新したため、旧版の回答履歴を混在させない。
const APP_VERSION = "v14";
const STORAGE = { history: "bierkompass-history-v14", session: "bierkompass-session-v14", settings: "bierkompass-settings-v10" };
const ACCESS_KEY = "bierkompass-access-v1";
const ACCESS_PASSWORD_HASH = "1d8b4cf854cd42f4868849c4ce329da72c406cc11983b4bf45acdae0805f7a72";
const TIER_NAMES = { A: "最頻出予想", B: "頻出予想", C: "補強・周辺知識" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

let data;
let questionsById = new Map();
let history = loadJson(STORAGE.history, {});
let session = null;
let mode = "study";
let timerHandle = null;
let pendingConfirm = null;

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
function currentQuestion() { return questionsById.get(session.questionIds[session.current]); }
function selectedValues(id = currentQuestion().id) { return session.answers[id] || []; }
function categoryName(id) { return data.metadata.categories.find((category) => category.id === id)?.name || id; }

async function init() {
  try {
    const response = await fetch(`questions.json?${APP_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`問題データを取得できませんでした (${response.status})`);
    data = await response.json();
    questionsById = new Map(data.questions.map((question) => [question.id, question]));
    renderFilters();
    restoreSettings();
    bindEvents();
    updateHome();
    const saved = loadJson(STORAGE.session, null);
    if (saved?.questionIds?.every((id) => questionsById.has(id)) && !saved.completed) {
      session = saved;
      showSession();
    }
  } catch (error) {
    $("#app").innerHTML = `<section class="dashboard"><h1>読み込みエラー</h1><p>${escapeHtml(error.message)}</p><p>WebサーバーまたはGitHub Pagesから開いてください。</p></section>`;
  }
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
  $("#nextButton").addEventListener("click", () => moveQuestion(1));
  $("#checkButton").addEventListener("click", checkStudyAnswer);
  $("#submitExamButton").addEventListener("click", requestSubmitExam);
  $("#restartSessionButton").addEventListener("click", requestRestart);
  $("#retryButton").addEventListener("click", restartSession);
  $("#resetHistoryButton").addEventListener("click", requestHistoryReset);
  $("#openNavigator").addEventListener("click", () => $("#navigator").classList.add("open"));
  $("#closeNavigator").addEventListener("click", () => $("#navigator").classList.remove("open"));
  $("#confirmDialog").addEventListener("close", () => { if ($("#confirmDialog").returnValue === "confirm" && pendingConfirm) pendingConfirm(); pendingConfirm = null; });
}

function setMode(nextMode) {
  mode = nextMode;
  $$(".mode-tab").forEach((button) => { const active = button.dataset.mode === mode; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
  $("#historyFilterCard").hidden = mode !== "study";
  $("#finalExamGuide").hidden = mode !== "exam";
  $("#modeSummary").textContent = mode === "exam" ? "50問・40分・合格基準50%" : "50問ずつ回答・解説と出典を表示";
  $("#startButton span").textContent = mode === "exam" ? "最終試験を始める" : "学習を始める";
  updatePoolCount();
}

function selectedFilters() {
  return {
    tiers: $$("#frequencyFilters input:checked").map((input) => input.value),
    categories: $$("#categoryFilters input:checked").map((input) => input.value),
    historyFilter: $("#historyFilter").value,
  };
}

function filteredPool() {
  const filters = selectedFilters();
  return data.questions.filter((question) => {
    if (!filters.tiers.includes(question.frequencyTier) || !filters.categories.includes(question.category)) return false;
    if (mode !== "study" || filters.historyFilter === "all") return true;
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
  const sessionCount = Math.min(mode === "exam" ? data.metadata.examQuestionCount : data.metadata.studyQuestionCount, count);
  $("#poolCount").textContent = count ? `出題 ${sessionCount.toLocaleString()}問（対象 ${count.toLocaleString()}問）` : "対象 0問";
  const message = mode === "exam" && count < data.metadata.examQuestionCount ? `最終試験には50問以上を選択してください（現在${count}問）。` : count === 0 ? "条件に合う問題がありません。" : "";
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
  setMode(settings?.mode === "exam" ? "exam" : "study");
}

function startSession() {
  const pool = filteredPool();
  const requestedCount = mode === "exam" ? data.metadata.examQuestionCount : data.metadata.studyQuestionCount;
  const count = Math.min(requestedCount, pool.length);
  const selectedQuestions = mode === "exam" ? broadExamSample(pool, count) : studyQuestionSample(pool, count);
  const questionIds = selectedQuestions.map((question) => question.id);
  const optionOrders = Object.fromEntries(questionIds.map((id) => [id, shuffle(questionsById.get(id).choices.map((_, index) => index))]));
  session = { mode, questionIds, optionOrders, answers: {}, answered: {}, checked: {}, current: 0, startedAt: Date.now(), durationSeconds: mode === "exam" ? data.metadata.examMinutes * 60 : null, completed: false };
  persistSession();
  showSession();
}

function studyQuestionSample(pool, count) {
  return shuffle(pool).slice(0, count);
}

function broadExamSample(pool, count) {
  const multiAnswerPool = pool.filter((question) => question.correct.length >= 2);
  const otherPool = pool.filter((question) => question.correct.length < 2);
  let multiAnswerCount = Math.min(multiAnswerPool.length, Math.round(count * 0.7));
  let otherCount = Math.min(otherPool.length, count - multiAnswerCount);
  if (multiAnswerCount + otherCount < count) {
    multiAnswerCount = Math.min(multiAnswerPool.length, count - otherCount);
    otherCount = Math.min(otherPool.length, count - multiAnswerCount);
  }
  return shuffle([
    ...balancedQuestionSample(multiAnswerPool, multiAnswerCount),
    ...balancedQuestionSample(otherPool, otherCount),
  ]);
}

function balancedQuestionSample(pool, count) {
  const groups = new Map();
  for (const question of shuffle(pool)) {
    if (!groups.has(question.category)) groups.set(question.category, []);
    groups.get(question.category).push(question);
  }
  for (const group of groups.values()) group.sort((a, b) => broadQuestionScore(b) - broadQuestionScore(a));
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

function broadQuestionScore(question) {
  let score = { A: 4, B: 2, C: 0 }[question.frequencyTier] || 0;
  if (question.question.includes("2つの基礎的な問い")) score += 5;
  if (!/[0-9０-９]{3,}|何年|何L|何ml|何℃/.test(question.question)) score += 2;
  if (question.question.length < 180) score += 1;
  if (Math.max(...question.choices.map((choice) => choice.length)) < 90) score += 1;
  return score;
}

function showView(name) {
  ["home", "session", "result"].forEach((view) => { $(`#${view}View`).hidden = view !== name; });
  window.scrollTo({ top: 0, behavior: "instant" });
  $("#app").focus({ preventScroll: true });
}

function showSession() {
  session.answered ||= Object.fromEntries(Object.keys(session.answers || {}).map((id) => [id, true]));
  showView("session");
  $("#sessionModeBadge").textContent = session.mode === "exam" ? "最終試験" : "学習モード";
  $("#timer").hidden = session.mode !== "exam";
  $("#checkButton").hidden = session.mode !== "study";
  $("#submitExamButton").hidden = session.mode !== "exam";
  $("#restartSessionButton").textContent = session.mode === "exam" ? "今回の試験を最初から" : "今回の学習を最初から";
  startTimer();
  renderQuestion();
}

function renderQuestion() {
  const question = currentQuestion();
  const checked = Boolean(session.checked[question.id]);
  $("#questionCounter").textContent = `${session.current + 1} / ${session.questionIds.length}`;
  $("#progressBar").style.width = `${((session.current + 1) / session.questionIds.length) * 100}%`;
  $("#frequencyTag").textContent = `${question.frequencyTier} · ${TIER_NAMES[question.frequencyTier]}`;
  $("#categoryTag").textContent = categoryName(question.category);
  $("#typeTag").textContent = "複数選択";
  $("#questionText").textContent = question.question;
  $("#answerHint").textContent = "問題文の条件に当てはまるものをすべて選択してください。選択数は決まっていません。";
  const selected = selectedValues(question.id);
  const inputType = "checkbox";
  $("#choiceList").innerHTML = session.optionOrders[question.id].map((originalIndex, displayIndex) => {
    const stateClass = checked ? (question.correct.includes(originalIndex) ? "correct" : selected.includes(originalIndex) ? "wrong" : "") : "";
    return `<div class="choice ${stateClass}"><input type="${inputType}" name="answer" id="choice-${displayIndex}" value="${originalIndex}" ${selected.includes(originalIndex) ? "checked" : ""} ${checked ? "disabled" : ""}><label for="choice-${displayIndex}"><span class="choice-key">${String.fromCharCode(65 + displayIndex)}</span><span>${escapeHtml(question.choices[originalIndex])}</span></label></div>`;
  }).join("");
  $$("#choiceList input").forEach((input) => input.addEventListener("change", captureAnswer));
  $("#feedbackPanel").hidden = !checked;
  if (checked) renderFeedback(question);
  $("#prevButton").disabled = session.current === 0;
  $("#nextButton").disabled = session.current === session.questionIds.length - 1;
  $("#nextButton").hidden = session.mode === "study" && !checked;
  $("#checkButton").textContent = question.type === "multiple" && selected.length === 0 ? "該当する選択肢はない（0個）として回答" : "回答する";
  $("#checkButton").disabled = (question.type === "single" && selected.length === 0) || checked;
  $("#noSelectionButton").hidden = !(session.mode === "exam" && question.type === "multiple" && selected.length === 0);
  $("#noSelectionButton").disabled = checked || (Boolean(session.answered[question.id]) && selected.length === 0);
  $("#clearSelectionButton").disabled = (!session.answered[question.id] && selected.length === 0) || checked;
  renderNavigator();
  persistSession();
}

function captureAnswer() {
  const question = currentQuestion();
  session.answers[question.id] = $$("#choiceList input:checked").map((input) => Number(input.value));
  session.answered[question.id] = true;
  renderQuestion();
}

function clearSelection() {
  const question = currentQuestion();
  if (session.checked[question.id]) return;
  delete session.answers[question.id];
  delete session.answered[question.id];
  renderQuestion();
}

function markNoSelection() {
  const question = currentQuestion();
  session.answers[question.id] = [];
  session.answered[question.id] = true;
  renderQuestion();
}

function moveQuestion(delta) {
  session.current = Math.max(0, Math.min(session.questionIds.length - 1, session.current + delta));
  $("#navigator").classList.remove("open");
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToQuestion(index) { session.current = index; $("#navigator").classList.remove("open"); renderQuestion(); window.scrollTo({ top: 0, behavior: "smooth" }); }

function renderNavigator() {
  const answered = session.questionIds.filter((id) => session.answered[id]).length;
  $("#questionMap").innerHTML = session.questionIds.map((id, index) => `<button type="button" data-index="${index}" class="${session.answered[id] ? "answered" : ""} ${index === session.current ? "current" : ""}" aria-label="問題${index + 1}${session.answered[id] ? " 回答済み" : " 未回答"}">${index + 1}</button>`).join("");
  $$("#questionMap button").forEach((button) => button.addEventListener("click", () => goToQuestion(Number(button.dataset.index))));
  $("#unansweredBadge").textContent = session.questionIds.length - answered;
}

function checkStudyAnswer() {
  const question = currentQuestion();
  if (question.type === "single" && !selectedValues().length) return;
  session.answered[question.id] = true;
  session.checked[question.id] = true;
  recordHistory(question, sameSet(selectedValues(), question.correct));
  renderQuestion();
}

function renderFeedback(question) {
  const correct = sameSet(selectedValues(question.id), question.correct);
  $("#feedbackPanel").classList.toggle("incorrect", !correct);
  $("#feedbackVerdict").textContent = correct ? "✓ 正解" : "✕ 不正解";
  $("#feedbackExplanation").textContent = question.explanation;
  const personQuestion = /人物|誰|発明した|導入した|設立した|開発した/.test(question.question)
    && /パスツール|ハンセン|リンデ|レーウェンフック|ヨーゼフ・グロル|アントン・ドレ|ゼードルマ|アーサー・ギネス|ヤコブセン|ピエール・セリス|ドゥーメンス/.test(question.choices.join(" "));
  $("#choiceReasons").innerHTML = session.optionOrders[question.id].map((originalIndex, displayIndex) => {
    const choice = question.choices[originalIndex];
    const isCorrect = question.correct.includes(originalIndex);
    const isFactuallyCorrect = isCorrect;
    const learningNote = personQuestion && isFactuallyCorrect ? ` — ${question.choiceReasons[originalIndex]}` : "";
    const displayKey = String.fromCharCode(65 + displayIndex);
    return `<details><summary>${displayKey}｜${isCorrect ? "✓ 正答" : "✕ 誤答"}：${escapeHtml(choice)}${escapeHtml(learningNote)}</summary><p>${escapeHtml(question.choiceReasons[originalIndex])}</p></details>`;
  }).join("");
  $("#sourceList").innerHTML = `<strong>出典</strong>${question.sources.map((source) => `<p>${escapeHtml(source.filename)}、${escapeHtml(source.locator)}${source.section ? `、「${escapeHtml(source.section)}」` : ""}</p>`).join("")}`;
}

function recordHistory(question, correct) {
  const item = history[question.id] || { attempts: 0, correctCount: 0, incorrectCount: 0, lastAnsweredAt: null, mastered: false };
  item.attempts += 1;
  item.correctCount += correct ? 1 : 0;
  item.incorrectCount += correct ? 0 : 1;
  item.lastAnsweredAt = new Date().toISOString();
  item.mastered = item.mastered || correct;
  history[question.id] = item;
  saveJson(STORAGE.history, history);
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
  const unanswered = session.questionIds.filter((id) => !session.answered[id]).length;
  confirmAction("試験を終了しますか？", unanswered ? `未回答が${unanswered}問あります。終了後に採点と解説を表示します。` : "回答を採点し、結果を表示します。", submitExam);
}

function submitExam() {
  clearInterval(timerHandle);
  let earned = 0; let maximum = 0;
  const categories = {};
  const review = [];
  for (const id of session.questionIds) {
    const question = questionsById.get(id); const selected = session.answers[id] || []; const answered = Boolean(session.answered[id]);
    const points = scoreQuestion(question, selected, answered); const max = Math.max(1, question.correct.length); const exact = answered && sameSet(selected, question.correct);
    earned += points; maximum += max;
    categories[question.category] ||= { earned: 0, maximum: 0, count: 0 };
    categories[question.category].earned += points; categories[question.category].maximum += max; categories[question.category].count += 1;
    review.push({ id, selected, points, max, exact });
    recordHistory(question, exact);
  }
  const rate = maximum ? earned / maximum : 0;
  session.completed = true;
  session.result = { earned, maximum, rate, passed: rate >= data.metadata.passingRate, categories, review };
  localStorage.removeItem(STORAGE.session);
  showResult();
}

function showResult() {
  const result = session.result;
  showView("result");
  $(".result-hero").classList.toggle("fail", !result.passed);
  $("#resultIcon").textContent = result.passed ? "✓" : "!";
  $("#resultTitle").textContent = result.passed ? "合格" : "もう一歩";
  $("#resultLead").textContent = result.passed ? "合格基準の50%をクリアしました。" : "復習して、もう一度チャレンジしましょう。";
  $("#scoreRate").textContent = `${Math.round(result.rate * 100)}%`;
  $("#scorePoints").textContent = `${result.earned} / ${result.maximum}点`;
  $("#categoryResults").innerHTML = Object.entries(result.categories).map(([id, item]) => { const rate = item.maximum ? item.earned / item.maximum : 0; return `<div class="category-result"><strong>${escapeHtml(categoryName(id))}</strong><div class="bar"><i style="width:${rate * 100}%"></i></div><span>${item.earned}/${item.maximum}点</span></div>`; }).join("");
  $("#reviewList").innerHTML = result.review.map((item, index) => { const question = questionsById.get(item.id); const order = session.optionOrders[item.id]; const answers = question.correct.length ? order.map((originalIndex, displayIndex) => ({ originalIndex, displayIndex })).filter(({ originalIndex }) => question.correct.includes(originalIndex)).map(({ originalIndex, displayIndex }) => `${String.fromCharCode(65 + displayIndex)}：${question.choices[originalIndex]}`).join("／") : "該当なし（0個）"; return `<article class="review-item"><span class="review-status ${item.exact ? "ok" : "ng"}">${item.exact ? "✓ 完全正解" : "✕ 要復習"}・${item.points}/${item.max}点</span><h3>Q${index + 1}. ${escapeHtml(question.question)}</h3><details><summary>正答・解説・出典を見る</summary><p><strong>正答：</strong>${escapeHtml(answers)}</p><p>${escapeHtml(question.explanation)}</p><p><strong>出典：</strong>${question.sources.map((source) => `${escapeHtml(source.filename)}、${escapeHtml(source.locator)}`).join("／")}</p></details></article>`; }).join("");
}

function restartSession() {
  if (!session) return;
  session.answers = {}; session.answered = {}; session.checked = {}; session.current = 0; session.startedAt = Date.now(); session.completed = false; delete session.result;
  persistSession(); showSession();
}

function requestRestart() { confirmAction("最初からやり直しますか？", "現在の選択・回答をすべて消去し、同じ問題を1問目から開始します。", restartSession); }
function requestHistoryReset() { confirmAction("全学習履歴を削除しますか？", "正解済み・不正解・回答回数・最終回答日時を削除します。この操作は元に戻せません。", () => { history = {}; localStorage.removeItem(STORAGE.history); updateHome(); }); }
function requestExit() { if (!session || session.completed) return goHome(); confirmAction("セッションを終了しますか？", "現在のセッションの回答状態を破棄して、条件選択へ戻ります。", goHome); }
function confirmAction(title, text, action) { $("#dialogTitle").textContent = title; $("#dialogText").textContent = text; pendingConfirm = action; $("#confirmDialog").showModal(); }

function goHome() { clearInterval(timerHandle); session = null; localStorage.removeItem(STORAGE.session); showView("home"); updateHome(); }
function persistSession() { if (session && !session.completed) saveJson(STORAGE.session, session); }

function startTimer() {
  clearInterval(timerHandle);
  if (session.mode !== "exam") return;
  const render = () => {
    const remaining = Math.max(0, session.durationSeconds - Math.floor((Date.now() - session.startedAt) / 1000));
    $("#timer").textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    if (remaining <= 0) submitExam();
  };
  render(); timerHandle = setInterval(render, 1000);
}

function updateStats() {
  const values = Object.values(history); const attempts = values.reduce((sum, item) => sum + item.attempts, 0); const correct = values.reduce((sum, item) => sum + item.correctCount, 0); const mastered = values.filter((item) => item.mastered).length;
  $("#headerProgress").textContent = `学習記録 ${mastered.toLocaleString()} / ${data.metadata.questionCount.toLocaleString()}`;
  $("#masteredStat").textContent = mastered.toLocaleString(); $("#attemptStat").textContent = attempts.toLocaleString(); $("#accuracyStat").textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "—";
}
function updateHome() { updateStats(); updatePoolCount(); }

window.BierKompass = { scoreQuestion, sameSet, filteredPool, studyQuestionSample, broadExamSample, broadQuestionScore };
startAccessControl();
