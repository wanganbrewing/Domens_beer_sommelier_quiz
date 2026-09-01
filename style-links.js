(() => {
  "use strict";

  const ROOT = "https://www.bjcp.org/style/2021";
  const STYLE_GROUPS = [
    [["アメリカンライトラガー"], "1/1A/american-light-lager"],
    [["アメリカンラガー"], "1/1B/american-lager"],
    [["クリームエール"], "1/1C/cream-ale"],
    [["アメリカン・ウィートエール", "アメリカンウィート"], "1/1D/american-wheat-beer"],
    [["インターナショナル・ペールラガー", "ジャパニーズ・ドライラガー"], "2/2A/international-pale-lager"],
    [["チェコ・ペールラガー"], "3/3A/czech-pale-lager"],
    [["ボヘミアンピルスナー", "チェコ・プレミアムペールラガー"], "3/3B/czech-premium-pale-lager"],
    [["チェコ・アンバーラガー"], "3/3C/czech-amber-lager"],
    [["チェコ・ダークラガー"], "3/3D/czech-dark-lager"],
    [["ミュンヘナー・ヘレス", "ミュンヘナーヘレス", "ヘレス"], "4/4A/munich-helles"],
    [["フェストビア"], "4/4B/festbier"],
    [["ヘレスボック", "マイボック"], "4/4C/helles-bock"],
    [["ジャーマン・ライヒトビア", "ライヒトビア"], "5/5A/german-leichtbier"],
    [["ケルシュ"], "5/5B/kolsch"],
    [["ドルトムンダー／エクスポート", "ドルトムンダー", "エクスポートビア"], "5/5C/german-helles-exportbier"],
    [["ジャーマンピルスナー", "ジャーマンピルス"], "5/5D/german-pils"],
    [["メルツェン"], "6/6A/marzen"],
    [["ラオホビア"], "6/6B/rauchbier"],
    [["ドゥンケルボック"], "6/6C/dunkles-bock"],
    [["ウィンナーラガー"], "7/7A/vienna-lager"],
    [["アルトビア"], "7/7B/altbier"],
    [["ケラービア"], "7/7C/kellerbier"],
    [["ミュンヘナー・ドゥンケル", "ミュンヘナードゥンケル"], "8/8A/munich-dunkel"],
    [["シュヴァルツビア"], "8/8B/schwarzbier"],
    [["ドッペルボック"], "9/9A/doppelbock"],
    [["アイスボック"], "9/9B/eisbock"],
    [["バルチックポーター"], "9/9C/baltic-porter"],
    [["ヘーフェヴァイツェン", "ヴァイスビア", "ヴァイツェン"], "10/10A/weissbier"],
    [["デュンケルヴァイツェン", "ドゥンケルヴァイツェン"], "10/10B/dunkles-weissbier"],
    [["ヴァイツェンボック"], "10/10C/weizenbock"],
    [["オーディナリービター"], "11/11A/ordinary-bitter"],
    [["ベストビター"], "11/11B/best-bitter"],
    [["ストロングビター", "ESB"], "11/11C/strong-bitter"],
    [["ブリティッシュ・ゴールデンエール"], "12/12A/british-golden-ale"],
    [["オーストラリアン・スパークリングエール"], "12/12B/australian-sparkling-ale"],
    [["イングリッシュIPA"], "12/12C/english-ipa"],
    [["ダークマイルド"], "13/13A/dark-mild"],
    [["ブリティッシュ・ブラウンエール", "イングリッシュ・ブラウンエール"], "13/13B/british-brown-ale"],
    [["ロンドン・ポーター", "イングリッシュポーター"], "13/13C/english-porter"],
    [["スコティッシュ・エクスポート"], "14/14C/scottish-export"],
    [["アイリッシュ・レッドエール"], "15/15A/irish-red-ale"],
    [["アイリッシュ・ドライスタウト", "ドライスタウト"], "15/15B/irish-stout"],
    [["アイリッシュ・エクストラスタウト"], "15/15C/irish-extra-stout"],
    [["ミルクスタウト", "スイートスタウト"], "16/16A/sweet-stout"],
    [["オートミールスタウト"], "16/16B/oatmeal-stout"],
    [["トロピカルスタウト"], "16/16C/tropical-stout"],
    [["フォーリン・エクストラスタウト"], "16/16D/foreign-extra-stout"],
    [["オールドエール"], "17/17B/old-ale"],
    [["ウィーヘビー"], "17/17C/wee-heavy"],
    [["イングリッシュ・バーレイワイン"], "17/17D/english-barley-wine"],
    [["アメリカンペールエール"], "18/18B/american-pale-ale"],
    [["アメリカンアンバーエール"], "19/19A/american-amber-ale"],
    [["カリフォルニアコモン"], "19/19B/california-common"],
    [["アメリカンブラウンエール"], "19/19C/american-brown-ale"],
    [["アメリカンポーター"], "20/20A/american-porter"],
    [["アメリカンスタウト"], "20/20B/american-stout"],
    [["インペリアルスタウト"], "20/20C/imperial-stout"],
    [["アメリカンIPA"], "21/21A/american-ipa"],
    [["ブラックIPA"], "21/21B/specialty-ipa-black-ipa"],
    [["ヘイジーIPA", "ニューイングランドIPA", "NEIPA"], "21/21C/hazy-ipa"],
    [["ダブルIPA", "インペリアルIPA"], "22/22A/double-ipa"],
    [["アメリカン・バーレイワイン"], "22/22C/american-barleywine"],
    [["ベルリナーヴァイセ"], "23/23A/berliner-weisse"],
    [["フランダース・レッドエール"], "23/23B/flanders-red-ale"],
    [["オード・ブライン"], "23/23C/oud-bruin"],
    [["ランビック"], "23/23D/lambic"],
    [["グーズ", "グーズランビック"], "23/23E/gueuze"],
    [["クリーク", "フルーツランビック"], "23/23F/fruit-lambic"],
    [["ベルジャンホワイト", "ヴィットビア", "ヴィット"], "24/24A/witbier"],
    [["ベルジャン・ペールエール"], "24/24B/belgian-pale-ale"],
    [["ビエール・ド・ギャルド"], "24/24C/biere-de-garde"],
    [["ベルジャンブロンド"], "25/25A/belgian-blond-ale"],
    [["セゾン"], "25/25B/saison"],
    [["ベルジャン・ゴールデンストロング", "ゴールデンストロング"], "25/25C/belgian-golden-strong-ale"],
    [["ベルジャンシングル"], "26/26A/belgian-single"],
    [["トラピスト・ダブル", "デュッベル"], "26/26B/belgian-dubbel"],
    [["トラピスト・トリプル", "トリプル"], "26/26C/belgian-tripel"],
    [["クアドルペル", "ベルジャン・ダークストロング"], "26/26D/belgian-dark-strong-ale"],
    [["ゴーゼ"], "23/23G/gose"],
    [["サハティ"], "27/27A/historical-beer-sahti"],
  ];

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lookup = new Map();
  STYLE_GROUPS.forEach(([names, path]) => names.forEach((name) => lookup.set(name, `${ROOT}/${path}/`)));
  const names = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(names.map(escapeRegex).join("|"), "g");

  function linkify(value) {
    const text = String(value ?? "");
    let result = "";
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      result += escapeHtml(text.slice(cursor, match.index));
      const name = match[0];
      result += `<a class="style-reference-link" href="${lookup.get(name)}" target="_blank" rel="noopener noreferrer" title="BJCP 2021スタイルガイドを開く">${escapeHtml(name)}<span aria-hidden="true">↗</span></a>`;
      cursor = match.index + name.length;
    }
    return result + escapeHtml(text.slice(cursor));
  }

  window.BierKompassStyleLinks = { linkify };
})();
