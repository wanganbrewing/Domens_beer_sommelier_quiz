"""Append reviewed Doemens-logo health chart questions, preserving the existing bank."""
from collections import Counter
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'DH-'
SOURCE_NOTE = '健康資料の右下Doemensロゴ付き英語図表（PDF 63・79・84・92ページ）から12問。古い図表の読み取り・民間療法史として扱い、飲酒の健康効果や治療効果は保証しない。'


def build():
    path = ROOT / 'questions.json'
    newline = '\r\n' if b'\r\n' in path.read_bytes() else '\n'
    data = json.loads(path.read_text(encoding='utf-8'))
    additions = json.loads((ROOT / 'data/doemens-health-supplement.json').read_text(encoding='utf-8'))
    data['questions'] = [q for q in data['questions'] if not q['id'].startswith(PREFIX)] + additions
    active = [q for q in data['questions'] if q.get('active', True)]
    meta = data['metadata']
    meta.update(
        title=f"BierKompass {len(data['questions'])}",
        questionCount=len(data['questions']), activeQuestionCount=len(active),
        excludedQuestionCount=len(data['questions']) - len(active),
        version='2026-11-11-doemens-health-charts',
        answerCountDistribution=dict(Counter(str(len(q['correct'])) for q in data['questions'])),
        multiAnswerQuestionCount=sum(len(q['correct']) >= 2 for q in data['questions']),
    )
    names = {c['id']: c['name'] for c in meta['categories']}
    meta['categories'] = [dict(id=k, name=names[k], count=v) for k, v in Counter(q['category'] for q in active).items()]
    for tier in meta['frequencyTiers']:
        tier['count'] = sum(q['frequencyTier'] == tier['id'] for q in active)
    meta['supplementalSources'] = [s for s in meta.get('supplementalSources', []) if s != SOURCE_NOTE] + [SOURCE_NOTE]
    meta['healthSupplement'] = {
        'questionCount': len(additions), 'ids': [q['id'] for q in additions],
        'answerCountDistribution': dict(Counter(str(len(q['correct'])) for q in additions)),
        'coverageFile': 'docs/doemens-health-coverage.md',
        'sourcePages': [63, 79, 84, 92],
        'sourceSha256': '912aab1d42417e4e9ebf1c19be0291391abe43836c3d4944e4baf5b579892f00',
        'sourceVersionStatus': '作成年・改訂版は未確認。重複添付2件は同一の113ページPDF。',
    }
    path.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + '\n').replace('\n', newline).encode('utf-8'))
    print(f"{len(data['questions'])} stored / {len(active)} active; {len(additions)} Doemens-logo health chart questions")


if __name__ == '__main__':
    build()
