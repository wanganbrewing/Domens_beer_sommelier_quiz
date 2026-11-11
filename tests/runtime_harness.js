"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
module.exports = function runtime({ fixture, engine = true, initialStorage = new Map() } = {}) {
  fixture ||= JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
  const elements = new Map(), storage = new Map(initialStorage), intervals = new Map();
  const filters = { tiers: ["A", "B", "C"], categories: fixture.metadata.categories.map(c => c.id) };
  let now = 1_800_000_000_000, nextInterval = 0;
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, value: "all", style: {}, events: {}, classList: { toggle() {}, remove() {} },
      addEventListener(event, callback) { this.events[event] = callback; },
      setAttribute() {}, removeAttribute() {}, focus() {},
      showModal() { this.open = true; },
      close(value) { this.open = false; this.returnValue = value; this.events.close?.(); },
    });
    return elements.get(selector);
  }
  const context = vm.createContext({ fixture, console, TextEncoder, crypto: globalThis.crypto,
    Date: class extends Date { static now() { return now; } },
    document: { querySelector: element, querySelectorAll: selector => {
      if (selector === "#frequencyFilters input:checked") return filters.tiers.map(value => ({value}));
      if (selector === "#categoryFilters input:checked") return filters.categories.map(value => ({value}));
      return [];
    }, addEventListener() {} },
    window: { scrollTo() {}, addEventListener() {}, ...(engine ? {BierKompassChoiceVariants: require(path.join(root, "choice-variants.js"))} : {}) },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setInterval(cb) { const id = ++nextInterval; intervals.set(id, cb); return id; }, clearInterval(id) { intervals.delete(id); },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context);
  const run = code => vm.runInContext(code, context);
  run("data = fixture; questionsById = new Map(data.questions.map(q => [q.id, q])); bindEvents();");
  const snapshot = code => JSON.parse(run(`JSON.stringify(${code})`));
  const click = selector => element(selector).events.click();
  function complete() {
    run("for (let i = 0; i < session.questionIds.length; i++) { session.current = i; session.answers[currentQuestion().id] = [...currentQuestion().correct]; checkStudyAnswer(); }");
  }
  return {run, snapshot, element, storage, intervals, filters, click, complete, context, advanceTime: ms => {now += ms;} };
};
