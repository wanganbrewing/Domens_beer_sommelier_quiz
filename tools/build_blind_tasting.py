"""Build the blind-tasting simulation data from the supplied Markdown spec."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Downloads" / "ブラインドテイスティング判定シミュレーション_完全仕様.md"
DEFAULT_OUTPUT = ROOT / "blind-tasting.json"
HEADER_RE = re.compile(r"^\*\*【([DUEBO]-\d{2})】(★+)[^\n]*$", re.MULTILINE)
CHOICE_RE = re.compile(r"(?<![A-Za-z0-9])([a-d])\)(.*?)(?=\s+[a-d]\)|$)", re.IGNORECASE)
COUNTRIES = {
    "D": ("germany", "ドイツ"),
    "U": ("america", "アメリカ"),
    "E": ("uk_ireland", "イギリス・アイルランド"),
    "B": ("belgium", "ベルギー"),
    "O": ("other", "その他の国"),
}

REPRESENTATIVE_BEERS = {
    "D-01": ["Bitburger Premium Pils", "Jever Pilsener", "Warsteiner Premium Verum"],
    "D-02": ["Augustiner Lagerbier Hell", "Weihenstephaner Original Helles", "Hofbräu Original"],
    "D-03": ["DAB Dortmunder Export", "Dortmunder Union Export"],
    "D-04": ["Ayinger Märzen", "Hacker-Pschorr Oktoberfest Märzen"],
    "D-05": ["Ayinger Altbairisch Dunkel", "Hofbräu Dunkel", "Weltenburger Kloster Barock Dunkel"],
    "D-06": ["Köstritzer Schwarzbier", "Mönchshof Schwarzbier"],
    "D-07": ["Paulaner Salvator", "Ayinger Celebrator", "Andechser Doppelbock Dunkel"],
    "D-08": ["Kulmbacher Eisbock", "Schneider Aventinus Eisbock"],
    "D-09": ["Aecht Schlenkerla Rauchbier Märzen", "Spezial Rauchbier Märzen"],
    "D-10": ["St. GeorgenBräu Kellerbier", "Mahrs Bräu Kellerbier"],
    "D-11": ["Schönramer Surtaler Schankbier"],
    "D-12": ["Weihenstephaner Hefeweissbier", "Schneider Weisse Original", "Erdinger Weissbier"],
    "D-13": ["Weihenstephaner Kristallweissbier", "Erdinger Kristall"],
    "D-14": ["Weihenstephaner Hefeweissbier Dunkel", "Erdinger Dunkel", "Franziskaner Hefe-Weissbier Dunkel"],
    "D-15": ["Früh Kölsch", "Gaffel Kölsch", "Reissdorf Kölsch"],
    "D-16": ["Uerige Alt", "Schumacher Alt", "Füchschen Alt"],
    "D-17": ["Berliner Kindl Weisse", "Schneeeule Marlene"],
    "D-18": ["Ritterguts Gose", "Bayerischer Bahnhof Original Leipziger Gose"],
    "U-01": ["Bud Light", "Coors Light", "Miller Lite"],
    "U-02": ["Sierra Nevada Pale Ale", "Deschutes Mirror Pond Pale Ale", "Dale's Pale Ale"],
    "U-03": ["Bell's Two Hearted Ale", "Stone IPA", "Lagunitas IPA"],
    "U-04": ["Russian River Pliny the Elder", "Dogfish Head 90 Minute IPA", "Stone Ruination IPA"],
    "U-05": ["Tree House Julius", "Sierra Nevada Hazy Little Thing", "The Alchemist Heady Topper"],
    "U-06": ["Widmer Hefeweizen", "Bell's Oberon Ale"],
    "U-07": ["Sierra Nevada Bigfoot", "Anchor Old Foghorn"],
    "U-08": ["Stone Sublimely Self-Righteous Black IPA", "Deschutes Hop in the Dark"],
    "E-01": ["Fuller's ESB", "Timothy Taylor Landlord", "Adnams Southwold Bitter"],
    "E-02": ["Fuller's London Pride", "Bass Pale Ale"],
    "E-03": ["Samuel Smith India Ale", "Worthington White Shield"],
    "E-04": ["Newcastle Brown Ale", "Samuel Smith Nut Brown Ale"],
    "E-05": ["Fuller's London Porter", "Samuel Smith Taddy Porter"],
    "E-06": ["Guinness Draught", "Murphy's Irish Stout", "Beamish Irish Stout"],
    "E-07": ["Courage Imperial Russian Stout", "Samuel Smith Imperial Stout"],
    "E-08": ["Thomas Hardy's Ale", "Fuller's Golden Pride", "J.W. Lees Harvest Ale"],
    "E-09": ["Belhaven Wee Heavy", "Traquair House Ale"],
    "E-10": ["Mackeson Stout", "Left Hand Milk Stout"],
    "B-01": ["Hoegaarden", "Blanche de Namur", "St.Bernardus Wit"],
    "B-02": ["Duvel", "Delirium Tremens", "Piraat"],
    "B-03": ["Westmalle Dubbel", "Chimay Red", "Rochefort 6"],
    "B-04": ["Westmalle Tripel", "Tripel Karmeliet", "Chimay White"],
    "B-05": ["Westvleteren 12", "Rochefort 10", "St.Bernardus Abt 12"],
    "B-06": ["Saison Dupont", "Fantôme Saison", "Saison de Dottignies"],
    "B-07": ["Orval"],
    "B-08": ["Rodenbach Grand Cru", "Duchesse de Bourgogne", "Cuvée des Jacobins"],
    "B-09": ["3 Fonteinen Oude Geuze", "Boon Oude Geuze", "Cantillon Gueuze"],
    "B-10": ["Cantillon Kriek", "Boon Kriek Mariage Parfait"],
    "B-11": ["Leffe Blond", "Affligem Blond"],
    "O-01": ["Pilsner Urquell", "Budweiser Budvar Original", "Bernard Celebration Lager"],
    "O-02": ["Budweiser Budvar Dark", "Kozel Dark", "U Fleků 13°"],
    "O-03": ["Ottakringer Wiener Original", "Negra Modelo", "Great Lakes Eliot Ness"],
    "O-04": ["Żywiec Porter", "Okocim Porter", "Sinebrychoff Porter"],
    "O-05": ["Asahi Super Dry"],
    "O-06": ["Jenlain Ambrée", "3 Monts", "Ch'Ti Ambrée"],
    "O-07": ["Birra del Borgo L'Equilibrista", "LoverBeer BeerBera"],
    "O-08": ["Lammin Sahti", "Finlandia Sahti"],
    "O-09": ["Voss Bryggeri Vossaøl 1814"],
    "O-10": ["8 Wired HopWired NZ IPA", "Epic Full Send NZIPA", "Tuatara Aotearoa Pale Ale"],
    "O-11": ["Coopers Sparkling Ale"],
}


# Step 2 must test causal inference rather than reveal the later country/style answer.
# These labels retain the brewing knowledge while removing country names, regional
# abbreviations, style names, and wording copied directly from the observation card.
INGREDIENT_PROCESS_REPLACEMENTS = {
    "独産ノーブルホップ": "ハーバルでスパイシーなノーブルホップ",
    "ドルトムントの炭酸塩＋硫酸塩共存水": "炭酸塩と硫酸塩がともに多い硬水",
    "ミュンヘン麦芽＋カラメル麦芽": "濃色キルンド麦芽＋カラメル麦芽",
    "ミュンヘン麦芽50-100%": "濃色キルンド麦芽50-100%",
    "メラノイジン/ミュンヘン麦芽": "濃色キルンド麦芽と長時間の加熱工程",
    "ボックを氷点下で凍結→氷を除去して濃縮": "強いラガーを氷点下で凍結し、氷を除いて濃縮",
    "ラウホマルツ50-100%": "ブナ材で燻した麦芽50-100%",
    "下面酵母（メルツェンベース）": "下面酵母を使う琥珀色ラガーベース",
    "バンベルク伝統": "木材燻煙麦芽を用いる歴史的製法",
    "樽出し低ガス仕上げ": "無濾過のまま低圧で容器内熟成して提供",
    "麦芽100%（独の税法規格）": "副原料を使わない麦芽100%設計",
    "上面ヴァイス酵母（POF+）": "バナナ香とクローブ香を生む上面酵母（POF+）",
    "高炭酸": "瓶内熟成で強い発泡感を得る",
    "ヴァイス酵母発酵後に完全濾過（酵母除去）": "果実・スパイス香を生む上面酵母で発酵後、完全濾過",
    "上面ヴァイス酵母（ボックは高比重）": "果実・スパイス香を生む上面酵母",
    "ケルシュ専用上面酵母（低温発酵）＋低温熟成": "上面酵母を低温発酵させ、さらに低温熟成",
    "ケルン協定": "原産地と伝統製法を保護する地域協定",
    "ミュンヘン": "濃色キルンド麦芽",
    "シュパルト系ホップ": "繊細でスパイシーなノーブルホップ",
    "乳酸菌＋上面酵母（純粋令の歴史的例外）": "乳酸菌＋上面酵母",
    "米": "ライス",
    "米産Cホップ": "グレープフルーツと松脂を思わせるホップ",
    "クリーンな米エール酵母": "エステルを抑えるクリーンな上面酵母",
    "米産ホップ大量投入（煮沸＆ドライホップ）": "柑橘・松脂系ホップを煮沸とドライホップで大量投入",
    "米産アロマホップ": "柑橘系アロマホップ",
    "クリーン米酵母": "フェノールをほぼ出さないクリーンな上面酵母",
    "米産アロマ＆ビタリング大量": "柑橘・樹脂系ホップを香味と苦味の両方へ大量使用",
    "米ホップ大量": "柑橘・松脂系ホップを大量使用",
    "英産ホップ": "アーシーでハーバルな伝統品種ホップ",
    "英エール酵母": "穏やかな果実香を出す高凝集上面酵母",
    "カスク文化": "無濾過・低炭酸の容器内コンディショニング",
    "英産アロマホップ": "フローラルでアーシーな伝統品種ホップ",
    "バートン高硫酸塩硬水": "硫酸塩の多い硬水",
    "EKG/ファグル系": "アーシーでフローラルな伝統品種ホップ",
    "英酵母": "穏やかな果実香を残す高凝集上面酵母",
    "（輸出史の文脈）": "長距離輸送を背景に苦味と保存性を高めた設計",
    "ブラウン＋クリスタルモルト": "淡色基礎麦芽＋結晶麦芽＋少量の濃色麦芽",
    "穏やかな英ホップ": "穏やかなアーシー系ホップ",
    "高凝集英酵母": "高凝集の上面酵母",
    "ブラウン＋チョコモルト": "淡色基礎麦芽＋チョコレート麦芽",
    "英上面酵母（1720年代ロンドン起源）": "高凝集の上面酵母",
    "ダブリン炭酸塩硬水": "炭酸塩の多い硬水",
    "英産ホップ多量": "アーシーでハーバルなホップを多量使用",
    "英上面酵母": "高凝集の上面酵母",
    "ベルジャン上面酵母": "果実香と穏やかなスパイス香を生む上面酵母",
    "高発酵度ベルジャン酵母": "高発酵度で果実・スパイス香を生む上面酵母",
    "高温耐性セゾン酵母（〜32℃）": "高温耐性・高発酵度のスパイシーな上面酵母（〜32℃）",
    "ランビック原酒＋スカールベーク種チェリー": "自然発酵の原酒＋酸味の強い在来種チェリー",
    "ベルジャン酵母": "穏やかな果実・スパイス香を生む上面酵母",
    "（大冒険をしない設計）": "香味を中庸に整えたバランス設計",
    "モラヴィア大麦": "高品質な淡色大麦麦芽",
    "ザーツ": "繊細でハーバルなノーブルホップ",
    "ピルゼン極軟水": "ミネラル分の非常に少ない軟水",
    "ウィーン系麦芽": "軽く焙燥した琥珀色の基礎麦芽",
    "ウィーン麦芽": "軽く焙燥した琥珀色の基礎麦芽",
    "下面発酵（ドレハー発祥）": "下面発酵",
    "低温長期貯蔵（バルト海沿岸）": "長期低温貯蔵",
    "ウィーン": "軽く焙燥した琥珀色の基礎麦芽",
    "仏ノーブルホップ": "穏やかなノーブルホップ",
    "コルク瓶文化": "コルク栓の大瓶で熟成させる提供伝統",
    "ジュニパー": "針葉樹の枝や実を醸造水・濾過へ利用",
    "大麦麦芽＋ジュニパー浸出液": "大麦麦芽＋針葉樹の枝や実の浸出液",
    "Kveik農家酵母": "高温で速く発酵する伝統的な農家酵母",
    "Nelson Sauvin/Motueka等": "白ブドウ・ライム・トロピカル香を持つ新世界ホップ",
    "豪州系酵母": "果実香を生む高発酵度の上面酵母",
    "瓶内二次発酵（クーパーズが象徴）": "酵母の澱を残す瓶内二次発酵",
}


BLIND_CARD_OVERRIDES = {
    "D-06": {"aroma": "焦がしたパンの縁・ビターチョコ・コーヒー"},
    "D-07": {
        "taste": "濃いパン皮とトフィーの甘美さ、温かいアルコール",
        "mouthfeel": "際立つフルボディ",
    },
    "D-10": {"aroma": "焼きたてパン様の新鮮なイースト香・素朴な麦芽"},
    "D-11": {"taste": "穀物の風味を保ちつつ非常に軽い、爽快なキレ"},
    "D-18": {"aroma": "レモン皮様のスパイス香と乳酸を思わせる酸香"},
    "U-02": {"aroma": "グレープフルーツ・松脂"},
    "U-08": {
        "appearance": "漆黒・淡褐色のしっかりした泡",
        "aroma": "柑橘・松脂のホップ香が前面、焦げ香は背景に控えめ",
    },
    "E-01": {
        "aroma": "ビスケット・トーストモルト、土や草を思わせる穏やかなホップ香",
        "mouthfeel": "穏やかな炭酸・滑らかな口当たり",
    },
    "E-03": {
        "aroma": "アーシー・フローラルなホップが強めで、モルト感もある",
        "taste": "引き締まった苦味、柑橘感は穏やか",
    },
    "E-06": {
        "appearance": "不透明な漆黒・非常にきめ細かく密でクリーミーな泡",
        "mouthfeel": "窒素ガスによる非常に滑らかな口当たり",
    },
    "E-08": {"taste": "非常に重厚な麦芽の甘美さと、熟成後も残るしっかりした苦味"},
    "B-01": {
        "aroma": "柑橘の皮・胡椒・青いハーブを思わせる香り",
        "mouthfeel": "シルキーで軽快",
    },
    "B-09": {"taste": "シャープな酸味があり、ホップの苦味はほぼ感じない"},
    "B-11": {"aroma": "穏やかな洋梨・白胡椒を思わせる香り"},
    "O-01": {"aroma": "上品なハーブ・スパイス香とモルトの甘み"},
    "O-02": {"aroma": "カラメル・トースト・ナッツの香ばしさと穏やかなハーブ香"},
    "O-03": {"aroma": "トーストしたパン・ビスケット"},
    "O-08": {"aroma": "針葉樹を思わせる清涼香とバナナ様の甘い香り"},
    "O-09": {"aroma": "針葉樹の清涼感と強いオレンジ・トロピカルの果実香"},
}


BLIND_TEXT_REPLACEMENTS = (
    ("陳旧ホップ", "熟成ホップ"),
    ("若古ブレンド", "若いビールと熟成したビールのブレンド"),
    ("超高比重", "非常に高い初期比重"),
    ("超高アルコール", "非常に高いアルコール度数"),
    ("超重厚", "非常に重厚"),
    ("超濃密", "非常にきめ細かく密"),
    ("超クリーミー", "非常にクリーミー"),
    ("ホップフォワード", "ホップの香味を前面に出す設計"),
    ("モルティで", "モルト風味が豊かで"),
    ("モルティな", "モルト風味の豊かな"),
    ("モルティ", "モルト風味が豊か"),
    ("クリーンラガー", "クリーンなラガー発酵"),
    ("米国産ホップの柑橘・松＋中立酵母のホップの香味を前面に出す設計（穏やか版）", "柑橘・松脂系ホップとクリーンな酵母の穏やかなバランス"),
    ("英バーレイの骨格に米国ホップを全力投入", "重厚な麦芽の支えに柑橘・樹脂系ホップを大量使用"),
    ("IPAの骨格×英国ホップ・英国酵母（vs 米IPAの識別）", "しっかりした苦味を、アーシーなホップ香と穏やかな酵母由来香が支える"),
    ("上面エステル", "上面発酵酵母由来の果実香"),
    ("焦げ酸味", "焙煎麦芽由来の酸味"),
    ("超ライト", "非常に軽い"),
    ("超フルボディ", "非常に重いボディ"),
    ("超フル", "非常に重いボディ"),
    ("極限まで", "非常に"),
    ("極限の", "非常に高い"),
    ("ドリンカブル", "飲みやすい"),
    ("シルキー", "絹のように滑らか"),
    ("ヴィスカス", "粘性が高い"),
    ("ライブリー", "活発な発泡感"),
    ("灼けるような温感", "焼けるようなアルコールの温感"),
    ("エステル皆無", "エステルがほとんど感じられない"),
    ("アーシーさ", "土やハーブを思わせる香り"),
    ("甘香ばしさ", "甘く香ばしい風味"),
    ("超濃厚", "非常に濃厚"),
)

STYLE_NAME_REPLACEMENTS = {
    "APA": "アメリカンペールエール",
    "NZ IPA": "ニュージーランドIPA",
    "IGA": "グレープエール（旧称イタリアングレープエール）",
    "ダブル": "ベルジャン・デュッベル",
    "コーネル": "コルンエール（ノルウェー農家ビール）",
}


def polish_blind_text(value: str) -> str:
    result = value
    for source, target in BLIND_TEXT_REPLACEMENTS:
        result = result.replace(source, target)
    return result


def clean(value: str) -> str:
    value = value.replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", value).strip()


def japanese_text(value: str) -> str:
    """Replace source-side English tasting terms that would leak into the Japanese UI."""
    replacements = {
        "distinctively full-bodied": "際立つフルボディ",
        "hop flavor and aroma normally absent": "ホップの香味は通常ほぼ感じられない",
        "poor head retention": "泡持ちが弱い",
        "good foam development and retention": "泡立ちと泡持ちが良好",
        "sharp bitterness": "鋭い苦味",
        "creamy mouthfeeling": "クリーミーな口当たり",
        "mellow flavor with low carbonation": "低炭酸で穏やかな味わい",
        "warming alcohol": "温かみのあるアルコール感",
        "fullbodied but effervescent": "フルボディながら発泡感がある",
        "amber or dark weizen": "琥珀色または濃色のヴァイツェン",
        "pronounced aromas of chocolate": "はっきりしたチョコレート香",
        "Brettanomyces yeasts": "ブレタノマイセス酵母",
        "very light": "非常に軽い",
        "Spontaneous": "自然発酵",
        "Farmhouse": "農家醸造系",
        "Lager": "下面発酵（ラガー）",
        "Ale": "上面発酵（エール）",
        "APA": "アメリカンペールエール",
    }
    result = value
    for source, target in replacements.items():
        result = result.replace(source, target)
    return result


def japanese_observations(blind_card: dict[str, str]) -> list[str]:
    return [
        f"外観：{japanese_text(blind_card['appearance'])}",
        f"香り：{japanese_text(blind_card['aroma'])}",
        f"味わい：{japanese_text(blind_card['taste'])}",
        f"口当たり：{japanese_text(blind_card['mouthfeel'])}",
    ]


INTERPRETATION_RULES = [
    ("淡色〜黄金色系の外観", r"\b(?:pale|straw|gold|golden|blond)\b"),
    ("琥珀〜赤褐色系の外観", r"\b(?:amber|copper|bronze|mahogany|ruby|reddish)\b"),
    ("濃褐色〜黒色系の外観", r"\b(?:dark|brown|black|opaque|jet)\b"),
    ("透明感が高い", r"\b(?:clear|brilliant)\b"),
    ("濁りや沈殿が見られる", r"\b(?:cloudy|hazy|turbid|sediment|unfiltered)\b"),
    ("麦芽由来の香味が識別軸", r"\b(?:malt|malty|bread|bready|biscuit|toast|toasty|caramel|toffee|nutty|molasses|wort)\b"),
    ("ホップ香や苦味が識別軸", r"\b(?:hop|hops|saaz|fuggle|golding|cascade|citrus|pine|resinous|grapefruit|bitterness|bitter)\b"),
    ("焙煎由来の香味が識別軸", r"\b(?:roast|roasted|coffee|espresso|cacao|chocolate)\b"),
    ("酵母由来の果実・スパイス香が識別軸", r"\b(?:banana|clove|ester|esters|pear|apple|fruit|fruity|mango|passionfruit|cherry|fig|date|plum|raisin|pepper)\b"),
    ("酸味が主要な識別軸", r"\b(?:lactic|tart|sour|acidity|balsamic|vinous)\b"),
    ("燻製香が主要な識別軸", r"\b(?:smoke|smoky|bacon|peat)\b"),
    ("野生酵母由来の香りが識別軸", r"\b(?:brett|horse|leather|hay|sage)\b"),
    ("ハーブ・スパイス香が識別軸", r"\b(?:coriander|spice|spicy|herbal|juniper|earthy)\b"),
    ("軽快でドライな飲み口", r"\b(?:light|watery|crisp|dry|delicate|attenuated)\b"),
    ("豊潤で高いボディ", r"\b(?:full-bodied|fullbodied|rich|syrupy|warming|massive|intense|concentrated)\b"),
    ("発泡感が強い", r"\b(?:effervescent|carbonated|carbonation|champagne|lively)\b"),
    ("炭酸が穏やか", r"\blow carbonation\b"),
    ("滑らかで丸みのある口当たり", r"\b(?:creamy|silky|smooth|rounded|mellow)\b"),
]


def step1_interpretations(value: str) -> list[str]:
    """Convert raw observations into standardized diagnostic axes, not copied phrases."""
    lowered = value.lower()
    interpretations = [label for label, pattern in INTERPRETATION_RULES if re.search(pattern, lowered)]
    return interpretations[:6]


def field(block: str, label: str) -> str:
    match = re.search(rf"^{re.escape(label)}\s*(.+)$", block, re.MULTILINE)
    if not match:
        raise ValueError(f"Missing {label}")
    return clean(match.group(1))


def parse_blind_card(block: str) -> dict[str, str]:
    match = re.search(r"^■B\*\*\s*(.+)$", block, re.MULTILINE)
    if not match:
        raise ValueError("Missing blind card")
    value = clean(match.group(1))
    labels = [("appearance", "外観:"), ("aroma", "アロマ:"), ("taste", "味:"), ("mouthfeel", "MF:")]
    result: dict[str, str] = {}
    for index, (key, label) in enumerate(labels):
        start = value.find(label)
        if start < 0:
            raise ValueError(f"Missing blind-card field {label}")
        start += len(label)
        next_starts = [value.find(next_label, start) for _, next_label in labels[index + 1:]]
        next_starts = [position for position in next_starts if position >= 0]
        end = min(next_starts) if next_starts else len(value)
        result[key] = value[start:end].strip(" ／")
    return result


def split_items(value: str, delimiter: str = "・") -> list[str]:
    parts = [clean(part) for part in value.split(delimiter)]
    return [part for part in parts if part]


def parse_choices(value: str) -> tuple[list[str], int]:
    matches = list(CHOICE_RE.finditer(value))
    if len(matches) != 4:
        raise ValueError(f"Expected four choices, found {len(matches)}: {value}")
    choices: list[str] = []
    correct = -1
    for index, match in enumerate(matches):
        label = clean(match.group(2))
        if "★" in label:
            correct = index
        choices.append(label.replace("★", "").strip())
    if correct < 0:
        raise ValueError(f"Correct choice is not marked: {value}")
    return choices, correct


def parse_scenarios(source: Path) -> list[dict]:
    text = source.read_text(encoding="utf-8-sig")
    matches = list(HEADER_RE.finditer(text))
    scenarios: list[dict] = []
    for index, match in enumerate(matches):
        scenario_id = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else text.find("# PART 3", match.end())
        block = text[match.end():end]
        blind_card = parse_blind_card(block)
        step1 = field(block, "S1:")
        step2 = field(block, "S2:")
        step3 = field(block, "S3:")
        fermentation_detail = field(block, "4.1:")
        exclusions_text = field(block, "4.2:")
        conclusion = field(block, "4.3:")
        choice_text = field(block, "【択】")
        choices, correct_choice = parse_choices(choice_text)
        exclusions = []
        for item in split_items(exclusions_text, "／"):
            if "→" not in item:
                continue
            style, reason = item.split("→", 1)
            exclusions.append({"style": clean(style), "reason": clean(reason)})
        if len(exclusions) != 3:
            raise ValueError(f"{scenario_id}: expected three exclusions, found {len(exclusions)}")
        family = next((name for name in ("Lager", "Ale", "Spontaneous", "Farmhouse") if fermentation_detail.startswith(name)), "Other")
        country_id, country_label = COUNTRIES[scenario_id[0]]
        scenarios.append({
            "id": scenario_id,
            "country": country_id,
            "countryLabel": country_label,
            "difficulty": len(match.group(2)),
            "blindCard": blind_card,
            "step1ObservationsJa": japanese_observations(blind_card),
            "step1InterpretationsJa": step1_interpretations(step1),
            "step1KeywordsSource": split_items(step1, "/"),
            "step2Characteristic": japanese_text(step2),
            "decisiveEvidence": japanese_text(step2),
            "step3IngredientsProcess": [japanese_text(item) for item in split_items(step3)],
            "fermentationFamily": family,
            "fermentationDetail": japanese_text(fermentation_detail),
            "exclusions": [{"style": item["style"], "reason": japanese_text(item["reason"])} for item in exclusions],
            "conclusion": japanese_text(conclusion),
            "choices": choices,
            "correctChoice": correct_choice,
            "answer": choices[correct_choice],
            "representativeBeers": REPRESENTATIVE_BEERS[scenario_id],
            "source": {"filename": source.name, "locator": scenario_id},
        })
    return scenarios


def apply_ui_overrides(scenarios: list[dict]) -> None:
    """Keep early-stage clues diagnostic without spelling out later answers."""
    for scenario in scenarios:
        scenario["choices"] = [
            STYLE_NAME_REPLACEMENTS.get(choice, choice)
            for choice in scenario["choices"]
        ]
        scenario["answer"] = scenario["choices"][scenario["correctChoice"]]
        for exclusion in scenario["exclusions"]:
            exclusion["style"] = STYLE_NAME_REPLACEMENTS.get(
                exclusion["style"], exclusion["style"]
            )
        scenario["step3IngredientsProcess"] = [
            INGREDIENT_PROCESS_REPLACEMENTS.get(item, item)
            for item in scenario["step3IngredientsProcess"]
        ]
        scenario["blindCard"].update(BLIND_CARD_OVERRIDES.get(scenario["id"], {}))
        scenario["blindCard"] = {
            key: polish_blind_text(value) for key, value in scenario["blindCard"].items()
        }
        scenario["step2Characteristic"] = polish_blind_text(scenario["step2Characteristic"])
        scenario["decisiveEvidence"] = polish_blind_text(scenario["decisiveEvidence"])
        scenario["step3IngredientsProcess"] = [
            polish_blind_text(item) for item in scenario["step3IngredientsProcess"]
        ]
        scenario["fermentationDetail"] = polish_blind_text(scenario["fermentationDetail"])
        for exclusion in scenario["exclusions"]:
            exclusion["reason"] = polish_blind_text(exclusion["reason"])
        scenario["step1ObservationsJa"] = japanese_observations(scenario["blindCard"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    scenarios = parse_scenarios(args.source)
    apply_ui_overrides(scenarios)
    ids = [scenario["id"] for scenario in scenarios]
    if len(scenarios) != 58 or len(ids) != len(set(ids)):
        raise ValueError(f"Expected 58 unique scenarios, found {len(scenarios)}")
    payload = {
        "metadata": {
            "title": "ブラインドテイスティング判定シミュレーション",
            "version": "2026-09-01-polished-japanese-v39",
            "scenarioCount": len(scenarios),
            "examScenarioCount": 10,
            "secondsPerScenario": 180,
            "maximumPoints": 10,
            "countries": [{"id": item[0], "label": item[1], "count": sum(s["country"] == item[0] for s in scenarios)} for item in COUNTRIES.values()],
            "difficultyCounts": dict(sorted(Counter(s["difficulty"] for s in scenarios).items())),
            "sourceFilename": args.source.name,
            "note": "仕様見出しは全50シナリオと記載されていますが、連番データ58件を欠落なく収録しています。",
        },
        "scenarios": scenarios,
    }
    if not args.validate_only:
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scenarios": len(scenarios), "countries": Counter(s["country"] for s in scenarios), "difficulties": Counter(s["difficulty"] for s in scenarios), "output": None if args.validate_only else str(args.output)}, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
