"use strict";
(function(root){
const entries = [
  {
    "id": "teku",
    "name": "テク（Teku）",
    "description": "ワイングラスのような長い脚の上に、角ばった輪郭の胴が載る形。胴は広い肩から上へすぼまり、飲み口の縁だけが外側へ反っています。「角ばった」は横から見た輪郭のことです。",
    "pattern": "(?:^|[^ァ-ヶー])テク(?![ァ-ヶー])|\\bTeku\\b",
    "paths": [
      "M37 30 L42 35 L25 76 L60 98 L95 76 L78 35 L83 30 M37 30 Q60 35 83 30",
      "M60 98 V161 M37 166 Q60 158 83 166 Z"
    ],
    "source": "公式の参考情報を参照",
    "url": "https://rastal.com/en/product-search/teku-set/"
  },
  {
    "id": "stange",
    "name": "シュタンゲ",
    "description": "細い筒をそのまま立てたような円筒形。ケルシュ用の代表形には脚や取っ手がありません。",
    "pattern": "シュタンゲ",
    "paths": [
      "M43 24 V163 Q60 168 77 163 V24 M43 24 Q60 29 77 24"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ10"
  },
  {
    "id": "alt",
    "name": "アルトのベッヒャー",
    "description": "ケルシュのシュタンゲを少し低く、太くしたような、脚のない円筒形です。",
    "pattern": "アルトビアのグラス|アルトの(?:グラス|ベッヒャー)",
    "paths": [
      "M35 53 V160 Q60 168 85 160 V53 M35 53 Q60 59 85 53"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ11"
  },
  {
    "id": "willi",
    "name": "ヴィリーベッヒャー",
    "description": "脚のない縦長のグラス。底から上へ少し広がり、飲み口の手前でわずかに内側へすぼまります。",
    "pattern": "ヴィリ[ー]?ベッヒャー|ヴィリー」ベッヒャー",
    "paths": [
      "M36 27 Q30 47 32 65 L43 162 Q60 168 77 162 L88 65 Q90 47 84 27 M36 27 Q60 33 84 27"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ12",
    "url": "https://www.sahmgastro.de/eshop/glas/bierglas/bierglas/willi-becher-0-3-l-ohne-eichstrich-s1084762051"
  },
  {
    "id": "tulip",
    "name": "チューリップ型",
    "description": "花のつぼみのように胴がふくらみ、口の方へ細くなる脚付きグラス。飲み口の縁が外へ開くタイプもあります。",
    "pattern": "チューリップ",
    "paths": [
      "M33 30 Q43 42 35 60 C12 99 40 121 60 121 C80 121 108 99 85 60 Q77 42 87 30 M33 30 Q60 38 87 30",
      "M60 121 V161 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ14",
    "url": "https://www.spiegelau.com/en-int/spiegelau-beer-classics-beer-tulip/4991884"
  },
  {
    "id": "goblet-straight",
    "name": "ゴブレット：直線的な代表例",
    "description": "ゴブレットは脚付きの杯の総称で、一つの形ではありません。この例は胴の側面がほぼ直線で、上へ少し広がります。",
    "pattern": "ゴブレット",
    "paths": [
      "M30 30 L42 101 Q60 123 78 101 L90 30 M30 30 Q60 37 90 30",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ15"
  },
  {
    "id": "goblet-tall",
    "name": "ゴブレット：背の高い代表例",
    "description": "細長い脚と、縦長で緩くふくらむ杯を組み合わせた代表例です。",
    "pattern": "ゴブレット",
    "paths": [
      "M35 20 C20 77 35 108 60 112 C85 108 100 77 85 20 M35 20 Q60 27 85 20",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ16"
  },
  {
    "id": "goblet-curved",
    "name": "ゴブレット：曲線のある代表例",
    "description": "下の胴がふくらみ、途中でくびれて、口が再び広がる代表例です。",
    "pattern": "ゴブレット",
    "paths": [
      "M28 28 C51 50 18 70 29 96 Q38 114 60 114 Q82 114 91 96 C102 70 69 50 92 28 M28 28 Q60 36 92 28",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ17"
  },
  {
    "id": "chalice",
    "name": "聖杯型（シャリス）",
    "description": "ミサの杯を思わせる、脚と台座の付いた広口の形。丸く広がった杯を、下から脚で支えます。",
    "pattern": "聖杯|シャリス",
    "paths": [
      "M17 52 Q20 110 60 112 Q100 110 103 52 M17 52 Q60 63 103 52",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ19"
  },
  {
    "id": "snifter",
    "name": "スニフター／ブランデー・コニャックグラス",
    "description": "短い脚の上に、丸く大きな胴が載り、飲み口は狭くすぼまる形。手のひらに胴が収まるような輪郭です。",
    "pattern": "スニフター|ブランデーグラス|コニャックグラス",
    "paths": [
      "M39 45 C-2 113 20 140 60 140 C100 140 122 113 81 45 M39 45 Q60 52 81 45",
      "M60 140 V162 M36 168 Q60 159 84 168 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ20"
  },
  {
    "id": "flute",
    "name": "フルート型",
    "description": "細長い笛のような胴に、長い脚と台座が付いた形。シャンパングラスの代表形の一つで、製品によって形は異なります。",
    "pattern": "フルート|シャンパングラス",
    "paths": [
      "M44 20 Q37 105 60 115 Q83 105 76 20 M44 20 Q60 25 76 20",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ21"
  },
  {
    "id": "coupe",
    "name": "クープ型",
    "description": "浅い皿のように広がった杯に、長い脚を付けた形。シャンパングラスには、このクープ型などもあり、名前だけでは一つの形に決まりません。",
    "pattern": "クープ|シャンパングラス",
    "paths": [
      "M15 45 Q25 85 60 85 Q95 85 105 45 M15 45 Q60 56 105 45",
      "M60 85 V162 M37 167 Q60 159 83 167 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ21"
  },
  {
    "id": "pint",
    "name": "パイントグラス：代表例",
    "description": "パイントは本来、容量の単位で、形は一つではありません。図は脚がなく、底より口が広い縦長の代表例です。",
    "pattern": "パイント",
    "paths": [
      "M27 30 L40 162 Q60 168 80 162 L93 30 M27 30 Q60 37 93 30"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ12"
  },
  {
    "id": "nonic",
    "name": "ノニック型",
    "description": "脚のない縦長のグラスで、飲み口の少し下に、輪のような膨らみが一周しています。",
    "pattern": "ノニック",
    "paths": [
      "M33 27 L31 49 C20 53 23 65 33 68 L42 162 Q60 168 78 162 L87 68 C97 65 100 53 89 49 L87 27 M33 27 Q60 33 87 27 M33 68 Q60 75 87 68"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ12"
  },
  {
    "id": "weizen",
    "name": "ヴァイツェングラス",
    "description": "背が高く、下部が細くくびれ、上部がふくらんだ形。上にたっぷりの泡を受け止める空間があります。",
    "pattern": "ヴァイツェングラス",
    "paths": [
      "M33 17 C10 66 48 103 45 145 L40 164 Q60 170 80 164 L75 145 C72 103 110 66 87 17 M33 17 Q60 24 87 17"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ18",
    "url": "https://www.spiegelau.com/en-int/spiegelau-beer-classics-wheat-beer-glass/4991685"
  },
  {
    "id": "mug",
    "name": "ビアマグ／ジョッキ",
    "description": "横に取っ手が付いた、厚手の器。筒形を基本とし、ガラス製や陶器製があります。",
    "pattern": "ビアマグ|ジョッキ|(?:^|[^ァ-ヶー])マグ(?![ァ-ヶー])",
    "paths": [
      "M24 35 V158 Q48 166 76 158 V35 M24 35 Q48 43 76 35",
      "M76 57 C115 42 115 128 76 116 M77 70 C99 60 98 112 77 103"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ13"
  },
  {
    "id": "mass",
    "name": "マス（マース）",
    "description": "1リットルのビールを入れる大きなジョッキ。代表的なガラス製は、太い取っ手と厚い胴を持ちます。",
    "pattern": "(?:^|[^ァ-ヶー])マ[ー]?ス(?![ァ-ヶー])",
    "paths": [
      "M18 25 V158 Q46 170 78 158 V25 M18 25 Q46 36 78 25",
      "M78 48 C121 35 120 138 78 124 M78 64 C101 55 101 118 78 108",
      "M32 55 V135 M47 55 V140 M63 55 V135"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ13"
  },
  {
    "id": "sherry",
    "name": "シェリーグラス",
    "description": "少量用の小さな脚付きグラス。教材の例では、縦長の小さな杯が上へややすぼまっています。",
    "pattern": "シェリーグラス",
    "paths": [
      "M44 45 C30 90 40 116 60 116 C80 116 90 90 76 45 M44 45 Q60 50 76 45",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ21"
  },
  {
    "id": "wine",
    "name": "白ワイングラス",
    "description": "細い脚と台座があり、卵形の胴が口へ向かってすぼまる形です。",
    "pattern": "白ワイングラス",
    "paths": [
      "M37 25 C11 70 28 112 60 112 C92 112 109 70 83 25 M37 25 Q60 32 83 25",
      "M60 112 V162 M38 166 Q60 159 82 166 Z"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ21"
  },
  {
    "id": "whisky",
    "name": "ウイスキーグラス：ロックグラスの例",
    "description": "形は複数あります。教材の例は、脚のない背の低い円筒形で、底が厚いロックグラスです。製品によって形は異なります。",
    "pattern": "ウイスキーグラス|ロックグラス",
    "paths": [
      "M24 75 V159 Q60 169 96 159 V75 M24 75 Q60 86 96 75 M25 147 Q60 157 95 147"
    ],
    "source": "0914ビアグラス2026・PDF表示ページ21"
  },
  {
    "id": "stein",
    "name": "シュタイン：蓋付きの伝統的な例",
    "description": "この問題の伝統的な例は、取っ手付きの胴に、親指で開ける蝶番付きの蓋が付いています。蓋のない器もあり、図は代表例です。",
    "pattern": "(?:^|[^ァ-ヶー])シュタイン(?![ァ-ヶー])",
    "paths": [
      "M25 59 V159 Q50 167 77 159 V59 M20 57 Q26 42 51 36 Q73 42 81 57 Z",
      "M77 78 C114 60 114 136 77 125 M78 90 C99 79 99 120 78 112",
      "M81 57 L88 40 L92 43 L86 63"
    ],
    "source": "メーカー・ブランドの公開商品情報",
    "url": "https://king-werk.de/en/2023-Masterpiece-Beer-Stein-Multi-Color-Decor.html"
  },
  {
    "id": "boot",
    "name": "ブーツ型（シュティーフェル）",
    "description": "長靴をそのまま器にしたような形。上の筒から注ぎ、底の横に「つま先」が突き出しています。",
    "pattern": "ブーツ型|シュティーフェル",
    "paths": [
      "M27 22 L72 22 L68 120 Q76 134 97 135 Q114 139 108 159 Q76 168 24 159 Z M27 22 Q49 29 72 22"
    ],
    "source": "メーカー・ブランドの公開商品情報",
    "url": "https://stoelzle-lausitz.com/en/products/beer-boot"
  },
  {
    "id": "kwak",
    "name": "クワックのグラス：伝統的な型",
    "description": "この問題で扱う伝統的な型は、球状の下部から細い首が伸び、口へ向かって広がる形。丸底を木の台で支えます。現在は自立する平底型もあります。",
    "pattern": "クワック|御者のグラス",
    "paths": [
      "M37 16 Q55 63 52 96 C17 111 33 150 60 150 C87 150 103 111 68 96 Q65 63 83 16 M37 16 Q60 22 83 16",
      "M22 166 H96 V174 H22 Z M88 66 V166 M88 66 H69 M88 76 H71"
    ],
    "source": "メーカー・ブランドの公開商品情報",
    "url": "https://www.perfectdraft.com/en-gb/blog/post/how-should-kwak-be-served",
    "extraUrl": "https://www.bosteelsbrewery.com/kwak"
  },
  {
    "id": "seidla",
    "name": "ザイドラ：陶器ジョッキの代表例",
    "description": "フランケンで半リットルを指す呼び名。器の一例は、厚手で取っ手のある陶器のジョッキです。ガラスの器でも提供され、形は一つではありません。",
    "pattern": "ザイドラ|ザイドラー|Seidla",
    "paths": [
      "M29 59 Q18 106 26 156 Q49 169 77 156 Q85 106 73 59 M29 59 Q50 68 73 59",
      "M76 78 C116 66 116 139 78 128 M79 91 C100 83 100 121 80 114"
    ],
    "source": "メーカー・ブランドの公開商品情報",
    "url": "https://shop.schlenkerla.de/Schlenkerla-stein",
    "extraUrl": "https://shop.schlenkerla.de/Traditional-Schlenkerla-glass-05-litres"
  }
];
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const supplements = {'B-228':['stange'],'B-342':['tulip'],'GL26-006':['alt']};
function matching(question) {
 const text = [question?.question || '', ...(question?.choices || [])].join(' ');
 const extra = supplements[question?.id] || [];
 return entries.filter(entry => extra.includes(entry.id) || new RegExp(entry.pattern,'iu').test(text));
}
function diagram(entry) {
 return `<svg viewBox="0 0 120 180" role="img" aria-label="${escape(entry.name)}の模式図" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${entry.paths.map(d=>`<path d="${d}"/>`).join('')}</g></svg>`;
}
function forQuestion(question) {
 const found = matching(question); if (!found.length) return '';
 if (question?.id === 'GL26-008') found.sort((a,b) => Number(b.id === 'goblet-curved') - Number(a.id === 'goblet-curved')); 
 return `<section class="glass-guide" aria-label="グラスの形（参考）"><h3>グラスの形（参考）</h3><p class="glass-guide-notice">名前と形を結び付けるための参考です。選択肢の正誤とは別に示しています。図は独自の簡略模式図で、寸法・比率や商品の完全な再現ではありません。</p><div class="glass-guide-grid">${found.map(entry=>`<figure class="glass-guide-card" data-glass-id="${entry.id}">${diagram(entry)}<figcaption><h4>${escape(entry.name)}${question?.id === "GL26-008" && entry.id === "goblet-curved" ? "（この設問の曲線型）" : ""}</h4><p>${escape(entry.description)}</p><p class="glass-guide-source">形状の参考：${escape(entry.source)}${entry.url ? ` · <a href="${escape(entry.url)}" target="_blank" rel="noopener noreferrer">公式の参考情報</a>` : ''}${entry.extraUrl ? ` · <a href="${escape(entry.extraUrl)}" target="_blank" rel="noopener noreferrer">ブランドの補足情報</a>` : ''}</p></figcaption></figure>`).join('')}</div></section>`;
}
const api={entries,matching,forQuestion,diagram};
if(typeof module==='object' && module.exports) module.exports=api;
if(root) root.BierKompassGlassGuide=api;
})(typeof window==='undefined'?null:window);
