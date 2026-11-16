"""Exact, owner-approved v66 bank; legacy tests still validate their historical manifests."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def approved():
    expected = json.loads((ROOT / 'tests/fixtures/scope-v66-approved.json').read_text())
    assert json.loads((ROOT / 'questions.json').read_text()) == expected, 'Bank differs from approved v66 snapshot'
    return expected

def check_legacy_generators():
    import subprocess, sys
    path = ROOT / 'questions.json'
    before = path.read_bytes()
    for script in ['add_2026_handouts.py', 'add_english_course_supplement.py', 'add_doemens_health_supplement.py']:
        result = subprocess.run([sys.executable, str(ROOT/'tools'/script)], capture_output=True, text=True)
        assert result.returncode != 0 and 'v66 scope audit' in result.stderr, script
        assert path.read_bytes() == before, 'Legacy generator overwrote approved questions'
