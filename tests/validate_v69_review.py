"""Regression guards for the reviewed Nov 16 attachment, not a scientific proof."""
import json
from pathlib import Path
R = Path(__file__).resolve().parents[1]
Q = {q['id']: q for q in json.loads((R/'questions.json').read_text())['questions']}
assert '別の口金規格' in Q['DS26-004']['choiceReasons'][1] and '意味ではありません' in Q['DS26-004']['choiceReasons'][1]
assert '0.01バール/m' in Q['DS26-012']['question'] and '3L/分' in Q['DS26-012']['question']
assert Q['DS26-012']['correct'] == [0] and Q['DS26-012']['choices'][0] == '1.36バール'
assert '講師は' not in Q['DS26-012']['explanation']
assert '80：20' in Q['DS26-013']['choices'][3]
assert '教材では' in Q['DS26-019']['choices'][0] and '条件によって' in Q['DS26-019']['choiceReasons'][0]
assert '主に下面発酵' in Q['ST26-003']['choices'][0]
assert '税法' not in Q['ST26-011']['explanation']
assert '一般的なビール酵母' in Q['BW26-001']['choices'][2]
assert '適正範囲' in Q['BW26-002']['choices'][0]
assert '通常法の例' in Q['BW26-003']['question']
assert Q['PL26-002']['sources'][0]['page'] == 32
assert [(s['filename'],s['page']) for s in Q['PL26-001']['sources']] == [
 ('0803ビールの世界史前半.pdf',3),('0803ビールの世界史前半.pdf',4),
 ('0803ビールの世界史後半.pdf',2),('3､ドイツビール.pdf',32)]
new = [q for q in Q.values() if q['id'].startswith(('DS26-','ST26-','BW26-','PL26-'))]
assert len(new) == 40
for q in new:
 assert len(q['choices']) == len(q['choiceReasons']) == 4
 for i,reason in enumerate(q['choiceReasons']):
  assert reason.startswith('正答：' if i in q['correct'] else '誤答：'), (q['id'],i)
 assert all('だけ' not in text and '必ず' not in text for i,text in enumerate(q['choices']) if i not in q['correct']), q['id']
 assert all(s.get('filename') and isinstance(s.get('page'),int) and s['page'] > 0 for s in q['sources'])
print('PASS v69 reviewed 40 additions: answer/reason alignment, scoped claims, exact source pages, no clue-only distractors')
