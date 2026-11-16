"""Doemens-logo health supplement: provenance, correctness structure and regressions."""
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from apply_reviewed_choice_wording import apply_to_questions
BASE = 'c0ebf1c'
path = ROOT / 'questions.json'
before = path.read_bytes()
data = json.loads(before)
base = json.loads(subprocess.check_output(['git', 'show', f'{BASE}:questions.json'], cwd=ROOT))
apply_to_questions(base['questions'])
added = json.loads((ROOT / 'data/doemens-health-supplement.json').read_text(encoding='utf-8'))
apply_to_questions(added)
qs = data['questions']
meta = data['metadata']
assert len(base['questions']) == 1068
from scope_approved import approved
assert data == approved()
assert [q['id'] for q in qs[:1068]] == [q['id'] for q in base['questions']]
added = [q for q in qs if q['id'].startswith('DH-')]
assert qs[1068:1080] == added and len(added) == 12
assert len(qs) == meta['questionCount'] == 1170
assert sum(q['active'] for q in qs) == meta['activeQuestionCount'] == 942
assert len({q['id'] for q in qs}) == len(qs)
assert [q['id'] for q in added] == [f'DH-{i:03}' for i in range(1, 13)]
assert Counter(len(q['correct']) for q in added) == {1: 3, 2: 3, 3: 3, 4: 3}
assert Counter(q['category'] for q in added) == {'quality_law': 10, 'history': 2}
assert Counter(q['sources'][0]['page'] for q in added) == {63: 2, 79: 4, 84: 4, 92: 2}
assert meta['healthSupplement']['questionCount'] == len(added)
assert meta['healthSupplement']['sourcePages'] == [63, 79, 84, 92]
assert meta['healthSupplement']['answerCountDistribution'] == dict(Counter(str(len(q['correct'])) for q in added))
seen = {(re.sub(r'\s+', '', q['question']), tuple(sorted(q['choices']))) for q in base['questions']}
for q in added:
    assert q['type'] == 'multiple' and q['active'] is True and q['frequencyTier'] == 'C'
    assert len(q['choices']) == len(q['choiceReasons']) == len(set(q['choices'])) == 4
    assert q['correct'] == sorted(set(q['correct'])) and all(i in range(4) for i in q['correct'])
    assert q['explanation'].strip() and not re.search(r'[1-4１-４](?:つ|個)選', q['question'])
    for i, reason in enumerate(q['choiceReasons']):
        assert reason.startswith('正答：' if i in q['correct'] else '誤答：')
    assert len(q['sources']) == 1
    s = q['sources'][0]
    assert s['filename'] == '1005ビールと健康.pdf' and s['language'] == 'en'
    assert s['page'] in {63, 79, 84, 92} and str(s['page']) in s['locator']
    assert 'Doemensロゴ' in s['locator'] and '英語' in s['locator']
    assert '未確認' in s['status'] and '飲酒を勧めるものではない' in s['status']
    assert '保証せず' in s['status']
    signature = (re.sub(r'\s+', '', q['question']), tuple(sorted(q['choices'])))
    assert signature not in seen
    seen.add(signature)
# No new unsupported statement that all beer is free of toxic heavy metals.
assert 'free of toxic heavy metals' not in json.dumps(added)
assert 'µg/bottle' in added[4]['choiceReasons'][0]
assert all(value in added[4]['choiceReasons'][0] for value in ['33.6', '131.8', '92.1', '58.4'])
assert all(value in added[8]['choiceReasons'][0] for value in ['30%', '28%', '23%', '21%'])
assert '臨床試験' in added[10]['choiceReasons'][3]
# Guard the health supplement's protected behavior without freezing unrelated UI features.
app = (ROOT / 'app.js').read_text()
base_app = subprocess.check_output(['git', 'show', f'{BASE}:app.js'], cwd=ROOT).decode().replace('\r\n', '\n')
for constant in ['STORAGE', 'ACCESS_KEY', 'ACCESS_PASSWORD_HASH']:
    pattern = rf'^const {constant} = .*;$'
    assert re.search(pattern, app, re.M).group(0) == re.search(pattern, base_app, re.M).group(0), constant
for function in ['sha256', 'unlockAccess', 'startAccessControl', 'scoreQuestion']:
    pattern = rf'^(?:async )?function {function}\([^\n]*\) \{{.*?^\}}'
    assert re.search(pattern, app, re.M | re.S).group(0) == re.search(pattern, base_app, re.M | re.S).group(0), function
html = (ROOT / 'index.html').read_text()
assert '全1170問を収録。' in html and '942' in html
version = re.search(r'const APP_VERSION = "v(\d+)";', app).group(1)
assert f'<script src="app.js?v={version}" defer></script>' in html
# Existing CSS remains a prefix; study-result/recent-card rules are appended.
assert (ROOT / 'styles.css').read_text().startswith(subprocess.check_output(['git', 'show', f'{BASE}:styles.css'], cwd=ROOT).decode().replace('\r\n', '\n'))
for name in ['blind-tasting.json', 'style-quiz.json', 'beer-photos.json', 'beer-illustrations.json', 'beer-image-styles.json']:
    assert json.loads((ROOT / name).read_text()) == json.loads(subprocess.check_output(['git', 'show', f'fa3ae41603702a840dfd16ffd400cc935f0e1af2:{name}'], cwd=ROOT)), name
# Legacy generators are intentionally not executed during v69 validation.
print('OK: 12 health questions, page provenance, protected auth/scoring/images and approved-bank preservation')
