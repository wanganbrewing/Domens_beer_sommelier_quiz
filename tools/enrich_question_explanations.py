"""Add concise learning explanations and hide excluded categories from the app."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "questions.json"
DEFAULT_OUTPUT = ROOT / "questions.json"
EXCLUDED_CATEGORIES = {"pairing"}
CATEGORY_REASON = {
    "raw_materials": "原材料の性質・役割",
    "brewing_process": "醸造工程の目的・作用",
    "fermentation": "酵母・発酵・熟成の働き",
    "beer_styles": "ビアスタイルの識別点",
    "history": "歴史・文化上の対応関係",
    "sensory": "官能評価上の判断",
    "off_flavor": "オフフレーバーの由来・知覚表現",
    "service_quality": "提供・保存・品質管理の要点",
    "quality_law": "品質・成分・規格上の整理",
    "integrated": "複数分野を横断する判断",
}


def normalize(value: str) -> str:
    value = re.sub(r"[\s・／/（）()\[\]【】「」『』・\-–—]", "", value)
    return value.lower()


def short(value: str, length: int = 58) -> str:
    value = re.sub(r"\s+", " ", value).strip("。 ")
    return value if len(value) <= length else value[: length - 1] + "…"


def subject(question: str) -> str:
    value = re.sub(r"〔[^〕]+〕", "", question)
    value = re.sub(r"（[^）]*(?:選べ|基準|手帳)[^）]*）", "", value)
    for separator in ("について", "の特徴", "の個性", "とは", "と呼", "はどれ", "を選", "を見分け", "の識別", "で正", "に関"):
        if separator in value:
            value = value.split(separator, 1)[0]
            break
    value = value.strip(" ：:？?。")
    return short(value, 42) or "この項目"


def correct_summary(question: dict) -> str:
    values = [f"「{short(question['choices'][index], 42)}」" for index in question["correct"]]
    return "、".join(values)


def load_style_profiles(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))["scenarios"]


def find_profile(value: str, profiles: list[dict]) -> dict | None:
    key = normalize(value)
    if len(key) < 3:
        return None
    candidates = []
    for profile in profiles:
        names = [profile["answer"], *profile["choices"]]
        for name in names:
            name_key = normalize(name)
            if key == name_key or (len(key) >= 4 and (key in name_key or name_key in key)):
                candidates.append(profile)
                break
    return candidates[0] if len({item["id"] for item in candidates}) == 1 else None


def correct_reason(question: dict, choice: str) -> str:
    topic = subject(question["question"])
    category = question["category"]
    if category == "beer_styles":
        return f"正答：「{short(choice)}」は「{topic}」に当てはまる特徴です。"
    label = CATEGORY_REASON.get(category, "設問の知識")
    return f"正答：「{short(choice)}」は、{label}として正しい内容です。"


def wrong_style_reason(
    question: dict,
    choice: str,
    profiles: list[dict],
    correct_choice_targets: dict[str, set[str]],
) -> str:
    topic = subject(question["question"])
    profile = find_profile(choice, profiles)
    if profile:
        return (
            f"誤答：「{short(choice)}」は「{profile['answer']}」に結び付く選択肢です。"
            f"同スタイルは「{short(profile['step2Characteristic'], 68)}」を識別軸にします。"
        )

    linked_targets = sorted(correct_choice_targets.get(normalize(choice), set()) - {topic})
    if len(linked_targets) == 1:
        return (
            f"誤答：「{short(choice)}」は「{linked_targets[0]}」に当てはまる特徴です。"
            f"この問題で問われている「{topic}」の特徴ではありません。"
        )

    answer_hint = correct_summary(question)
    if re.search(r"(?:ABV|IBU|EBC|°P|%|度|年|℃|比重|数値|[0-9０-９])", choice, re.IGNORECASE):
        return f"誤答：「{short(choice)}」に示された値は「{topic}」の範囲外です。正しい範囲は{answer_hint}です。"
    if re.search(r"(?:上面|下面|自然発酵|混合発酵|酵母|発酵|ラガー|エール)", choice):
        return f"誤答：「{short(choice)}」は発酵方式または酵母の特徴が「{topic}」と異なります。正しい特徴は{answer_hint}です。"
    if re.search(r"(?:色|淡|黄金|琥珀|褐色|黒|透明|濁|泡)", choice):
        return f"誤答：「{short(choice)}」は「{topic}」の典型的な外観ではありません。正しい特徴は{answer_hint}です。"
    if re.search(r"(?:香|苦味|甘|酸|塩味|ロースト|モルト|ホップ|バナナ|クローブ|果実|ドライ)", choice):
        return f"誤答：「{short(choice)}」は「{topic}」の典型的な香味ではありません。正しい特徴は{answer_hint}です。"
    if re.search(r"(?:麦芽|ホップ|水|副原料|糖|瓶内|樽|熟成|濾過|煮沸|濃縮)", choice):
        return f"誤答：「{short(choice)}」は「{topic}」で用いる原材料または工程と異なります。正しい内容は{answer_hint}です。"
    if re.search(r"(?:ドイツ|ベルギー|英国|イギリス|アメリカ|チェコ|地域|都市|修道院|協定|法律)", choice):
        return f"誤答：「{short(choice)}」は「{topic}」の産地または歴史的背景と一致しません。正しい内容は{answer_hint}です。"
    return f"誤答：「{short(choice)}」は「{topic}」に当てはまりません。正しい内容は{answer_hint}です。"


def wrong_general_reason(
    question: dict,
    choice: str,
    correct_choice_targets: dict[str, set[str]],
) -> str:
    """Explain a wrong choice with the fact the learner should remember instead."""
    topic = subject(question["question"])
    answer_hint = correct_summary(question)
    normalized_choice = normalize(choice)

    if "誤っている" in question["question"]:
        return (
            f"誤答としては選びません。「{short(choice)}」は正しい内容です。"
            "この設問は誤っている選択肢を選ぶ逆問です。"
        )

    misconception_corrections = (
        (r"エステル.*バター|バター.*エステル", "バター・バタースコッチ様の香りは主にジアセチルです。エステルはバナナ、洋梨、リンゴなどの果実様香に関係します。"),
        (r"青リンゴ|未熟.*リンゴ", "青リンゴ様香の代表的原因はアセトアルデヒドです。発酵・熟成が不十分な場合などに目立ちます。"),
        (r"クリームコーン|煮野菜", "クリームコーンや煮野菜様の香りはDMSが代表的原因です。麦汁煮沸や冷却、原料由来の前駆体と関係します。"),
        (r"紙|段ボール", "紙・段ボール様の香りは酸化で生じるトランス-2-ノネナールの代表的表現です。"),
        (r"スカンク|日光臭", "スカンク様の日光臭は、光でホップ成分が変化して生じる3-MBTが代表的原因です。"),
        (r"チーズ|イソ吉草酸", "古いチーズや汗様の香りはイソ吉草酸に結びつき、劣化したホップなどが原因になり得ます。"),
        (r"金属|血.*インク", "金属・血・インク様の風味は、鉄や銅などとの接触や設備由来の金属汚染を確認します。"),
    )
    for pattern, correction in misconception_corrections:
        if re.search(pattern, choice):
            return f"誤答：「{short(choice)}」は対応関係が異なります。{correction}"

    linked_targets = sorted(correct_choice_targets.get(normalized_choice, set()) - {topic})
    if len(linked_targets) == 1:
        return (
            f"誤答：「{short(choice)}」は「{linked_targets[0]}」で正答となる知識です。"
            f"この問題では{answer_hint}が正しい内容です。"
        )

    category_labels = {
        "raw_materials": "原材料の性質・用途の対応が異なります",
        "brewing_process": "工程の目的・順序・作用の対応が異なります",
        "fermentation": "酵母・発酵生成物・熟成作用の対応が異なります",
        "history": "人物・年代・地域・文化の対応が異なります",
        "sensory": "官能用語と知覚される特徴の対応が異なります",
        "off_flavor": "香味表現と原因物質・発生要因の対応が異なります",
        "service_quality": "提供・保存・設備管理の原則と異なります",
        "quality_law": "品質・成分・規格上の整理が異なります",
        "pairing": "料理とビールの強度・調和・対比の考え方と異なります",
        "integrated": "複数分野を合わせた判断条件と異なります",
    }
    reason = category_labels.get(question["category"], "設問の条件と異なります")
    return f"誤答：「{short(choice)}」は{reason}。正しくは{answer_hint}です。"


def overall_explanation(question: dict) -> str:
    topic = subject(question["question"])
    summary = correct_summary(question)
    if question["category"] == "beer_styles":
        return f"「{topic}」の識別では、{summary}が重要な特徴です。"
    label = CATEGORY_REASON.get(question["category"], "設問の要点")
    return f"{label}として正しい内容は、{summary}です。"


def enrich_questions(payload: dict, blind_path: Path | None = None) -> dict:
    questions = payload["questions"]
    metadata = payload["metadata"]
    profiles = load_style_profiles(blind_path or ROOT / "blind-tasting.json")

    correct_choice_targets: dict[str, set[str]] = defaultdict(set)
    for question in questions:
        if "誤っている" in question["question"]:
            continue
        target = subject(question["question"])
        for index in question["correct"]:
            correct_choice_targets[normalize(question["choices"][index])].add(target)

    for question in questions:
        question["active"] = question["category"] not in EXCLUDED_CATEGORIES
        if question["explanation"] == "添付資料に個別解説の記載はありません。":
            question["explanation"] = overall_explanation(question)
        for index, choice in enumerate(question["choices"]):
            if question["choiceReasons"][index].strip():
                continue
            if index in question["correct"]:
                question["choiceReasons"][index] = correct_reason(question, choice)
            elif question["category"] == "beer_styles":
                question["choiceReasons"][index] = wrong_style_reason(question, choice, profiles, correct_choice_targets)
            else:
                question["choiceReasons"][index] = wrong_general_reason(question, choice, correct_choice_targets)

    active_questions = [question for question in questions if question["active"]]
    active_category_counts = Counter(question["category"] for question in active_questions)
    active_tier_counts = Counter(question["frequencyTier"] for question in active_questions)
    metadata["activeQuestionCount"] = len(active_questions)
    metadata["excludedCategories"] = ["pairing"]
    metadata["excludedQuestionCount"] = len(questions) - len(active_questions)
    metadata["categories"] = [
        {**category, "count": active_category_counts[category["id"]]}
        for category in metadata["categories"]
        if category["id"] not in EXCLUDED_CATEGORIES
    ]
    metadata["frequencyTiers"] = [
        {**tier, "count": active_tier_counts[tier["id"]]}
        for tier in metadata["frequencyTiers"]
    ]
    metadata["explanationEnrichment"] = {
        "allCorrectChoicesExplained": True,
        "allWrongChoicesExplained": True,
        "method": "添付資料の正答、同一問題バンク内の対応知識、ブラインド判定のスタイル識別軸を相互参照",
    }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--blind-data", type=Path, default=ROOT / "blind-tasting.json")
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    enrich_questions(payload, args.blind_data)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    questions = payload["questions"]
    styles = [question for question in questions if question["category"] == "beer_styles"]
    print(json.dumps({
        "questions": len(questions),
        "active": payload["metadata"]["activeQuestionCount"],
        "excluded": payload["metadata"]["excludedQuestionCount"],
        "missingCorrectReasons": sum(sum(not question["choiceReasons"][index].strip() for index in question["correct"]) for question in questions),
        "missingStyleWrongReasons": sum(sum(not question["choiceReasons"][index].strip() for index in range(4) if index not in question["correct"]) for question in styles),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
