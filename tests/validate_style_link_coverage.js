"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "style-links.js"), "utf8");
const context = {window: {}};
vm.runInNewContext(code, context);
const links = context.window.BierKompassStyleLinks;
const json = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const queries = html => [...html.matchAll(/<a class="style-reference-link" href="([^"]+)"/g)].map(m => new URL(m[1]).searchParams.get("q"));
const expected = name => `${name} ビール スタイル`;
const newlyCovered = [
  "IPA",
  "ピルス",
  "ボック",
  "ボックビール",
  "ポーター",
  "スタウト",
  "スタウトポーター",
  "スタウト・ポーター",
  "ペールエール",
  "ブラウンエール",
  "アルト",
  "シュヴァルツ",
  "ラオホ",
  "クアド",
  "ダークストロング",
  "シャンクビア",
  "スモールビア",
  "ロッゲンビア",
  "ライ麦ビール",
  "オクトーバーフェストビア",
  "オクトーバーフェストビール",
  "オードグーズ",
  "ストレートランビック",
  "ストレート・ランビック",
  "フランダース・レッド",
  "アウトブラウン",
  "サワーレッド",
  "カスクエール",
  "リアルエール",
  "イングリッシュ・ペールエール",
  "イングリッシュペール",
  "イングリッシュ・ブラウン",
  "イングリッシュ・マイルド",
  "アイリッシュスタウト",
  "アイリッシュレッドエール",
  "ゴールデンエール",
  "ゴールデンストロングエール",
  "スコティッシュエール",
  "アメリカン・ペールエール",
  "アメリカン・ウィート",
  "アメリカン・ライトラガー",
  "アメリカン・IPA",
  "アメリカンバーレイ",
  "チェコダークラガー",
  "ジャパニーズ・ラガー",
  "インターナショナルラガー",
  "アンバーラガー",
  "ライトラガー",
  "ドライラガー",
  "ミュンヘンラガー",
  "ドイツヴァイツェン",
  "ヘーフェ・ヴァイス",
  "クリスタル・ヴァイツェン",
  "ベルリナー・ヴァイセ",
  "ベルジャン・ホワイト",
  "ベルジャンペール",
  "スペシャル・ベルジュ",
  "バルチック・ポーター",
  "ボヘミアンピルス",
  "ボヘミアン・ピルスナー",
  "イタリアン・グレープエール",
  "クヴェイクビール",
  "ファームハウスエール",
  "セッションIPA",
  "セッションエール",
  "カスケイディアンダークエール",
  "サワーIPA",
  "サワービール",
  "フルーツビール",
  "フルーツエール",
  "フルーツサワー",
  "ペストリースタウト",
  "オイスタースタウト",
  "チョコレートスタウト",
  "ナイトロスタウト",
  "ツォイグル",
  "グロジスキェ",
  "グレツァー",
  "リヒテンハイナー",
  "ケラーピルス",
  "イタリアンピルス",
  "ブリュットIPA",
  "ミルクシェイクIPA",
  "コールドIPA",
  "ファロ",
  "グリゼット",
  "テーブルビア",
  "ワイルドエール",
  "ドライホップド・サワー",
  "スモークビール",
  "スモークエール",
  "ピートスモークエール",
  "バレルエイジド・インペリアルスタウト",
  "Brown Ale",
  "Pale Ale",
  "Dubbel",
  "Biere de Garde"
];
for (const name of newlyCovered) {
  assert.deepEqual(queries(links.linkify(name)), [expected(name)], name);
  assert.deepEqual(queries(links.linkify(`「${name}」の特徴`)), [expected(name)], `whole label: ${name}`);
}

const cases = [
  ["乳酸菌系（ベルリナー/ゴーゼ）", ["ベルリナー", "ゴーゼ"]],
  ["樽混合熟成系（フランダース）", ["フランダース"]],
  ["フランダース系の酸の一部", ["フランダース"]],
  ["ベルリナー=乳酸のみのクリーンな酸・最軽量", ["ベルリナー"]],
  ["大量使用でベルリナー様の酸も理論上可能", ["ベルリナー"]],
  ["ゴーゼ・ベルリナーの親戚的存在", ["ゴーゼ", "ベルリナー"]],
  ["ベルリナー一択", ["ベルリナー"]],
  ["夏=ヴァイツェン/ベルリナー", ["ヴァイツェン", "ベルリナー"]],
  ["フランダース・レッド／アウトブラウン", ["フランダース・レッド", "アウトブラウン"]],
  ["ポーター/スタウト（ロースト同調）", ["ポーター", "スタウト"]],
  ["ビター／ESB", ["ビター", "ESB"]],
  ["ビター→インペリアルスタウト", ["ビター", "インペリアルスタウト"]],
  ["ウィンナーはよりマイルドで飲みやすい琥珀ラガー", ["ウィンナー"]],
  ["ウィンナーは自然発酵", ["ウィンナー"]],
  ["メルツェン→ウィンナー/フェスト系の親戚関係", ["メルツェン", "ウィンナー", "フェスト"]],
  ["秋=フェスト/メルツェン、冬=ボック/バーレイ", ["フェスト", "メルツェン", "ボック", "バーレイ"]],
  ["シャンクビア/ライヒト（独）", ["シャンクビア", "ライヒト"]],
  ["バルチック=下面発酵（ラガー酵母）", ["バルチック"]],
  ["シュヴァルツ・バルチックなど下面の黒", ["シュヴァルツ", "バルチック"]],
  ["インペリアル=上面発酵のエステル", ["インペリアル"]],
  ["同じヴァイツェンもろ過でクリスタル化", ["ヴァイツェン", "クリスタル"]],
  ["代表銘柄はフリュー ケルシュ。「ケルシュ」の特徴", ["ケルシュ"]],
  ["フランダース地方の料理と、フランダース・レッド", ["フランダース・レッド"]],
  ["Brown Ale（ブラウンエール）", ["Brown Ale", "ブラウンエール"]],
];
for (const [text, names] of cases) assert.deepEqual(queries(links.linkify(text)), names.map(expected), text);

const nonStyles = [
  "フランダース地方の郷土料理", "フランダースの歴史", "フランダース", "ベルリナー", "ベルリナー市民", "ベルリナー地方",
  "ベルリナーフィル", "ベルリナー・フィル", "ベルリナーヴァイセ麦芽", "ベルリナー様の建築",
  "西海岸=クリアでビターな味", "ビターオレンジ", "ビターカカオ", "ビターチョコ", "マイルドな苦味",
  "イギリス：約568ml（インペリアル）", "インペリアルホテル", "ローストバーレイ", "ケラー文化とセット",
  "ビアガーデン/フェスト", "オクトーバーフェスト", "ウィンナーソーセージ", "クリスタルモルト", "クヴェイク酵母",
  "カラピルス", "ラオホマルツ", "ピルスナーモルト", "ピルスナー麦芽", "ヴァイツェングラス", "セゾン酵母",
  "ダブルチーズ", "トリプルアクセル", "アルトサックス", "サポーター", "ピルスナーウルケル", "ピルスナー・ウルケル", "ピルスナー ウルケル",
  "セゾン・デュポン", "セゾン デュポン", "ランミン・サハティ", "ウェストマール ダブル", "ウェストマール トリプル",
  "フリュー ケルシュ", "ユリゲ アルト", "リッターグーツ ゴーゼ", "ジヴィエツ ポーター", "オルヴァル",
  "xIPA IPAx xIGA IGAx xESB ESBx NEIPAX", "Browner Ale", "Altimeter"
];
for (const text of nonStyles) assert.deepEqual(queries(links.linkify(text)), [], text);
// A catalog has an explicit style field. Keep that distinct from automatic prose recognition.
assert.deepEqual(queries(links.linkStyle("オルヴァル")), [expected("オルヴァル")]);

const questions = json("questions.json").questions;
const pictured = questions.find(q => q.id === "A-328");
assert.deepEqual(queries(links.linkify(pictured.explanation)), ["ベルリナー", "ゴーゼ", "ランビック", "フランダース"].map(expected));
for (const q of questions) {
  for (const text of [q.question, q.explanation, ...q.choices, ...q.choiceReasons]) {
    const html = links.linkify(text);
    assert.equal(links.linkify(text), html, `stateless repeated rendering: ${q.id}`);
    const restored = html.replace(/<a [^>]+>(.*?)<span aria-hidden="true">↗<\/span><\/a>/g, "$1")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
    assert.equal(restored, text, `rendering preserves wording exactly: ${q.id}`);
    for (const href of [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map(m => m[1])) {
      const url = new URL(href);
      assert.equal(url.origin, "https://www.google.com");
      assert.equal(url.pathname, "/search");
      assert.deepEqual([...url.searchParams.keys()], ["q"]);
    }
  }
}
// Actual feedback and review paths for the screenshot, including the displayed choice order.
const h = require("./runtime_harness")();
vm.runInContext(code, h.context);
h.context.q = pictured;
h.run('session={mode:"study",questionIds:[q.id],questionSnapshots:{[q.id]:q},optionOrders:{[q.id]:[3,2,1,0]},answers:{},answered:{},checked:{},current:0,completed:false};renderQuestion();');
assert.doesNotMatch(h.element("#choiceList").innerHTML, /style-reference-link/);
h.run('session.answers[q.id]=[...q.correct];checkStudyAnswer();');
assert.deepEqual(queries(h.element("#feedbackExplanation").innerHTML), ["ベルリナー", "ゴーゼ", "ランビック", "フランダース"].map(expected));
assert.doesNotMatch(h.element("#choiceList").innerHTML, /style-reference-link/, "checkbox labels remain non-interactive");
const history = [...h.storage];
h.run('renderFeedback(q);renderFeedback(q);');
assert.deepEqual([...h.storage], history, "links do not record history");
h.run('session.result={review:[{id:q.id,selected:[0,1,2],points:3,max:3,exact:true,answered:true}]};renderReview();');
for (const style of ["ベルリナー", "ゴーゼ", "ランビック", "フランダース"]) {
  assert.ok(queries(h.element("#reviewList").innerHTML).includes(expected(style)), `review: ${style}`);
}
console.log(`PASS ${newlyCovered.length} reviewed aliases; ${cases.length} contexts; ${nonStyles.length} non-style cases; all ${questions.length} questions preserve exact text; A-328 feedback/review and history`);
