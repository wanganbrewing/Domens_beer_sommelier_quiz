"""Japanese answer glosses are explicit, reversible and preserve scoring semantics."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from apply_japanese_answer_text import apply_to_questions, apply_to_variants, restore_questions, restore_variants
manifest = json.loads((ROOT / 'data/japanese-answer-text.json').read_text())
def original(path):
    return json.loads(subprocess.check_output(['git', 'show', f"{manifest['baselineCommit']}:{path}"], cwd=ROOT))
baseline = original('questions.json')
base_variants = original('choice-variants.json')
expected, expected_variants = deepcopy(baseline), deepcopy(base_variants)
questions = {(q['id'], None): q for q in expected['questions']}
questions.update({(g['questionId'], v['id']): v for g in expected_variants['questions'] for v in g['variants']})
seen = set()
for edit in manifest['edits']:
    key = edit['id'], edit['variantId'], edit['field'], edit['index']
    assert key not in seen
    seen.add(key)
    q = questions[key[:2]]
    field, index = edit['field'], edit['index']
    assert field in ('choices', 'choiceReasons', 'explanation')
    old = q[field] if index is None else q[field][index]
    assert old == edit['oldChoice'], key
    assert edit['newChoice'].strip() and edit['newChoice'] != old
    if field == 'explanation':
        assert index is None
        q[field] = edit['newChoice']
    else:
        assert index in range(4)
        if field == 'choiceReasons':
            assert edit['newChoice'].startswith('正答：' if index in q['correct'] else '誤答：')
        q[field][index] = edit['newChoice']
assert len(seen) == manifest['fieldEdits'] == 250
assert len({e['id'] for e in manifest['edits']}) == manifest['questionCount'] == 54
assert Counter(e['field'] for e in manifest['edits']) == {'choices':42, 'choiceReasons':185, 'explanation':23}
current = json.loads((ROOT / 'questions.json').read_text())
variants = json.loads((ROOT / 'choice-variants.json').read_text())
assert current == expected and variants == expected_variants
for q in questions.values():
    assert len(set(q['choices'])) == len(q['choices']) == len(q['choiceReasons']) == 4
for _ in range(2):
    apply_to_questions(expected['questions'])
    apply_to_variants(expected_variants)
    assert expected == current and expected_variants == variants
restore_questions(expected['questions'])
restore_variants(expected_variants)
assert expected == baseline and expected_variants == base_variants
# Meaning questions must not give away the definition in the pre-answer gloss.
q_by_id = {q['id']: q for q in current['questions']}
assert q_by_id['DH-003']['choices'] == next(q for q in baseline['questions'] if q['id']=='DH-003')['choices']
assert 'metallic（メタリック）' in q_by_id['EP26-007']['choices'][3]
assert '金属様' not in q_by_id['EP26-007']['choices'][3]
vegetal = next(v for g in variants['questions'] if g['questionId']=='BP26-015' for v in g['variants'] if v['id']=='alt-b')
assert 'vegetal（ベジタル）' in vegetal['choices'][2] and '植物' not in vegetal['choices'][2]
assert 'Shive（シーブ）' not in json.dumps(current, ensure_ascii=False)
# An unexpected source edit must fail instead of overwriting newer content.
probe = deepcopy(current['questions'])
first = manifest['edits'][0]
next(q for q in probe if q['id']==first['id'])[first['field']][first['index']] = '未確認の別の記述'
try:
    apply_to_questions(probe)
except AssertionError:
    pass
else:
    raise AssertionError('Unexpected translation source drift must stop')
print('OK: 250 Japanese glosses / 54 question families (42 choices, 185 choice reasons, 23 explanations); exact reviewed changes, preserved truth keys/numbers/sources and no definition leakage; repeat-safe and reversible imports')
