"""Validate the generated blind-tasting scenario bank and UI wiring."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "blind-tasting.json").read_text(encoding="utf-8"))
SCENARIOS = DATA["scenarios"]
META = DATA["metadata"]
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
SCRIPT = (ROOT / "blind-quiz.js").read_text(encoding="utf-8")
EARLY_ANSWER_LEAK = re.compile(
    r"独産|英産|米産|米ホップ|英エール|英酵母|英上面|仏ノーブル|豪州|"
    r"バルト海|ドルトムント|ミュンヘン|バンベルク|ケルシュ|ケルン|"
    r"シュパルト|バートン|EKG|ファグル|ダブリン|ベルジャン|セゾン酵母|"
    r"ザーツ|ピルゼン|ウィーン|Kveik|Nelson|Motueka|クーパーズ|カスク|APA"
)
OBSERVATION_ANSWER_WORD = re.compile(
    r"カスク|英ホップ|米ホップ|ザーツ|ウィーン麦芽|カスケード系|"
    r"ベルジャン酵母|コリアンダー|陳旧ホップ|ジュニパー|メラノイジン|ロースト麦芽"
)


def main() -> None:
    assert META["scenarioCount"] == 58
    assert META["examScenarioCount"] == 10
    assert META["secondsPerScenario"] == 180
    assert META["maximumPoints"] == 10
    assert len(SCENARIOS) == 58
    ids = [scenario["id"] for scenario in SCENARIOS]
    assert len(ids) == len(set(ids)) == 58
    assert Counter(scenario["country"] for scenario in SCENARIOS) == {
        "germany": 18,
        "america": 8,
        "uk_ireland": 10,
        "belgium": 11,
        "other": 11,
    }
    assert Counter(scenario["difficulty"] for scenario in SCENARIOS) == {1: 11, 2: 38, 3: 9}
    assert Counter(scenario["fermentationFamily"] for scenario in SCENARIOS) == {
        "Lager": 17,
        "Ale": 37,
        "Spontaneous": 2,
        "Farmhouse": 2,
    }
    for scenario in SCENARIOS:
        assert set(scenario["blindCard"]) == {"appearance", "aroma", "taste", "mouthfeel"}
        assert all(value.strip() for value in scenario["blindCard"].values())
        assert len(scenario["step1ObservationsJa"]) == 4
        assert scenario["step1ObservationsJa"][0].startswith("外観：")
        assert scenario["step1ObservationsJa"][1].startswith("香り：")
        assert scenario["step1ObservationsJa"][2].startswith("味わい：")
        assert scenario["step1ObservationsJa"][3].startswith("口当たり：")
        assert 2 <= len(scenario["step1InterpretationsJa"]) <= 6
        assert len(scenario["step1InterpretationsJa"]) == len(set(scenario["step1InterpretationsJa"]))
        card_text = " ".join(scenario["blindCard"].values())
        assert not OBSERVATION_ANSWER_WORD.search(card_text)
        assert all(item not in card_text for item in scenario["step1InterpretationsJa"])
        assert scenario["step2Characteristic"].strip()
        assert scenario["decisiveEvidence"] == scenario["step2Characteristic"]
        assert 2 <= len(scenario["step3IngredientsProcess"]) <= 5
        assert not EARLY_ANSWER_LEAK.search(" ".join(scenario["step3IngredientsProcess"]))
        assert all("APA" not in choice for choice in scenario["choices"])
        assert 1 <= len(scenario["representativeBeers"]) <= 3
        assert all(beer.strip() for beer in scenario["representativeBeers"])
        assert len(scenario["exclusions"]) == 3
        assert len(scenario["choices"]) == 4
        assert len(set(scenario["choices"])) == 4
        assert 0 <= scenario["correctChoice"] < 4
        assert scenario["answer"] == scenario["choices"][scenario["correctChoice"]]
        assert scenario["source"]["filename"] == "ブラインドテイスティング判定シミュレーション_完全仕様.md"
        assert scenario["source"]["locator"] == scenario["id"]
    assert "startBlindQuizButton" in INDEX
    assert "blindQuizView" in INDEX
    assert "練習モード" in SCRIPT and "試験モード" in SCRIPT and "弱点モード" in SCRIPT
    assert "bierkompass-blind-history-v4" in SCRIPT
    assert "secondsPerScenario" in SCRIPT
    assert "成立しない候補を外す" in SCRIPT and "特定の決め手を選ぶ" in SCRIPT
    assert "このスタイルはこれで覚える" in SCRIPT
    assert "観察は入力情報です" in SCRIPT
    assert "target.step1InterpretationsJa" not in SCRIPT and "target.step1ObservationsJa" not in SCRIPT and "target.step1Keywords" not in SCRIPT
    assert "代表的なビール銘柄" in SCRIPT and "representativeBeers" in SCRIPT
    assert 'const STAGES = ["観察", "原材料・工程", "発酵系統", "国・地域", "候補絞り込み", "最終判定", "決め手"]' in SCRIPT
    assert "下面発酵（ラガー）" in SCRIPT and "上面発酵（エール）" in SCRIPT
    assert "render({ preserveScroll: true })" in SCRIPT
    assert "blind-selected-details" in SCRIPT and "state.answers.ingredients.map" in SCRIPT
    assert "現在の推理は" in SCRIPT and "1対1で比べてください" in SCRIPT
    assert "escapeHtml(hints[state.stage])" in SCRIPT
    assert '"△"' not in SCRIPT and "目標達成" in SCRIPT and "要復習" in SCRIPT and "要確認" in SCRIPT
    assert "正答：${escapeHtml(correctAnswer)}" in SCRIPT and "あなたの回答：" in SCRIPT
    print("OK: 58 scenarios; seven-stage causal reasoning flow and representative beers verified")


if __name__ == "__main__":
    main()
