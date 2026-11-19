"use strict";
// Fixed, reviewed collection. No generated questions and no change to the shared bank.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BierKompassPrediction = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const chapters = [
  {
    "title": "必須・定義",
    "fixedOrder": true,
    "items": [
      {
        "id": "B-207",
        "topic": "1516年・発布場所"
      },
      {
        "id": "A-185",
        "topic": "純粋令の原料・年号"
      },
      {
        "id": "PL26-002",
        "topic": "先行条例・バイエルン公国"
      },
      {
        "id": "C-231",
        "topic": "IBU・苦味"
      },
      {
        "id": "C-232",
        "topic": "EBCとSRM・色"
      },
      {
        "id": "C-233",
        "topic": "プラート度・エキス"
      },
      {
        "id": "C-242",
        "topic": "ABVとABW"
      }
    ]
  },
  {
    "title": "ビアスタイル",
    "fixedOrder": false,
    "items": [
      {
        "id": "ST26-001",
        "topic": "ラガー・下面発酵"
      },
      {
        "id": "ST26-002",
        "topic": "エール・上面発酵"
      },
      {
        "id": "ST26-003",
        "topic": "発酵形式と色・名前・強さの区別"
      },
      {
        "id": "ST26-004",
        "topic": "ホッピー"
      },
      {
        "id": "ST26-005",
        "topic": "モルティー"
      },
      {
        "id": "ST26-006",
        "topic": "淡色"
      },
      {
        "id": "ST26-007",
        "topic": "濃色"
      },
      {
        "id": "ST26-008",
        "topic": "色とアルコール度数の区別"
      },
      {
        "id": "ST26-009",
        "topic": "高アルコール"
      },
      {
        "id": "ST26-010",
        "topic": "低アルコール"
      },
      {
        "id": "ST26-011",
        "topic": "中アルコール"
      },
      {
        "id": "ST26-012",
        "topic": "強い酸味"
      }
    ]
  },
  {
    "title": "製造・工程",
    "fixedOrder": false,
    "items": [
      {
        "id": "A-001",
        "topic": "製麦の全体像"
      },
      {
        "id": "A-003",
        "topic": "製麦の発芽・酵素"
      },
      {
        "id": "A-005",
        "topic": "ベース麦芽"
      },
      {
        "id": "A-021",
        "topic": "ホップの働き"
      },
      {
        "id": "A-024",
        "topic": "ホップ精油と投入時期"
      },
      {
        "id": "A-036",
        "topic": "水・ミネラル"
      },
      {
        "id": "A-066",
        "topic": "醸造工程の順序"
      },
      {
        "id": "A-068",
        "topic": "糖化温度・発酵性"
      },
      {
        "id": "A-069",
        "topic": "アミラーゼ2種"
      },
      {
        "id": "A-072",
        "topic": "麦汁ろ過・穀皮"
      },
      {
        "id": "A-073",
        "topic": "煮沸の目的"
      },
      {
        "id": "A-074",
        "topic": "ワールプール"
      },
      {
        "id": "A-076",
        "topic": "酵母・主発酵・温度"
      },
      {
        "id": "A-077",
        "topic": "貯酒・熟成・清澄"
      },
      {
        "id": "BW26-001",
        "topic": "麦汁の糖"
      },
      {
        "id": "BW26-002",
        "topic": "マッシュpH・水"
      },
      {
        "id": "BW26-003",
        "topic": "主発酵と熟成の温度"
      }
    ]
  },
  {
    "title": "サービス・知識",
    "fixedOrder": false,
    "items": [
      {
        "id": "A-213",
        "topic": "五基本味"
      },
      {
        "id": "A-214",
        "topic": "味覚と香り・レトロネーザル"
      },
      {
        "id": "A-215",
        "topic": "口当たり"
      },
      {
        "id": "BP26-004",
        "topic": "ペアリングの基本設計"
      },
      {
        "id": "BP26-015",
        "topic": "ペアリングの香り・調理"
      },
      {
        "id": "A-261",
        "topic": "瓶ビールの保管"
      },
      {
        "id": "A-262",
        "topic": "長期熟成に向くスタイル"
      },
      {
        "id": "A-254",
        "topic": "ドラフトシステムの構成"
      },
      {
        "id": "DS26-010",
        "topic": "飽和圧力とビール温度・炭酸量"
      },
      {
        "id": "DS26-011",
        "topic": "ラインの長さ・内径・高さ・流量"
      },
      {
        "id": "DS26-012",
        "topic": "ライン・高さ・圧力の応用計算"
      },
      {
        "id": "DS26-016",
        "topic": "グラスの選択・すすぎ・注ぎ方"
      },
      {
        "id": "GL26-001",
        "topic": "グラス衛生"
      },
      {
        "id": "B-330",
        "topic": "グラス形状の効果"
      }
    ]
  }
];
  const ids = chapters.flatMap(chapter => chapter.items.map(item => item.id));
  const clone = value => JSON.parse(JSON.stringify(value));
  function questions(bank) {
    const pool = ids.map(id => bank.get(id));
    // Do not silently lose a required topic after a later bank update.
    return ids.length === 50 && new Set(ids).size === 50 && pool.every(q => q && q.active !== false) ? pool : [];
  }
  function orderedQuestions(bank, shuffle) {
    if (!questions(bank).length) return [];
    return chapters.flatMap(chapter => (chapter.fixedOrder ? chapter.items : shuffle(chapter.items)).map(item => bank.get(item.id)));
  }
  function sectionFor(id) { return chapters.find(chapter => chapter.items.some(item => item.id === id))?.title || ""; }
  function prepareQuestion(base) {
    const q = clone(base);
    if (q.predictionRevision === 1) return q;
    const addSource = (filename, url, section) => q.sources.push({filename, locator: url, section, status: "予想問題集の表現補足を一次情報と照合（2026-11-19）"});
    if (q.id === "A-185") {
      q.choices[3] = "1516年の条文に列挙される原料には、酵母の記載がない";
      q.choiceReasons[3] = "条文は大麦・ホップ・水を列挙しており、酵母は明記していません。発酵に酵母が関わらなかったという意味ではありません。";
      q.explanation = "1516年4月23日、バイエルンのインゴルシュタットで発布された条文は、大麦・ホップ・水を列挙し、販売価格も定めています。酵母は条文に明記されていません。後世の4原料（麦芽・ホップ・水・酵母）の説明と区別します。";
      addSource("Deutscher Brauer-Bund：1516年条文", "https://brauer-bund.de/reinheitsgebot/entstehung/wortlaut/", "当初の原料・年号・価格規定");
    }
    if (q.id === "C-231") {
      q.choices[0] = "イソα酸など、ビールの苦味成分を分析する尺度";
      q.choiceReasons[0] = "IBUはビールの苦味成分の分析値です。1 IBU ≒ イソα酸1 mg/Lという対応は目安で、分析には他の苦味成分なども影響します。知覚する苦さそのものの点数ではありません。";
      q.explanation = "IBUは国際苦味単位です。苦味成分を分析した指標で、イソα酸濃度だけを厳密に表すものではありません。感じる苦さは甘味や香味のバランスなどでも変わります。色はEBC/SRM、エキス濃度は°P、アルコールの容量割合はABVと区別します。";
      addSource("ASBC：Beer 23 Master the Method", "https://www.asbcnet.org/methods/beer-methods/beer-23-master-method", "IBU測定と抽出される苦味成分");
    }
    if (q.id === "A-073") {
      q.choices[2] = "DMSを蒸気とともに追い出し、その量を抑える";
      q.choiceReasons[2] = "煮沸では前駆体SMMの熱分解でDMSが生じる一方、揮発性のDMSは蒸気とともに除かれます。前駆体そのものがすべて蒸発する、という意味ではありません。";
      q.explanation += "【補足】前駆体SMMからDMSが生じる反応と、生じたDMSの揮散を区別します。";
      addSource("BJCP：Beer Characteristics", "https://www.bjcp.org/exam-certification/program/studying/beer-exam-study-guide/troubleshooting/", "DMSとSMM、煮沸による揮散");
    }
    if (q.id === "ST26-009") {
      q.question = "スタイルの典型的な特徴として、比較的アルコール度数が高いものを、すべて選んでください。";
      q.explanation += "【補足】高・中・低はこの学習の比較区分です。法的な共通区分や全製品に共通する7%の境界ではありません。教材のドッペルボックには6.6%の例も含まれます。";
    }
    if (q.id === "ST26-010") {
      q.question = "スタイルの典型的な特徴として、比較的アルコール度数が低いものを、すべて選んでください。";
      q.explanation += "【補足】典型的な特徴による比較であり、4.5%未満という全製品共通の境界を定めたものではありません。";
    }
    if (q.id === "ST26-011") q.explanation += "【補足】フォルビア（Vollbier）は原麦汁のエキス濃度による区分で、アルコール度数5%を定義する用語ではありません。原麦汁濃度とABVは別の量です。";
    if (q.id === "A-066") {
      q.question = "教材に示された標準的な醸造工程の順序として、正しいものをすべて選んでください。";
      q.explanation += "【補足】これは代表的な工程例です。無ろ過ビールなど、最終ろ過を行わない製法もあります。";
    }
    if (q.id === "A-068") {
      q.question = "一般的な麦芽の糖化温度域で、仕込み温度と麦汁の発酵性について、正しいものをすべて選んでください。";
      q.choices[1] = "低めの温度で糖化すると、発酵されやすい糖が多い麦汁になりやすい";
      q.choices[2] = "高めの温度で糖化すると、デキストリンが多く残りやすい";
      q.explanation += "【補足】通常の糖化温度域で他条件が近い場合の傾向です。極端な低温・高温まで一般化せず、時間・pH・原料・酵母による違いも考慮します。";
    }
    if (q.id === "A-077") {
      q.choiceReasons[3] = "伝統的な低温の貯酒は数時間で完了する工程ではありません。ラガーはドイツ語の貯蔵に関する語に由来し、lagern は『貯蔵する』という動詞です。";
      q.explanation += "【補足】温度や日数は製法によって異なります。ここでは伝統的な低温貯酒の基本作用を扱います。";
    }
    if (q.id === "A-214") {
      q.choiceReasons[2] = "鼻をつまむと香りの寄与が弱まります。甘味や苦味などの基本味、口当たりや温度の感覚までなくなるわけではありません。";
      q.explanation = "風味には基本味、鼻で感じる香り、口当たりなどが関わります。口から鼻へ抜ける香り（レトロネーザル）も重要です。甘味は舌先、苦味は舌の奥だけ、という固定的な味覚地図は正しくありません。【参照テキスト】「1-1感覚生理学、官能評価」p.11〜16";
    }
    if (q.id === "A-262") q.explanation += "【補足】長期熟成に向く可能性の比較です。どの製品でも長年おいしくなるという保証ではなく、製品の設計・栓・保管温度等に左右されます。製造者の保存案内を優先します。";
    if (q.id === "DS26-011") q.choiceReasons[1] = "流量など他の条件が同じなら、ラインが長いほど摩擦による損失が累積します。内径が小さいほど流れの抵抗が増え、必要な圧力も大きくなります。";
    q.predictionRevision = 1;
    return q;
  }
  return {questions, orderedQuestions, sectionFor, prepareQuestion, ids: [...ids], chapters: clone(chapters)};
});
