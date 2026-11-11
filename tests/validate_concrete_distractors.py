"""v52: exact reviewed changes, preserved answer keys and no source-agreement shortcut."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from apply_japanese_answer_text import apply_to_questions as translate_questions, apply_to_variants as translate_variants
manifest = json.loads((ROOT / 'data/concrete-distractor-revisions.json').read_text())
def original(path):
    return subprocess.check_output(['git', 'show', f"{manifest['baselineCommit']}:{path}"], cwd=ROOT)
baseline = json.loads(original('questions.json'))
current = json.loads((ROOT / 'questions.json').read_text())
expected = deepcopy(baseline)
questions = {q['id']: q for q in expected['questions']}
before = {q['id']: q for q in baseline['questions']}
seen = set()
for edit in manifest['edits']:
    key = edit['id'], edit['index']
    assert key not in seen
    seen.add(key)
    q, i = questions[edit['id']], edit['index']
    assert edit['variantId'] == 'base'
    assert i not in q['correct']
    assert q['choices'][i] == edit['oldChoice']
    assert q['choiceReasons'][i] == edit['oldReason']
    assert before[q['id']]['explanation'] == edit['oldExplanation']
    assert edit['basis']['filename'] and edit['basis']['page'] and edit['basis']['quote']
    assert not re.search(r'だけ|必ず|一切', edit['newChoice'])
    q['choices'][i] = edit['newChoice']
    q['choiceReasons'][i] = edit['newReason']
    q['explanation'] = edit['newExplanation']
for source in manifest['sourceUpdates']:
    q = questions[source['id']]
    assert q['sources'] == source['oldSources']
    assert all(s in source['newSources'] for s in q['sources'])
    q['sources'] = source['newSources']
assert len(seen) == manifest['choiceEdits'] == 31
assert len({id for id, _ in seen}) == manifest['questionCount'] == 20
assert Counter(id.split('-')[0] for id, _ in seen) == {'OF26': 16, 'BP26': 15}
assert len(manifest['sourceUpdates']) == 5
assert sum(len(s['newSources']) - len(s['oldSources']) for s in manifest['sourceUpdates']) == 9
translate_questions(expected['questions'])
assert current == expected, 'Every question change must be in the reviewed incremental manifest'
expected_variants = json.loads(original('choice-variants.json'))
translate_variants(expected_variants)
assert json.loads((ROOT / 'choice-variants.json').read_bytes()) == expected_variants
variants = json.loads((ROOT / 'choice-variants.json').read_text())
all_questions = current['questions'] + [v for g in variants['questions'] for v in g['variants']]
shortcut = re.compile(r'(?:資料|本文|講義|説明).{0,16}(?:一致しない|合致しない|反する|記載されていない|示されていない)|挙げられていない')
for q in all_questions:
    assert len(q['choices']) == len(set(q['choices'])) == len(q['choiceReasons']) == 4
    for choice in q['choices']:
        assert not shortcut.search(choice), (q['id'], choice)
for q in current['questions']:
    old = before[q['id']]
    assert q['correct'] == old['correct']
    assert all(q['choices'][i] == questions[q['id']]['choices'][i] for i in q['correct'])
    for field in ('id', 'question', 'category', 'active', 'frequency'):
        assert q.get(field) == old.get(field), (q['id'], field)
# UI-only additions are covered by validate_study_continuation.js,
# validate_recent_accuracy.js and the existing runtime regression suites.
# The first source generator must not manufacture the old meta-level distractors.
assert 'という説明は資料の内容と一致しない' not in (ROOT / 'tools/add_2026_handouts.py').read_text()
print('OK: 31 concrete distractors / 20 questions; 9 verified page citations; unchanged correct choices, keys, IDs, variants; no meta-answer cues in 1080 questions + 16 alternate sets')
