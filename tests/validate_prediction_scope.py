"""v71 collection: preserve the shared bank, source ACL links, core grading and auth."""
from pathlib import Path
import subprocess,re,json
R=Path(__file__).resolve().parents[1]
BASE='d557721adeda7fe5c52d8d2547e2b70a83e20e57'
old=lambda path:subprocess.check_output(['git','show',f'{BASE}:{path}'],cwd=R)
for path in ['choice-variants.js','choice-variants.json','source-links.json','source-passages.json','source-viewer.js','style-links.js','beer-photos.js','glass-guide.js','sound.js','sound-media.js','blind-quiz.js']:
 assert (R/path).read_bytes()==old(path),path
app=(R/'app.js').read_text();base=old('app.js').decode()
for name in ['STORAGE','ACCESS_KEY','ACCESS_PASSWORD_HASH','VARIANT_STORAGE','RECENT_STORAGE','RECENT_ANSWER_LIMIT','STREAK_STORAGE','MOCK_EXAM']:
 pattern=rf'^const {name} = .*;$'
 assert re.search(pattern,app,re.M).group()==re.search(pattern,base,re.M).group(),name
for name in ['startAccessControl','unlockAccess','studyQuestionSample','mockExamSample','checkStudyAnswer','recordHistory','scoreQuestion','submitExam','renderFeedback','renderReviewChoiceReasons','renderReview','finishStudySession','startTimer','remainingSeconds','requestHistoryReset']:
 pattern=rf'^(?:async )?function {name}\([^\n]*\) \{{[\s\S]*?^\}}'
 a=re.search(pattern,app,re.M);b=re.search(pattern,base,re.M)
 assert a and b and a.group()==b.group(),name
from scope_approved import approved
q=approved()
assert len(q['questions'])==1170 and sum(x['active'] for x in q['questions'])==942
html=(R/'index.html').read_text()
version=re.search(r'const APP_VERSION = \"(v\d+)\";',app).group(1)
assert f'class="version-badge">{version}' in html and f'prediction-set.js?v={version[1:]}' in html
assert html.index(f'prediction-set.js?v={version[1:]}')<html.index(f'app.js?v={version[1:]}')
assert '2026年11月24日に削除予定です' in html
assert '本番の出題を保証するものではありません' in html
assert int(version[1:])>=71
print('PASS v71 scope: shared 1170/942 bank, auth, storage, grading, mock, sound, variants, source ACL links and existing notices unchanged.')
