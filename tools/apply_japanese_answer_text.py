"""Apply reviewed Japanese glosses without changing the question's truth conditions."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/japanese-answer-text.json'


def edits():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))['edits'] if MANIFEST.exists() else []


def transform(questions, *, variants=False, restore=False):
    if variants:
        by_id = {(group['questionId'], q['id']): q for group in questions['questions'] for q in group['variants']}
    else:
        by_id = {(q['id'], None): q for q in questions}
    for edit in edits():
        key = edit['id'], edit['variantId']
        if key not in by_id:
            continue
        q = by_id[key]
        field, index = edit['field'], edit['index']
        value = q[field] if index is None else q[field][index]
        if restore:
            # Old import sources can predate the reviewed wording layer. Leave them
            # untouched, and let that layer validate before Japanese text is applied.
            if value != edit['newChoice']:
                continue
            new_value = edit['oldChoice']
        else:
            assert value in (edit['oldChoice'], edit['newChoice']), (*key, field, index, 'translation source drift')
            new_value = edit['newChoice']
        if index is None:
            q[field] = new_value
        else:
            q[field][index] = new_value
    return questions


def apply_to_questions(questions):
    return transform(questions)


def apply_to_variants(document):
    return transform(document, variants=True)


def restore_questions(questions):
    return transform(questions, restore=True)


def restore_variants(document):
    return transform(document, variants=True, restore=True)


def build():
    for filename, apply in [('questions.json', apply_to_questions), ('choice-variants.json', apply_to_variants)]:
        path = ROOT / filename
        data = json.loads(path.read_bytes())
        if filename == 'questions.json':
            apply(data['questions'])
        else:
            apply(data)
        newline = '\r\n' if b'\r\n' in path.read_bytes() else '\n'
        path.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + '\n').replace('\n', newline).encode())


if __name__ == '__main__':
    build()
