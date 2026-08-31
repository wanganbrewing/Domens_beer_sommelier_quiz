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
ROBOTS_TXT = (ROOT / "robots.txt").read_text(encoding="utf-8")


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
        assert "2つの基礎的な問い" not in question["question"] and "①" not in question["question"] and "②" not in question["question"]
        assert "回答は1つとは限りません" not in question["question"]
        supporting_text = question["explanation"] + "\0" + "\0".join(question["choiceReasons"])
        assert not re.search(r"出典資料|資料が示す|資料では", supporting_text)
        assert not re.search(r"^（古く|^ーシップ|^これらの発明|^一般的に炭酸|^冬に氷|について、が", question["question"])
        assert all(not re.search(r"^[、,。]|[■□●▪]|講座終了後|レポート", choice) for choice in question["choices"])
        japan_text = question["question"] + "\0" + "\0".join(question["choices"])
        assert not re.search(r"日本|ジャパン|JBA|JBSA|地ビール|酒税|キリンビール大学|全国地ビール|文化交流ヴィラ|[イロハ]号ビール|2017年度税制改正", japan_text)
        assert all("ビールの日本史" not in source["filename"] for source in question["sources"])
        assert not re.search(r"人気の高いビールブランドの流通|ケルシュ用グラス|ピルスナーに用いられる代表的なグラス|何mlのグラスで提供|ドラフト（樽生）設備|コースメニュー", question["question"])
    answer_counts = Counter(len(question["correct"]) for question in QUESTIONS)
    assert set(answer_counts) == {0, 1, 2, 3}
    assert paired_count == 0
    assert 'const inputType = "checkbox"' in APP_JS
    assert 'type="radio"' not in APP_JS
    assert "broadExamSample(pool, count)" in APP_JS
    assert "broadQuestionScore(b) - broadQuestionScore(a)" in APP_JS
    assert "広く浅く" in INDEX_HTML
    assert 'id="accessGate"' in INDEX_HTML
    assert "ACCESS_PASSWORD_HASH" in APP_JS and 'input.value === "beer"' not in APP_JS
    assert "personQuestion && isCorrect" in APP_JS
    assert "アーサー・ギネス" in APP_JS and "ヤコブセン" in APP_JS and "ピエール・セリス" in APP_JS
    assert "正しい選択肢はない（0個）として回答" in APP_JS and "正しい選択肢はない（0個）として回答" in INDEX_HTML
    assert 'name="robots" content="noindex, nofollow' in INDEX_HTML
    assert "User-agent: *" in ROBOTS_TXT and "Disallow: /" in ROBOTS_TXT
    assert Counter(question["frequencyTier"] for question in QUESTIONS) == {"A": 350, "B": 400, "C": 250}
    assert sum(category["count"] for category in DATA["metadata"]["categories"]) == 1000
    excluded_categories = {"quality", "service", "draft", "pairing", "marketing"}
    assert len(DATA["metadata"]["categories"]) == 7
    assert not ({question["category"] for question in QUESTIONS} & excluded_categories)
    assert not ({category["id"] for category in DATA["metadata"]["categories"]} & excluded_categories)
    question_by_id = {question["id"]: question for question in QUESTIONS}
    representative_ids = {"BK-0166", "BK-0168", "BK-0176", "BK-0181", "BK-0370", "BK-0626", "BK-0630", "BK-0645", "BK-0648", "BK-0672"}
    assert all("人物は誰" in question_by_id[question_id]["question"] for question_id in representative_ids)
    assert all("リンドナー" not in question_by_id[question_id]["question"] + " ".join(question_by_id[question_id]["choices"]) for question_id in representative_ids)
    assert len(DATA["metadata"]["brewingBoostIds"]) == 50
    assert all(question_by_id[question_id]["category"] in {"brewing_process", "fermentation"} for question_id in DATA["metadata"]["brewingBoostIds"])
    aroma = question_by_id["BK-0701"]
    assert all(3 <= len(re.findall(r"\d[\d,]*", choice)) <= 4 for choice in aroma["choices"])
    brewing_dates = question_by_id["BK-0356"]
    assert all(len(re.findall(r"\d+", choice)) == 4 for choice in brewing_dates["choices"])
    assert question_by_id["BK-0910"]["question"] == "官能評価におけるアロマは、主にどの感覚で知覚しますか。"
    print(f"OK: 1,000 checkbox questions; answer counts={dict(sorted(answer_counts.items()))}; paired questions={paired_count}; representative people and numeric distractors checked; sources and 3 frequency tiers")


if __name__ == "__main__":
    main()
