"""v69 additions/tier update with all prior question content and UI assets protected."""
import json, subprocess, collections
from pathlib import Path
R=Path(__file__).resolve().parents[1]
load=lambda n:json.loads((R/n).read_text())
p=load('questions.json');base=load('tests/fixtures/v68-bank.json')
assert base==json.loads(subprocess.check_output(['git','show','99e1b9bc331380b10c9d9e4fb2726b27e46c2c58:questions.json'],cwd=R))
assert p==load('tests/fixtures/scope-v69-approved.json')
B={q['id']:q for q in base['questions']};P={q['id']:q for q in p['questions']}
assert len(P)==len(p['questions'])==1170 and list(P)[:1130]==list(B)
expected={f'{prefix}26-{i:03}' for prefix,n in [('DS',19),('PL',2),('ST',16),('BW',3)] for i in range(1,n+1)}
assert P.keys()-B.keys()==expected
for i in B:
 assert {k:v for k,v in B[i].items() if k!='frequencyTier'}=={k:v for k,v in P[i].items() if k!='frequencyTier'},i
assert sum(B[i]['frequencyTier']!=P[i]['frequencyTier'] for i in B)==313
assert {i:q['frequencyTier'] for i,q in P.items()}==load('tests/fixtures/v69-input-tiers.json')
m=p['metadata'];assert m['questionCount']==1170 and m['activeQuestionCount']==sum(q['active'] for q in P.values())==942
assert m['excludedQuestionCount']==sum(not q['active'] for q in P.values())==228
assert all(P[i]['active'] for i in expected)
assert {x['id']:x['count'] for x in m['categories']}==collections.Counter(q['category'] for q in P.values() if q['active'])
assert {x['id']:x['count'] for x in m['frequencyTiers']}==collections.Counter(q['frequencyTier'] for q in P.values() if q['active'])
assert m['answerCountDistribution']==dict(collections.Counter(str(len(q['correct'])) for q in P.values()))
for name in ['glass-guide.js','sound.js','sound-media.js','source-links.json','source-passages.json','choice-variants.json','styles.css','blind-quiz.js']:
 assert (R/name).read_bytes()==subprocess.check_output(['git','show',f'99e1b9bc331380b10c9d9e4fb2726b27e46c2c58:{name}'],cwd=R),name
old=subprocess.check_output(['git','show','99e1b9bc331380b10c9d9e4fb2726b27e46c2c58:app.js'],cwd=R).decode()
assert (R/'app.js').read_text()==old.replace('v68','v69').replace('?v=68','?v=69')
print('PASS v69 1170/942/228, 40 exact additions, 313 attachment tier changes; all prior question content, grading/history/session/UI assets preserved')

html=(R/'index.html').read_text()
assert '学習記録 0 / 942' in html and 'id="questionBankStat">942' in html
assert 'sound-media.js?v=69' in html and 'glass-guide.js?v=69' in html
