"""Exact, owner-approved v69 bank; legacy tests still validate their historical manifests."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def approved():
    expected = json.loads((ROOT / 'tests/fixtures/scope-v69-approved.json').read_text())
    edit = json.loads((ROOT / 'tests/fixtures/v72-a003.json').read_text())
    index = next(i for i,q in enumerate(expected['questions']) if q['id'] == edit['id'])
    assert expected['questions'][index] == edit['before']
    expected['questions'][index] = edit['after']
    assert json.loads((ROOT / 'questions.json').read_text()) == expected, 'Bank differs from approved bank plus reviewed A-003 correction'
    return expected
