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
BLIND_JS = (ROOT / "blind-quiz.js").read_text(encoding="utf-8")
STYLE_LINKS_JS = (ROOT / "style-links.js").read_text(encoding="utf-8")

EXPECTED_TIERS = {"A": 400, "B": 350, "C": 250}
ACTIVE_TIERS = {"A": 375, "B": 325, "C": 250}
EXPECTED_ANSWERS = {1: 133, 2: 211, 3: 420, 4: 236}
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
ACTIVE_CATEGORIES = {key: value for key, value in EXPECTED_CATEGORIES.items() if key != "pairing"}
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
    cross_reference_choice = re.compile(
        r"[（(][^）)]*[a-dA-D]\s*(?:と|、|,|・|〜|～|/|／|\+)\s*[a-dA-D][^）)]*[）)]"
    )
    unnatural_language = re.compile(
        r"陳旧|前面度|〔逆問|手帳基準|ズレ|収束|裏取り|正答側|"
        r"覚える内容|数値・範囲|香味の方向|&#xA0;|上面エステル|"
        r"エステル皆無|焦げ酸味|甘香ばしさ|アーシーさ|高Cl=|高SO4="
    )
    answer_count_hint = re.compile(r"[0-9０-９]+つ選べ")
    assert METADATA["questionCount"] == 1000
    assert METADATA["activeQuestionCount"] == 950
    assert METADATA["excludedQuestionCount"] == 50
    assert METADATA["excludedCategories"] == ["pairing"]
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
    assert len(set(question_texts)) == 890
    assert METADATA["duplicateQuestionTextCount"] == 30
    assert len({(normalized(question["question"]), tuple(question["choices"])) for question in QUESTIONS}) == 1000

    for question in QUESTIONS:
        assert question["type"] == "multiple"
        assert len(question["choices"]) == 4
        assert len(set(question["choices"])) == 4
        assert 1 <= len(question["correct"]) <= 4
        assert question["correct"] == sorted(set(question["correct"]))
        assert all(0 <= index < 4 for index in question["correct"])
        assert len(question["choiceReasons"]) == 4
        assert question["explanation"].strip()
        assert all(reason.strip() for reason in question["choiceReasons"])
        assert not re.search(r"[:：]\s*$", question["question"])
        assert not answer_count_hint.search(question["question"])
        assert not unnatural_language.search(question["question"])
        assert not unnatural_language.search(question["explanation"])
        assert all(not unnatural_language.search(choice) for choice in question["choices"])
        assert all(not unnatural_language.search(reason) for reason in question["choiceReasons"])
        assert "**" not in question["question"]
        assert all("**" not in choice and "→ 加えて" not in choice for choice in question["choices"])
        assert all(not cross_reference_choice.search(choice) for choice in question["choices"])
        assert len(question["sources"]) == 1
        source = question["sources"][0]
        assert source["filename"] == "0901 v3 ドゥーメンス予想問題1000問_完全統合版_v3_25パーセント配分.md"
        assert source["locator"] == question["id"]
        assert source["unit"] == "問題ID"

    assert Counter(question["frequencyTier"] for question in QUESTIONS) == EXPECTED_TIERS
    assert {
        tier["id"]: tier["count"] for tier in METADATA["frequencyTiers"]
    } == ACTIVE_TIERS
    assert Counter(len(question["correct"]) for question in QUESTIONS) == EXPECTED_ANSWERS
    assert METADATA["answerCountDistribution"] == {
        str(key): value for key, value in EXPECTED_ANSWERS.items()
    }
    assert METADATA["multiAnswerQuestionCount"] == 867
    assert METADATA["japanesePolish"]["reverseQuestionsConvertedToPositive"] == 143
    assert Counter(question["category"] for question in QUESTIONS) == EXPECTED_CATEGORIES
    assert {
        category["id"]: category["count"] for category in METADATA["categories"]
    } == ACTIVE_CATEGORIES
    assert sum(question["active"] for question in QUESTIONS) == 950
    assert all(not question["active"] for question in QUESTIONS if question["category"] == "pairing")
    assert all(question["active"] for question in QUESTIONS if question["category"] != "pairing")
    assert all("添付資料に個別解説の記載はありません" not in question["explanation"] for question in QUESTIONS)
    ester_question = next(question for question in QUESTIONS if question["id"] == "A-050")
    assert "バター・バタースコッチ様の香りは主にジアセチル" in ester_question["choiceReasons"][3]
    assert "果実様香" in ester_question["choiceReasons"][3]

    source_import = METADATA["sourceImport"]
    assert source_import["mainQuestionCount"] == 1000
    assert source_import["appendixMockExamIncluded"] is False
    assert source_import["appendixMockExamQuestionCount"] == 50

    assert 'const APP_VERSION = "v39"' in APP_JS
    assert '"bierkompass-history-v23"' in APP_JS
    assert '"bierkompass-session-v23"' in APP_JS
    assert '"bierkompass-settings-v14"' in APP_JS
    assert "question.active === false" in APP_JS
    assert "styles.css?v=39" in INDEX_HTML
    assert "style-links.js?v=39" in INDEX_HTML
    assert "app.js?v=39" in INDEX_HTML
    assert "blind-quiz.js?v=39" in INDEX_HTML
    assert INDEX_HTML.index("style-links.js?v=39") < INDEX_HTML.index("app.js?v=39")
    assert all("APA" not in question["question"] for question in QUESTIONS)
    assert all("APA" not in choice for question in QUESTIONS for choice in question["choices"])
    assert "spreadAnswerCounts" in APP_JS
    assert "style-quiz.js" not in INDEX_HTML
    assert '$("#questionText").innerHTML = questionHtml(question.question)' in APP_JS
    assert 'class="negative-cue"' in APP_JS
    assert "1〜4" in INDEX_HTML
    assert "0〜3" not in INDEX_HTML
    assert "noindex, nofollow" in INDEX_HTML
    assert 'type="password"' in INDEX_HTML
    assert "blindQuizView" in INDEX_HTML
    assert "scoreScenario" in BLIND_JS
    assert "BierKompassStyleLinks" in APP_JS and "answerHtml" in APP_JS
    assert "target=\"_blank\"" in STYLE_LINKS_JS
    assert 'const ROOT = "https://www.bjcp.org/style/2021"' in STYLE_LINKS_JS

    pils_helles = next(question for question in QUESTIONS if question["id"] == "A-088")
    assert "ピルスとヘレス" in pils_helles["question"]
    assert pils_helles["correct"] == [0, 1, 2]
    baltic_porter = next(question for question in QUESTIONS if question["id"] == "A-310")
    assert baltic_porter["correct"] == [0, 1, 2, 3]
    assert all("正答：" in reason for reason in baltic_porter["choiceReasons"])

    print(
        "OK: 1000 v3 questions; unique IDs and full question/choice sets; "
        "1000 stored / 950 active; self-contained choices; explanations present; "
        "reverse artifacts repaired; Japanese polished; answer links limited to feedback; app v39 verified"
    )


if __name__ == "__main__":
    main()
