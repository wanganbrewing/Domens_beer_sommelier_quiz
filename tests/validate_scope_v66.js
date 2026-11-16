'use strict';
const assert=require('node:assert/strict');
const h=require('./runtime_harness')();
h.run(`questionsById=new Map(data.questions.map(q=>[q.id,q])); history={'A-001':{mastered:true,attempts:2},'C-001':{mastered:true,attempts:3},'missing':{mastered:true,attempts:1}};`);
const before=h.snapshot('history');
h.run('updateStats()');
assert.equal(h.element('#headerProgress').textContent,'学習記録 1 / 942');
assert.deepEqual(h.snapshot('history'),before);
console.log('OK: mastery uses active IDs without deleting saved history');
