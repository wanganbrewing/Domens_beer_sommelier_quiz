"""Remove answer-revealing hints and demote peripheral facts to tier C."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"

BLACKCURRANT_IDS = {"BK-0034", "BK-0480"}
WATER_STYLE_IDS = {"BK-0011", "BK-0038", "BK-0039", "BK-0706"}
EXTREME_IBU_IDS = {"BK-0277", "BK-0320", "BK-0449", "BK-0554", "BK-0561", "BK-0901"}
HARDNESS_ONLY_IDS = {
    "BK-0005", "BK-0006", "BK-0007", "BK-0008",
    "BK-0011", "BK-0038", "BK-0039", "BK-0061",
    "BK-0069", "BK-0070", "BK-0071", "BK-0123",
    "BK-0147", "BK-0191", "BK-0202", "BK-0706",
    "BK-0757", "BK-0834",
}
CONSUMPTION_PATTERN = re.compile(r"(?:一人|1人)当たり.*ビール消費量|ビール消費量.*(?:一人|1人)当たり")
IBU_EBC_PATTERN = re.compile(r"(?<![A-Za-z])(?:IBU|EBC)(?![A-Za-z])")


def strip_parenthetical(choice: str) -> str:
    return re.sub(r"\s*[（(][^）)]*[）)]\s*", "", choice).strip()


def main() -> None:
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    by_id = {question["id"]: question for question in data["questions"]}
    assert BLACKCURRANT_IDS | WATER_STYLE_IDS | HARDNESS_ONLY_IDS <= set(by_id)

    blackcurrant_choices = [
        "ミルセン",
        "リナロール",
        "4MMP（4-メルカプト-4-メチルペンタン-2-オン）",
        "ゲラニオール",
    ]
    blackcurrant_reasons = [
        "ミルセンはホップ精油の主要成分ですが、この設問の条件に該当する成分ではありません。",
        "リナロールはフローラルな香りに関係し、この設問の条件には該当しません。",
        "4MMPは黒すぐりを思わせる香りを持ち、フレーバー閾値が10〜50 ppbと非常に低い成分です。",
        "ゲラニオールはフローラルな香りに関係し、この設問の条件には該当しません。",
    ]

    by_id["BK-0034"]["question"] = "ホップ精油成分のうち、フレーバー閾値が10〜50 ppbと非常に低い成分はどれですか。"
    by_id["BK-0480"]["question"] = "ホップ精油成分のうち、黒すぐり（カシス）を思わせる香りに関係する成分はどれですか。"
    for question_id in BLACKCURRANT_IDS:
        question = by_id[question_id]
        question["choices"] = blackcurrant_choices.copy()
        question["correct"] = [2]
        question["explanation"] = "4MMPは黒すぐりを思わせる香りに関係し、フレーバー閾値が10〜50 ppbと非常に低いホップ由来成分です。"
        question["choiceReasons"] = blackcurrant_reasons.copy()

    # These choices repeated the city/hardness clue verbatim.  Keep the clue in
    # the stem and present only the style names as answer choices.
    for question_id in WATER_STYLE_IDS:
        question = by_id[question_id]
        question["choices"] = [strip_parenthetical(choice) for choice in question["choices"]]
        question["choiceReasons"] = [
            f"「{choice}」は設問の条件に合う正しいスタイルです。" if index in question["correct"]
            else f"「{choice}」は設問の条件に合わないため、選択対象ではありません。"
            for index, choice in enumerate(question["choices"])
        ]

    demoted: set[str] = set()
    for question in data["questions"]:
        text = question["question"] + " " + " ".join(question["choices"])
        is_consumption = bool(CONSUMPTION_PATTERN.search(question["question"]))
        is_non_extreme_ibu_ebc = bool(IBU_EBC_PATTERN.search(text)) and question["id"] not in EXTREME_IBU_IDS
        is_hardness_only = question["id"] in HARDNESS_ONLY_IDS
        if is_consumption or is_non_extreme_ibu_ebc or is_hardness_only:
            question["frequencyTier"] = "C"
            demoted.add(question["id"])

    tier_counts = Counter(question["frequencyTier"] for question in data["questions"])
    for tier in data["metadata"]["frequencyTiers"]:
        tier["count"] = tier_counts[tier["id"]]
    data["metadata"]["frequencyTierPolicy"] = (
        "国別の一人当たりビール消費量、水の硬度だけを問う設問、"
        "極端な低値・高値を除くIBU/EBCの数値問題はCに分類。"
    )

    assert all(by_id[question_id]["frequencyTier"] == "C" for question_id in HARDNESS_ONLY_IDS)
    assert all(by_id[question_id]["frequencyTier"] != "C" or question_id in {"BK-0901"} for question_id in EXTREME_IBU_IDS)
    for question_id in BLACKCURRANT_IDS:
        question = by_id[question_id]
        assert not any("黒すぐり" in choice or "カシス" in choice for choice in question["choices"])
    assert len({question["question"] for question in data["questions"]}) == len(data["questions"])

    QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: clue fixes={len(BLACKCURRANT_IDS) + len(WATER_STYLE_IDS)}; tier C assignments={len(demoted)}; tiers={dict(sorted(tier_counts.items()))}")


if __name__ == "__main__":
    main()
