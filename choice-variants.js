"use strict";

// Reviewed, finite choice sets. No answers are generated or negated at runtime.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BierKompassChoiceVariants = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const signature = (question) => [...question.choices].sort().join("\u0000");
  function validQuestion(question) {
    return Boolean(question && typeof question.id === "string" && typeof question.question === "string"
      && Array.isArray(question.choices) && question.choices.length === 4
      && question.choices.every((value) => typeof value === "string" && value.trim())
      && new Set(question.choices).size === 4
      && Array.isArray(question.correct) && question.correct.length >= 1 && question.correct.length <= 4
      && question.correct.every((value, i) => Number.isInteger(value) && value >= 0 && value < 4 && (i === 0 || question.correct[i - 1] < value))
      && Array.isArray(question.choiceReasons) && question.choiceReasons.length === 4
      && question.choiceReasons.every((value) => typeof value === "string" && value.trim())
      && typeof question.explanation === "string" && question.explanation.trim()
      && Array.isArray(question.sources) && question.sources.length);
  }
  function createCatalog(bank, document) {
    if (document?.version !== 1 || !Array.isArray(document.questions)) throw new Error("選択肢セットの形式が正しくありません。");
    const originals = new Map(bank.map((q) => [q.id, q]));
    const result = new Map();
    for (const group of document.questions) {
      const base = originals.get(group.questionId);
      if (!validQuestion(base) || base.active === false || result.has(base.id) || !Array.isArray(group.variants) || !group.variants.length) throw new Error("選択肢セットの問題IDが正しくありません。");
      const options = [{ ...clone(base), choiceVariantId: "base" }];
      const ids = new Set(["base"]);
      const seen = new Set([signature(base)]);
      for (const variant of group.variants) {
        const q = { ...clone(base), choices: variant.choices, correct: variant.correct, choiceReasons: variant.choiceReasons,
          explanation: variant.explanation, sources: variant.sources, choiceVariantId: variant.id };
        if (typeof variant.id !== "string" || !variant.id || ids.has(variant.id) || !validQuestion(q)
            || q.correct.length !== base.correct.length || seen.has(signature(q))) throw new Error(`選択肢セットが不正です: ${base.id}`);
        ids.add(variant.id); seen.add(signature(q)); options.push(clone(q));
      }
      result.set(base.id, options);
    }
    return result;
  }
  function chooseQuestion(base, catalog, previousId, random = Math.random) {
    const options = catalog.get(base.id);
    if (!options) return clone(base);
    const eligible = options.filter((q) => q.choiceVariantId !== previousId);
    const chosen = eligible[Math.min(eligible.length - 1, Math.max(0, Math.floor(random() * eligible.length)))];
    return clone(chosen);
  }
  function score(question, selected) {
    return Math.max(0, selected.filter((i) => question.correct.includes(i)).length - selected.filter((i) => !question.correct.includes(i)).length);
  }
  return { createCatalog, chooseQuestion, validQuestion, signature, score };
});
