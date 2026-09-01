"""Validate the generated blind-tasting scenario bank and UI wiring."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "blind-tasting.json").read_text(encoding="utf-8"))
SCENARIOS = DATA["scenarios"]
META = DATA["metadata"]
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
SCRIPT = (ROOT / "blind-quiz.js").read_text(encoding="utf-8")


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
        assert 2 <= len(scenario["step1Keywords"]) <= 4
        assert scenario["step2Characteristic"].strip()
        assert 2 <= len(scenario["step3IngredientsProcess"]) <= 5
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
    assert "bierkompass-blind-history-v1" in SCRIPT
    assert "secondsPerScenario" in SCRIPT
    assert "除外するスタイル" in SCRIPT and "除外理由" in SCRIPT
    print("OK: 58 blind-tasting scenarios; six-stage 10-point flow; practice/exam/weak modes verified")


if __name__ == "__main__":
    main()
