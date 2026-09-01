"""Extract S-001..S-060 and connect direct profiles to the 4-step style quiz."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from import_integrated_markdown import DEFAULT_SOURCE, parse_questions


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STYLE_DATA = ROOT / "style-quiz.json"

DIRECT_STYLE_IDS = {
    f"S-{number:03d}": f"STYLE-{style_number:02d}"
    for number, style_number in enumerate(
        [6, 17, 24, 20, 21, 22, 23, 32, 31, 25, 27, 26, 28, 29, 30, 7, 8, 9, 10, 15, 16, 39, 34, 45, 51],
        start=1,
    )
}


def module_kind(question_id: str) -> str:
    number = int(question_id.split("-")[1])
    if number <= 25:
        return "blind_identification"
    if number <= 35:
        return "elimination_reasoning"
    if number <= 50:
        return "comparison_axis"
    return "feature_matrix"


def extract_module(source: Path) -> list[dict]:
    questions, _ = parse_questions(source)
    extracted = []
    for question in questions:
        if not question["id"].startswith("S-"):
            continue
        item = {
            "id": question["id"],
            "kind": module_kind(question["id"]),
            "question": question["question"],
            "choices": question["choices"],
            "correct": question["correct"],
            "explanation": question["explanation"],
            "choiceReasons": question["choiceReasons"],
            "source": question["sources"][0],
        }
        if question["id"] in DIRECT_STYLE_IDS:
            if len(question["correct"]) != 1:
                raise ValueError(f"{question['id']} must have exactly one answer")
            item["targetStyleId"] = DIRECT_STYLE_IDS[question["id"]]
        extracted.append(item)
    if len(extracted) != 60:
        raise ValueError(f"Expected 60 S questions, found {len(extracted)}")
    return extracted


def merge(source: Path, style_data_path: Path) -> dict:
    style_data = json.loads(style_data_path.read_text(encoding="utf-8"))
    module = extract_module(source)
    styles_by_id = {style["id"]: style for style in style_data["styles"]}
    for style in style_data["styles"]:
        style.pop("diagnostic", None)
    for item in module[:25]:
        style_id = item["targetStyleId"]
        if style_id not in styles_by_id:
            raise ValueError(f"Unknown style mapping: {item['id']} -> {style_id}")
        correct_choice = item["choices"][item["correct"][0]]
        styles_by_id[style_id]["diagnostic"] = {
            "id": item["id"],
            "clue": item["question"],
            "choices": item["choices"],
            "correctChoice": correct_choice,
            "explanation": item["explanation"],
            "choiceReasons": item["choiceReasons"],
            "source": item["source"],
        }

    counts = Counter(item["kind"] for item in module)
    style_data["metadata"]["version"] = "2026-09-01-integrated-style-module-v2"
    style_data["metadata"]["integratedModule"] = {
        "filename": source.name,
        "questionCount": len(module),
        "blindIdentificationCount": counts["blind_identification"],
        "eliminationReasoningCount": counts["elimination_reasoning"],
        "comparisonAxisCount": counts["comparison_axis"],
        "featureMatrixCount": counts["feature_matrix"],
        "linkedStyleCount": sum("diagnostic" in style for style in style_data["styles"]),
    }
    style_data["styleModule"] = module
    return style_data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--style-data", type=Path, default=DEFAULT_STYLE_DATA)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    merged = merge(args.source, args.style_data)
    summary = {
        "moduleQuestions": len(merged["styleModule"]),
        "linkedStyles": sum("diagnostic" in style for style in merged["styles"]),
        "kinds": Counter(item["kind"] for item in merged["styleModule"]),
    }
    if not args.validate_only:
        args.style_data.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        summary["output"] = str(args.style_data)
    print(json.dumps(summary, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
