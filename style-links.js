(() => {
  "use strict";

  const ROOT = "https://www.google.com/search";
  // Known style labels from the existing style, image and tasting catalogs.
  const STYLE_NAMES = [
    "アメリカンライトラガー",
    "アメリカンラガー",
    "クリームエール",
    "アメリカン・ウィートエール",
    "アメリカンウィート",
    "インターナショナル・ペールラガー",
    "ジャパニーズ・ドライラガー",
    "ジャパニーズドライ",
    "チェコ・ペールラガー",
    "ボヘミアンピルスナー",
    "チェコ・プレミアムペールラガー",
    "チェコ・アンバーラガー",
    "チェコ・ダークラガー",
    "チェコダーク",
    "ミュンヘナー・ヘレス",
    "ミュンヘナーヘレス",
    "ヘレス",
    "フェストビア",
    "ヘレスボック",
    "マイボック",
    "ジャーマン・ライヒトビア",
    "ライヒトビア",
    "ケルシュ",
    "ドルトムンダー／エクスポート",
    "ドルトムンダー",
    "エクスポートビア",
    "ジャーマンピルスナー",
    "ジャーマンピルス",
    "メルツェン",
    "ラオホビア",
    "ドゥンケルボック",
    "ウィンナーラガー",
    "アルトビア",
    "ケラービア",
    "ミュンヘナー・ドゥンケル",
    "ミュンヘナードゥンケル",
    "シュヴァルツビア",
    "ドッペルボック",
    "アイスボック",
    "バルチックポーター",
    "ヘーフェヴァイツェン",
    "クリスタルヴァイツェン",
    "ヴァイスビア",
    "ヴァイツェン",
    "デュンケルヴァイツェン",
    "ドゥンケルヴァイツェン",
    "ダークヴァイツェン",
    "ヴァイツェンボック",
    "オーディナリービター",
    "ベストビター",
    "ストロングビター",
    "ビター/ESB",
    "ESB",
    "イングリッシュペールエール",
    "ブリティッシュ・ゴールデンエール",
    "オーストラリアン・スパークリングエール",
    "スパークリングエール",
    "イングリッシュIPA",
    "ダークマイルド",
    "ブリティッシュ・ブラウンエール",
    "イングリッシュ・ブラウンエール",
    "イングリッシュブラウン",
    "ロンドン・ポーター",
    "ロンドンポーター",
    "イングリッシュポーター",
    "スコティッシュ・エクスポート",
    "アイリッシュ・レッドエール",
    "アイリッシュ・ドライスタウト",
    "アイリッシュドライスタウト",
    "ドライスタウト",
    "アイリッシュ・エクストラスタウト",
    "ミルクスタウト",
    "スイートスタウト",
    "オートミールスタウト",
    "トロピカルスタウト",
    "フォーリン・エクストラスタウト",
    "オールドエール",
    "ウィーヘビー",
    "スコッチエール",
    "イングリッシュ・バーレイワイン",
    "イングリッシュバーレイワイン",
    "アメリカンペールエール",
    "アメリカンアンバーエール",
    "カリフォルニアコモン",
    "アメリカンブラウンエール",
    "アメリカンポーター",
    "アメリカンスタウト",
    "インペリアルスタウト",
    "アメリカンIPA",
    "ブラックIPA",
    "ヘイジーIPA",
    "ニューイングランドIPA",
    "NEIPA",
    "ダブルIPA",
    "インペリアルIPA",
    "アメリカン・バーレイワイン",
    "アメリカンバーレイワイン",
    "ベルリナーヴァイセ",
    "フランダース・レッドエール",
    "フランダースレッド",
    "オード・ブライン",
    "ランビック",
    "グーズ",
    "グーズランビック",
    "クリーク",
    "フルーツランビック",
    "ベルジャンホワイト",
    "ヴィットビア",
    "ヴィット",
    "ベルジャン・ペールエール",
    "ビエール・ド・ギャルド",
    "ベルジャンブロンド",
    "セゾン",
    "ベルジャン・ゴールデンストロング",
    "ゴールデンストロング",
    "ベルジャンシングル",
    "トラピスト・ダブル",
    "ベルジャン・デュッベル",
    "デュッベル",
    "ダブル",
    "トラピスト・トリプル",
    "トリプル",
    "クアドルペル",
    "ベルジャン・ダークストロング",
    "ゴーゼ",
    "サハティ",
    "グレープエール（旧称イタリアングレープエール）",
    "イタリアングレープエール",
    "IGA",
    "ニュージーランドIPA",
    "NZ IPA",
    "ジャーマン・ピルスナー",
    "ドルトムンダー・エクスポート",
    "ミュンヘナー・デュンケル",
    "ツヴィッケル",
    "ヘーフェヴァイス",
    "ヘーフェヴァイスビア",
    "デュンケル・ヴァイツェン",
    "イングリッシュブラウンエール",
    "ウィー・ヘビー",
    "ベルジャン・ゴールデン・ストロングエール",
    "ベルジャン・ダーク・ストロングエール",
    "オルヴァル",
    "グーズ・ランビック",
    "ヴィエナラガー",
    "ウィーンラガー",
    "グレープエール",
    "コルンエール（ノルウェー農家ビール）",
    "コルンエール",
    "コーネル",
    "ノルウェー農家ビール",
    "ドゥンケル",
    "バーレイワイン",
    "ピートスモックエール",
    "トラピストダブル",
    "ウエストコーストIPA",
    "ベルジャンIPA",
    "アメリカンブラウン",
    "ピルスナー",
    "甘口チェリービール",
    "甘口フルーツエール"
  ];

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = [...new Set(STYLE_NAMES)].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(names.map(escapeRegex).join("|"), "g");

  function linkStyle(value) {
    const name = String(value ?? "");
    if (!name.trim()) return escapeHtml(name);
    const url = `${ROOT}?q=${encodeURIComponent(`${name.trim()} ビール スタイル`)}`;
    return `<a class="style-reference-link" href="${url}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${escapeHtml(name)}をGoogleで検索（新しいタブ）">${escapeHtml(name)}<span aria-hidden="true">↗</span></a>`;
  }

  function linkify(value) {
    const text = String(value ?? "");
    let result = "";
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      const name = match[0];
      // The brand Pilsner Urquell is not a standalone style-name mention.
      if (name === "ピルスナー" && /^[・\s]?ウルケル/.test(text.slice(match.index + name.length))) continue;
      // Short ASCII aliases such as IGA must not link inside unrelated words.
      if ((/^[A-Za-z0-9]/.test(name) && /[A-Za-z0-9_]/.test(text[match.index - 1] || ""))
        || (/[A-Za-z0-9]$/.test(name) && /[A-Za-z0-9_]/.test(text[match.index + name.length] || ""))) continue;
      result += escapeHtml(text.slice(cursor, match.index));
      result += linkStyle(name);
      cursor = match.index + name.length;
    }
    return result + escapeHtml(text.slice(cursor));
  }

  window.BierKompassStyleLinks = { linkify, linkStyle };
})();
