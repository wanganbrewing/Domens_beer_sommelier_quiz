/* Real beer photographs and clearly labelled AI reference illustrations.
 * Call only after an answer is revealed, or from the study guide. */
(() => {
  "use strict";
  const VERSION = "v47";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = text => String(text ?? "").normalize("NFKC").replace(/[・\s／/（）()\-‐‑–]/g, "").toLowerCase();
  let catalog = new Map();
  let aliases = [];
  const load = file => fetch(`${file}?${VERSION}`).then(r => {
    if (!r.ok) throw new Error(`image catalog: ${file}`);
    return r.json();
  }).catch(() => []);
  const ready = Promise.all([load("beer-photos.json"), load("beer-illustrations.json"), load("beer-image-styles.json")]).then(([photos, illustrations, styles]) => {
    // Prefer a documented real photograph whenever one is available.
    catalog = new Map([...illustrations, ...photos].map(item => [item.id, item]));
    const known = new Map(styles.map(item => [item.id, item]));
    for (const item of catalog.values()) {
      if (!known.has(item.id)) known.set(item.id, item);
    }
    aliases = [...known.values()].flatMap(item => [item.style, ...(item.aliases || [])].filter(Boolean).map(name => ({name: normalize(name), id: item.id}))).sort((a, b) => b.name.length - a.name.length);
  });
  function card(item, context = "") {
    const illustration = item.kind === "illustration";
    const alt = illustration ? `${item.style}の外観を描いたAI参考イラスト。${item.appearance || ""}` : `${item.beer}：グラスに注いだビールの色と泡`;
    const img = `<img class="beer-reference-image" src="${escape(item.image)}" alt="${escape(alt)}" loading="lazy" width="400" height="360">`;
    const media = illustration ? img : `<a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">${img}</a>`;
    const style = window.BierKompassStyleLinks?.linkStyle(item.style) || escape(item.style);
    const caption = illustration
      ? `<strong>${style}</strong><span class="beer-image-kind">AI参考イラスト</span><small>実在銘柄の写真ではありません。${escape(item.appearance || "")}</small>`
      : `<strong>${escape(item.beer)}</strong><span>${style} · 実物写真</span><small>写真：${escape(item.author)} · <a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">出典</a> · <a href="${escape(item.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(item.license)}</a></small>`;
    return `<figure class="beer-photo" data-beer-style-id="${escape(item.id)}">${context ? `<p class="beer-image-context">${escape(context)}</p>` : ""}${media}<figcaption>${caption}</figcaption></figure>`;
  }
  function matchingIds(text) {
    const normalized = normalize(text);
    const occupied = [];
    const matches = [];
    // Match longer, specific names first, including styles without images.
    // Thus ダークヴァイツェン never accidentally receives a pale ヴァイツェン photo.
    for (const alias of aliases) {
      let from = 0;
      for (;;) {
        const start = normalized.indexOf(alias.name, from);
        if (start < 0) break;
        const end = start + alias.name.length;
        from = end;
        if (occupied.some(range => start < range.end && end > range.start)) continue;
        occupied.push({ start, end });
        if (!matches.some(match => match.id === alias.id)) matches.push({ id: alias.id, start });
      }
    }
    return matches.sort((a, b) => a.start - b.start).map(match => match.id);
  }
  function gallery(entries) {
    const seen = new Set();
    const cards = [];
    for (const { text, context } of entries) {
      for (const id of matchingIds(text)) {
        if (seen.has(id) || !catalog.has(id)) continue;
        seen.add(id);
        cards.push(card(catalog.get(id), context));
      }
    }
    return cards.length ? `<section class="beer-image-gallery" aria-label="解答後のビール参考画像"><h3>ビールの見た目</h3><p class="beer-image-note">実物写真とAI参考イラストを区別しています。色や泡は銘柄・注ぎ方で変わり、見た目だけでは判別できません。</p><div class="beer-image-grid">${cards.join("")}</div></section>` : "";
  }
  function forId(id) { return catalog.has(id) ? card(catalog.get(id)) : ""; }
  function forText(text) { return matchingIds(text).filter(id => catalog.has(id)).map(id => card(catalog.get(id))).join(""); }
  function forQuestion(question, order = question.choices.map((_, i) => i)) {
    return gallery([
      {text: `${question.question}\n${question.explanation}`, context: "設問・解説で参照するビール"},
      ...order.map((originalIndex, displayIndex) => ({
        text: `${question.choices[originalIndex]}\n${question.choiceReasons?.[originalIndex] || ""}`,
        context: `${String.fromCharCode(65 + displayIndex)}｜${question.correct.includes(originalIndex) ? "正答" : "誤答"}の選択肢・解説で参照`,
      })),
    ]);
  }
  function forChoices(choices, correct, selected = null) {
    const order = [...correct, ...choices.map((_, i) => i).filter(i => !correct.includes(i))];
    return gallery(order.map(i => ({text: choices[i], context: correct.includes(i) ? "正答のビール" : `誤答の候補${selected !== null && Number(selected) === i ? "（あなたの回答）" : ""}`})));
  }
  if (typeof document !== "undefined") document.addEventListener("error", event => {
    const img = event.target;
    if (!img?.classList?.contains("beer-reference-image") || img.dataset.failed) return;
    img.dataset.failed = "true";
    img.hidden = true;
    const note = document.createElement("p");
    note.className = "beer-image-error";
    note.textContent = "画像を読み込めませんでした。通信状況を確認して再読み込みしてください。";
    img.after(note);
  }, true);
  window.BierKompassPhotos = { ready, forId, forText, forQuestion, forChoices };
})();
