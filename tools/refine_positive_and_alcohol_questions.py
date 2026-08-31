"""Use positive question stems and retain only extreme-ABV range questions."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"
NEGATIVE_PATTERN = re.compile(r"誤っている|適切でない|正しくない|該当しない|当てはまらない|含まれない")


def style_replacement(stem: str, truths: list[str], falsehood: str, explanation: str, style: str) -> dict:
    choices = [*truths, falsehood]
    return {
        "question": stem,
        "choices": choices,
        "correct": [0, 1, 2],
        "explanation": explanation,
        "choiceReasons": [
            *[f"「{choice}」は、{style}の特徴として正しい内容です。" for choice in truths],
            f"「{falsehood}」は、{style}の典型的な特徴ではありません。",
        ],
    }


STYLE_REPLACEMENTS = {
    "BK-0278": style_replacement(
        "アメリカンラガーの典型的な外観や風味として、正しいものをすべて選んでください。",
        ["非常に淡い黄色", "薄く軽いボディ", "軽く控えめなフィニッシュ"],
        "濃い黒色で強い焙煎香",
        "アメリカンラガーは、淡い色、軽いボディ、穏やかで短いフィニッシュが典型です。",
        "アメリカンラガー",
    ),
    "BK-0770": style_replacement(
        "アメリカンラガーの製法や原料として、正しいものをすべて選んでください。",
        ["下面発酵で造る", "コーン・米・糖類などの副原料を使用できる", "ライトタイプは発酵度が高く残留エキスが少ない"],
        "小麦麦芽を必ず50%以上使用する",
        "アメリカンラガーは下面発酵で、副原料を使用する軽い設計があり、ライトタイプは高発酵度です。",
        "アメリカンラガー",
    ),
    "BK-0293": style_replacement(
        "イタリアン・ピルスナーの典型的な外観として、正しいものをすべて選んでください。",
        ["明るいゴールデンイエロー", "透明感がある", "粘りのある白い泡が立つ"],
        "濃い黒色で泡がほとんど立たない",
        "イタリアン・ピルスナーは明るく透明感があり、白い泡とレーシングが見られます。",
        "イタリアン・ピルスナー",
    ),
    "BK-0966": style_replacement(
        "イタリアン・ピルスナーのアロマやホップ特性として、正しいものをすべて選んでください。",
        ["ドライホッピング由来のフローラル香", "ハーブや柑橘を思わせる香り", "ホップ香がドイツのピルスナーより前面に出る"],
        "ホップを使用せず強いバナナ香を中心とする",
        "イタリアン・ピルスナーはドライホッピングを多用し、フローラル、ハーブ、柑橘系の香りが際立ちます。",
        "イタリアン・ピルスナー",
    ),
    "BK-0300": style_replacement(
        "エクスポート／スペシャルの典型的な外観として、正しいものをすべて選んでください。",
        ["明るい黄色から濃い黄色", "透明で輝きがある", "泡立ちと泡持ちがよい"],
        "不透明な黒色で泡立ちが弱い",
        "エクスポート／スペシャルは黄色系で透明感があり、良好な泡立ちと泡持ちが特徴です。",
        "エクスポート／スペシャル",
    ),
    "BK-0960": style_replacement(
        "エクスポート／スペシャルの典型的な風味として、正しいものをすべて選んでください。",
        ["はっきりしたモルトアロマ", "わずかに強調されたホップノート", "ソフトでフルボディの風味"],
        "強烈な乳酸の酸味が中心",
        "エクスポート／スペシャルはモルト主体で、穏やかなホップと柔らかなフルボディが調和します。",
        "エクスポート／スペシャル",
    ),
    "BK-0309": style_replacement(
        "オールドエール／ストックエールの典型的な香味として、正しいものをすべて選んでください。",
        ["強いカラメル香", "ドライフルーツのアロマ", "樽熟成による軽い酸味が現れる場合がある"],
        "柑橘系ホップだけが支配的",
        "オールドエールはカラメル、ドライフルーツ、樽熟成由来の軽い酸味など複雑な香味を持ちます。",
        "オールドエール／ストックエール",
    ),
    "BK-0568": style_replacement(
        "オールドエール／ストックエールの熟成や外観として、正しいものをすべて選んでください。",
        ["新しいエールと1年以上樽熟成したエールを混ぜる場合がある", "琥珀色からマホガニー色", "余韻が長い"],
        "無色透明で熟成を行わない",
        "オールドエールは樽熟成やブレンドを用いる場合があり、濃い色調と長い余韻を示します。",
        "オールドエール／ストックエール",
    ),
    "BK-0331": style_replacement(
        "スコティッシュエールの発酵や香味傾向として、正しいものをすべて選んでください。",
        ["低温で発酵させることが多い", "イングリッシュエールより果実香やスパイス香が穏やか", "ホップの主張が比較的弱い"],
        "強いトロピカルホップ香を最優先する",
        "スコティッシュエールは低温発酵が多く、果実・スパイス・ホップの主張は比較的穏やかです。",
        "スコティッシュエール",
    ),
    "BK-0962": style_replacement(
        "スコティッシュエールに見られる特徴として、正しいものをすべて選んでください。",
        ["わずかなスモーキーさが現れる場合がある", "ピート麦芽を思わせる香りが出る場合がある", "イングリッシュエールよりホップ感が弱い傾向"],
        "乳酸発酵による強い酸味が必須",
        "スコティッシュエールには穏やかなホップ感と、場合により軽いスモークやピートのニュアンスがあります。",
        "スコティッシュエール",
    ),
    "BK-0336": style_replacement(
        "セゾンの典型的な外観や風味として、正しいものをすべて選んでください。",
        ["ブロンズからアンバーの色調", "コショウを思わせるスパイス香", "フレッシュでドライなフィニッシュ"],
        "無炭酸で強い残糖感が中心",
        "セゾンはブロンズからアンバー色で、複雑なスパイス香と爽快でドライな後味が特徴です。",
        "セゾン",
    ),
    "BK-0523": style_replacement(
        "セゾンの伝統的な醸造背景や発酵として、正しいものをすべて選んでください。",
        ["農場労働者向けに醸造された歴史がある", "温度耐性のある酵母株を使用する", "コショウなどのスパイスを加える場合がある"],
        "発酵温度を必ず5℃以下に保つ",
        "セゾンは農場での歴史を持ち、高温耐性酵母やスパイスを用いる場合があります。",
        "セゾン",
    ),
    "BK-0349": style_replacement(
        "ドゥーベルの典型的な外観や香りとして、正しいものをすべて選んでください。",
        ["アンバーから濃いブラウン", "わずかな果実やワインのアロマ", "干しプラムやスパイスのノート"],
        "淡い麦わら色で香りがほとんどない",
        "ドゥーベルは濃い色調で、果実、ワイン、スパイス、ドライフルーツの複雑な香りを持ちます。",
        "ドゥーベル",
    ),
    "BK-0727": style_replacement(
        "ドゥーベルの製法や口当たりとして、正しいものをすべて選んでください。",
        ["上面発酵のダークエール", "瓶内二次発酵に糖を用いる", "炭酸は非常に強い"],
        "下面発酵で無炭酸に仕上げる",
        "ドゥーベルは上面発酵で、瓶内二次発酵と高い炭酸が特徴です。",
        "ドゥーベル",
    ),
    "BK-0351": style_replacement(
        "ニュージーランドIPAの代表的なホップアロマとして、正しいものをすべて選んでください。",
        ["パッションフルーツやマンゴー", "柑橘類", "松を思わせる香り"],
        "ホップ香を完全に抑えた無香の設計",
        "ニュージーランドIPAはトロピカルフルーツ、柑橘、松を思わせるホップ香が際立ちます。",
        "ニュージーランドIPA",
    ),
    "BK-0772": style_replacement(
        "ニュージーランドIPAの口当たりや原料構成として、正しいものをすべて選んでください。",
        ["ミディアムからフルボディ", "ペールエールモルトを基礎にできる", "クリーンな発酵のエール酵母を使う"],
        "小麦麦芽だけで造りホップを使わない",
        "ニュージーランドIPAは中程度以上のボディを持ち、ペールモルトとクリーンなエール酵母がホップを支えます。",
        "ニュージーランドIPA",
    ),
    "BK-0357": style_replacement(
        "バイエルン・メルツェンの典型的な外観や香味として、正しいものをすべて選んでください。",
        ["淡いアンバーから濃いアンバー", "強い芳香性のモルト風味", "カラメルを伴う柔らかな甘味"],
        "淡い酸味と強い乳酸香が中心",
        "バイエルン・メルツェンはアンバー色で、芳香性のあるモルトとカラメルの甘味が特徴です。",
        "バイエルン・メルツェン",
    ),
    "BK-0815": style_replacement(
        "バイエルン・メルツェンのボディや後味として、正しいものをすべて選んでください。",
        ["フルボディ", "ソフトでマイルド", "後味にわずかな甘味が続く"],
        "非常に薄いボディで強烈な酸味が残る",
        "バイエルン・メルツェンは柔らかなフルボディで、わずかな甘味を伴う余韻があります。",
        "バイエルン・メルツェン",
    ),
    "BK-0378": style_replacement(
        "ビエール・ド・ギャルドの典型的な外観や香りとして、正しいものをすべて選んでください。",
        ["深い黄金色から栗色", "トーストやパンを思わせるモルト香", "リンゴや洋梨を思わせる穏やかな果実香"],
        "無色透明で強烈な乳酸臭",
        "ビエール・ド・ギャルドは黄金色から栗色で、モルト、パン、穏やかな果実香が調和します。",
        "ビエール・ド・ギャルド",
    ),
    "BK-0774": style_replacement(
        "ビエール・ド・ギャルドの原料や発酵特性として、正しいものをすべて選んでください。",
        ["ピルスナー・ミュンヘン・ウィーンモルトを使用できる", "ノーブルホップをバランス目的で使う", "果実エステルとフェノールが控えめな酵母を使う"],
        "ロースト麦芽だけを使い強い焦げ味を必須とする",
        "ビエール・ド・ギャルドは複数のモルトを組み合わせ、穏やかなホップとクリーンな発酵で仕上げます。",
        "ビエール・ド・ギャルド",
    ),
    "BK-0591": style_replacement(
        "イングリッシュ・ペールエールの典型的な外観や香りとして、正しいものをすべて選んでください。",
        ["明るい金色から深い琥珀色", "ややフルーティーでスパイシー", "ナッツを思わせるモルト風味"],
        "不透明な黒色で強い燻製香",
        "イングリッシュ・ペールエールは色幅が広く、穏やかな果実・スパイス香とナッツ様モルトを持ちます。",
        "イングリッシュ・ペールエール",
    ),
    "BK-0623": style_replacement(
        "イングリッシュ・ペールエールの炭酸や後味として、正しいものをすべて選んでください。",
        ["発泡性は弱め", "炭酸ガスは少なめ", "後味に明確な苦味が出る"],
        "非常に強い炭酸と甘い後味だけが残る",
        "イングリッシュ・ペールエールは炭酸が穏やかで、後味にははっきりした苦味が現れます。",
        "イングリッシュ・ペールエール",
    ),
}


EXTREME_ABV = {
    "BK-0130": ("7.5〜9.5%", "高アルコールのトリプル"),
    "BK-0341": ("7.5〜9.5%", "高アルコールのトリプル"),
    "BK-0137": ("8〜12%", "高アルコールのImperial Stout"),
    "BK-0233": ("8〜12%", "高アルコールのImperial Stout"),
    "BK-0266": ("8.5〜14.5%", "高アルコールのアイスボック"),
    "BK-0559": ("8.5〜14.5%", "高アルコールのアイスボック"),
    "BK-0312": ("9〜14%", "高アルコールのクアドルペル"),
    "BK-0804": ("9〜14%", "高アルコールのクアドルペル"),
    "BK-0333": ("2.5〜3.5%", "低アルコールのスコティッシュライトエール"),
    "BK-0768": ("2.5〜3.5%", "低アルコールのスコティッシュライトエール"),
    "BK-0383": ("7〜11%", "高アルコールのサハティ"),
    "BK-0794": ("7〜11%", "高アルコールのサハティ"),
}

SECOND_ABV_WORDING_IDS = {"BK-0233", "BK-0341", "BK-0559", "BK-0768", "BK-0794", "BK-0804"}


def positivize_stem(stem: str) -> str:
    replacements = (
        ("適切でない", "適切な"),
        ("正しくない", "正しい"),
        ("該当しない", "該当する"),
        ("当てはまらない", "当てはまる"),
        ("含まれない", "含まれる"),
        ("誤っている", "正しい"),
    )
    for old, new in replacements:
        stem = stem.replace(old, new)
    return stem


def clean_explanation(text: str) -> str:
    text = re.sub(r"^この設問では誤っている選択肢を選びます。", "", text)
    text = re.sub(r"^「.+?」は条件に当てはまりません。したがって、それ以外の選択肢が正答です。", "", text)
    return text


def rewrite_reason(reason: str, choice: str, is_correct: bool) -> str:
    # The choice itself may contain a Japanese full stop.  Start looking for
    # supplemental detail only after the closing quote and the old verdict.
    verdict_marker = reason.find("」は")
    verdict_end = reason.find("。", verdict_marker + 2) if verdict_marker >= 0 else -1
    tail = reason[verdict_end + 1 :].strip() if verdict_end >= 0 else ""
    return tail


def main() -> None:
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    by_id = {question["id"]: question for question in data["questions"]}
    assert set(STYLE_REPLACEMENTS) <= set(by_id)
    assert set(EXTREME_ABV) <= set(by_id)

    for question_id, replacement in STYLE_REPLACEMENTS.items():
        question = by_id[question_id]
        for key, value in replacement.items():
            question[key] = value

    converted = 0
    for question in data["questions"]:
        if not NEGATIVE_PATTERN.search(question["question"]):
            continue
        old_correct = set(question["correct"])
        question["question"] = positivize_stem(question["question"])
        question["correct"] = [index for index in range(len(question["choices"])) if index not in old_correct]
        question["explanation"] = clean_explanation(question["explanation"])
        question["choiceReasons"] = [
            rewrite_reason(reason, question["choices"][index], index in question["correct"])
            for index, reason in enumerate(question["choiceReasons"])
        ]
        converted += 1

    for question_id, (actual, description) in EXTREME_ABV.items():
        question = by_id[question_id]
        style_name = re.sub(r"^(?:高|低)アルコールの", "", description)
        if question_id in SECOND_ABV_WORDING_IDS:
            question["question"] = f"{style_name}のアルコール度数の一般的な目安として、正しい範囲をすべて選んでください。"
        else:
            question["question"] = f"{style_name}の代表的なアルコール度数の範囲として、正しいものをすべて選んでください。"
        low_choices = ["0.0〜0.5%", "8〜12%", "18〜22%"] if "低アルコール" in description else ["0.0〜0.5%", "2.5〜3.5%", "18〜22%"]
        question["choices"] = [actual, *low_choices]
        question["correct"] = [0]
        question["explanation"] = f"{description}の代表的なアルコール度数範囲は{actual}です。"
        question["choiceReasons"] = ["", "", "", ""]

    answer_counts = Counter(len(question["correct"]) for question in data["questions"])
    multi_count = sum(count for answers, count in answer_counts.items() if answers >= 2)
    data["metadata"]["multiAnswerQuestionCount"] = multi_count
    data["metadata"]["questionDesign"] = "設問は肯定形のみ。最終試験では50問中35問を正答2個以上として出題。"
    data["metadata"]["numericDistractorPolicy"] = "度数問題は低度数・高度数が特徴的なスタイルだけを扱い、選択肢には現実的な低値・高値を含める。"

    direct_abv_ids = {
        question["id"] for question in data["questions"]
        if re.search(r"アルコール度数.*範囲", question["question"])
    }
    assert direct_abv_ids == set(EXTREME_ABV)
    assert not any(NEGATIVE_PATTERN.search(question["question"]) for question in data["questions"])
    assert len({question["question"] for question in data["questions"]}) == len(data["questions"])
    QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: converted {converted} negative stems; extreme ABV={len(EXTREME_ABV)}; multi-answer={multi_count}")


if __name__ == "__main__":
    main()
