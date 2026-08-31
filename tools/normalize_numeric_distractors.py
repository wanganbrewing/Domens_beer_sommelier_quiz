from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"

# Keep distractors broad, but replace impossible future event years with
# historically possible alternatives. Years expressed as "years ago" are excluded.
REPLACEMENTS = {
    "BK-0525": {2144: 1945, 2303: 2005},
    "BK-0576": {2129: 1911, 2287: 2001},
    "BK-0603": {2142: 1944, 2301: 2004},
    "BK-0633": {2142: 1944, 2301: 2004},
    "BK-0634": {2174: 1944, 2335: 2014},
    "BK-0639": {2165: 1947},
    "BK-0649": {2144: 1945, 2303: 2005},
    "BK-0653": {2164: 1949, 2324: 2019},
    "BK-0658": {2165: 1945, 2325: 2015},
    "BK-0678": {2129: 1911, 2287: 2001},
    "BK-0725": {2165: 1945, 2325: 2015},
    "BK-0844": {2170: 1949, 2331: 2019},
    "BK-0855": {2174: 1944, 2335: 2014},
    "BK-0861": {2170: 1949, 2331: 2019},
    "BK-0930": {2165: 1947},
    "BK-0963": {2164: 1949, 2324: 2019},
}


def replace_year(text: str, old: int, new: int) -> str:
    return re.sub(rf"(?<!\d){old}年(?!前)", f"{new}年", text)


def main() -> None:
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    questions = {question["id"]: question for question in data["questions"]}
    changed = 0
    for question_id, replacements in REPLACEMENTS.items():
        question = questions[question_id]
        for old, new in replacements.items():
            for index, choice in enumerate(question["choices"]):
                updated_choice = replace_year(choice, old, new)
                if updated_choice == choice:
                    continue
                question["choices"][index] = updated_choice
                question["choiceReasons"][index] = replace_year(question["choiceReasons"][index], old, new)
                changed += 1

    data["metadata"]["numericDistractorPolicy"] = "数値差は広く許容するが、未来の歴史年や100%超の割合など条件上あり得ない値は使用しない。"
    QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    remaining = [
        (question["id"], choice, int(match.group(1)))
        for question in data["questions"]
        for choice in question["choices"]
        for match in re.finditer(r"(?<![\d,])(\d{3,4})年(?!前)", choice)
        if int(match.group(1)) > 2026
    ]
    assert not remaining, remaining
    print(f"OK: replaced {changed} impossible future-year distractors")


if __name__ == "__main__":
    main()
