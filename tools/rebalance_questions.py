from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "questions.json"
TARGET_MULTI_ANSWER = 700
NEGATIVE_MARKERS = ("適切でない", "誤っている", "正しくない", "挙げられていない", "含まれない", "該当しない")
VACUOUS_REASON_MARKERS = (
    "設問の条件に当てはまるため、選択対象です。",
    "条件に当てはまらないため、この設問では選択しません。",
    "正しい内容なので、この否定形の設問では選択しません。",
    "設問の条件に当てはまらないため、選択対象です。",
)


def is_negative(text: str) -> bool:
    return any(marker in text for marker in NEGATIVE_MARKERS)


def positivize(text: str) -> str | None:
    replacements = (
        (r"挙げられていないものは(?:どれ(?:ですか|か)?)?[？?。]?$", "挙げられているものをすべて選んでください。"),
        (r"含まれないものは(?:どれ(?:ですか|か)?)?[？?。]?$", "含まれるものをすべて選んでください。"),
        (r"該当しないものは(?:どれ(?:ですか|か)?)?[？?。]?$", "該当するものをすべて選んでください。"),
    )
    for pattern, replacement in replacements:
        changed = re.sub(pattern, replacement, text)
        if changed != text:
            return changed

    match = re.match(r"^(.*)適切でない([^？?。]*?)(?:は(?:どれ(?:ですか|か)?)?)?[？?。]?$", text)
    if match:
        prefix, label = match.groups()
        label = label.strip("、 ")
        if label in {"", "の"}:
            label = "もの"
        return f"{prefix}適切な{label}をすべて選んでください。"
    return None


def negativize(text: str) -> str | None:
    replacements = (
        (r"適切なもの(?:はどれ(?:ですか|か)?|は何(?:ですか|か)?|は)?[？?。]?$", "適切でないものをすべて選んでください。"),
        (r"正しいもの(?:はどれ(?:ですか|か)?|は何(?:ですか|か)?|は)?[？?。]?$", "誤っているものをすべて選んでください。"),
        (r"正しい説明(?:はどれ(?:ですか|か)?|は)?[？?。]?$", "誤っている説明をすべて選んでください。"),
        (r"適切な説明(?:はどれ(?:ですか|か)?|は)?[？?。]?$", "適切でない説明をすべて選んでください。"),
        (r"正しい選択肢をすべて選んでください。[？?。]?$", "誤っている選択肢をすべて選んでください。"),
        (r"正しいものをすべて選んでください。[？?。]?$", "誤っているものをすべて選んでください。"),
        (r"適切なものをすべて選んでください。[？?。]?$", "適切でないものをすべて選んでください。"),
    )
    for pattern, replacement in replacements:
        changed = re.sub(pattern, replacement, text)
        if changed != text:
            return changed

    terminal_patterns = (
        (r"人物は誰(?:ですか|か)?[？?。]?$", "人物として誤っているものをすべて選んでください。"),
        (r"は何年、どこ(?:ですか|か)?[？?。]?$", "の時期と場所の組み合わせとして誤っているものをすべて選んでください。"),
        (r"は何年(?:ですか|か)?[？?。]?$", "の年として誤っているものをすべて選んでください。"),
        (r"は何科の植物(?:ですか|か)?[？?。]?$", "の植物分類として誤っているものをすべて選んでください。"),
        (r"の範囲は(?:どれ(?:ですか|か)?)?[？?。]?$", "の範囲として誤っているものをすべて選んでください。"),
        (r"の組み合わせは(?:どれ(?:ですか|か)?)?[？?。]?$", "の組み合わせとして誤っているものをすべて選んでください。"),
        (r"として適切なものは(?:どれ(?:ですか|か)?)?[？?。]?$", "として適切でないものをすべて選んでください。"),
        (r"として正しいものは(?:どれ(?:ですか|か)?)?[？?。]?$", "として誤っているものをすべて選んでください。"),
        (r"とは何を指す(?:のですか|か)?[？?。]?$", "の説明として誤っているものをすべて選んでください。"),
        (r"は何と呼ばれる(?:のですか|か)?[？?。]?$", "の名称として誤っているものをすべて選んでください。"),
        (r"は(?:およそ)?何[^？?。]*[？?。]?$", "について、誤っているものをすべて選んでください。"),
        (r"はどの[^？?。]*[？?。]?$", "について、誤っているものをすべて選んでください。"),
        (r"はどこ[^？?。]*[？?。]?$", "の場所として誤っているものをすべて選んでください。"),
        (r"はいつ[^？?。]*[？?。]?$", "の時期として誤っているものをすべて選んでください。"),
        (r"はどう[^？?。]*[？?。]?$", "の説明として誤っているものをすべて選んでください。"),
        (r"は[？?。]$", "について、誤っているものをすべて選んでください。"),
        (r"はどれ(?:ですか|か)?[？?。]?$", "として誤っているものをすべて選んでください。"),
        (r"は何(?:ですか|か)?[？?。]?$", "として誤っているものをすべて選んでください。"),
        (r"は誰(?:ですか|か)?[？?。]?$", "として誤っている人物をすべて選んでください。"),
    )
    for pattern, replacement in terminal_patterns:
        changed = re.sub(pattern, replacement, text)
        if changed != text:
            return changed
    return None


def clean_stem(text: str) -> str:
    text = text.replace("原料として優れている理由として適切なものを", "原料として優れている理由のうち、適切なものを")
    text = text.replace("ドゥーメンスが教育対象としている職種として適切なものを", "ドゥーメンスの教育対象に含まれる職種を")
    text = text.replace("酵素の中で、タンパク質分解酵素として挙げられているものとして誤っている", "酵素のうち、タンパク質分解酵素として誤っている")
    text = text.replace("分析仕様として示されているアルコール度数の範囲として", "分析仕様で示されるアルコール度数の範囲として")
    text = text.replace("分析仕様として、使用される主な原料の組み合わせとして", "分析仕様における主な原料の組み合わせとして")
    text = re.sub(r"([れし]た)のの(年|時期)", r"\1\2", text)
    text = text.replace("として挙げられているものとして誤っている", "として挙げられているもののうち、誤っている")
    text = text.replace("として名前が挙げられている製品として誤っている", "として名前が挙げられている製品のうち、誤っている")
    text = text.replace("として使われている表現として誤っている", "として使われる表現のうち、誤っている")
    text = text.replace("として、適切な組み合わせとして誤っている", "の組み合わせとして誤っている")
    text = text.replace("としておおよそ適切な範囲について、誤っているものを", "の範囲として誤っているものを")
    text = text.replace("として正しいのについて、誤っているものを", "として誤っているものを")
    text = text.replace("として適切なのについて、誤っているものを", "として適切でないものを")
    text = re.sub(r"として正しい([^、。]+?)について、誤っているものを", r"の\1として誤っているものを", text)
    text = re.sub(r"として正しい([^、。]+?)として誤っているものを", r"の\1として誤っているものを", text)
    text = re.sub(r"として適切な([^、。]+?)について、誤っているものを", r"の\1として誤っているものを", text)
    text = text.replace("について、適切な評価として誤っている", "について、誤っている評価")
    text = text.replace("適切な組み合わせとして誤っている", "組み合わせとして誤っている")
    text = text.replace("発酵という現象について、古くについて、誤っているものを", "発酵に対する古い考え方として、誤っているものを")
    text = text.replace("という一般的な誤解について、適切な見解について、誤っているものを", "という一般的な誤解に対する見解として、誤っているものを")
    text = text.replace("心理的影響として適切な、人間の感覚の中で他の感覚より優位とされるものについて、誤っているものを", "人間の感覚の優位性について、誤っているものを")
    text = text.replace("修道院が初めてホップを醸造に使用したのについて、誤っているものを", "修道院が醸造にホップを初めて使用した時期として、誤っているものを")
    text = text.replace("ステップ1と同じ内容が繰り返されるのについて、誤っているものを", "ステップ1と同じ内容が繰り返されるステップとして、誤っているものを")
    text = text.replace("として1位に挙げられているのについて、誤っているものを", "として1位に挙げられているもののうち、誤っているものを")
    text = text.replace("として挙げられているのについて、誤っているものを", "として挙げられているもののうち、誤っているものを")
    text = text.replace("で確認するものについて、誤っているものを", "で確認する項目として、誤っているものを")
    text = text.replace("ものについて、誤っているものを", "もののうち、誤っているものを")
    text = re.sub(r"のうち、(.+?)もののうち、誤っているものを", r"の中で、\1ものとして誤っているものを", text)
    return text


def proportional_selection(candidates: list[dict], count: int) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for question in candidates:
        groups[(question["category"], question["frequencyTier"])].append(question)
    for questions in groups.values():
        questions.sort(key=lambda question: question["id"])

    total = len(candidates)
    quotas = {key: count * len(values) / total for key, values in groups.items()}
    selected_counts = {key: math.floor(quota) for key, quota in quotas.items()}
    remainder = count - sum(selected_counts.values())
    for key in sorted(groups, key=lambda item: (-(quotas[item] - selected_counts[item]), item))[:remainder]:
        selected_counts[key] += 1

    selected = []
    for key in sorted(groups):
        values = groups[key]
        take = selected_counts[key]
        if not take:
            continue
        # IDs are spread over the whole source order instead of taking one contiguous block.
        indexes = [index * len(values) // take for index in range(take)]
        selected.extend(values[index] for index in indexes)
    assert len(selected) == count
    assert len({question["id"] for question in selected}) == count
    return selected


def complement(question: dict) -> list[int]:
    original = set(question["correct"])
    return [index for index in range(len(question["choices"])) if index not in original]


def convert_positive_question(question: dict, new_stem: str) -> None:
    question["question"] = new_stem
    question["correct"] = complement(question)
    question["explanation"] = f"この設問では誤っている選択肢を選びます。{question['explanation']}"
    question["choiceReasons"] = ["" for _ in question["choices"]]


def convert_negative_question(question: dict, new_stem: str) -> None:
    original_false = question["correct"][0]
    false_choice = question["choices"][original_false]
    question["question"] = new_stem
    question["correct"] = complement(question)
    question["explanation"] = f"「{false_choice}」は条件に当てはまりません。したがって、それ以外の選択肢が正答です。{question['explanation']}"
    question["choiceReasons"] = ["" for _ in question["choices"]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--clean-only", action="store_true")
    args = parser.parse_args()

    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    questions = data["questions"]
    if args.clean_only:
        changed = 0
        removed_reasons = 0
        for question in questions:
            cleaned = clean_stem(question["question"])
            if cleaned != question["question"]:
                question["question"] = cleaned
                changed += 1
            for index, reason in enumerate(question["choiceReasons"]):
                if any(marker in reason for marker in VACUOUS_REASON_MARKERS):
                    question["choiceReasons"][index] = ""
                    removed_reasons += 1
        QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"cleaned question stems: {changed}; removed vacuous choice reasons: {removed_reasons}")
        return
    existing_multi = sum(len(question["correct"]) >= 2 for question in questions)
    conversions_needed = TARGET_MULTI_ANSWER - existing_multi

    negative_candidates = [
        (question, positivize(question["question"]))
        for question in questions
        if len(question["correct"]) == 1 and is_negative(question["question"])
    ]
    negative_candidates = [(question, stem) for question, stem in negative_candidates if stem]

    positive_candidates = [
        (question, negativize(question["question"]))
        for question in questions
        if len(question["correct"]) == 1 and not is_negative(question["question"])
    ]
    positive_candidates = [(question, stem) for question, stem in positive_candidates if stem]

    use_negative = negative_candidates[:conversions_needed]
    positive_needed = conversions_needed - len(use_negative)
    positive_by_id = {question["id"]: (question, stem) for question, stem in positive_candidates}
    selected_positive = proportional_selection([item[0] for item in positive_candidates], positive_needed)
    use_positive = [positive_by_id[question["id"]] for question in selected_positive]

    print(f"existing multi-answer: {existing_multi}")
    print(f"positive-form conversions: {len(use_negative)} / {len(negative_candidates)} available")
    print(f"negative-form conversions: {len(use_positive)} / {len(positive_candidates)} available")
    print("negative-form distribution:", dict(Counter(question["category"] for question, _ in use_positive)))
    for question, stem in (use_negative[:4] + use_positive[:8]):
        print(f"{question['id']}: {question['question']} -> {stem}")

    if not args.apply:
        return

    for question, stem in use_negative:
        convert_negative_question(question, clean_stem(stem))
    for question, stem in use_positive:
        convert_positive_question(question, clean_stem(stem))

    data["metadata"]["version"] = "2026-08-31-doemens-global-v5"
    data["metadata"]["multiAnswerQuestionCount"] = TARGET_MULTI_ANSWER
    data["metadata"]["questionDesign"] = "700問は正答2個以上。複数の問いを結合せず、単独の論点で肯定形と否定形を併用。"
    QUESTIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    answer_counts = Counter(len(question["correct"]) for question in questions)
    assert sum(count for answers, count in answer_counts.items() if answers >= 2) == TARGET_MULTI_ANSWER
    print("written:", QUESTIONS_PATH)
    print("answer counts:", dict(sorted(answer_counts.items())))


if __name__ == "__main__":
    main()
