"""Import the user-supplied integrated 1000-question Markdown bank."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Downloads" / "ドゥーメンス予想問題1000問_完全統合版.md"
DEFAULT_OUTPUT = ROOT / "questions.json"

ID_PATTERN = re.compile(r"^\*\*((?:A|B|C|S)-\d{3})\.\*\*", re.MULTILINE)
CHOICE_PATTERN = re.compile(r"(?<![A-Za-z0-9])([a-d])\)\s*", re.IGNORECASE)
ANSWER_PATTERN = re.compile(r"^(?:正答\s*[:：]\s*)?([a-d](?:\s*,\s*[a-d])*)", re.IGNORECASE)
ANSWER_DELIMITER_PATTERN = re.compile(r"→\s*(?=(?:\*\*)?正答\s*[:：]|[a-d](?=[,，\s*（(]|$))", re.IGNORECASE)
REASON_PATTERN = re.compile(r"(?<![A-Za-z0-9])([a-d])\s*=\s*", re.IGNORECASE)
CHOICE_LABELS = "abcd"

CATEGORY_NAMES = {
    "raw_materials": "原材料",
    "brewing_process": "醸造工程・設備",
    "fermentation": "酵母・発酵・熟成",
    "beer_styles": "ビアスタイル",
    "history": "ビールの歴史・文化",
    "sensory": "官能評価",
    "off_flavor": "オフフレーバー",
    "service_quality": "サービス・グラス・樽生・保存",
    "pairing": "フードペアリング",
    "quality_law": "品質・成分・法規",
    "integrated": "総合・横断知識",
}
CATEGORY_ORDER = list(CATEGORY_NAMES)


def clean_inline(value: str) -> str:
    value = value.replace("**", "").replace("`", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def category_for(question_id: str) -> str:
    prefix, number_text = question_id.split("-")
    number = int(number_text)
    if prefix == "S":
        return "beer_styles"
    if prefix == "A":
        if number <= 45:
            return "raw_materials"
        if number <= 65:
            return "fermentation"
        if number <= 85:
            return "brewing_process"
        if number <= 180:
            return "beer_styles"
        if number <= 210:
            return "history"
        if number <= 218:
            return "sensory"
        if number <= 245:
            return "off_flavor"
        if number <= 275:
            return "service_quality"
        if number <= 300:
            return "pairing"
        return "integrated"
    if prefix == "B":
        if number <= 65:
            return "raw_materials"
        if number <= 95:
            return "fermentation"
        if number <= 125:
            return "brewing_process"
        if number <= 175:
            return "beer_styles"
        if number <= 200:
            return "fermentation"
        if number <= 230:
            return "history"
        if number <= 255:
            return "sensory"
        if number <= 280:
            return "service_quality"
        if number <= 300:
            return "quality_law"
        if number <= 325:
            return "pairing"
        return "service_quality"
    if number <= 100:
        return "beer_styles"
    if number <= 110:
        return "sensory"
    if number <= 200:
        return "beer_styles"
    if number <= 230:
        return "history"
    return "quality_law"


def section_at(text: str, position: int, question_id: str) -> str:
    if question_id.startswith("S-"):
        return "スタイル判定・消去推論モジュール（S-001〜S-060）"
    headings = list(re.finditer(r"^#{1,6}\s+(.+)$", text[:position], re.MULTILINE))
    if not headings:
        return ""
    return clean_inline(headings[-1].group(1))


def parse_choice_reasons(explanation: str, choice_count: int) -> list[str]:
    reasons = [""] * choice_count
    matches = list(REASON_PATTERN.finditer(explanation))
    for index, match in enumerate(matches):
        letter = match.group(1).lower()
        choice_index = CHOICE_LABELS.index(letter)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(explanation)
        reason = explanation[match.end():end].strip(" ／/、;；　")
        if choice_index < choice_count:
            reasons[choice_index] = clean_inline(reason)
    return reasons


def parse_questions(source: Path) -> tuple[list[dict], dict]:
    text = source.read_text(encoding="utf-8-sig")
    matches = list(ID_PATTERN.finditer(text))
    if len(matches) != 1000:
        raise ValueError(f"Expected 1000 question IDs, found {len(matches)}")

    questions = []
    failures = []
    for index, match in enumerate(matches):
        question_id = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        content = text[match.end():end]
        answer_delimiters = list(ANSWER_DELIMITER_PATTERN.finditer(content))
        if not answer_delimiters:
            failures.append(f"{question_id}: answer arrow not found")
            continue
        answer_delimiter = answer_delimiters[-1]
        prompt_and_choices = content[:answer_delimiter.start()]
        answer_line = content[answer_delimiter.end():].splitlines()[0].strip()
        choice_matches = list(CHOICE_PATTERN.finditer(prompt_and_choices))
        if len(choice_matches) != 4:
            failures.append(f"{question_id}: expected 4 choices, found {len(choice_matches)}")
            continue
        question_text = clean_inline(prompt_and_choices[:choice_matches[0].start()])
        choices = []
        for choice_index, choice_match in enumerate(choice_matches):
            choice_end = choice_matches[choice_index + 1].start() if choice_index + 1 < len(choice_matches) else len(prompt_and_choices)
            choice_text = clean_inline(prompt_and_choices[choice_match.end():choice_end])
            choice_text = re.sub(r"\s*→\s*加えて\s*$", "", choice_text)
            choices.append(choice_text)
        cleaned_answer = clean_inline(answer_line)
        answer_match = ANSWER_PATTERN.match(cleaned_answer)
        if not answer_match:
            failures.append(f"{question_id}: could not parse answer: {cleaned_answer}")
            continue
        letters = [letter.strip().lower() for letter in answer_match.group(1).split(",")]
        correct = sorted({CHOICE_LABELS.index(letter) for letter in letters})
        explanation = cleaned_answer[answer_match.end():].strip(" ／/、;；　")
        explanation = re.sub(r"^[（(](?:単独正答|全部)[）)]\s*", "", explanation)
        explanation = explanation.strip(" ／/、;；　")
        choice_reasons = parse_choice_reasons(explanation, len(choices))
        if not explanation:
            explanation = "添付資料に個別解説の記載はありません。"
        category = category_for(question_id)
        tier = "A" if question_id.startswith(("A-", "S-")) else question_id[0]
        section = section_at(text, match.start(), question_id)
        questions.append({
            "category": category,
            "type": "multiple",
            "question": question_text,
            "choices": choices,
            "correct": correct,
            "explanation": explanation,
            "choiceReasons": choice_reasons,
            "sources": [{
                "filename": source.name,
                "locator": question_id,
                "page": None,
                "unit": "問題ID",
                "section": section,
                "raw": f"{source.name} {question_id}",
            }],
            "frequencyTier": tier,
            "id": question_id,
        })
    if failures:
        raise ValueError("\n".join(failures[:50]))

    id_counts = Counter(question["id"] for question in questions)
    duplicate_ids = sorted(question_id for question_id, count in id_counts.items() if count > 1)
    normalized_counts = Counter(re.sub(r"\s+", "", question["question"]) for question in questions)
    duplicate_texts = sorted(text for text, count in normalized_counts.items() if count > 1)
    if duplicate_ids:
        raise ValueError(f"Duplicate IDs: {duplicate_ids}")

    category_counts = Counter(question["category"] for question in questions)
    tier_counts = Counter(question["frequencyTier"] for question in questions)
    answer_counts = Counter(len(question["correct"]) for question in questions)
    metadata = {
        "title": "BierKompass 1000",
        "subtitle": "Doemens Biersommelier 試験対策",
        "version": "2026-09-01-integrated-markdown-v1",
        "questionCount": len(questions),
        "studyQuestionCount": 50,
        "examQuestionCount": 50,
        "examMinutes": 40,
        "passingRate": 0.5,
        "categories": [
            {"id": category, "name": CATEGORY_NAMES[category], "count": category_counts[category]}
            for category in CATEGORY_ORDER
            if category_counts[category]
        ],
        "frequencyTiers": [
            {"id": "A", "name": "最頻出予想", "count": tier_counts["A"]},
            {"id": "B", "name": "頻出予想", "count": tier_counts["B"]},
            {"id": "C", "name": "補強・周辺知識", "count": tier_counts["C"]},
        ],
        "notice": "ユーザー提供の完全統合版Markdownから取り込んだ非公式予想問題です。Doemens公式問題ではありません。",
        "sourceImport": {
            "filename": source.name,
            "mainQuestionCount": len(questions),
            "appendixMockExamIncluded": False,
            "appendixMockExamQuestionCount": 50,
        },
        "multiAnswerQuestionCount": sum(count for answers, count in answer_counts.items() if answers >= 2),
        "answerCountDistribution": {str(key): answer_counts[key] for key in sorted(answer_counts)},
        "duplicateQuestionTextCount": len(duplicate_texts),
        "questionDesign": "全問4択の複数選択式。添付Markdown記載の正答を保持し、最終試験では50問中35問を正答2個以上から抽出する。",
    }
    return questions, metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    questions, metadata = parse_questions(args.source)
    summary = {
        "questions": len(questions),
        "ids": len({question["id"] for question in questions}),
        "tiers": Counter(question["frequencyTier"] for question in questions),
        "categories": Counter(question["category"] for question in questions),
        "answers": Counter(len(question["correct"]) for question in questions),
        "duplicateQuestionTextCount": metadata["duplicateQuestionTextCount"],
    }
    if not args.validate_only:
        payload = {"metadata": metadata, "questions": questions}
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary["output"] = str(args.output)
    print(json.dumps(summary, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
