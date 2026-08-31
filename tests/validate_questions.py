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
STYLES_CSS = (ROOT / "styles.css").read_text(encoding="utf-8")
ROBOTS_TXT = (ROOT / "robots.txt").read_text(encoding="utf-8")
STYLE_DATA = json.loads((ROOT / "style-quiz.json").read_text(encoding="utf-8"))
STYLE_JS = (ROOT / "style-quiz.js").read_text(encoding="utf-8")


def main() -> None:
    assert DATA["metadata"]["questionCount"] == 1000
    assert DATA["metadata"]["studyQuestionCount"] == 50
    assert DATA["metadata"]["examQuestionCount"] == 50
    assert DATA["metadata"]["examMinutes"] == 40
    assert DATA["metadata"]["passingRate"] == 0.5
    assert DATA["metadata"]["multiAnswerQuestionCount"] == 112
    assert len(QUESTIONS) == 1000
    assert len({question["id"] for question in QUESTIONS}) == 1000
    assert {question["id"] for question in QUESTIONS} == {f"BK-{index:04d}" for index in range(1, 1001)}
    assert len({question["question"] for question in QUESTIONS}) == 1000
    signatures = {question["question"] + "\0" + "\0".join(question["choices"]) for question in QUESTIONS}
    assert len(signatures) == 1000
    normalized_questions = [re.sub(r"\s+", "", re.sub(r"^理解確認[:：]\s*", "", question["question"])) for question in QUESTIONS]
    assert len(normalized_questions) == len(set(normalized_questions))
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
        assert not re.search(r"のの(?:年|時期)|正しい.*誤っている|適切な.*誤っている|について.*について", question["question"])
        assert "回答は1つとは限りません" not in question["question"]
        supporting_text = question["explanation"] + "\0" + "\0".join(question["choiceReasons"])
        gravity_text = question["question"] + "\0" + "\0".join(question["choices"]) + "\0" + supporting_text
        assert not re.search(r"(?<![A-Z])(?:OG|FG)(?![A-Z])|初期比重|最終比重", gravity_text)
        assert not re.search(r"出典資料|資料が示す|資料では", supporting_text)
        assert not re.search(r"^（古く|^ーシップ|^これらの発明|^一般的に炭酸|^冬に氷|について、が", question["question"])
        assert all(not re.search(r"^[、,。]|[■□●▪]|講座終了後|レポート", choice) for choice in question["choices"])
        for choice in question["choices"]:
            assert all(int(match.group(1)) <= 2026 for match in re.finditer(r"(?<![\d,])(\d{3,4})年(?!前)", choice))
            assert all(float(match.group(1)) <= 100 for match in re.finditer(r"(?<![\d.])(\d+(?:\.\d+)?)%", choice))
        japan_text = question["question"] + "\0" + "\0".join(question["choices"])
        assert not re.search(r"日本|ジャパン|JBA|JBSA|地ビール|酒税|キリンビール大学|全国地ビール|文化交流ヴィラ|[イロハ]号ビール|2017年度税制改正", japan_text)
        assert all("ビールの日本史" not in source["filename"] for source in question["sources"])
        assert not re.search(r"人気の高いビールブランドの流通|ケルシュ用グラス|ピルスナーに用いられる代表的なグラス|何mlのグラスで提供|ドラフト（樽生）設備|コースメニュー", question["question"])
    answer_counts = Counter(len(question["correct"]) for question in QUESTIONS)
    assert set(answer_counts) == {0, 1, 2, 3}
    assert answer_counts == {0: 2, 1: 886, 2: 16, 3: 96}
    assert sum(count for answers, count in answer_counts.items() if answers >= 2) == 112
    negative_pattern = re.compile(r"誤っている|適切でない|正しくない|該当しない|当てはまらない|含まれない")
    assert not any(negative_pattern.search(question["question"]) for question in QUESTIONS)
    assert paired_count == 0
    assert 'const inputType = "checkbox"' in APP_JS
    assert 'type="radio"' not in APP_JS
    assert "broadExamSample(pool, count)" in APP_JS
    assert "studyQuestionSample(pool, count)" in APP_JS
    assert 'class="negative-cue"' not in APP_JS
    assert '$("#questionText").textContent = question.question' in APP_JS
    assert "data.metadata.studyQuestionCount" in APP_JS
    assert "Math.round(count * 0.7)" in APP_JS
    assert "balancedQuestionSample(multiAnswerPool, multiAnswerCount)" in APP_JS
    assert "broadQuestionScore(b) - broadQuestionScore(a)" in APP_JS
    assert "広く浅く" in INDEX_HTML
    assert "知識の現在地" not in INDEX_HTML and "次の一杯" not in INDEX_HTML
    assert 'let mode = "study"' in APP_JS
    assert INDEX_HTML.index('data-mode="study"') < INDEX_HTML.index('data-mode="exam"')
    assert 'data-mode="study" role="tab" aria-selected="true"' in INDEX_HTML
    assert 'tier.id === "A" ? "checked" : ""' in APP_JS
    assert 'session.optionOrders[question.id].map((originalIndex, displayIndex)' in APP_JS
    assert 'const displayKey = String.fromCharCode(65 + displayIndex)' in APP_JS
    assert 'const order = session.optionOrders[item.id]' in APP_JS
    assert 'id="accessGate"' in INDEX_HTML
    assert "ACCESS_PASSWORD_HASH" in APP_JS and 'input.value === "beer"' not in APP_JS
    assert "personQuestion && isFactuallyCorrect" not in APP_JS
    serialized_data = json.dumps(DATA, ensure_ascii=False)
    assert all(name in serialized_data for name in ("アーサー・ギネス", "ヤコブセン", "ピエール・セリス"))
    assert "該当する選択肢はない（0個）として回答" in APP_JS and "該当する選択肢はない（0個）として回答" in INDEX_HTML
    assert 'name="robots" content="noindex, nofollow' in INDEX_HTML
    assert "User-agent: *" in ROBOTS_TXT and "Disallow: /" in ROBOTS_TXT
    assert Counter(question["frequencyTier"] for question in QUESTIONS) == {"A": 366, "B": 409, "C": 225}
    assert {tier["id"]: tier["count"] for tier in DATA["metadata"]["frequencyTiers"]} == {"A": 366, "B": 409, "C": 225}
    assert sum(category["count"] for category in DATA["metadata"]["categories"]) == 1000
    excluded_categories = {"quality", "service", "draft", "pairing", "marketing"}
    assert len(DATA["metadata"]["categories"]) == 7
    assert not ({question["category"] for question in QUESTIONS} & excluded_categories)
    assert not ({category["id"] for category in DATA["metadata"]["categories"]} & excluded_categories)
    question_by_id = {question["id"]: question for question in QUESTIONS}
    representative_ids = {"BK-0166", "BK-0168", "BK-0176", "BK-0181", "BK-0370", "BK-0626", "BK-0630", "BK-0645", "BK-0648", "BK-0672"}
    assert all("人物" in question_by_id[question_id]["question"] for question_id in representative_ids)
    assert all("リンドナー" not in question_by_id[question_id]["question"] + " ".join(question_by_id[question_id]["choices"]) for question_id in representative_ids)
    assert len(DATA["metadata"]["brewingBoostIds"]) == 18
    assert all(question_by_id[question_id]["category"] in {"brewing_process", "fermentation"} for question_id in DATA["metadata"]["brewingBoostIds"])
    aroma = question_by_id["BK-0701"]
    assert all(3 <= len(re.findall(r"\d[\d,]*", choice)) <= 4 for choice in aroma["choices"])
    brewing_dates = question_by_id["BK-0356"]
    assert all(len(re.findall(r"\d+", choice)) == 4 for choice in brewing_dates["choices"])
    assert question_by_id["BK-0851"]["question"].endswith("官能評価におけるアロマは、主にどの感覚で知覚しますか。")
    expected_abv_ids = {"BK-0130", "BK-0137", "BK-0233", "BK-0266", "BK-0312", "BK-0333", "BK-0341", "BK-0383", "BK-0559", "BK-0768", "BK-0794", "BK-0804"}
    direct_abv = {
        question["id"]: question
        for question in QUESTIONS
        if "アルコール度数区分" in question["question"] or "高・中・低の3区分" in question["question"]
    }
    assert set(direct_abv) == expected_abv_ids
    expected_bands = {"高い（7.0〜15.0%程度）", "中くらい（4.0〜6.9%程度）", "低い（0.0〜3.9%程度）"}
    for question in direct_abv.values():
        assert len(question["correct"]) == 1
        assert set(question["choices"]) == expected_bands
        assert re.search(r"\d+(?:\.\d+)?〜\d+(?:\.\d+)?%", question["explanation"])
    assert Counter(question["correct"][0] for question in direct_abv.values()) == {0: 5, 1: 5, 2: 2}
    assert not any(re.search(r"アルコール度数.*範囲", question["question"]) for question in QUESTIONS)
    assert all(
        direct_abv[question_id]["sources"][0]["filename"] == "Doemens_Beer_Styles_Mobile_Fluffy_Foam.pdf"
        for question_id in {"BK-0233", "BK-0341", "BK-0559", "BK-0768", "BK-0794", "BK-0804"}
    )
    assert "50問中35問は正答が2個以上" in INDEX_HTML
    assert 'id="openNavigatorMobile"' in INDEX_HTML and 'id="unansweredBadgeMobile"' in INDEX_HTML
    assert '$("#openNavigatorMobile").addEventListener("click", () => setNavigatorOpen(true))' in APP_JS
    assert '.map-fab{display:none!important}' in STYLES_CSS
    assert '.mobile-map-trigger{display:inline-flex' in STYLES_CSS
    assert '.final-exam-guide[hidden]{display:none}' in STYLES_CSS
    assert "正答・選択肢判定・解説・出典を見る" in APP_JS
    assert "制作：Wangan Brewing" not in INDEX_HTML
    assert "制作支援：OpenAI Codex" not in INDEX_HTML
    assert "Doemens Biersommelier関連資料を参照" in INDEX_HTML
    assert "Doemens公式問題集ではありません" in INDEX_HTML
    assert ".site-credit" in STYLES_CSS
    assert "renderReviewChoiceReasons(question, order)" in APP_JS
    assert APP_JS.count("<details open><summary>") >= 2
    blackcurrant_ids = {"BK-0034", "BK-0480"}
    assert all(not any("黒すぐり" in choice or "カシス" in choice for choice in question_by_id[question_id]["choices"]) for question_id in blackcurrant_ids if question_id in question_by_id)
    water_style_ids = {"BK-0011", "BK-0038", "BK-0039", "BK-0706"}
    assert all(not any("（" in choice or "(" in choice for choice in question_by_id[question_id]["choices"]) for question_id in water_style_ids if question_id in question_by_id)
    consumption_pattern = re.compile(r"(?:一人|1人)当たり.*ビール消費量|ビール消費量.*(?:一人|1人)当たり")
    assert all(question["frequencyTier"] == "C" for question in QUESTIONS if consumption_pattern.search(question["question"]))
    hardness_only_ids = {"BK-0005", "BK-0006", "BK-0007", "BK-0008", "BK-0011", "BK-0038", "BK-0039", "BK-0061", "BK-0069", "BK-0070", "BK-0071", "BK-0123", "BK-0147", "BK-0191", "BK-0202", "BK-0706", "BK-0757", "BK-0834"}
    assert all(
        question_by_id[question_id]["frequencyTier"] == "C"
        for question_id in hardness_only_ids
        if question_id in question_by_id and re.search(r"硬度|硬水|軟水", question_by_id[question_id]["question"])
    )
    extreme_ibu_ids = {"BK-0277", "BK-0320", "BK-0449", "BK-0554", "BK-0561", "BK-0901"}
    assert all(question["frequencyTier"] == "C" for question in QUESTIONS if re.search(r"(?<![A-Za-z])(?:IBU|EBC)(?![A-Za-z])", question["question"]) and question["id"] not in extreme_ibu_ids)
    style_guide = DATA["metadata"]["mobileStyleGuideIntegration"]
    style_guide_ids = set(style_guide["questionIds"])
    assert style_guide["questionCount"] == 52 == len(style_guide_ids)
    assert all(question_by_id[question_id]["category"] == "beer_styles" for question_id in style_guide_ids)
    assert all(len(question_by_id[question_id]["correct"]) == 1 for question_id in style_guide_ids)
    assert all(len(question_by_id[question_id]["choices"]) == 4 for question_id in style_guide_ids)
    assert all(question_by_id[question_id]["sources"][0]["filename"] == "Doemens_Beer_Styles_Mobile_Fluffy_Foam.pdf" for question_id in style_guide_ids)
    assert not any("ジャパニーズ・ドライラガー" in question_by_id[question_id]["question"] for question_id in style_guide_ids)
    for question_id in style_guide_ids:
        question = question_by_id[question_id]
        dimensions = [label for label in ("詳細説明", "特徴定義", "原材料・工程") if f"の{label}として" in question["question"]]
        assert len(dimensions) == 1
        assert question["choiceReasons"][question["correct"][0]].startswith("この内容が示すスタイル：")
        assert all(
            reason.startswith("この内容が示すスタイル：")
            for index, reason in enumerate(question["choiceReasons"])
            if index not in question["correct"]
        )
        assert all("ではありません" not in reason and "合致します" not in reason for reason in question["choiceReasons"])
        assert all(not choice.startswith(("詳細説明：", "特徴定義：", "原材料・工程：")) for choice in question["choices"])
    assert not any(re.search(r"情報源|Sources?|参照元|情報の出典", question["question"], re.IGNORECASE) for question in QUESTIONS)
    vacuous_markers = (
        "設問の条件に当てはまるため、選択対象です。",
        "条件に当てはまらないため、この設問では選択しません。",
        "正しい内容なので、この否定形の設問では選択しません。",
        "設問の条件に当てはまらないため、選択対象です。",
        "正しい回答は",
        "該当箇所の記述と一致しません",
        "正しい数値範囲は",
        "この設問の正答は",
        "正答の条件に合います",
        "正答の数値範囲に合います",
        "正しい内容は",
        "出典内容とは異なる説明です",
        "正しい内容ではないため、選択対象ではありません",
        "設問の条件に合う正しい内容です",
        "設問の条件に合う正しいスタイルです",
        "設問の条件に合わないため、選択対象ではありません",
        "正しくは「",
        "の特徴として正しい内容です",
        "の度数範囲ではありません",
        "の正しい度数範囲です",
        "正しい説明です。",
    )
    assert not any(marker in reason for question in QUESTIONS for reason in question["choiceReasons"] for marker in vacuous_markers)
    assert not any(
        reason.strip() and reason.strip() == question["explanation"].strip()
        for question in QUESTIONS
        for reason in question["choiceReasons"]
    )
    assert sum(not reason.strip() for question in QUESTIONS for reason in question["choiceReasons"]) == 2708
    assert not any(
        len(nonempty := [reason.strip() for reason in question["choiceReasons"] if reason.strip()]) >= 2
        and len(set(nonempty)) == 1
        for question in QUESTIONS
    )
    question_by_id = {question["id"]: question for question in QUESTIONS}
    for question_id in ("BK-0187", "BK-0213"):
        reasons = question_by_id[question_id]["choiceReasons"]
        assert all(reason.strip() for reason in reasons)
        assert len(set(reasons)) == len(reasons)
    assert 'class="choice-verdict"' in APP_JS
    assert 'if (!reason) return "";' not in APP_JS
    assert STYLE_DATA["metadata"]["styleCount"] == 52
    assert {item["id"]: item["count"] for item in STYLE_DATA["metadata"]["families"]} == {"lager": 16, "ale": 36}
    assert {item["id"]: item["count"] for item in STYLE_DATA["metadata"]["countries"]} == {
        "germany": 18, "belgium": 10, "czech": 2, "england": 6, "america": 7, "other": 9,
    }
    assert all(
        style["appearance"]["colorHex"].startswith("#")
        and style["appearance"]["foam"] in {"rich", "medium", "thin"}
        and style["appearance"]["clarity"] in {"clear", "hazy", "soft"}
        and style["definition"] and style["ingredients"]
        for style in STYLE_DATA["styles"]
    )
    assert not any("ジャパニーズ・ドライラガー" in style["name"] for style in STYLE_DATA["styles"])
    assert 'id="styleQuizView"' in INDEX_HTML and 'id="startStyleQuizButton"' in INDEX_HTML
    assert '["home", "session", "result", "styleQuiz"]' in APP_JS
    assert "style.family === state.answers.family && style.country === state.answers.country" in STYLE_JS
    assert "選択条件に一致する全${matching.length}件を表示" in STYLE_JS
    assert "slice(" not in STYLE_JS
    assert 'id="styleQuizBackButton"' in INDEX_HTML and "state.step -= 1" in STYLE_JS
    assert "function answerSafeText(text)" in STYLE_JS
    assert all(token in STYLE_JS for token in ("styleAnswerWords()", "STYLE_TERM_WORDS", "COUNTRY_ANSWER_WORDS", "FAMILY_ANSWER_WORDS"))
    assert "answerSafeText(target.appearance.detail)" in STYLE_JS
    assert "answerSafeText(target.definition)" in STYLE_JS
    assert "answerSafeText(option.label)" in STYLE_JS
    assert 'class="style-clue-card appearance-clue style-final-clue"' in STYLE_JS
    assert 'class="style-selected-summary"' in STYLE_JS
    assert all(label in STYLE_JS for label in ("色", "透明度", "泡持ち", "選択した情報", "原材料・工程"))
    assert DATA["metadata"]["deduplication"]["removedDuplicateCount"] == 313
    assert DATA["metadata"]["deduplication"]["removedSourceQuestionCount"] == 2
    assert DATA["metadata"]["deduplication"]["currentDuplicateCount"] == 0
    assert DATA["metadata"]["deduplication"]["reauthoredQuestionCount"] == 315
    expansion = DATA["metadata"]["expansionTo1000"]
    assert expansion["addedQuestionCount"] == 315
    assert expansion["styleQuestionCount"] == 312
    assert expansion["sensoryMethodQuestionCount"] == 3
    assert "1000" in INDEX_HTML and "685" not in INDEX_HTML
    assert 'const APP_VERSION = "v29"' in APP_JS
    print(f"OK: 1000 unique checkbox questions; answer counts={dict(sorted(answer_counts.items()))}; paired questions={paired_count}; representative people and numeric distractors checked; sources and 3 frequency tiers")


if __name__ == "__main__":
    main()
