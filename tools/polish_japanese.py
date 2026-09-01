"""Polish Japanese wording and repair imported reverse-question artifacts."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from enrich_question_explanations import (
    correct_reason,
    find_profile,
    load_style_profiles,
    normalize,
    overall_explanation,
    subject,
    wrong_general_reason,
    wrong_style_reason,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "questions.json"
DEFAULT_OUTPUT = ROOT / "questions.json"
REVERSE_RE = re.compile(r"\s*〔逆問：誤っているものを1つ選べ〕")
ANSWER_COUNT_RE = re.compile(r"（(?:手帳基準・)?[0-9０-９]+つ選べ）")
GENERIC_REASON_RE = re.compile(
    r"見分けるための要点です。覚える内容は|"
    r"は、.+として正しい内容です。|"
    r"正答側|数値・範囲は|香味の方向が|"
    r"発酵系統または酵母の対応|外観の特徴が|"
    r"原材料・工程の組み合わせ|産地・歴史的背景の対応|"
    r"代表的な識別点ではありません|で正答となる知識です|"
    r"誤答としては選びません|。正しくは"
)
GENERIC_EXPLANATION_RE = re.compile(
    r"^（単独・逆問）$|を判別するときは、|^この問題では.+正しい組み合わせです。$"
)


TEXT_REPLACEMENTS = (
    ("陳旧ホップ（劣化ホップ）", "長期間熟成させたホップ"),
    ("陳旧ホップ", "熟成ホップ"),
    ("モルト甘みの前面度", "モルト由来の甘みやパン様風味の強さ"),
    ("極限までドライ", "非常にドライ"),
    ("極限ドライ", "非常にドライ"),
    ("超高アルコール", "非常に高いアルコール度数"),
    ("超高温", "非常に高い温度"),
    ("超高発酵度", "非常に高い発酵度"),
    ("超軽量ボディ", "非常に軽いボディ"),
    ("超重厚ボディ", "非常に重いボディ"),
    ("超重厚", "非常に重厚"),
    ("超濃密", "非常にきめ細かく密"),
    ("超クリーミー", "非常にクリーミー"),
    ("超高比重", "非常に高い初期比重"),
    ("ホップフォワード", "ホップの香味を前面に出す設計"),
    ("ドリンカブル", "飲みやすい"),
    ("若古ブレンド", "若いビールと熟成したビールのブレンド"),
    ("クリーンラガー", "クリーンなラガー発酵"),
    ("モルティで", "モルト風味が豊かで"),
    ("モルティな", "モルト風味の豊かな"),
    ("よりモルティ", "モルト風味がより豊か"),
    ("モルティ・", "豊かなモルト風味と"),
    ("甘口モルティ", "甘みとモルト風味が豊か"),
    ("モルティ", "モルト風味が豊か"),
    ("農家系", "農家醸造に由来するスタイル"),
    ("豪州", "オーストラリア"),
    ("NZ", "ニュージーランド"),
    ("仏・ベルギー", "フランス・ベルギー"),
    ("（仏）", "（フランス）"),
    ("歴史的独スタイル", "ドイツの歴史的スタイル"),
    ("独ハラタウ", "ドイツのハラタウ"),
    ("米ヤキマ", "アメリカのヤキマ"),
    ("英=", "イギリス："),
    ("米=", "アメリカ："),
    ("Step 1-2", "ステップ1～2"),
    ("基本骨格", "基本的な構成"),
    ("モルト骨格", "モルトの支え"),
    ("小麦使用という骨格", "小麦を使う点"),
    ("クリーンな骨格", "雑味の少ない味わい"),
    ("味の骨格", "味わいの厚み"),
    ("バートン風の水質に寄せる", "バートンの水質に近づける"),
    ("上面エステル", "上面発酵酵母由来の果実香"),
    ("エステル皆無", "エステルがほとんど感じられない"),
    ("焦げ酸味", "焙煎麦芽由来の酸味"),
    ("甘香ばしさ", "甘く香ばしい風味"),
    ("アーシーさ", "土やハーブを思わせる香り"),
    ("アーシーな", "土やハーブを思わせる"),
    ("通常度数", "標準的なアルコール度数"),
    ("判別は僅差", "特徴が近く判別は難しい"),
    ("灼ける", "焼ける"),
    ("酵素で極限まで辛口化したIPA", "酵素を用いて発酵度を高め、非常にドライに仕上げたIPA"),
)


OVERRIDES = {
    "A-033": {
        "question": "長期間熟成させたホップについて、正しい説明をすべて選んでください。",
        "choices": [
            "ランビックの伝統的な醸造で使われる",
            "保存性を得ながら、強い苦味や鮮烈なホップ香を抑える目的で使われる",
            "ジャーマンピルスナーの鮮烈なホップ香を強める目的で使われる",
            "収穫直後のホップと同様に、フレッシュな柑橘香を最大限に引き出す",
        ],
        "correct": [0, 1],
        "explanation": "ランビックでは、強い苦味や鮮烈なホップ香を抑えながら保存性を得るため、長期間熟成させたホップを伝統的に使います。",
        "choiceReasons": [
            "正答：ランビックでは長期間熟成させたホップが伝統的に使われます。",
            "正答：熟成によって鮮烈なホップ香と苦味を弱めつつ、保存性に関わる成分を利用します。",
            "誤答：ジャーマンピルスナーでは、熟成ホップではなく新鮮なノーブルホップの香味が重要です。",
            "誤答：フレッシュな柑橘香を狙う用途では、収穫後の品質が良い新鮮なホップを使います。",
        ],
    },
    "A-088": {
        "question": "ピルスとヘレスの一般的な識別軸として、正しいものをすべて選んでください。",
        "choices": [
            "ピルスはホップの苦味とドライな後口が目立ちやすい",
            "ヘレスは穏やかな苦味とモルト由来の甘みが目立ちやすい",
            "両者とも淡色ラガーであり、色だけでの識別は難しい",
            "ピルスはモルト、ヘレスはホップを前面に出しやすい",
        ],
        "correct": [0, 1, 2],
        "explanation": "ピルスはホップの苦味とドライさ、ヘレスは穏やかな苦味とモルト由来の甘みやパン様風味が識別軸です。両者とも淡色なので、色だけでは判断しません。",
        "choiceReasons": [
            "正答：ピルスはヘレスよりホップの苦味が明瞭で、後口もドライに感じられる傾向があります。",
            "正答：ヘレスは苦味が穏やかで、モルト由来の甘みやパン様風味が前面に出やすいスタイルです。",
            "正答：どちらも淡色ラガーのため、色よりも苦味、ドライさ、モルト感のバランスで識別します。",
            "誤答：関係が逆です。一般にピルスはホップ、ヘレスはモルトの特徴が前面に出やすくなります。",
        ],
    },
    "A-310": {
        "question": "ブラインド評価で、エステルが目立たず、漆黒でアルコール度数が高く、滑らかなビールを判定するとき、適切な考え方をすべて選んでください。",
        "choices": [
            "下面発酵由来の滑らかさと高いアルコール度数から、バルチックポーターを有力候補とする",
            "インペリアルスタウトは、上面発酵由来のエステルと強い焦げ香が出やすい点を比較する",
            "シュヴァルツビアは一般にアルコール度数が低いため、候補から外す",
            "最終判断では、下面発酵らしい滑らかでクリーンな口当たりを確認する",
        ],
        "correct": [0, 1, 2, 3],
        "explanation": "高いアルコール度数を持つ黒ビールのうち、エステルが控えめで滑らかな下面発酵の特徴がそろう場合は、バルチックポーターが有力です。",
        "choiceReasons": [
            "正答：バルチックポーターは、下面発酵由来の滑らかさと高いアルコール度数を併せ持つ黒ビールです。",
            "正答：インペリアルスタウトは上面発酵由来のエステルや強い焦げ香が出やすく、識別時の比較対象になります。",
            "正答：シュヴァルツビアは一般に度数が標準的で軽快なため、高アルコールという条件から外れます。",
            "正答：下面発酵らしい滑らかでクリーンな口当たりは、バルチックポーターを裏付ける特徴です。",
        ],
    },
    "A-150": {
        "question": "英国発祥のエールと、その米国版に見られる一般的な違いについて、正しいものをすべて選んでください。",
        "choices": [
            "米国版では柑橘や松を思わせるホップ香が強い傾向がある",
            "英国版ではモルト風味と土やハーブを思わせるホップ香が重視される",
            "同様の傾向はペールエールやバーレイワインにも見られる",
            "英国版と米国版の香味には一般的な違いがない",
        ],
        "explanation": "米国版は柑橘・松脂系のホップ香、英国版はモルト風味と土・ハーブ系のホップ香が目立つ傾向があり、複数の英米系エールで共通する識別軸です。",
        "choiceReasons": [
            "正答：米国版では、アメリカ産ホップ由来の柑橘や松脂を思わせる香りが明瞭になりやすい傾向があります。",
            "正答：英国版では、モルトの支えと英国系ホップ由来の土・ハーブを思わせる香りが識別に役立ちます。",
            "正答：ペールエールやバーレイワインなどでも、米国版と英国版を比較する際に同じ傾向を利用できます。",
            "誤答：使用するホップや香味のバランスに一般的な違いがあり、識別の手掛かりになります。",
        ],
    },
    "S-018": {
        "explanation": "正解のラオホビアは、ブナ材で燻製した麦芽の香りとモルト感のあるラガーが特徴です。ピートスモークエールは薬品や土を思わせる煙香になりやすく、シュヴァルツビアとドゥンケルには明瞭な燻製香がありません。",
        "choiceReasons": [
            "正答：ラオホビアは、ブナ材で燻製した麦芽のベーコンや焚き火を思わせる香りが特徴です。",
            "誤答：ピートスモークエールは上面発酵で、薬品や土を思わせる煙香が中心となり、ブナ燻製麦芽の香りとは質が異なります。",
            "誤答：シュヴァルツビアはロースト感を伴う黒色ラガーですが、明瞭な燻製香を基本特徴としません。",
            "誤答：ドゥンケルはパンやトーストを思わせるモルト風味が中心で、明瞭な燻製香を基本特徴としません。",
        ],
    },
    "S-029": {
        "explanation": "ジャーマンピルスナー、シュヴァルツビア、バルチックポーターは下面発酵で、果実様エステルは通常目立ちません。アルトビアは上面発酵のため、この情報だけでは除外できません。",
        "choiceReasons": [
            "正答：ジャーマンピルスナーは下面発酵で、果実様エステルが目立つ場合は候補から外せます。",
            "正答：シュヴァルツビアは下面発酵で、果実様エステルが目立つ場合は候補から外せます。",
            "誤答：アルトビアは上面発酵なので、果実様エステルを感じるという情報だけでは除外できません。",
            "正答：バルチックポーターは通常下面発酵で、果実様エステルが明瞭な場合は候補から外せます。",
        ],
    },
    "S-047": {
        "choices": [
            "ロンドン・ポーターは甘く香ばしい風味と柔らかな口当たりを持つ",
            "アイリッシュ・ドライスタウトはローストバーレイ由来の酸味とドライな後口を持つ",
            "アイリッシュ・ドライスタウトはきめ細かくクリーミーな泡で知られる",
            "ロンドン・ポーターは下面発酵のラガーである",
        ],
        "explanation": "ロンドン・ポーターはチョコレートやカラメルを思わせる柔らかなモルト風味、アイリッシュ・ドライスタウトはローストバーレイ由来の酸味、ドライな後口、きめ細かな泡が識別点です。どちらも上面発酵です。",
        "choiceReasons": [
            "正答：ロンドン・ポーターでは、ブラウンモルトやチョコレートモルト由来の甘く香ばしい風味が感じられます。",
            "正答：アイリッシュ・ドライスタウトは、ローストバーレイ由来の酸味を伴う焙煎香とドライな後口が特徴です。",
            "正答：窒素ガスで提供される代表例では、きめ細かくクリーミーな泡がよく見られます。",
            "誤答：ロンドン・ポーターは下面発酵のラガーではなく、上面発酵のエールです。",
        ],
    },
    "B-053": {
        "question": "醸造用水の硫酸イオンと塩化物イオンの比率について、正しい設計指針をすべて選んでください。",
        "choices": [
            "硫酸イオンを相対的に高めると、苦味を引き締めドライな印象を強めやすい",
            "塩化物イオンを相対的に高めると、モルトの豊かさや口当たりの丸みを強めやすい",
            "目標とするビアスタイルに応じて比率を調整する",
            "両者の比率はビールの味わいに影響しない",
        ],
        "explanation": "硫酸イオンは苦味の引き締まった印象、塩化物イオンはモルトの豊かさや丸い口当たりを強調しやすいため、目標スタイルに応じて比率を調整します。",
        "choiceReasons": [
            "正答：硫酸イオンを相対的に高めると、ホップの苦味が引き締まり、よりドライに感じられやすくなります。",
            "正答：塩化物イオンを相対的に高めると、モルト風味の豊かさや口当たりの丸みが感じられやすくなります。",
            "正答：望ましい比率は一律ではなく、目標とするビアスタイルと香味設計によって変わります。",
            "誤答：硫酸イオンと塩化物イオンの比率は、苦味、モルト感、口当たりの印象に影響します。",
        ],
    },
}


def replace_terms(value: str) -> str:
    result = value.replace("&#xA0;", " ").replace("\u00a0", " ")
    for source, target in TEXT_REPLACEMENTS:
        result = result.replace(source, target)
    return re.sub(r"[ \t]+", " ", result).strip()


def polish_question_text(value: str) -> str:
    value = replace_terms(REVERSE_RE.sub("", ANSWER_COUNT_RE.sub("", value)))
    value = re.sub(r"\s+vs\.?\s+", "と", value, flags=re.IGNORECASE)
    value = value.replace("。正しいのは？", "について正しいものをすべて選んでください。")
    value = value.replace("について正しいものは？", "について正しいものをすべて選んでください。")
    if value.endswith((":", "：")):
        value = value[:-1].rstrip() + "として正しいものは？"
    return value


def expand_letter_explanation(question: dict, value: str) -> str:
    parts = re.split(r"[／/]", value)
    converted = []
    for part in parts:
        match = re.fullmatch(r"\s*([a-dA-D])\s*[=＝]\s*(.+)", part)
        if not match:
            return value
        index = ord(match.group(1).lower()) - ord("a")
        reason = match.group(2).rstrip("。")
        converted.append(f"「{question['choices'][index]}」は{reason}。")
    return " ".join(converted)


def apply_override(question: dict) -> bool:
    override = OVERRIDES.get(question["id"])
    if not override:
        return False
    for key, value in override.items():
        question[key] = value
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--blind-data", type=Path, default=ROOT / "blind-tasting.json")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    questions = payload["questions"]
    converted_reverse: set[str] = set()
    explicit_ids: set[str] = set()

    for question in questions:
        question_reverse = bool(REVERSE_RE.search(question["question"]))
        choice_reverse = any(REVERSE_RE.search(choice) for choice in question["choices"])
        if question_reverse or choice_reverse:
            question["correct"] = sorted(set(range(4)) - set(question["correct"]))
            converted_reverse.add(question["id"])

        question["question"] = polish_question_text(question["question"])
        question["choices"] = [replace_terms(REVERSE_RE.sub("", choice)) for choice in question["choices"]]
        question["explanation"] = replace_terms(question["explanation"])
        question["choiceReasons"] = [replace_terms(reason) for reason in question["choiceReasons"]]

        expanded = expand_letter_explanation(question, question["explanation"])
        question["explanation"] = replace_terms(expanded)
        if apply_override(question):
            explicit_ids.add(question["id"])

    profiles = load_style_profiles(args.blind_data)
    correct_choice_targets: dict[str, set[str]] = defaultdict(set)
    for question in questions:
        target = subject(question["question"])
        for index in question["correct"]:
            correct_choice_targets[normalize(question["choices"][index])].add(target)

    for question in questions:
        if question["id"] in explicit_ids:
            continue
        if question["id"] in converted_reverse or GENERIC_EXPLANATION_RE.search(question["explanation"]):
            question["explanation"] = overall_explanation(question)
        for index, choice in enumerate(question["choices"]):
            reason = question["choiceReasons"][index]
            if question["id"] not in converted_reverse and not GENERIC_REASON_RE.search(reason):
                continue
            if index in question["correct"]:
                question["choiceReasons"][index] = correct_reason(question, choice)
            elif question["category"] == "beer_styles":
                question["choiceReasons"][index] = wrong_style_reason(
                    question, choice, profiles, correct_choice_targets
                )
            else:
                question["choiceReasons"][index] = wrong_general_reason(
                    question, choice, correct_choice_targets
                )

    distribution = Counter(len(question["correct"]) for question in questions)
    normalized_questions = [re.sub(r"\s+", "", question["question"]) for question in questions]
    duplicate_groups = sum(count > 1 for count in Counter(normalized_questions).values())
    payload["metadata"]["answerCountDistribution"] = {
        str(count): distribution[count] for count in sorted(distribution)
    }
    payload["metadata"]["multiAnswerQuestionCount"] = sum(
        count for answers, count in distribution.items() if answers >= 2
    )
    payload["metadata"]["duplicateQuestionTextCount"] = duplicate_groups
    previous_converted = payload["metadata"].get("japanesePolish", {}).get(
        "reverseQuestionsConvertedToPositive", 0
    )
    payload["metadata"]["japanesePolish"] = {
        "version": "2026-09-01-v41",
        "reverseQuestionsConvertedToPositive": max(previous_converted, len(converted_reverse)),
        "answerCountHintsRemoved": True,
        "awkwardLiteralPhrasesRewritten": True,
    }

    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "questions": len(questions),
        "reverseConverted": len(converted_reverse),
        "explicitOverrides": sorted(explicit_ids),
        "distribution": dict(sorted(distribution.items())),
        "multiAnswer": payload["metadata"]["multiAnswerQuestionCount"],
        "duplicateGroups": duplicate_groups,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
