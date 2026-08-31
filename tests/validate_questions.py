from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
QUESTIONS = DATA["questions"]


def main() -> None:
    assert DATA["metadata"]["questionCount"] == 1000
    assert len(QUESTIONS) == 1000
    assert len({question["id"] for question in QUESTIONS}) == 1000
    signatures = {question["question"] + "\0" + "\0".join(question["choices"]) for question in QUESTIONS}
    assert len(signatures) == 1000
    for question in QUESTIONS:
        assert question["type"] in {"single", "multiple"}
        assert question["correct"]
        assert all(0 <= index < len(question["choices"]) for index in question["correct"])
        assert len(question["choiceReasons"]) == len(question["choices"])
        assert question["sources"]
        assert all(source.get("filename") and source.get("locator") for source in question["sources"])
        assert question["frequencyTier"] in {"A", "B", "C"}
        if question["type"] == "single":
            assert len(question["correct"]) == 1
        else:
            assert len(question["correct"]) >= 2
    assert Counter(question["frequencyTier"] for question in QUESTIONS) == {"A": 350, "B": 400, "C": 250}
    assert sum(category["count"] for category in DATA["metadata"]["categories"]) == 1000
    print("OK: 1,000 questions, unique IDs/signatures, answers, sources, and 3 frequency tiers")


if __name__ == "__main__":
    main()
