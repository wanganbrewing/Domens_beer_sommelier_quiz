"""Exact, owner-approved v69 bank; legacy tests still validate their historical manifests."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def approved():
    expected = json.loads((ROOT / 'tests/fixtures/scope-v69-approved.json').read_text())
    assert json.loads((ROOT / 'questions.json').read_text()) == expected, 'Bank differs from approved v69 snapshot'
    return expected
