"""Validate the imported integrated 1000-question bank and app wiring."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
QUESTIONS = DATA["questions"]
METADATA = DATA["metadata"]
APP_JS = (ROOT / "app.js").read_text(encoding="utf-8")
INDEX_HTML = (ROOT / "index.html").read_text(encoding="utf-8")
STYLE_JS = (ROOT / "style-quiz.js").read_text(encoding="utf-8")
STYLE_DATA = json.loads((ROOT / "style-quiz.json").read_text(encoding="utf-8"))

EXPECTED_TIERS = {"A": 400, "B": 350, "C": 250}
EXPECTED_ANSWERS = {1: 271, 2: 8, 3: 675, 4: 46}
EXPECTED_CATEGORIES = {
    "raw_materials": 110,
    "brewing_process": 50,
    "fermentation": 75,
    "beer_styles": 395,
    "history": 90,
    "sensory": 43,
    "off_flavor": 27,
    "service_quality": 80,
    "pairing": 50,
    "quality_law": 40,
    "integrated": 40,
}
EXPECTED_IDS = (
    [f"A-{number:03d}" for number in range(1, 151)]
    + [f"S-{number:03d}" for number in range(1, 61)]
    + [f"A-{number:03d}" for number in range(151, 341)]
    + [f"B-{number:03d}" for number in range(1, 351)]
    + [f"C-{number:03d}" for number in range(1, 251)]
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", "", value)


def main() -> None:
    assert METADATA["questionCount"] == 1000
    assert METADATA["studyQuestionCount"] == 50
    assert METADATA["examQuestionCount"] == 50
    assert METADATA["examMinutes"] == 40
    assert METADATA["passingRate"] == 0.5
    assert len(QUESTIONS) == 1000

    ids = [question["id"] for question in QUESTIONS]
    assert ids == EXPECTED_IDS
    assert len(ids) == len(set(ids)) == 1000
    assert all(not question_id.startswith("BK-") for question_id in ids)

    question_texts = [normalized(question["question"]) for question in QUESTIONS]
    assert all(question_texts)
    assert len(question_texts) == len(set(question_texts)) == 1000
    assert METADATA["duplicateQuestionTextCount"] == 0

    for question in QUESTIONS:
        assert question["type"] == "multiple"
        assert len(question["choices"]) == 4
        assert len(set(question["choices"])) == 4
        assert 1 <= len(question["correct"]) <= 4
        assert question["correct"] == sorted(set(question["correct"]))
        assert all(0 <= index < 4 for index in question["correct"])
        assert len(question["choiceReasons"]) == 4
        assert question["explanation"].strip()
        assert "**" not in question["question"]
        assert all("**" not in choice and "→ 加えて" not in choice for choice in question["choices"])
        assert len(question["sources"]) == 1
        source = question["sources"][0]
        assert source["filename"] == "ドゥーメンス予想問題1000問_完全統合版.md"
        assert source["locator"] == question["id"]
        assert source["unit"] == "問題ID"

    assert Counter(question["frequencyTier"] for question in QUESTIONS) == EXPECTED_TIERS
    assert {
        tier["id"]: tier["count"] for tier in METADATA["frequencyTiers"]
    } == EXPECTED_TIERS
    assert Counter(len(question["correct"]) for question in QUESTIONS) == EXPECTED_ANSWERS
    assert METADATA["answerCountDistribution"] == {
        str(key): value for key, value in EXPECTED_ANSWERS.items()
    }
    assert METADATA["multiAnswerQuestionCount"] == 729
    assert Counter(question["category"] for question in QUESTIONS) == EXPECTED_CATEGORIES
    assert {
        category["id"]: category["count"] for category in METADATA["categories"]
    } == EXPECTED_CATEGORIES

    source_import = METADATA["sourceImport"]
    assert source_import["mainQuestionCount"] == 1000
    assert source_import["appendixMockExamIncluded"] is False
    assert source_import["appendixMockExamQuestionCount"] == 50

    assert 'const APP_VERSION = "v31"' in APP_JS
    assert '"bierkompass-history-v20"' in APP_JS
    assert '"bierkompass-session-v20"' in APP_JS
    assert '"bierkompass-settings-v11"' in APP_JS
    assert "styles.css?v=31" in INDEX_HTML
    assert "app.js?v=31" in INDEX_HTML
    assert "style-quiz.js?v=31" in INDEX_HTML
    assert "1〜4" in INDEX_HTML
    assert "0〜3" not in INDEX_HTML
    assert "noindex, nofollow" in INDEX_HTML
    assert 'type="password"' in INDEX_HTML
    assert "styleQuizView" in INDEX_HTML
    assert "answerSafeText" in STYLE_JS
    assert 'fetch("style-quiz.json?v31"' in STYLE_JS
    assert "renderDiagnostic(target)" in STYLE_JS

    style_module = STYLE_DATA["styleModule"]
    assert len(style_module) == 60
    assert [item["id"] for item in style_module] == [
        f"S-{number:03d}" for number in range(1, 61)
    ]
    assert Counter(item["kind"] for item in style_module) == {
        "blind_identification": 25,
        "elimination_reasoning": 10,
        "comparison_axis": 15,
        "feature_matrix": 10,
    }
    assert all(len(item["choices"]) == 4 for item in style_module)
    assert all(item["correct"] for item in style_module)
    diagnostics = [style for style in STYLE_DATA["styles"] if "diagnostic" in style]
    assert len(diagnostics) == 25
    assert {style["diagnostic"]["id"] for style in diagnostics} == {
        f"S-{number:03d}" for number in range(1, 26)
    }
    assert all(
        style["diagnostic"]["correctChoice"]
        in style["diagnostic"]["choices"]
        for style in diagnostics
    )
    assert all(
        not any(
            choice in style["diagnostic"]["clue"]
            for choice in style["diagnostic"]["choices"]
        )
        for style in diagnostics
    )
    integrated = STYLE_DATA["metadata"]["integratedModule"]
    assert integrated == {
        "filename": "ドゥーメンス予想問題1000問_完全統合版.md",
        "questionCount": 60,
        "blindIdentificationCount": 25,
        "eliminationReasoningCount": 10,
        "comparisonAxisCount": 15,
        "featureMatrixCount": 10,
        "linkedStyleCount": 25,
    }

    print(
        "OK: 1000 imported questions; unique IDs/text; "
        "A/B/C=400/350/250; 60 style-module items and app v31 wiring verified"
    )


if __name__ == "__main__":
    main()
