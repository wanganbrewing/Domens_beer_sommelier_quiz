"""Approved natural distractors: exact scope, preserved truth keys and repeatable imports."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from apply_reviewed_choice_wording import apply_to_questions, apply_to_variants

manifest = json.loads((ROOT / 'data/choice-wording-revisions.json').read_text())
BASE = manifest['baselineCommit']


def old_file(name):
    return subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=ROOT)


old = json.loads(old_file('questions.json'))
current = json.loads((ROOT / 'questions.json').read_text())
old_variants = json.loads(old_file('choice-variants.json'))
current_variants = json.loads((ROOT / 'choice-variants.json').read_text())
expected = deepcopy(old)
expected_variants = deepcopy(old_variants)
questions = {(q['id'], 'base'): q for q in expected['questions']}
questions.update({(g['questionId'], v['id']): v for g in expected_variants['questions'] for v in g['variants']})
targets = set()
edits = 0
for revision in manifest['questions']:
    key = (revision['id'], revision['variantId'])
    q = questions[key]
    assert q['explanation'] == revision['oldExplanation']
    for edit in revision['edits']:
        i = edit['index']
        assert (*key, i) not in targets
        targets.add((*key, i))
        assert i not in q['correct'], 'This release changes distractors, never correct options'
        assert q['choices'][i] == edit['oldChoice']
        assert q['choiceReasons'][i] == edit['oldReason']
        assert edit['newChoice'].strip() and edit['newChoice'] != edit['oldChoice']
        assert edit['newReason'].startswith('誤答：') and edit['basis'].strip()
        q['choices'][i] = edit['newChoice']
        q['choiceReasons'][i] = edit['newReason']
        edits += 1
    q['explanation'] = revision['newExplanation']
    if 'newSources' in revision:
        assert q['sources'] == revision['oldSources']
        q['sources'] = deepcopy(revision['newSources'])
    assert len(q['choices']) == len(set(q['choices'])) == len(q['choiceReasons']) == 4
assert edits == manifest['choiceEdits'] == 187
assert sum(v == 'base' for _, v, _ in targets) == 178
assert len({id for id, v, _ in targets if v == 'base'}) == 136
assert current == expected, 'No unreviewed bank, metadata, source, ID, stem or answer-key change'
assert current_variants == expected_variants, 'No unreviewed variant change'
assert len(current['questions']) == 1080 and sum(q['active'] for q in current['questions']) == 1030
assert Counter(len(q['correct']) for q in current['questions']) == Counter(len(q['correct']) for q in old['questions'])
for q in current['questions']:
    assert len(set(q['choices'])) == len(q['choices']) == 4

# Repeated application is stable. Existing generator tests exercise the documented pipeline.
for _ in range(2):
    apply_to_questions(expected['questions'])
    apply_to_variants(expected_variants)
    assert expected == current and expected_variants == current_variants

# Runtime, persistence, authorization and images are unchanged apart from cache/version tokens.
for name in ['app.js', 'index.html']:
    prior = old_file(name).replace(b'v50', b'v52').replace(b'?v=50', b'?v=52')
    assert (ROOT / name).read_bytes() == prior, name
for name in ['choice-variants.js', 'styles.css', 'beer-photos.js', 'beer-photos.json', 'beer-illustrations.json', 'blind-quiz.js', 'style-links.js']:
    assert (ROOT / name).read_bytes() == old_file(name), name
print('OK: 187 reviewed distractors (178 bank / 9 variants), 136 questions; unchanged keys/IDs/stems/runtime and explicitly verified source additions, no duplicates, idempotent application')
