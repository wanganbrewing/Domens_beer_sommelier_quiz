/* Photographs are shown only after answering, or in the study guide. */
(() => {
  "use strict";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog = [];
  const ready = fetch('beer-photos.json?v42').then(r => {
    if (!r.ok) throw new Error('photo catalog');
    return r.json();
  }).then(data => { catalog = data; }).catch(() => {});
  function card(item) {
    return `<figure class="beer-photo"><a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer"><img src="${escape(item.image)}" alt="${escape(item.beer)}：グラスに注いだビールの色と泡" loading="lazy" width="400" height="360"></a><figcaption><strong>${escape(item.beer)}</strong><span>${escape(item.style)}</span><small>写真：${escape(item.author)} · <a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">出典</a> · <a href="${escape(item.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(item.license)}</a></small></figcaption></figure>`;
  }
  const normalize = text => String(text).replace(/[・\s／/（）()]/g, '').toLowerCase();
  function forId(id) { return catalog.filter(item => item.id === id).map(card).join(''); }
  function forText(text) {
    const normalized = normalize(text);
    return catalog.filter(item => [item.style, ...(item.aliases || [])].some(name => normalized.includes(normalize(name)))).slice(0, 2).map(card).join('');
  }
  window.BierKompassPhotos = { ready, forId, forText };
})();
