"""English-source additions: provenance, options, idempotency and immutable old bank."""
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
data_path = ROOT / 'questions.json'
before = data_path.read_bytes()
data = json.loads(before)
added = json.loads((ROOT / 'data/english-course-supplement.json').read_text())
all_q = data['questions']
assert added and data['metadata']['englishSupplement']['questionCount'] == len(added)
assert [q for q in all_q if q["id"].startswith(("EP26-", "UK26-", "ES26-"))] == added
assert len({q['id'] for q in all_q}) == len(all_q)
known_categories = {c['id'] for c in data['metadata']['categories']}
old_signatures = {(re.sub(r'\s+', '', q['question']), tuple(sorted(q['choices']))) for q in all_q if q['id'] not in {a['id'] for a in added}}
signatures = set()
for q in added:
    assert q['category'] in known_categories
    assert q['type'] == 'multiple' and q['active'] is True
    assert q['frequencyTier'] == 'A'
    assert len(q['choices']) == len(set(q['choices'])) == len(q['choiceReasons']) == 4
    assert 1 <= len(q['correct']) <= 4
    assert q['correct'] == sorted(set(q['correct'])) and all(i in range(4) for i in q['correct'])
    assert q['explanation'].strip() and all(r.strip() for r in q['choiceReasons'])
    assert not re.search(r'[1-4１-４](?:つ|個)選', q['question'])
    assert 'という説明は資料の内容と一致しない' not in ' '.join(q['choices'])
    for index, reason in enumerate(q['choiceReasons']):
        assert reason.startswith('正答：' if index in q['correct'] else '誤答：')
    assert q['sources']
    for s in q['sources']:
        assert s['language'] == 'en'
        assert s['filename'] and s['section'] and s['status'] and s['locator']
        assert isinstance(s['page'], int) and 1 <= s['page'] <= 121
        assert str(s['page']) in s['locator'] and '英語' in s['locator']
        if 'Cooking' in s['filename']:
            assert s['page'] == 2 and '2025' in s['status'] and '未確認' in s['status']
    signature = (re.sub(r'\s+', '', q['question']), tuple(sorted(q['choices'])))
    assert signature not in old_signatures and signature not in signatures
    signatures.add(signature)

# All prior questions retain their IDs and data, apart from the requested copy cleanup.
base = json.loads(subprocess.check_output(['git', 'show', '8a985a43c70f21a35b20016a13f3c960f54e38b5:questions.json'], cwd=ROOT))
for q in base['questions']:
    q['question'] = q['question'].removeprefix('講義資料の英語本文に基づき、')
    q['explanation'] = q['explanation'].removeprefix('講義資料の英語本文をもとにした学習用問題です。')
assert [q for q in all_q[:1040] if q['id'] != 'OF26-007'] == [q for q in base['questions'] if q['id'] != 'OF26-007'], 'Unrelated existing questions must not change'
clarified = next(q for q in all_q if q['id'] == 'OF26-007')
original = next(q for q in base['questions'] if q['id'] == 'OF26-007')
assert clarified['correct'] == original['correct'] == [0, 1, 2]
assert clarified['sources'] == original['sources']
assert '汚染とは断定できない' in clarified['choiceReasons'][1]
assert data['metadata']['englishSupplement']['answerCountDistribution'] == dict(Counter(str(len(q['correct'])) for q in added))
subprocess.run([sys.executable,str(ROOT/'tools/add_english_course_supplement.py')],check=True)
assert data_path.read_bytes() == before, 'Regeneration must be idempotent'
print(f'OK: {len(added)} additions, English page/status citations, full choice reasoning, stable IDs and idempotent generation')
