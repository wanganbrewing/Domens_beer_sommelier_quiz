from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from pypdf import PdfReader


SOURCE_FILENAME = "Doemens_Beer_Styles_Mobile_Fluffy_Foam.pdf"

REPLACEMENT_IDS = """
BK-0060 BK-0064 BK-0096 BK-0097 BK-0098 BK-0119 BK-0125 BK-0127 BK-0135
BK-0144 BK-0145 BK-0156 BK-0169 BK-0182 BK-0221 BK-0329 BK-0363
BK-0375 BK-0389 BK-0392 BK-0433 BK-0439 BK-0440 BK-0441 BK-0442 BK-0443
BK-0460 BK-0462 BK-0468 BK-0469 BK-0470 BK-0475 BK-0481 BK-0482 BK-0489
BK-0490 BK-0492 BK-0493 BK-0494 BK-0134 BK-0138 BK-0163 BK-0207 BK-0458
BK-0501 BK-0506 BK-0558 BK-0581 BK-0584 BK-0600 BK-0632 BK-0684
""".split()

STYLE_NAMES = [
    "ジャーマン・ピルスナー",
    "ミュンヘナー・ヘレス",
    "ドルトムンダー／エクスポート",
    "メルツェン／フェストビア",
    "ミュンヘナー・ドゥンケル",
    "シュヴァルツビア",
    "ドッペルボック",
    "アイスボック",
    "ラオホビア",
    "ケラービア／ツヴィッケル",
    "シャンクビア／ライトビール",
    "ボヘミアン・ピルスナー",
    "チェコ・ダークラガー",
    "アメリカン・ライトラガー",
    "ジャパニーズ・ドライラガー",
    "ウィンナーラガー／メキシカン",
    "バルチック・ポーター",
    "ヘーフェ・ヴァイス",
    "クリスタル・ヴァイツェン",
    "ダークヴァイツェン／ボック",
    "ケルシュ",
    "アルトビア（デュッセルドルフ）",
    "ベルリナー・ヴァイセ",
    "ゴーゼ",
    "ベルジャン・ホワイト",
    "ゴールデンストロングエール",
    "トラピスト・ダブル",
    "トラピスト・トリプル",
    "クアドルペル／ダークストロング",
    "セゾン",
    "オルヴァル",
    "フランダース・レッドエール",
    "ストレート・ランビック／グーズ",
    "クリーク",
    "ビター／ESB",
    "イングリッシュ・ペールエール",
    "イングリッシュ・ブラウンエール",
    "イングリッシュ・バーレイワイン",
    "ロンドン・ポーター",
    "アイリッシュ・ドライスタウト",
    "インペリアルスタウト",
    "スコッチエール（ウィーヘビー）",
    "アメリカン・ペールエール",
    "アメリカン・IPA",
    "インペリアル／ダブルIPA",
    "ヘイジーIPA／NEIPA",
    "アメリカン・ウィートエール",
    "アメリカン・バーレイワイン",
    "ビエール・ド・ギャルド",
    "イタリアン・グレープエール",
    "サハティ",
    "コーネル",
    "ニュージーランドIPA／XPA",
]

STYLE_GROUPS = [
    "pale_lager", "pale_lager", "pale_lager", "amber_lager", "dark_lager",
    "dark_lager", "strong_lager", "strong_lager", "smoked_lager", "pale_lager",
    "pale_lager", "pale_lager", "dark_lager", "pale_lager", "pale_lager",
    "amber_lager", "strong_lager", "wheat", "wheat", "wheat", "hybrid", "hybrid",
    "sour", "sour", "wheat", "belgian", "belgian", "belgian", "belgian",
    "farmhouse", "sour", "sour", "sour", "sour", "british", "british", "british",
    "strong_british", "dark_british", "dark_british", "dark_british", "strong_british",
    "hoppy", "hoppy", "hoppy", "hoppy", "wheat", "strong_hoppy", "farmhouse",
    "fruit", "farmhouse_raw", "farmhouse_raw", "hoppy",
]

DISTRACTOR_NAMES_BY_GROUP = {
    "pale_lager": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "amber_lager": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "dark_lager": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "strong_lager": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "smoked_lager": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "wheat": ("アイリッシュ・ドライスタウト", "インペリアル／ダブルIPA"),
    "hybrid": ("アイリッシュ・ドライスタウト", "インペリアル／ダブルIPA"),
    "sour": ("ジャーマン・ピルスナー", "アイスボック"),
    "belgian": ("ジャーマン・ピルスナー", "アイリッシュ・ドライスタウト"),
    "farmhouse": ("ジャーマン・ピルスナー", "アイリッシュ・ドライスタウト"),
    "british": ("ゴーゼ", "インペリアル／ダブルIPA"),
    "strong_british": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "dark_british": ("ゴーゼ", "ヘーフェ・ヴァイス"),
    "hoppy": ("ゴーゼ", "アイリッシュ・ドライスタウト"),
    "strong_hoppy": ("ゴーゼ", "アイリッシュ・ドライスタウト"),
    "fruit": ("ジャーマン・ピルスナー", "アイリッシュ・ドライスタウト"),
    "farmhouse_raw": ("ジャーマン・ピルスナー", "アイリッシュ・ドライスタウト"),
}

EXCLUDED_STYLE_NAMES = {"ジャパニーズ・ドライラガー"}


def extract_between(block: str, start: str, end: str) -> str:
    match = re.search(re.escape(start) + r"(.*?)" + re.escape(end), block)
    if not match:
        raise ValueError(f"Could not extract {start!r} ... {end!r}")
    return re.sub(r"\s+", " ", match.group(1)).strip()


def remove_gravity_notation(text: str) -> str:
    text = re.sub(r"低初期比重（[^）]+）", "低濃度の麦汁", text)
    text = re.sub(r"初期比重\d+(?:\.\d+)?(?:[〜-]\d+(?:\.\d+)?)?°P(?:以上)?の", "高比重仕込みによる", text)
    text = re.sub(r"比重12（OG[^）]+）に達する", "高比重の", text)
    text = re.sub(r"（OG[^）]+）", "", text)
    text = text.replace("初期比重", "仕込み麦汁の濃さ").replace("最終比重", "発酵後の麦汁濃度")
    return re.sub(r"\s+", " ", text).strip()


def extract_styles(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    styles: list[dict] = []
    for page_number, page in enumerate(reader.pages, 1):
        lines = [line.strip() for line in (page.extract_text() or "").splitlines() if line.strip()]
        representative_indexes = [index for index, line in enumerate(lines) if line.startswith("★ 代表:")]
        for item_index, representative_index in enumerate(representative_indexes):
            start = representative_index - 1
            if item_index + 1 < len(representative_indexes):
                end = representative_indexes[item_index + 1] - 1
            else:
                end = len(lines)
            block = "".join(lines[start:end])
            styles.append(
                {
                    "page": page_number,
                    "source_heading": lines[start],
                    "detail": remove_gravity_notation(extract_between(block, "Step 1 詳細説明", "Step 2 特徴定義")),
                    "definition": remove_gravity_notation(extract_between(block, "Step 2 特徴定義", "Step 3 原料工程")),
                    "ingredients": remove_gravity_notation(extract_between(block, "Step 3 原料工程", "Step 4 スタイル結論")),
                }
            )
    if len(styles) != len(STYLE_NAMES) or len(STYLE_NAMES) != len(STYLE_GROUPS):
        raise ValueError(f"Expected {len(STYLE_NAMES)} styles, found {len(styles)}")
    for style, name, group in zip(styles, STYLE_NAMES, STYLE_GROUPS, strict=True):
        style["name"] = name
        style["group"] = group
    return [style for style in styles if style["name"] not in EXCLUDED_STYLE_NAMES]


def build_question(
    question_id: str,
    tier: str,
    style: dict,
    distractors: tuple[dict, dict],
    fields: tuple[str, str],
) -> dict:
    field_labels = {
        "detail": "詳細説明",
        "definition": "特徴定義",
        "ingredients": "原材料・工程",
    }
    first_field, second_field = fields
    first_distractor, second_distractor = distractors
    choices = [
        f"{field_labels[first_field]}：{style[first_field]}",
        f"{field_labels[first_field]}：{first_distractor[first_field]}",
        f"{field_labels[second_field]}：{style[second_field]}",
        f"{field_labels[second_field]}：{second_distractor[second_field]}",
    ]
    explanation = (
        f"{style['name']}は、外観・香味、際立つ特徴、原材料・工程から整理できます。"
        "正答の2項目は同じスタイル像を示します。"
    )
    reasons = [
        f"この{field_labels[first_field]}は{style['name']}に合致します。",
        (
            f"これは{first_distractor['name']}の{field_labels[first_field]}であり、"
            f"{style['name']}には合致しません。"
        ),
        f"この{field_labels[second_field]}は{style['name']}に合致します。",
        (
            f"これは{second_distractor['name']}の{field_labels[second_field]}であり、"
            f"{style['name']}には合致しません。"
        ),
    ]
    page = style["page"]
    return {
        "category": "beer_styles",
        "type": "multiple",
        "question": f"{style['name']}に合致する詳細説明・特徴定義・原材料／工程をすべて選んでください。",
        "choices": choices,
        "correct": [0, 2],
        "explanation": explanation,
        "choiceReasons": reasons,
        "sources": [
            {
                "filename": SOURCE_FILENAME,
                "locator": f"PDF表示ページ{page}（印刷ページ{page}）",
                "page": page,
                "unit": "ページ",
                "section": f"{style['name']} - Step 1〜3",
                "raw": f"{SOURCE_FILENAME} p.{page} {style['source_heading']}",
            }
        ],
        "frequencyTier": tier,
        "id": question_id,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--questions", type=Path, default=Path("questions.json"))
    args = parser.parse_args()

    styles = extract_styles(args.pdf)
    styles_by_name = {style["name"]: style for style in styles}
    data = json.loads(args.questions.read_text(encoding="utf-8"))
    by_id = {question["id"]: question for question in data["questions"]}
    if set(REPLACEMENT_IDS) - set(by_id):
        raise ValueError("One or more replacement IDs are missing")

    replacements = {}
    for index, (question_id, style) in enumerate(zip(REPLACEMENT_IDS, styles, strict=True)):
        old = by_id[question_id]
        if old["category"] != "beer_styles":
            raise ValueError(f"{question_id} is not a beer style question")
        distractor_names = DISTRACTOR_NAMES_BY_GROUP[style["group"]]
        distractors = tuple(styles_by_name[name] for name in distractor_names)
        field_pairs = (
            ("detail", "definition"),
            ("definition", "ingredients"),
            ("detail", "ingredients"),
        )
        replacements[question_id] = build_question(
            question_id,
            old["frequencyTier"],
            style,
            distractors,
            field_pairs[index % len(field_pairs)],
        )

    data["questions"] = [replacements.get(question["id"], question) for question in data["questions"]]
    category_counts = Counter(question["category"] for question in data["questions"])
    tier_counts = Counter(question["frequencyTier"] for question in data["questions"])
    for category in data["metadata"]["categories"]:
        category["count"] = category_counts[category["id"]]
    for tier in data["metadata"]["frequencyTiers"]:
        tier["count"] = tier_counts[tier["id"]]
    data["metadata"]["version"] = "2026-08-31-doemens-global-v6"
    data["metadata"]["multiAnswerQuestionCount"] = sum(
        len(question["correct"]) >= 2 for question in data["questions"]
    )
    data["metadata"]["mobileStyleGuideIntegration"] = {
        "source": SOURCE_FILENAME,
        "questionCount": len(REPLACEMENT_IDS),
        "questionIds": REPLACEMENT_IDS,
        "policy": "各スタイルの詳細説明・特徴定義・原材料工程を問う。誤答は近縁スタイルではなく、違いが明確な別スタイルから採用する。日本固有スタイルは従来方針に従い除外する。",
    }
    args.questions.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: integrated {len(replacements)} style-guide questions; tiers={dict(sorted(tier_counts.items()))}")


if __name__ == "__main__":
    main()
