"""Correct the reviewed S-011 aroma classification without changing answers."""
OLD = "完熟バナナ・桃・クローブのスパイシーなエステル"
NEW = "完熟バナナ・桃を思わせるエステル系の果実香と、クローブを思わせるフェノール系のスパイス香"

def apply_to_questions(questions):
    for q in questions:
        if q.get("id") != "S-011":
            continue
        assert q["correct"] == [2] and q["choices"][2] == "トラピスト・トリプル"
        for text in (q["question"], q["choiceReasons"][2]):
            if OLD not in text and NEW not in text:
                raise ValueError("S-011 has an unexpected aroma description; review it before replacing")
        q["question"] = q["question"].replace(OLD, NEW)
        q["choiceReasons"][2] = q["choiceReasons"][2].replace(OLD, NEW)
