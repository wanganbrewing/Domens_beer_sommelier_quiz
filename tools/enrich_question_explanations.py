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
    for separator in ("について", "の特徴", "の個性", "とは", "と呼", "はどれ", "を選", "で正", "に関"):
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
        return f"正答：「{topic}」を見分けるための要点です。覚える内容は「{short(choice)}」です。"
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
            f"誤答：「{short(choice)}」は「{linked_targets[0]}」を整理するときに使われる内容です。"
            f"「{topic}」とは識別軸が異なります。"
        )

    answer_hint = correct_summary(question)
    if re.search(r"(?:ABV|IBU|EBC|°P|%|度|年|℃|比重|数値|[0-9０-９])", choice, re.IGNORECASE):
        return f"誤答：「{short(choice)}」の数値・範囲は「{topic}」の基準と一致しません。正答側の{answer_hint}と対比してください。"
    if re.search(r"(?:上面|下面|自然発酵|混合発酵|酵母|発酵|ラガー|エール)", choice):
        return f"誤答：「{short(choice)}」は発酵系統または酵母の対応が異なります。「{topic}」では{answer_hint}が判断材料です。"
    if re.search(r"(?:色|淡|黄金|琥珀|褐色|黒|透明|濁|泡)", choice):
        return f"誤答：「{short(choice)}」は外観の特徴が「{topic}」と一致しません。外観は正答側の{answer_hint}で整理します。"
    if re.search(r"(?:香|苦味|甘|酸|塩味|ロースト|モルト|ホップ|バナナ|クローブ|果実|ドライ)", choice):
        return f"誤答：「{short(choice)}」は香味の方向が「{topic}」と異なります。識別には正答側の{answer_hint}を使います。"
    if re.search(r"(?:麦芽|ホップ|水|副原料|糖|瓶内|樽|熟成|濾過|煮沸|濃縮)", choice):
        return f"誤答：「{short(choice)}」は原材料・工程の組み合わせが「{topic}」と一致しません。正答側の{answer_hint}を確認してください。"
    if re.search(r"(?:ドイツ|ベルギー|英国|イギリス|アメリカ|チェコ|地域|都市|修道院|協定|法律)", choice):
        return f"誤答：「{short(choice)}」は産地・歴史的背景の対応が異なります。「{topic}」は正答側の{answer_hint}で整理します。"
    return f"誤答：「{short(choice)}」は「{topic}」の代表的な識別点ではありません。正答側の{answer_hint}を優先して覚えます。"


def overall_explanation(question: dict) -> str:
    topic = subject(question["question"])
    summary = correct_summary(question)
    if question["category"] == "beer_styles":
        return f"「{topic}」を判別するときは、{summary}を一組の識別ポイントとして覚えます。"
    label = CATEGORY_REASON.get(question["category"], "設問の要点")
    return f"この問題では{label}として、{summary}が正しい組み合わせです。"


def enrich_questions(payload: dict, blind_path: Path | None = None) -> dict:
    questions = payload["questions"]
    metadata = payload["metadata"]
    profiles = load_style_profiles(blind_path or ROOT / "blind-tasting.json")

    correct_choice_targets: dict[str, set[str]] = defaultdict(set)
    for question in questions:
        if question["category"] != "beer_styles":
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
        "allBeerStyleWrongChoicesExplained": True,
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
