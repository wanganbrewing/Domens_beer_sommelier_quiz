"""Keep question wording concise without changing answers or useful source details."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from apply_reviewed_choice_wording import apply_to_questions
PREFIX = '講義資料の英語本文に基づき、'
INTRO = '講義資料の英語本文をもとにした学習用問題です。'
data_path = ROOT / 'questions.json'
before = data_path.read_bytes()
data = json.loads(before)
baseline = json.loads(subprocess.check_output(
    ['git', 'show', '64c0645edfe5546330994ed34c5def89c50772eb:questions.json'], cwd=ROOT))

assert len(baseline['questions']) == 1068
assert len(data['questions']) == 1068 + data['metadata']['healthSupplement']['questionCount']
assert sum(q.get('active', True) for q in data['questions']) == 1018 + data['metadata']['healthSupplement']['questionCount']
assert sum(q['question'].startswith(PREFIX) for q in baseline['questions']) == 68
assert sum(q['explanation'].startswith(INTRO) for q in baseline['questions']) == 39
expected_questions = []
for old in baseline['questions']:
    expected = dict(old)
    expected['question'] = old['question'].removeprefix(PREFIX)
    expected['explanation'] = old['explanation'].removeprefix(INTRO)
    expected_questions.append(expected)
apply_to_questions(expected_questions)
for current, expected in zip(data['questions'], expected_questions):
    assert current == expected, f"Unexpected content change: {expected['id']}"
    assert PREFIX not in current['question']
    assert INTRO not in current['explanation']

assert next(c for c in data['metadata']['categories'] if c['id'] == 'pairing')['name'] == 'フードペアリング'
assert '英語講義資料から作成' not in (ROOT / 'index.html').read_text()
assert f"全{data['metadata']['questionCount']}問を収録。" in (ROOT / 'index.html').read_text()

# Both documented regeneration steps must preserve the questions and existing metadata.
try:
    subprocess.run([sys.executable, str(ROOT / 'tools/add_2026_handouts.py')], check=True)
    subprocess.run([sys.executable, str(ROOT / 'tools/add_english_course_supplement.py')], check=True)
    rebuilt = json.loads(data_path.read_bytes())
    assert rebuilt['questions'] == data['questions'], 'Regeneration must preserve the question data exactly'
    assert all(rebuilt['metadata'][key] == value for key, value in data['metadata'].items())
    # The first generator also derives this optional legacy metadata field.
    assert rebuilt['metadata']['excludedQuestionIds'] == [q['id'] for q in data['questions'] if not q.get('active', True)]
finally:
    data_path.write_bytes(before)
print('OK: 68 concise questions, 39 concise explanations, unchanged answers/IDs/sources, full regeneration')
