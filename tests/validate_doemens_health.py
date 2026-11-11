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
assert qs[:1068] == base['questions'], 'Every existing question must remain byte-equivalent as data'
assert qs[1068:] == added and len(added) == 12
assert len(qs) == meta['questionCount'] == 1080
assert sum(q['active'] for q in qs) == meta['activeQuestionCount'] == 1030
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
assert '全1080問を収録。' in html and '1030' in html
version = re.search(r'const APP_VERSION = "v(\d+)";', app).group(1)
assert f'<script src="app.js?v={version}" defer></script>' in html
# Existing CSS remains a prefix; study-result/recent-card rules are appended.
assert (ROOT / 'styles.css').read_bytes().startswith(subprocess.check_output(['git', 'show', f'{BASE}:styles.css'], cwd=ROOT))
for name in ['blind-quiz.js', 'blind-tasting.json', 'style-quiz.json', 'style-links.js', 'beer-photos.js', 'beer-photos.json', 'beer-illustrations.json', 'beer-image-styles.json']:
    assert (ROOT / name).read_bytes() == subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=ROOT), name
# Repeated imports do not duplicate IDs, reorder old questions or alter metadata.
try:
    for script in ['add_doemens_health_supplement.py', 'add_doemens_health_supplement.py', 'add_english_course_supplement.py']:
        subprocess.run([sys.executable, str(ROOT / 'tools' / script)], check=True)
        assert path.read_bytes() == before, script
finally:
    path.write_bytes(before)
print('OK: 12 reviewed questions, four verified logo pages, 1080/1030 counts, balanced answers, immutable 1068-question baseline, protected auth/scoring/images and repeat-safe imports')
