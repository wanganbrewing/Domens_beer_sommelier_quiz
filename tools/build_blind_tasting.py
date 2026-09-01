"""Build the blind-tasting simulation data from the supplied Markdown spec."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Downloads" / "ブラインドテイスティング判定シミュレーション_完全仕様.md"
DEFAULT_OUTPUT = ROOT / "blind-tasting.json"
HEADER_RE = re.compile(r"^\*\*【([DUEBO]-\d{2})】(★+)[^\n]*$", re.MULTILINE)
CHOICE_RE = re.compile(r"(?<![A-Za-z0-9])([a-d])\)(.*?)(?=\s+[a-d]\)|$)", re.IGNORECASE)
COUNTRIES = {
    "D": ("germany", "ドイツ"),
    "U": ("america", "アメリカ"),
    "E": ("uk_ireland", "イギリス・アイルランド"),
    "B": ("belgium", "ベルギー"),
    "O": ("other", "その他の国"),
}


def clean(value: str) -> str:
    value = value.replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", value).strip()


def japanese_text(value: str) -> str:
    """Replace source-side English tasting terms that would leak into the Japanese UI."""
    replacements = {
        "distinctively full-bodied": "際立つフルボディ",
        "hop flavor and aroma normally absent": "ホップの香味は通常ほぼ感じられない",
        "poor head retention": "泡持ちが弱い",
        "good foam development and retention": "泡立ちと泡持ちが良好",
        "sharp bitterness": "鋭い苦味",
        "creamy mouthfeeling": "クリーミーな口当たり",
        "mellow flavor with low carbonation": "低炭酸で穏やかな味わい",
        "warming alcohol": "温かみのあるアルコール感",
        "fullbodied but effervescent": "フルボディながら発泡感がある",
        "amber or dark weizen": "琥珀色または濃色のヴァイツェン",
        "pronounced aromas of chocolate": "はっきりしたチョコレート香",
        "Brettanomyces yeasts": "ブレタノマイセス酵母",
        "very light": "非常に軽い",
        "Spontaneous": "自然発酵",
        "Farmhouse": "農家醸造系",
        "Lager": "下面発酵（ラガー）",
        "Ale": "上面発酵（エール）",
    }
    result = value
    for source, target in replacements.items():
        result = result.replace(source, target)
    return result


def japanese_observations(blind_card: dict[str, str]) -> list[str]:
    return [
        f"外観：{japanese_text(blind_card['appearance'])}",
        f"香り：{japanese_text(blind_card['aroma'])}",
        f"味わい：{japanese_text(blind_card['taste'])}",
        f"口当たり：{japanese_text(blind_card['mouthfeel'])}",
    ]


INTERPRETATION_RULES = [
    ("淡色〜黄金色系の外観", r"\b(?:pale|straw|gold|golden|blond)\b"),
    ("琥珀〜赤褐色系の外観", r"\b(?:amber|copper|bronze|mahogany|ruby|reddish)\b"),
    ("濃褐色〜黒色系の外観", r"\b(?:dark|brown|black|opaque|jet)\b"),
    ("透明感が高い", r"\b(?:clear|brilliant)\b"),
    ("濁りや沈殿が見られる", r"\b(?:cloudy|hazy|turbid|sediment|unfiltered)\b"),
    ("麦芽由来の香味が識別軸", r"\b(?:malt|malty|bread|bready|biscuit|toast|toasty|caramel|toffee|nutty|molasses|wort)\b"),
    ("ホップ香や苦味が識別軸", r"\b(?:hop|hops|saaz|fuggle|golding|cascade|citrus|pine|resinous|grapefruit|bitterness|bitter)\b"),
    ("焙煎由来の香味が識別軸", r"\b(?:roast|roasted|coffee|espresso|cacao|chocolate)\b"),
    ("酵母由来の果実・スパイス香が識別軸", r"\b(?:banana|clove|ester|esters|pear|apple|fruit|fruity|mango|passionfruit|cherry|fig|date|plum|raisin|pepper)\b"),
    ("酸味が主要な識別軸", r"\b(?:lactic|tart|sour|acidity|balsamic|vinous)\b"),
    ("燻製香が主要な識別軸", r"\b(?:smoke|smoky|bacon|peat)\b"),
    ("野生酵母由来の香りが識別軸", r"\b(?:brett|horse|leather|hay|sage)\b"),
    ("ハーブ・スパイス香が識別軸", r"\b(?:coriander|spice|spicy|herbal|juniper|earthy)\b"),
    ("軽快でドライな飲み口", r"\b(?:light|watery|crisp|dry|delicate|attenuated)\b"),
    ("豊潤で高いボディ", r"\b(?:full-bodied|fullbodied|rich|syrupy|warming|massive|intense|concentrated)\b"),
    ("発泡感が強い", r"\b(?:effervescent|carbonated|carbonation|champagne|lively)\b"),
    ("炭酸が穏やか", r"\blow carbonation\b"),
    ("滑らかで丸みのある口当たり", r"\b(?:creamy|silky|smooth|rounded|mellow)\b"),
]


def step1_interpretations(value: str) -> list[str]:
    """Convert raw observations into standardized diagnostic axes, not copied phrases."""
    lowered = value.lower()
    interpretations = [label for label, pattern in INTERPRETATION_RULES if re.search(pattern, lowered)]
    return interpretations[:6]


def field(block: str, label: str) -> str:
    match = re.search(rf"^{re.escape(label)}\s*(.+)$", block, re.MULTILINE)
    if not match:
        raise ValueError(f"Missing {label}")
    return clean(match.group(1))


def parse_blind_card(block: str) -> dict[str, str]:
    match = re.search(r"^■B\*\*\s*(.+)$", block, re.MULTILINE)
    if not match:
        raise ValueError("Missing blind card")
    value = clean(match.group(1))
    labels = [("appearance", "外観:"), ("aroma", "アロマ:"), ("taste", "味:"), ("mouthfeel", "MF:")]
    result: dict[str, str] = {}
    for index, (key, label) in enumerate(labels):
        start = value.find(label)
        if start < 0:
            raise ValueError(f"Missing blind-card field {label}")
        start += len(label)
        next_starts = [value.find(next_label, start) for _, next_label in labels[index + 1:]]
        next_starts = [position for position in next_starts if position >= 0]
        end = min(next_starts) if next_starts else len(value)
        result[key] = value[start:end].strip(" ／")
    return result


def split_items(value: str, delimiter: str = "・") -> list[str]:
    parts = [clean(part) for part in value.split(delimiter)]
    return [part for part in parts if part]


def parse_choices(value: str) -> tuple[list[str], int]:
    matches = list(CHOICE_RE.finditer(value))
    if len(matches) != 4:
        raise ValueError(f"Expected four choices, found {len(matches)}: {value}")
    choices: list[str] = []
    correct = -1
    for index, match in enumerate(matches):
        label = clean(match.group(2))
        if "★" in label:
            correct = index
        choices.append(label.replace("★", "").strip())
    if correct < 0:
        raise ValueError(f"Correct choice is not marked: {value}")
    return choices, correct


def parse_scenarios(source: Path) -> list[dict]:
    text = source.read_text(encoding="utf-8-sig")
    matches = list(HEADER_RE.finditer(text))
    scenarios: list[dict] = []
    for index, match in enumerate(matches):
        scenario_id = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else text.find("# PART 3", match.end())
        block = text[match.end():end]
        blind_card = parse_blind_card(block)
        step1 = field(block, "S1:")
        step2 = field(block, "S2:")
        step3 = field(block, "S3:")
        fermentation_detail = field(block, "4.1:")
        exclusions_text = field(block, "4.2:")
        conclusion = field(block, "4.3:")
        choice_text = field(block, "【択】")
        choices, correct_choice = parse_choices(choice_text)
        exclusions = []
        for item in split_items(exclusions_text, "／"):
            if "→" not in item:
                continue
            style, reason = item.split("→", 1)
            exclusions.append({"style": clean(style), "reason": clean(reason)})
        if len(exclusions) != 3:
            raise ValueError(f"{scenario_id}: expected three exclusions, found {len(exclusions)}")
        family = next((name for name in ("Lager", "Ale", "Spontaneous", "Farmhouse") if fermentation_detail.startswith(name)), "Other")
        country_id, country_label = COUNTRIES[scenario_id[0]]
        scenarios.append({
            "id": scenario_id,
            "country": country_id,
            "countryLabel": country_label,
            "difficulty": len(match.group(2)),
            "blindCard": blind_card,
            "step1ObservationsJa": japanese_observations(blind_card),
            "step1InterpretationsJa": step1_interpretations(step1),
            "step1KeywordsSource": split_items(step1, "/"),
            "step2Characteristic": japanese_text(step2),
            "step3IngredientsProcess": [japanese_text(item) for item in split_items(step3)],
            "fermentationFamily": family,
            "fermentationDetail": japanese_text(fermentation_detail),
            "exclusions": [{"style": item["style"], "reason": japanese_text(item["reason"])} for item in exclusions],
            "conclusion": japanese_text(conclusion),
            "choices": choices,
            "correctChoice": correct_choice,
            "answer": choices[correct_choice],
            "source": {"filename": source.name, "locator": scenario_id},
        })
    return scenarios


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    scenarios = parse_scenarios(args.source)
    ids = [scenario["id"] for scenario in scenarios]
    if len(scenarios) != 58 or len(ids) != len(set(ids)):
        raise ValueError(f"Expected 58 unique scenarios, found {len(scenarios)}")
    payload = {
        "metadata": {
            "title": "ブラインドテイスティング判定シミュレーション",
            "version": "2026-09-01-full-spec",
            "scenarioCount": len(scenarios),
            "examScenarioCount": 10,
            "secondsPerScenario": 180,
            "maximumPoints": 10,
            "countries": [{"id": item[0], "label": item[1], "count": sum(s["country"] == item[0] for s in scenarios)} for item in COUNTRIES.values()],
            "difficultyCounts": dict(sorted(Counter(s["difficulty"] for s in scenarios).items())),
            "sourceFilename": args.source.name,
            "note": "仕様見出しは全50シナリオと記載されていますが、連番データ58件を欠落なく収録しています。",
        },
        "scenarios": scenarios,
    }
    if not args.validate_only:
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scenarios": len(scenarios), "countries": Counter(s["country"] for s in scenarios), "difficulties": Counter(s["difficulty"] for s in scenarios), "output": None if args.validate_only else str(args.output)}, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
