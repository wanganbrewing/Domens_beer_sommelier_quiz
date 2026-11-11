"""Reviewed passage maps: exact displayed questions, valid regions and no source uploads."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'questions.json').read_text())
variants = json.loads((ROOT / 'choice-variants.json').read_text())
links = json.loads((ROOT / 'source-links.json').read_text())
base = {q['id']: q for q in data['questions']}
questions = {(id, 'base'): q for id, q in base.items()}
for group in variants['questions']:
    for variant in group['variants']:
        questions[(group['questionId'], variant['id'])] = dict(base[group['questionId']], **{k:v for k,v in variant.items() if k != 'id'})
expected = {(q['id'], 'base') for q in data['questions'] if q['id'].startswith(('OF26-', 'BP26-', 'EP26-', 'UK26-', 'ES26-', 'DH-'))}
expected |= {(g['questionId'], v['id']) for g in variants['questions'] for v in g['variants']}
expected |= {(id, 'base') for id in ('A-257', 'A-258', 'A-261', 'B-283')}
assert len(expected) == 100
assert links['version'] == 1
assert len(links['documents']) == len({d['id'] for d in links['documents']})
documents = {d['id']: d for d in links['documents']}
for d in documents.values():
    assert set(d) == {'id', 'filename', 'sha256', 'pageCount'}
    assert re.fullmatch('[a-f0-9]{64}', d['sha256'])
    assert isinstance(d['pageCount'], int) and 1 <= d['pageCount'] <= 200
    assert d['filename'].endswith('.pdf')
seen, mapped, missing = set(), 0, []
for entry in links['questions']:
    key = entry['questionId'], entry['variantId']
    assert key not in seen and key in expected
    seen.add(key)
    q = questions[key]
    payload = [q['question'], q['choices'], q['correct'], q['choiceReasons'], q['explanation']]
    fingerprint = hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    assert entry['contentHash'] == fingerprint, key
    assert sorted(c['index'] for c in entry['choices']) == [0, 1, 2, 3]
    for choice in entry['choices']:
        if choice['refs']:
            mapped += 1
        else:
            missing.append((*key, choice['index']))
        signatures = set()
        for ref in choice['refs']:
            assert set(ref) == {'documentId', 'page', 'label', 'rects'}
            doc = documents[ref['documentId']]
            assert isinstance(ref['page'], int) and 1 <= ref['page'] <= doc['pageCount']
            assert ref['label'].strip() and len(ref['label']) < 100
            assert not re.search(r'https?://|/workspace/|/tmp/|@', ref['label'])
            assert ref['rects']
            signature = json.dumps(ref, ensure_ascii=False, sort_keys=True)
            assert signature not in signatures
            signatures.add(signature)
            for rect in ref['rects']:
                assert len(rect) == 4 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in rect)
                x0, y0, x1, y1 = rect
                assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1
                assert (x1-x0)*(y1-y0) < 0.95, 'Avoid pretending an entire page is a specific passage'
assert seen == expected
assert mapped + len(missing) == 400
assert mapped == 393
assert set(missing) == {('A-257', 'base', 1), ('A-257', 'base', 2), ('A-258', 'base', 0),
                        ('A-261', 'base', 1), ('A-261', 'base', 2), ('B-283', 'base', 1), ('B-283', 'base', 2)}
assert links['coverage']['questionSets'] == len(seen)
assert links['coverage']['mappedChoices'] == mapped
assert links['coverage']['unmappedChoices'] == len(missing)
assert links['coverage']['baseQuestions'] == 84
assert links['coverage']['alternateSets'] == 16
# Every previously reviewed English passage remains; Japanese context is additive.
english = json.loads((ROOT / 'tests/fixtures/source-links-english.json').read_text())
current_groups = {(q['questionId'], q['variantId']):q for q in links['questions']}
for old in english['questions']:
    current = current_groups[(old['questionId'], old['variantId'])]
    assert old['contentHash'] == current['contentHash']
    for choice in old['choices']:
        refs = next(c['refs'] for c in current['choices'] if c['index'] == choice['index'])
        for ref in choice['refs']:
            assert any(r['documentId'] == ref['documentId'] and r['page'] == ref['page']
                       and r['rects'][:len(ref['rects'])] == ref['rects'] for r in refs)
resolved = next(c for c in current_groups[('OF26-013', 'base')]['choices'] if c['index'] == 3)['refs']
assert {(r['documentId'], r['page']) for r in resolved} == {('pairing0830', 9), ('sensory0830', 17)}
# This change adds pointers, not copied source documents, text pages or altered answers.
BASE = '1820068c448800d07dd7ed9ac059ca2265fca247'
for filename in ('questions.json', 'choice-variants.json'):
    assert (ROOT / filename).read_bytes() == subprocess.check_output(['git', 'show', f'{BASE}:{filename}'], cwd=ROOT)
tracked = subprocess.check_output(['git', 'ls-files'], cwd=ROOT).decode().splitlines()
assert not any(name.lower().endswith('.pdf') for name in tracked), 'Original PDFs must not be published'
print(f'OK: {len(seen)} exact question sets; {mapped}/400 choices have reviewed passage links, {len(missing)} explicitly unmapped; English references preserved, reviewed Japanese references added; no PDF publication or answer changes')
