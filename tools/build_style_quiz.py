from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from integrate_mobile_style_guide import SOURCE_FILENAME, extract_styles


GERMANY = {
    "ジャーマン・ピルスナー", "ミュンヘナー・ヘレス", "ドルトムンダー／エクスポート",
    "メルツェン／フェストビア", "ミュンヘナー・ドゥンケル", "シュヴァルツビア",
    "ドッペルボック", "アイスボック", "ラオホビア", "ケラービア／ツヴィッケル",
    "シャンクビア／ライトビール", "ヘーフェ・ヴァイス", "クリスタル・ヴァイツェン",
    "ダークヴァイツェン／ボック", "ケルシュ", "アルトビア（デュッセルドルフ）",
    "ベルリナー・ヴァイセ", "ゴーゼ",
}
CZECH = {"ボヘミアン・ピルスナー", "チェコ・ダークラガー"}
BELGIUM = {
    "ベルジャン・ホワイト", "ゴールデンストロングエール", "トラピスト・ダブル",
    "トラピスト・トリプル", "クアドルペル／ダークストロング", "セゾン", "オルヴァル",
    "フランダース・レッドエール", "ストレート・ランビック／グーズ", "クリーク",
}
ENGLAND = {
    "ビター／ESB", "イングリッシュ・ペールエール", "イングリッシュ・ブラウンエール",
    "イングリッシュ・バーレイワイン", "ロンドン・ポーター", "インペリアルスタウト",
}
AMERICA = {
    "アメリカン・ライトラガー", "アメリカン・ペールエール", "アメリカン・IPA",
    "インペリアル／ダブルIPA", "ヘイジーIPA／NEIPA", "アメリカン・ウィートエール",
    "アメリカン・バーレイワイン",
}

LAGERS = {
    "ジャーマン・ピルスナー", "ミュンヘナー・ヘレス", "ドルトムンダー／エクスポート",
    "メルツェン／フェストビア", "ミュンヘナー・ドゥンケル", "シュヴァルツビア",
    "ドッペルボック", "アイスボック", "ラオホビア", "ケラービア／ツヴィッケル",
    "シャンクビア／ライトビール", "ボヘミアン・ピルスナー", "チェコ・ダークラガー",
    "アメリカン・ライトラガー", "ウィンナーラガー／メキシカン", "バルチック・ポーター",
}

COUNTRY_LABELS = {
    "germany": "ドイツ",
    "belgium": "ベルギー",
    "czech": "チェコ",
    "england": "イギリス",
    "america": "アメリカ",
    "other": "その他の国",
}


def country_for(name: str) -> str:
    for country, names in (
        ("germany", GERMANY),
        ("belgium", BELGIUM),
        ("czech", CZECH),
        ("england", ENGLAND),
        ("america", AMERICA),
    ):
        if name in names:
            return country
    return "other"


def color_for(detail: str) -> tuple[str, str]:
    appearance = detail.split("。", 1)[0]
    color_label = re.split(r"[、。]", appearance, 1)[0]
    if any(word in appearance for word in ("漆黒", "極濃褐", "黒色", "不透明な漆黒")):
        color = "#24100c"
    elif any(word in appearance for word in ("濃褐", "暗褐", "ダーク", "濃い赤褐")):
        color = "#4a1d12"
    elif any(word in appearance for word in ("ルビー", "赤色", "深紅")):
        color = "#8d251c"
    elif any(word in appearance for word in ("アンバー", "琥珀", "銅色", "オレンジ")):
        color = "#b85b1d"
    elif any(word in appearance for word in ("褐色", "ブラウン")):
        color = "#713416"
    elif any(word in appearance for word in ("極淡", "淡い黄色", "淡黄色", "麦わら")):
        color = "#f0cf55"
    else:
        color = "#dda52e"
    return color_label, color


def appearance_for(style: dict) -> dict:
    detail = style["detail"]
    appearance = detail.split("。", 1)[0] + "。"
    remainder = detail[len(appearance):].strip() or detail
    color_label, color_hex = color_for(detail)
    if any(word in appearance for word in ("濁", "乳白色", "不透明")):
        clarity = "hazy"
    elif any(word in appearance for word in ("クリア", "透明", "澄んだ")):
        clarity = "clear"
    else:
        clarity = "soft"
    if any(word in appearance for word in ("泡は極めて薄い", "泡は薄", "泡は少", "泡がほぼない", "無炭酸")):
        foam = "thin"
    elif any(word in appearance for word in ("分厚", "豊かな", "持続泡", "しっかりした泡", "リッチな泡", "クリーミーな泡")):
        foam = "rich"
    else:
        foam = "medium"
    group = style["group"]
    if group == "wheat":
        glass = "weizen"
    elif group in {"belgian", "farmhouse", "sour", "fruit", "farmhouse_raw"}:
        glass = "tulip"
    elif group in {"british", "strong_british", "dark_british", "hoppy", "strong_hoppy"}:
        glass = "pint"
    else:
        glass = "pilsner"
    return {
        "summary": appearance,
        "detail": remainder,
        "colorLabel": color_label,
        "colorHex": color_hex,
        "clarity": clarity,
        "foam": foam,
        "glass": glass,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=Path("style-quiz.json"))
    args = parser.parse_args()
    styles = extract_styles(args.pdf)
    records = []
    for index, style in enumerate(styles, 1):
        country = country_for(style["name"])
        records.append(
            {
                "id": f"STYLE-{index:02d}",
                "name": style["name"],
                "family": "lager" if style["name"] in LAGERS else "ale",
                "country": country,
                "countryLabel": COUNTRY_LABELS[country],
                "appearance": appearance_for(style),
                "detail": style["detail"],
                "definition": style["definition"],
                "ingredients": style["ingredients"],
                "group": style["group"],
                "source": {
                    "filename": SOURCE_FILENAME,
                    "page": style["page"],
                    "locator": f"PDF表示ページ{style['page']}（印刷ページ{style['page']}）",
                    "section": f"{style['name']} - Step 1〜4",
                },
            }
        )
    family_counts = Counter(style["family"] for style in records)
    country_counts = Counter(style["country"] for style in records)
    assert len(records) == 52
    assert family_counts == {"ale": 36, "lager": 16}
    assert sum(country_counts.values()) == 52
    data = {
        "metadata": {
            "version": "2026-08-31-style-step-quiz-v1",
            "styleCount": len(records),
            "families": [
                {"id": "lager", "label": "ラガー", "count": family_counts["lager"]},
                {"id": "ale", "label": "エール", "count": family_counts["ale"]},
            ],
            "countries": [
                {"id": key, "label": label, "count": country_counts[key]}
                for key, label in COUNTRY_LABELS.items()
            ],
            "candidatePolicy": "Step 1の発酵タイプとStep 2の国に一致するスタイルを上限なしですべて表示する。",
        },
        "styles": records,
    }
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(records)} styles; families={dict(family_counts)}; countries={dict(country_counts)}")


if __name__ == "__main__":
    main()
