from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from refine_positive_and_alcohol_questions import EXTREME_ABV, categorize_abv_question


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"


def main() -> None:
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    by_id = {question["id"]: question for question in data["questions"]}
    assert set(EXTREME_ABV) <= set(by_id)
    for question_id, (actual, description) in EXTREME_ABV.items():
        categorize_abv_question(by_id[question_id], question_id, actual, description)
    answer_counts = Counter(len(question["correct"]) for question in data["questions"])
    data["metadata"]["multiAnswerQuestionCount"] = sum(
        count for answer_count, count in answer_counts.items() if answer_count >= 2
    )
    data["metadata"]["abvQuestionPolicy"] = (
        "従来問題内の度数問題は、高い（7.0〜15.0%程度）・中くらい（4.0〜6.9%程度）・"
        "低い（0.0〜3.9%程度）の3区分で問う。代表的な実数値は回答後の解説に示す。"
    )
    QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: categorized {len(EXTREME_ABV)} ABV questions; answer counts={dict(sorted(answer_counts.items()))}")


if __name__ == "__main__":
    main()
