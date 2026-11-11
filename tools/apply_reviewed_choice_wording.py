"""Apply explicitly reviewed wording edits without changing question identities or answers."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/choice-wording-revisions.json'


def revisions():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))['questions']


def apply_question(question, revision):
    """Fail on unexpected source changes instead of silently replacing newer work."""
    for edit in revision['edits']:
        index = edit['index']
        assert question['choices'][index] in (edit['oldChoice'], edit['newChoice']), (revision['id'], index, 'choice drift')
        assert question['choiceReasons'][index] in (edit['oldReason'], edit['newReason']), (revision['id'], index, 'reason drift')
        question['choices'][index] = edit['newChoice']
        question['choiceReasons'][index] = edit['newReason']
    allowed_explanations = [revision['oldExplanation'], revision['newExplanation'], *revision.get('intermediateExplanations', [])]
    assert question['explanation'] in allowed_explanations, (revision['id'], 'explanation drift')
    question['explanation'] = revision['newExplanation']
    if 'newSources' in revision:
        assert question['sources'] in (revision['oldSources'], revision['newSources']), (revision['id'], 'source drift')
        question['sources'] = json.loads(json.dumps(revision['newSources']))


def apply_to_questions(questions):
    by_id = {q['id']: q for q in questions}
    for revision in revisions():
        if revision.get('variantId', 'base') == 'base' and revision['id'] in by_id:
            apply_question(by_id[revision['id']], revision)
    return questions


def apply_to_variants(document):
    by_id = {(g['questionId'], q['id']): q for g in document['questions'] for q in g['variants']}
    for revision in revisions():
        variant = revision.get('variantId', 'base')
        if variant != 'base':
            apply_question(by_id[(revision['id'], variant)], revision)
    return document


def build():
    path = ROOT / 'questions.json'
    newline = '\r\n' if b'\r\n' in path.read_bytes() else '\n'
    data = json.loads(path.read_text(encoding='utf-8'))
    apply_to_questions(data['questions'])
    path.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + '\n').replace('\n', newline).encode('utf-8'))
    variants_path = ROOT / 'choice-variants.json'
    variants_newline = '\r\n' if b'\r\n' in variants_path.read_bytes() else '\n'
    variants = json.loads(variants_path.read_text(encoding='utf-8'))
    apply_to_variants(variants)
    variants_path.write_bytes((json.dumps(variants, ensure_ascii=False, indent=2) + '\n').replace('\n', variants_newline).encode('utf-8'))


if __name__ == '__main__':
    build()
