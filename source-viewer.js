"use strict";

// Only reference metadata and ACL-protected Drive view links are public. No source bytes are fetched from Drive.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BierKompassSources = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
  const contentSignature = q => JSON.stringify([q.question, q.choices, q.correct, q.choiceReasons, q.explanation]);
  const keyFor = (id, variant = "base") => JSON.stringify([id, variant]);
  async function digest(bytes, crypto = root.crypto) {
    if (!crypto?.subtle) throw new Error("出典の照合にはHTTPSと新しいブラウザーが必要です。ブラウザーを更新して開き直してください。");
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function validRect(rect) {
    return Array.isArray(rect) && rect.length === 4 && rect.every(n => Number.isFinite(n) && n >= 0 && n <= 1)
      && rect[0] < rect[2] && rect[1] < rect[3];
  }
  async function createCatalog(manifest, questions, variants = new Map(), crypto = root.crypto) {
    if (manifest?.version !== 1 || !Array.isArray(manifest.documents) || !Array.isArray(manifest.questions)) throw new Error("出典リンクの形式が正しくありません。");
    const documents = new Map();
    for (const d of manifest.documents) {
      if (!d || typeof d.id !== "string" || !d.id || documents.has(d.id) || typeof d.filename !== "string" || !d.filename
        || !/^[a-f0-9]{64}$/.test(d.sha256) || !Number.isInteger(d.pageCount) || d.pageCount < 1) throw new Error("資料情報が正しくありません。");
      documents.set(d.id, {...d});
    }
    const canonical = new Map(questions.map(q => [keyFor(q.id), q]));
    for (const sets of variants.values()) for (const q of sets) canonical.set(keyFor(q.id, q.choiceVariantId || "base"), q);
    const groups = new Map();
    for (const group of manifest.questions) {
      const key = keyFor(group.questionId, group.variantId);
      if (groups.has(key) || typeof group.variantId !== "string" || !Array.isArray(group.choices)) throw new Error("問題の出典リンクが正しくありません。");
      const q = canonical.get(key);
      // A stale manifest must not point the learner to evidence for a different statement.
      if (!q || !/^[a-f0-9]{64}$/.test(group.contentHash || "")
        || await digest(new TextEncoder().encode(contentSignature(q)), crypto) !== group.contentHash) continue;
      const choices = new Map();
      for (const choice of group.choices) {
        if (!Number.isInteger(choice.index) || choice.index < 0 || choice.index > 3 || choices.has(choice.index) || !Array.isArray(choice.refs)) throw new Error("選択肢の出典リンクが正しくありません。");
        const refs = choice.refs.map(ref => {
          const doc = documents.get(ref.documentId);
          if (!doc || !Number.isInteger(ref.page) || ref.page < 1 || ref.page > doc.pageCount
            || typeof ref.label !== "string" || !ref.label.trim() || !Array.isArray(ref.rects) || !ref.rects.every(validRect)) throw new Error("本文の参照位置が正しくありません。");
          return {documentId: doc.id, page: ref.page, label: ref.label, rects: ref.rects.map(r => [...r])};
        });
        choices.set(choice.index, refs);
      }
      groups.set(key, {signature: contentSignature(q), choices});
    }
    for (const group of groups.values()) for (const refs of group.choices.values()) for (const ref of refs) {
      ref.passageKey = await passageKey(documents.get(ref.documentId).sha256, ref.page, ref.rects, crypto);
    }
    return {documents, groups, passages: new Map(), driveStatus: "unavailable"};
  }
  async function passageKey(pdfSha256, page, rects, crypto = root.crypto) {
    return digest(new TextEncoder().encode(JSON.stringify([pdfSha256, page, rects])), crypto);
  }
  const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
  function validDriveViewLink(link, fileId) {
    // Allow only the normal Drive single-file viewer, never download, preview, tokens or arbitrary URLs.
    return typeof fileId === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(fileId)
      && typeof link === "string" && new RegExp(`^https://drive\\.google\\.com/file/d/${fileId}/view(?:\\?usp=(?:drivesdk|sharing|drive_link))?$`).test(link);
  }
  async function createPassageCatalog(manifest, catalog, crypto = root.crypto) {
    const fail = () => { throw new Error("共有画像の対応表が正しくありません。"); };
    if (!exactKeys(manifest, ["version", "linkSource", "passages"]) || manifest.version !== 1
      || manifest.linkSource !== "google_drive.get_file_metadata.webViewLink" || !Array.isArray(manifest.passages)) fail();
    const known = new Map();
    for (const group of catalog.groups.values()) for (const refs of group.choices.values()) for (const ref of refs)
      known.set(ref.passageKey, [catalog.documents.get(ref.documentId).sha256, ref.page, ref.rects]);
    const result = new Map(), files = new Set();
    for (const entry of manifest.passages) {
      if (!exactKeys(entry, ["key", "pdfSha256", "page", "rects", "imageSha256", "driveFileId", "webViewLink"])
        || !/^[a-f0-9]{64}$/.test(entry.key) || !/^[a-f0-9]{64}$/.test(entry.pdfSha256)
        || !/^[a-f0-9]{64}$/.test(entry.imageSha256) || !Number.isInteger(entry.page) || entry.page < 1
        || !Array.isArray(entry.rects) || !entry.rects.length || !entry.rects.every(validRect)
        || !validDriveViewLink(entry.webViewLink, entry.driveFileId) || result.has(entry.key) || files.has(entry.driveFileId)) fail();
      const identity = [entry.pdfSha256, entry.page, entry.rects];
      if (await passageKey(...identity, crypto) !== entry.key) fail();
      // Stale or unrelated entries are not usable; an invalid mapping fails closed as a whole.
      if (JSON.stringify(known.get(entry.key)) !== JSON.stringify(identity)) fail();
      result.set(entry.key, {...entry}); files.add(entry.driveFileId);
    }
    return result;
  }
  async function loadPassages(catalog, version, fetcher = root.fetch.bind(root), crypto = root.crypto) {
    let timeout;
    catalog.passages = new Map(); catalog.driveStatus = "unavailable";
    try {
      const controller = new root.AbortController();
      timeout = root.setTimeout(() => controller.abort(), 5000);
      const response = await fetcher(`source-passages.json?${encodeURIComponent(version)}`, {cache: "no-store", signal: controller.signal});
      if (!response.ok) throw new Error("共有画像の対応表を読み込めませんでした。");
      catalog.passages = await createPassageCatalog(await response.json(), catalog, crypto);
      catalog.driveStatus = catalog.passages.size ? "available" : "unconfigured";
    } catch (error) {
      root.console?.warn("共有画像を利用できません。通常の出典表示で学習を続けられます。", error.message);
    } finally { root.clearTimeout(timeout); }
    return catalog.driveStatus;
  }
  function choiceLinks(catalog, question, originalIndex) {
    const variant = question.choiceVariantId || "base";
    const group = catalog?.groups.get(keyFor(question.id, variant));
    if (!group || group.signature !== contentSignature(question)) return "";
    const refs = group.choices.get(originalIndex) || [];
    return refs.length ? `<div class="source-links">${refs.map(ref => {
      const passage = catalog.passages?.get(ref.passageKey);
      const filename = escapeHtml(catalog.documents.get(ref.documentId).filename);
      return passage ? `<a class="source-link" href="${escapeHtml(passage.webViewLink)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">資料の該当箇所を見る · PDF ${ref.page}ページ<span>${escapeHtml(ref.label)} · ${filename} · Google Driveで別タブを開く</span></a>`
        : `<span class="source-drive-status">${catalog.driveStatus === "unavailable" ? "共有画像を読み込めません。" : "この箇所の共有画像は準備中です。"}<span>${escapeHtml(ref.label)} · ${filename} · PDF ${ref.page}ページ</span></span>`;
    }).join("")}</div>` : "";
  }
  let catalog = null;
  async function init({questions, variants, version}) {
    let timeout;
    try {
      const controller = new root.AbortController();
      timeout = root.setTimeout(() => controller.abort(), 5000);
      const response = await root.fetch(`source-links.json?${encodeURIComponent(version)}`, {cache: "no-store", signal: controller.signal});
      if (!response.ok) throw new Error("出典リンクを読み込めませんでした。");
      catalog = await createCatalog(await response.json(), questions, variants);
      await loadPassages(catalog, version);
      return true;
    } catch (error) {
      catalog = null;
      // The question bank, scoring and plain source citations remain available.
      root.console?.warn("資料本文リンクを利用できません。通常の出典表示で学習を続けられます。", error.message);
      return false;
    } finally {
      root.clearTimeout(timeout);
    }
  }
  return {init, choiceLinks: (q, i) => choiceLinks(catalog, q, i), contentSignature, createCatalog,
    passageKey, validDriveViewLink, createPassageCatalog, loadPassages,
    renderChoiceLinks: choiceLinks, validRect, digest};
});
