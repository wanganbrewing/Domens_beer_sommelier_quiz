"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "style-quiz.js"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(root, "style-quiz.json"), "utf8"));
const stubElement = { addEventListener() {} };
const sandbox = {
  document: { getElementById: () => stubElement },
  window: {
    BierKompass: {
      escapeHtml: (value) => String(value),
      goHome() {},
      showView() {},
      shuffle: (items) => [...items],
    },
    scrollTo() {},
  },
};

vm.runInNewContext(source, sandbox, { filename: "style-quiz.js" });
const sanitize = sandbox.window.BierKompassStyleQuiz.answerSafeText;
const styles = data.styles;
const bannedPlaces = [
  "仏フランドル地方", "フランドル", "フランダース", "ドルトムント", "ミュンヘン", "バンベルク",
  "ボヘミア", "モラヴィア", "ピルゼン", "ウィーン", "デュッセルドルフ", "センヌ川", "バートン",
  "ロンドン", "ダブリン", "ロシア", "スコットランド", "ノルウェー", "フィンランド", "ニュージーランド",
];

for (const style of styles) {
  const fields = [style.detail, style.definition, style.ingredients, style.appearance?.summary, style.appearance?.detail];
  for (const field of fields.filter(Boolean)) {
    const sanitized = sanitize(field, styles);
    for (const place of bannedPlaces) {
      if (sanitized.includes(place)) throw new Error(`${style.id}: 地名「${place}」が残っています: ${sanitized}`);
    }
  }
}

const example = sanitize("仏フランドル地方発祥。春仕込み・ワイン瓶長期セラー貯蔵。", styles);
if (example.includes("仏") || example.includes("フランドル")) throw new Error(`例題の地名が残っています: ${example}`);
console.log(`OK: ${styles.length} styles have no direct country/region clues before answering`);
