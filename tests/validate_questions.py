from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
QUESTIONS = DATA["questions"]
APP_JS = (ROOT / "app.js").read_text(encoding="utf-8")
INDEX_HTML = (ROOT / "index.html").read_text(encoding="utf-8")


def main() -> None:
    assert DATA["metadata"]["questionCount"] == 1000
    assert DATA["metadata"]["examQuestionCount"] == 50
    assert DATA["metadata"]["examMinutes"] == 40
    assert DATA["metadata"]["passingRate"] == 0.5
    assert len(QUESTIONS) == 1000
    assert len({question["id"] for question in QUESTIONS}) == 1000
    assert len({question["question"] for question in QUESTIONS}) == 1000
    signatures = {question["question"] + "\0" + "\0".join(question["choices"]) for question in QUESTIONS}
    assert len(signatures) == 1000
    paired_count = 0
    for question in QUESTIONS:
        assert question["type"] == "multiple"
        assert 0 <= len(question["correct"]) <= 3
        assert all(0 <= index < len(question["choices"]) for index in question["correct"])
        assert len(question["correct"]) == len(set(question["correct"]))
        assert len(question["choiceReasons"]) == len(question["choices"])
        assert question["sources"]
        assert all(source.get("filename") and source.get("locator") for source in question["sources"])
        assert question["frequencyTier"] in {"A", "B", "C"}
        assert not re.search(r"資料|記述と一致|記載され", question["question"])
        assert not question["question"].startswith("次の説明の空欄")
        assert all(question["question"].count(left) == question["question"].count(right) for left, right in [("(", ")"), ("（", "）"), ("「", "」"), ("『", "』")])
        assert not re.search(r"でが挙げる|について、が|としてに|昔なの|入れられの|^が", question["question"])
        if "2つの基礎的な問い" in question["question"]:
            paired_count += 1
        supporting_text = question["explanation"] + "\0" + "\0".join(question["choiceReasons"])
        assert not re.search(r"出典資料|資料が示す|資料では", supporting_text)
        assert not re.search(r"^（古く|^ーシップ|^これらの発明|^一般的に炭酸|^冬に氷|について、が", question["question"])
        assert all(not re.search(r"^[、,。]|[■□●▪]|講座終了後|レポート", choice) for choice in question["choices"])
    answer_counts = Counter(len(question["correct"]) for question in QUESTIONS)
    assert set(answer_counts) == {0, 1, 2, 3}
    assert paired_count >= 400
    assert 'const inputType = "checkbox"' in APP_JS
    assert 'type="radio"' not in APP_JS
    assert "broadExamSample(pool, count)" in APP_JS
    assert "broadQuestionScore(b) - broadQuestionScore(a)" in APP_JS
    assert "広く浅く" in INDEX_HTML
    assert Counter(question["frequencyTier"] for question in QUESTIONS) == {"A": 350, "B": 400, "C": 250}
    assert sum(category["count"] for category in DATA["metadata"]["categories"]) == 1000
    print(f"OK: 1,000 checkbox questions; answer counts={dict(sorted(answer_counts.items()))}; clear paired questions={paired_count}; unique IDs/stems/signatures; sources and 3 frequency tiers")


if __name__ == "__main__":
    main()
