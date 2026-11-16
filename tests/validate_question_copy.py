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

from correct_s011_aroma import apply_to_questions as correct_s011_aroma
correct_s011_aroma(baseline["questions"])
assert len(baseline['questions']) == 1068
from scope_approved import approved, check_legacy_generators
assert data == approved()
assert len(data['questions']) == 1130
assert sum(q.get('active', True) for q in data['questions']) == 902
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
    assert current["id"] == expected["id"]
    assert current["correct"] == expected["correct"]
    assert current["sources"] == expected["sources"]
    assert PREFIX not in current['question']
    assert INTRO not in current['explanation']

assert next(c for c in data['metadata']['categories'] if c['id'] == 'pairing')['name'] == 'フードペアリング'
assert '英語講義資料から作成' not in (ROOT / 'index.html').read_text()
assert f"全{data['metadata']['questionCount']}問を収録。" in (ROOT / 'index.html').read_text()

# Old generators must fail before writing the approved scope-audited bank.
check_legacy_generators()
print('OK: v66 approved wording; preserved IDs, keys and sources; safe legacy-generator refusal')
