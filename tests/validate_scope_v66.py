"""Strict authorized v66 bank, exclusions, sources and preserved keys."""
import json, subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[1]
load=lambda n:json.loads((R/n).read_text())
# Validate the preserved v66 evidence independently of later frequency revisions.
p=load('tests/fixtures/scope-v66-approved.json'); b=json.loads(subprocess.check_output(['git','show','fa3ae41603702a840dfd16ffd400cc935f0e1af2:questions.json'],cwd=R))
assert p==load('tests/fixtures/scope-v66-approved.json')
B={q['id']:q for q in b['questions']};P={q['id']:q for q in p['questions']}
assert len(P)==len(p['questions'])==1130 and B.keys()<=P.keys()
assert len(P.keys()-B.keys())==50
expected={f'C-{n:03}' for n in [*range(1,141),163,*range(201,231)]}|{'A-081','A-158','A-334','B-227','B-230','B-346','B-350'}
assert len(expected)==178
assert {i for i in B if B[i]['active'] and not P[i]['active']}==expected
assert sum(q['active'] for q in P.values())==p['metadata']['activeQuestionCount']==902
assert p['metadata']['excludedQuestionCount']==228
for i in B:
 for key in ['correct','sources','category','frequencyTier']:
  assert B[i][key]==P[i][key],(i,key)
v=load('choice-variants.json')['questions'];assert len(v)==8 and sum(len(x['variants']) for x in v)==16
assert all(P[x['questionId']]['active'] for x in v)
s=load('source-links.json');assert len(s['questions'])==100
assert not (P.keys()-B.keys())&{x['questionId'] for x in s['questions']},'New 50 have textual sources only'
print('OK: v66 authorized bank, 1130/902/228, exact 178 exclusions, 50 additions, preserved keys, 8/16 variants, 100 source groups')
