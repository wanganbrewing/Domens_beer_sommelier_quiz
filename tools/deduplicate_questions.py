from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"


def content_key(question: str) -> str:
    question = re.sub(r"^理解確認[:：]\s*", "", question.strip())
    return re.sub(r"\s+", "", question)


def main() -> None:
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    seen: set[str] = set()
    kept: list[dict] = []
    duplicate_ids: list[str] = []
    source_question_ids: list[str] = []

    for question in data["questions"]:
        if re.search(r"情報源|Sources?|参照元|情報の出典", question["question"], re.IGNORECASE):
            source_question_ids.append(question["id"])
            continue
        key = content_key(question["question"])
        if key in seen:
            duplicate_ids.append(question["id"])
            continue
        seen.add(key)
        kept.append(question)

    remaining_ids = {question["id"] for question in kept}
    category_counts = Counter(question["category"] for question in kept)
    tier_counts = Counter(question["frequencyTier"] for question in kept)
    metadata = data["metadata"]
    metadata["title"] = "BierKompass"
    metadata["version"] = "2026-08-31-doemens-global-v7"
    metadata["questionCount"] = len(kept)
    metadata["multiAnswerQuestionCount"] = sum(len(question["correct"]) >= 2 for question in kept)
    metadata["deduplication"] = {
        "policy": "先頭の『理解確認：』と空白を除いた問題文が同じ設問は1問だけ残す。情報源自体を尋ねる設問は収録しない。",
        "removedDuplicateCount": len(duplicate_ids),
        "removedDuplicateIds": duplicate_ids,
        "removedSourceQuestionCount": len(source_question_ids),
        "removedSourceQuestionIds": source_question_ids,
    }
    for category in metadata["categories"]:
        category["count"] = category_counts[category["id"]]
    for tier in metadata["frequencyTiers"]:
        tier["count"] = tier_counts[tier["id"]]
    if "brewingBoostIds" in metadata:
        metadata["brewingBoostIds"] = [question_id for question_id in metadata["brewingBoostIds"] if question_id in remaining_ids]
    style_guide = metadata.get("mobileStyleGuideIntegration")
    if style_guide:
        style_guide["questionIds"] = [question_id for question_id in style_guide["questionIds"] if question_id in remaining_ids]
        style_guide["questionCount"] = len(style_guide["questionIds"])

    data["questions"] = kept
    QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"OK: kept={len(kept)}; duplicates removed={len(duplicate_ids)}; "
        f"source questions removed={len(source_question_ids)}; categories={dict(category_counts)}"
    )


if __name__ == "__main__":
    main()
