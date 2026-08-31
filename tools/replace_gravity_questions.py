"""Replace OG/FG memorization questions with broader style-character questions."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"


def source(filename: str, page: int, section: str) -> list[dict]:
    locator = f"PDFビューアー上のページ{page}"
    return [{
        "filename": filename,
        "locator": locator,
        "page": page,
        "unit": "ページ",
        "section": section,
        "raw": f"{filename} {locator} / {section}",
    }]


REPLACEMENTS = {
    "BK-0059": {
        "question": "イタリアン・グレープ・エール（IGA）で使用できるブドウ原料や投入方法として、正しいものをすべて選んでください。",
        "choices": ["新鮮なブドウを使用する", "ブドウ果汁（マスト）を使用する", "発酵中または発酵後にワインを加える", "ブドウ由来原料は煮沸前の乾燥果皮に限る"],
        "correct": [0, 1, 2],
        "explanation": "IGAでは、ブドウそのもの、ブドウ果汁（マスト）、ワインなどを利用でき、発酵中または発酵後に加える場合もあります。",
        "choiceReasons": [
            "新鮮なブドウは、IGAで使用できる代表的なブドウ原料です。",
            "ブドウ果汁（マスト）も、IGAで使用できる代表的な原料です。",
            "ワインを発酵中または発酵後に加える方法も示されています。",
            "ブドウ原料は乾燥果皮だけに限定されず、投入時期も煮沸前だけではありません。",
        ],
        "sources": source("7､その他の国のビール.pdf", 17, "Italian Grape Ale（ブドウ）"),
    },
    "BK-0291": {
        "question": "イタリアン・グレープ・エール（IGA）のモルト構成として、正しいものをすべて選んでください。",
        "choices": ["ピルスナーモルトをベースにできる", "ペールモルトをベースにできる", "色や複雑さを加えるため特殊麦芽を使う場合がある", "焙煎麦芽を必ず半量以上使用する"],
        "correct": [0, 1, 2],
        "explanation": "IGAのモルト構成は比較的シンプルで、ピルスナーまたはペールモルトを基礎にし、目的に応じて小麦や特殊麦芽を加える場合があります。",
        "choiceReasons": [
            "ピルスナーモルトは、IGAの代表的なベースモルトです。",
            "ペールモルトも、IGAの代表的なベースモルトです。",
            "特殊麦芽は、色や複雑さを加える目的で使用される場合があります。",
            "焙煎麦芽を半量以上使うという必須条件は示されていません。",
        ],
        "sources": source("7､その他の国のビール.pdf", 17, "Italian Grape Ale（モルト）"),
    },
    "BK-0344": {
        "question": "ドイツのライトビール（Leichtbier）の典型的な外観として、正しいものをすべて選んでください。",
        "choices": ["明るい黄色から麦わら色", "透明感があり輝いている", "泡立ちと泡持ちがよい", "濃い黒色で濁りが強い"],
        "correct": [0, 1, 2],
        "explanation": "ライトビールの典型的な外観は、明るい黄色から麦わら色で、透明感があり、泡立ちと泡持ちが良好です。",
        "choiceReasons": [
            "明るい黄色から麦わら色は、典型的な色調です。",
            "透明感があり輝く外観は、典型的な特徴です。",
            "良好な泡立ちと泡持ちは、典型的な特徴です。",
            "濃い黒色や強い濁りは、ライトビールの典型的な外観ではありません。",
        ],
        "sources": source("3-2､ドイツのビール参考資料.pdf", 31, "Leichtbier（典型的な外観）"),
    },
    "BK-0852": {
        "question": "ドイツのライトビール（Leichtbier）の典型的な風味や口当たりとして、正しいものをすべて選んでください。",
        "choices": ["軽いモルトアロマ", "ライトからミディアムのボディ", "飲みやすく、はつらつとした発泡感", "重厚な甘味と無炭酸の口当たり"],
        "correct": [0, 1, 2],
        "explanation": "ライトビールは、軽いモルトアロマ、軽めから中程度のボディ、飲みやすく発泡感のある性格が典型的です。",
        "choiceReasons": [
            "軽いモルトアロマは、典型的な風味特性です。",
            "ライトからミディアムのボディが示されています。",
            "飲みやすさとはつらつとした発泡感が特徴です。",
            "重厚な甘味や無炭酸は、ライトビールの典型像と一致しません。",
        ],
        "sources": source("3-2､ドイツのビール参考資料.pdf", 31, "Leichtbier（典型的なフレーバー・プロファイル）"),
    },
}


def main() -> None:
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    by_id = {question["id"]: question for question in data["questions"]}
    assert set(REPLACEMENTS) <= set(by_id)
    for question_id, replacement in REPLACEMENTS.items():
        question = by_id[question_id]
        frequency_tier = question["frequencyTier"]
        question.clear()
        question.update({"category": "beer_styles", "type": "multiple", **replacement, "frequencyTier": frequency_tier, "id": question_id})
    data["metadata"]["excludedQuestionTopics"] = "日本固有事項、OG・FG（初期比重・最終比重）の暗記問題"
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    question_text = json.dumps(data["questions"], ensure_ascii=False)
    assert "初期比重" not in question_text and "最終比重" not in question_text
    QUESTIONS_PATH.write_text(serialized, encoding="utf-8")
    print(f"OK: replaced {len(REPLACEMENTS)} OG/FG questions")


if __name__ == "__main__":
    main()
