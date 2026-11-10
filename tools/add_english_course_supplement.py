"""Idempotently add reviewed English-source lecture questions without changing old IDs."""
from collections import Counter
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIXES = ('EP26-', 'UK26-', 'ES26-')


def build():
    data_path = ROOT / 'questions.json'
    newline = '\r\n' if b'\r\n' in data_path.read_bytes() else '\n'
    data = json.loads(data_path.read_text(encoding='utf-8'))
    additions = json.loads((ROOT / 'data/english-course-supplement.json').read_text(encoding='utf-8'))
    data['questions'] = [q for q in data['questions'] if not q['id'].startswith(PREFIXES)] + additions
    # Preserve ID and answer indices while removing an over-specific cause attribution.
    q = next(q for q in data['questions'] if q['id'] == 'OF26-007')
    q['question'] = '講義資料の英語本文に基づき、不快な香りの記述と関連物質について正しい記述を選んでください。'
    q['choices'][0] = '汗、古いホップ、チーズのような特徴は、酸敗臭の記述例に含まれる'
    q['choices'][1] = '腐卵臭に関連する代表的な物質は硫化水素である'
    q['choiceReasons'][0] = '正答：英語本文のRancid欄にsweat、cheesy、like old hopsという記述がある。これだけで原因を酵母の自己消化と断定しない。'
    q['choiceReasons'][1] = '正答：英語本文ではrotten eggとH2Sを関連づけている。硫化水素は通常の酵母発酵でも生じ得るため、検出だけで汚染とは断定できない。'
    q['choiceReasons'][3] = '誤答：腐卵臭に関連する代表物質は硫化水素。ヘキサン酸エチルは果実様のエステル香に関連する。'
    q['explanation'] = '香りの記述と関連物質を確認する問題。腐卵臭だけで汚染、チーズや汗様の香りだけで自己消化と断定しない。' + ' '.join(q['choiceReasons'])
    active = [q for q in data['questions'] if q.get('active', True)]
    meta = data['metadata']
    meta.update(
        title=f"BierKompass {len(data['questions'])}", questionCount=len(data['questions']), activeQuestionCount=len(active),
        excludedQuestionCount=len(data['questions']) - len(active),
        version='2026-11-10-english-course-supplement',
        answerCountDistribution=dict(Counter(str(len(q['correct'])) for q in data['questions'])),
        multiAnswerQuestionCount=sum(len(q['correct']) >= 2 for q in data['questions']),
        notice='提供資料に基づく非公式予想問題です。追加問題は講義資料の英語本文を優先し、出典ページと版の注意を表示します。Doemens公式問題ではありません。',
    )
    names = {c['id']: c['name'] for c in meta['categories']}
    names['pairing'] = 'フードペアリング（講義資料）'
    meta['categories'] = [dict(id=k, name=names[k], count=v) for k,v in Counter(q['category'] for q in active).items()]
    for tier in meta['frequencyTiers']:
        tier['count'] = sum(q['frequencyTier'] == tier['id'] for q in active)
    meta['supplementalSources'] = [
        '8/30英語講義資料由来の既存40問を維持。既存の非対象ペアリング50問も保管。',
        f'英語本文の未反映論点を追加{len(additions)}問。官能・オフフレーバー、ペアリング、英国カスク管理を出典ページ付きで補強。日本語主体の資料は低優先として今回の追加対象外。',
    ]
    meta['englishSupplement'] = {
        'questionCount':len(additions),
        'ids':[q['id'] for q in additions],
        'answerCountDistribution':dict(Counter(str(len(q['correct'])) for q in additions)),
        'coverageFile':'docs/english-material-coverage.md',
    }
    data_path.write_bytes((json.dumps(data,ensure_ascii=False,indent=2)+'\n').replace('\n', newline).encode('utf-8'))
    print(f"{len(data['questions'])} stored / {len(active)} active; {len(additions)} new English-source questions")


if __name__ == '__main__':
    build()
