from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

from build_style_quiz import COUNTRY_LABELS, appearance_for, country_for, LAGERS
from integrate_mobile_style_guide import (
    EXCLUDED_STYLE_NAMES,
    REPLACEMENT_IDS,
    SOURCE_FILENAME,
    STYLE_NAMES,
    extract_styles,
)


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"
FIELD_LABELS = {
    "detail": "詳細説明",
    "definition": "特徴定義",
    "ingredients": "原材料・工程",
}
CLARITY_LABELS = {"clear": "透明", "hazy": "濁りあり", "soft": "外観説明を参照"}
FOAM_LABELS = {"rich": "豊か", "medium": "中程度", "thin": "薄い"}


def source(style: dict, section: str = "Step 1〜4") -> list[dict]:
    page = style["page"]
    return [{
        "filename": SOURCE_FILENAME,
        "locator": f"PDF表示ページ{page}（印刷ページ{page}）",
        "page": page,
        "unit": "ページ",
        "section": f"{style['name']} - {section}",
        "raw": f"{SOURCE_FILENAME} p.{page} {style['source_heading']}",
    }]


def question_record(
    question_id: str,
    *,
    question: str,
    choices: list[str],
    correct: list[int],
    explanation: str,
    reasons: list[str],
    sources: list[dict],
    tier: str,
    category: str = "beer_styles",
) -> dict:
    assert choices and correct and len(reasons) == len(choices)
    assert all(0 <= index < len(choices) for index in correct)
    return {
        "category": category,
        "type": "multiple",
        "question": question,
        "choices": choices,
        "correct": correct,
        "explanation": explanation,
        "choiceReasons": reasons,
        "sources": sources,
        "frequencyTier": tier,
        "id": question_id,
    }


def style_distractors(styles: list[dict], target_index: int, field: str) -> list[dict]:
    target = styles[target_index]
    selected: list[dict] = []
    seen_values = {target[field]}
    offsets = (11, 23, 37, 5, 17, 29, 41, 1, 7, 13, 19, 31, 43, 47)
    for offset in offsets:
        candidate = styles[(target_index + offset) % len(styles)]
        if candidate["name"] == target["name"] or candidate[field] in seen_values:
            continue
        selected.append(candidate)
        seen_values.add(candidate[field])
        if len(selected) == 3:
            return selected
    for candidate in styles:
        if candidate["name"] != target["name"] and candidate[field] not in seen_values:
            selected.append(candidate)
            seen_values.add(candidate[field])
        if len(selected) == 3:
            return selected
    raise ValueError(f"Not enough distractors for {target['name']} / {field}")


def appearance_text(style: dict) -> str:
    appearance = appearance_for(style)
    summary = appearance["summary"].rstrip("。")
    return (
        f"{summary}。透明度は{CLARITY_LABELS[appearance['clarity']]}、"
        f"泡は{FOAM_LABELS[appearance['foam']]}。"
    )


def extract_eliminations(pdf_path: Path) -> dict[str, str]:
    reader = PdfReader(str(pdf_path))
    blocks: list[str] = []
    for page in reader.pages:
        lines = [line.strip() for line in (page.extract_text() or "").splitlines() if line.strip()]
        representative_indexes = [index for index, line in enumerate(lines) if line.startswith("★ 代表:")]
        for item_index, representative_index in enumerate(representative_indexes):
            start = representative_index - 1
            end = representative_indexes[item_index + 1] - 1 if item_index + 1 < len(representative_indexes) else len(lines)
            blocks.append("".join(lines[start:end]))
    if len(blocks) != len(STYLE_NAMES):
        raise ValueError(f"Expected {len(STYLE_NAMES)} style blocks, found {len(blocks)}")
    result: dict[str, str] = {}
    for name, block in zip(STYLE_NAMES, blocks, strict=True):
        if name in EXCLUDED_STYLE_NAMES:
            continue
        match = re.search(r"4\.2\s*消去除外[:：](.*?)4\.3\s*最終結論[:：]", block)
        if not match:
            raise ValueError(f"Elimination text not found for {name}")
        result[name] = re.sub(r"\s+", " ", match.group(1)).strip()
    return result


def build_style_questions(styles: list[dict], eliminations: dict[str, str]) -> list[dict]:
    records: list[dict] = []
    used_fields = {
        style["name"]: ("detail", "definition", "ingredients")[index % 3]
        for index, style in enumerate(styles)
    }

    # 52スタイルそれぞれについて、既存問題で未使用だった2種類を追加する（104問）。
    for index, style in enumerate(styles):
        for field in ("detail", "definition", "ingredients"):
            if field == used_fields[style["name"]]:
                continue
            distractors = style_distractors(styles, index, field)
            records.append({
                "kind": "field",
                "style": style,
                "field": field,
                "distractors": distractors,
            })

    # 外観・国分類・発酵系統・識別ポイントを各52問追加する（208問）。
    for kind in ("appearance", "country", "family", "elimination"):
        for index, style in enumerate(styles):
            records.append({"kind": kind, "style": style, "index": index})

    assert len(records) == 312
    return records


def materialize_style_question(question_id: str, spec: dict, styles: list[dict], eliminations: dict[str, str], order: int) -> dict:
    style = spec["style"]
    kind = spec["kind"]
    tier = ("A", "B", "B", "C")[order % 4]
    if kind == "field":
        field = spec["field"]
        distractors = spec["distractors"]
        choices = [style[field], *(item[field] for item in distractors)]
        reasons = [f"この内容が示すスタイル：{style['name']}", *(f"この内容が示すスタイル：{item['name']}" for item in distractors)]
        return question_record(
            question_id,
            question=f"{style['name']}の{FIELD_LABELS[field]}として合致するものを選んでください。",
            choices=choices,
            correct=[0],
            explanation=f"{style['name']}の{FIELD_LABELS[field]}は「{style[field]}」です。各選択肢が示すスタイル名を下に示します。",
            reasons=reasons,
            sources=source(style, "Step 1〜3"),
            tier=tier,
        )
    if kind == "appearance":
        index = spec["index"]
        distractors = style_distractors(styles, index, "detail")
        choices = [appearance_text(style), *(appearance_text(item) for item in distractors)]
        reasons = [f"この外観が示すスタイル：{style['name']}", *(f"この外観が示すスタイル：{item['name']}" for item in distractors)]
        return question_record(
            question_id,
            question=f"{style['name']}の外観として合致するものを選んでください。",
            choices=choices,
            correct=[0],
            explanation=f"{style['name']}の外観は「{choices[0]}」です。香味や原材料を混ぜず、外観だけで比較します。",
            reasons=reasons,
            sources=source(style, "Step 1 外観"),
            tier=tier,
        )
    if kind == "country":
        country = country_for(style["name"])
        choices = list(COUNTRY_LABELS.values())
        correct_index = list(COUNTRY_LABELS).index(country)
        reasons = ["" for _ in choices]
        reasons[correct_index] = f"{style['name']}は、この国・地域分類では「{COUNTRY_LABELS[country]}」に属します。"
        return question_record(
            question_id,
            question=f"{style['name']}が属する国・地域の分類を選んでください。",
            choices=choices,
            correct=[correct_index],
            explanation=f"{style['name']}の国・地域分類は「{COUNTRY_LABELS[country]}」です。",
            reasons=reasons,
            sources=source(style, "国別分類"),
            tier="B",
        )
    if kind == "family":
        is_lager = style["name"] in LAGERS
        choices = ["ラガー（下面発酵系統）", "エール（上面発酵系統）"]
        correct_index = 0 if is_lager else 1
        family = "ラガー" if is_lager else "エール"
        reasons = ["", ""]
        reasons[correct_index] = f"{style['name']}は「{family}」の発酵系統に分類されます。"
        return question_record(
            question_id,
            question=f"{style['name']}の発酵系統を選んでください。",
            choices=choices,
            correct=[correct_index],
            explanation=f"{style['name']}は「{family}」に分類されます。",
            reasons=reasons,
            sources=source(style, "Step 4 発酵判別"),
            tier="A",
        )
    if kind == "elimination":
        index = spec["index"]
        target_text = eliminations[style["name"]]
        elimination_styles = [{**item, "elimination": eliminations[item["name"]]} for item in styles]
        distractors = style_distractors(elimination_styles, index, "elimination")
        choices = [target_text, *(item["elimination"] for item in distractors)]
        reasons = [f"この比較・除外ポイントが示すスタイル：{style['name']}", *(f"この比較・除外ポイントが示すスタイル：{item['name']}" for item in distractors)]
        return question_record(
            question_id,
            question=f"{style['name']}を他のスタイルから識別する際の比較・除外ポイントとして合致するものを選んでください。",
            choices=choices,
            correct=[0],
            explanation=f"{style['name']}の識別では「{target_text}」という比較・除外ポイントが示されています。",
            reasons=reasons,
            sources=source(style, "Step 4 消去除外"),
            tier="B" if order % 2 else "C",
        )
    raise ValueError(f"Unknown question kind: {kind}")


def method_questions(ids: list[str]) -> list[dict]:
    common_source = [{
        "filename": SOURCE_FILENAME,
        "locator": "PDF表示ページ1（印刷ページ1）",
        "page": 1,
        "unit": "ページ",
        "section": "Doemens式 ブラインドテイスティング分析手順",
        "raw": f"{SOURCE_FILENAME} p.1 How to analyze beer in a blind tasting",
    }]
    specs = [
        (
            "ブラインドテイスティング分析のStep 1で行う作業として合致するものを選んでください。",
            ["色・泡・香り・味・炭酸・粘度を客観的に言語化する", "際立つ最大の特徴だけを一語で決める", "原材料と醸造工程を逆算する", "候補スタイルを消去して最終結論を出す"],
            "Step 1では、外観・香味・口当たりを客観的かつ具体的に記述します。",
            "ここではスタイルを決めつけず、観察できた事実を具体的な言葉にします。",
        ),
        (
            "ブラインドテイスティング分析のStep 2で行う作業として合致するものを選んでください。",
            ["際立つ最大の特徴を抽出して定義する", "色・泡・香り・味を順番に記録する", "麦芽比率や酵母種を逆算する", "発酵系統と国から候補を確定する"],
            "Step 2では、強い酸味やバナナ香など、そのビールで際立つ最大の特徴を抽出します。",
            "複数の観察結果から、そのビールを最もよく表す特徴へ焦点を絞ります。",
        ),
        (
            "ブラインドテイスティング分析のStep 3で行う作業として合致するものを選んでください。",
            ["麦芽比率・ホップ・酵母・水質・特殊製法や副原料を推定する", "最初にラガーかエールかだけを決定する", "外観を色と透明度だけで記録する", "候補スタイルを一つ選んでから香味を確認する"],
            "Step 3では、観察した特徴から原材料と醸造工程を逆算します。",
            "香味や口当たりの原因を、麦芽・ホップ・酵母・水質・製法へ結び付ける段階です。",
        ),
    ]
    records = []
    for question_id, (question, choices, explanation, reason) in zip(ids, specs, strict=True):
        records.append(question_record(
            question_id,
            question=question,
            choices=choices,
            correct=[0],
            explanation=explanation,
            reasons=[reason, "", "", ""],
            sources=common_source,
            tier="A",
            category="sensory",
        ))
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--questions", type=Path, default=QUESTIONS_PATH)
    args = parser.parse_args()

    data = json.loads(args.questions.read_text(encoding="utf-8"))
    dedup = data["metadata"]["deduplication"]
    reusable_ids = dedup["removedDuplicateIds"] + dedup["removedSourceQuestionIds"]
    if len(reusable_ids) != 315 or len(set(reusable_ids)) != 315:
        raise ValueError("Expected exactly 315 reusable IDs")
    existing_ids = {question["id"] for question in data["questions"]}
    present_reusable_ids = existing_ids.intersection(reusable_ids)
    if present_reusable_ids:
        if present_reusable_ids != set(reusable_ids) or not data["metadata"].get("expansionTo1000"):
            raise ValueError("Only part of the reusable ID set is already present")
        data["questions"] = [question for question in data["questions"] if question["id"] not in present_reusable_ids]

    styles = extract_styles(args.pdf)
    eliminations = extract_eliminations(args.pdf)
    specs = build_style_questions(styles, eliminations)
    added = [
        materialize_style_question(question_id, spec, styles, eliminations, order)
        for order, (question_id, spec) in enumerate(zip(reusable_ids[:312], specs, strict=True))
    ]
    added.extend(method_questions(reusable_ids[312:]))
    if len(added) != 315:
        raise ValueError(f"Expected 315 additions, created {len(added)}")

    data["questions"].extend(added)
    data["questions"].sort(key=lambda question: int(question["id"].split("-")[1]))
    questions = data["questions"]
    if len(questions) != 1000 or len({question["id"] for question in questions}) != 1000:
        raise ValueError("Question count or ID uniqueness failed")
    normalized = {re.sub(r"\s+", "", question["question"]) for question in questions}
    if len(normalized) != 1000:
        raise ValueError("Duplicate question text detected")

    category_counts = Counter(question["category"] for question in questions)
    tier_counts = Counter(question["frequencyTier"] for question in questions)
    metadata = data["metadata"]
    metadata["title"] = "BierKompass 1000"
    metadata["version"] = "2026-08-31-doemens-global-v10"
    metadata["questionCount"] = 1000
    metadata["multiAnswerQuestionCount"] = sum(len(question["correct"]) >= 2 for question in questions)
    for category in metadata["categories"]:
        category["count"] = category_counts[category["id"]]
    for tier in metadata["frequencyTiers"]:
        tier["count"] = tier_counts[tier["id"]]
    dedup["currentDuplicateCount"] = 0
    dedup["reauthoredQuestionCount"] = 315
    dedup["reauthoredQuestionIds"] = reusable_ids
    dedup["policy"] = "旧版で除外した313件の実質重複と2件の情報源問題は復元せず、同じIDを独立した新規問題315件へ置き換える。"
    style_guide = metadata["mobileStyleGuideIntegration"]
    style_guide["questionIds"] = REPLACEMENT_IDS
    style_guide["questionCount"] = len(REPLACEMENT_IDS)
    metadata["expansionTo1000"] = {
        "addedQuestionCount": 315,
        "styleQuestionCount": 312,
        "sensoryMethodQuestionCount": 3,
        "source": SOURCE_FILENAME,
        "policy": "同一の説明軸を繰り返さず、詳細説明・特徴定義・原材料工程・外観・国分類・発酵系統・識別ポイントを1問1論点で作成する。",
    }

    args.questions.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(questions)} questions; added={len(added)}; categories={dict(category_counts)}; tiers={dict(tier_counts)}")


if __name__ == "__main__":
    main()
