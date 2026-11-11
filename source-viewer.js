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
    if (!crypto?.subtle) throw new Error("PDFの照合にはHTTPSと新しいブラウザーが必要です。Safariを更新して開き直してください。");
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
      root.console?.warn("共有画像を利用できません。端末のPDFは引き続き参照できます。", error.message);
    } finally { root.clearTimeout(timeout); }
    return catalog.driveStatus;
  }
  function choiceLinks(catalog, question, originalIndex) {
    const variant = question.choiceVariantId || "base";
    const group = catalog?.groups.get(keyFor(question.id, variant));
    if (!group || group.signature !== contentSignature(question)) return "";
    const refs = group.choices.get(originalIndex) || [];
    return refs.length ? `<div class="source-links">${refs.map((ref, i) => {
      const passage = catalog.passages?.get(ref.passageKey);
      const filename = escapeHtml(catalog.documents.get(ref.documentId).filename);
      const direct = passage ? `<a class="source-link" href="${escapeHtml(passage.webViewLink)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">資料の該当箇所を見る · PDF ${ref.page}ページ<span>${escapeHtml(ref.label)} · ${filename} · Google Driveで別タブを開く</span></a>`
        : `<span class="source-drive-status">${catalog.driveStatus === "unavailable" ? "共有画像を読み込めません。" : "この箇所の共有画像は準備中です。"}</span>`;
      return `${direct}<button type="button" class="source-link source-local-link" data-source-question="${escapeHtml(question.id)}" data-source-variant="${escapeHtml(variant)}" data-source-choice="${originalIndex}" data-source-ref="${i}">端末のPDFで確認 · ${ref.page}ページ <span>${escapeHtml(ref.label)} · ${filename}</span></button>`;
    }).join("")}</div>` : "";
  }
  async function verifyFile(file, descriptor, crypto = root.crypto) {
    if (!file || file.size === 0) throw new Error("PDFファイルを選んでください。");
    if (file.size > 100 * 1024 * 1024) throw new Error("100MBを超えるPDFは読み込めません。指定された元のPDFを選んでください。");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (await digest(bytes, crypto) !== descriptor.sha256) throw new Error(`資料の版が一致しません。「${descriptor.filename}」の元のPDFを選んでください。ファイル名の変更だけでは一致しません。`);
    return bytes;
  }
  // Packed without changing a byte; avoid 182 separate files in a static deployment.
  // Only bundled library assets are fetched. PDF-controlled URLs are never fetched.
  function createResourceFactory(baseURL, fetcher = root.fetch.bind(root)) {
    let resources;
    const wasm = new Set(["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"]);
    return class LocalBinaryDataFactory {
      async fetch({kind, filename}) {
        if (kind === "wasmUrl" && wasm.has(filename)) {
          const response = await fetcher(new URL(`wasm/${filename}`, baseURL));
          if (!response.ok) throw new Error("PDF描画部品を読み込めませんでした。");
          return new Uint8Array(await response.arrayBuffer());
        }
        const folder = {cMapUrl: "cmaps", standardFontDataUrl: "standard_fonts"}[kind];
        if (!folder || typeof filename !== "string") throw new Error("未対応のPDF描画部品です。");
        if (!resources) resources = Promise.all([fetcher(new URL("resources.json", baseURL)), fetcher(new URL("resources.bin", baseURL))]).then(async ([index, bytes]) => {
          if (!index.ok || !bytes.ok) throw new Error("PDFの文字データを読み込めませんでした。");
          return [await index.json(), await bytes.arrayBuffer()];
        }).catch(error => { resources = null; throw error; });
        const [index, buffer] = await resources;
        const entry = index[`${folder}/${filename}`];
        if (!Array.isArray(entry) || entry.length !== 2) throw new Error("未対応のPDF文字データです。");
        return new Uint8Array(buffer.slice(entry[0], entry[0] + entry[1]));
      }
    };
  }
  function renderSize(pageWidth, pageHeight, availableWidth, zoom, deviceScale = 1) {
    const scale = Math.max(240, availableWidth) / pageWidth * zoom;
    const width = pageWidth * scale, height = pageHeight * scale;
    // Keep canvases below conservative iPhone memory limits, even when zoomed.
    const outputScale = Math.min(deviceScale || 1, 2, Math.sqrt(4_000_000 / (width * height)), 8192 / Math.max(width, height));
    return {scale, width, height, outputScale};
  }
  let catalog = null, ui = null;
  async function init({questions, variants, version}) {
    let timeout;
    try {
      const controller = new root.AbortController();
      timeout = root.setTimeout(() => controller.abort(), 5000);
      const response = await root.fetch(`source-links.json?${encodeURIComponent(version)}`, {cache: "no-store", signal: controller.signal});
      if (!response.ok) throw new Error("出典リンクを読み込めませんでした。");
      catalog = await createCatalog(await response.json(), questions, variants);
      await loadPassages(catalog, version);
      ui ||= mountViewer(catalog);
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
  function mountViewer(currentCatalog) {
    const doc = root.document;
    const dialog = doc.querySelector("#sourceViewer");
    if (!dialog) throw new Error("資料画面がありません。");
    const el = name => doc.querySelector(`#source${name}`);
    const assetURL = new URL("vendor/pdfjs/", doc.baseURI);
    let ref = null, descriptor = null, loaded = null, loading = null, rendering = null;
    let pdfModule = null, pageNumber = 1, zoom = 1, epoch = 0, renderEpoch = 0;
    let opener = null, returnScroll = 0, historyToken = null, closingByHistory = false;
    let closing = false, historyPending = false, pendingOpen = null;
    function message(text, error = false) {
      el("Status").textContent = text;
      el("Status").classList.toggle("is-error", error);
    }
    function controls(ready) {
      el("Tools").hidden = !ready;
      el("Viewport").hidden = !ready;
      el("Forget").hidden = !loaded;
    }
    function cancelRender() {
      renderEpoch += 1;
      if (rendering) { rendering.cancel(); rendering = null; }
    }
    function cancelLoad() {
      epoch += 1;
      if (loading) { loading.destroy().catch(() => {}); loading = null; }
      el("Choose").disabled = false;
      el("File").disabled = false;
    }
    function cleanup() {
      cancelRender(); cancelLoad();
      doc.body.classList.remove("source-viewer-open");
      el("Canvas").width = 1; el("Canvas").height = 1;
      el("Highlights").replaceChildren();
      root.scrollTo({top: returnScroll, behavior: "auto"});
      if (opener?.isConnected) opener.focus({preventScroll: true});
    }
    function close() {
      if (!dialog.open) return;
      closing = true;
      dialog.close();
    }
    function finishClose() {
      closing = false; historyPending = false; historyToken = null; closingByHistory = false;
      if (pendingOpen) { const next = pendingOpen; pendingOpen = null; open(next.ref, next.trigger); }
    }
    dialog.addEventListener("close", () => {
      cleanup();
      if (!closingByHistory && historyToken && root.history.state?.bierkompassSource === historyToken) {
        historyPending = true;
        try { root.history.back(); } catch { finishClose(); }
      } else finishClose();
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    el("Back").addEventListener("click", close);
    root.addEventListener("popstate", () => {
      if (historyPending) { finishClose(); return; }
      if (dialog.open && root.history.state?.bierkompassSource !== historyToken) { closingByHistory = true; close(); }
    });
    function open(targetRef, trigger) {
      // Native close and browser history events are asynchronous on Safari.
      if (closing || historyPending) { pendingOpen = {ref: targetRef, trigger}; return; }
      cancelLoad(); cancelRender();
      ref = targetRef; descriptor = currentCatalog.documents.get(ref.documentId);
      pageNumber = ref.page; zoom = 1; opener = trigger; returnScroll = root.scrollY;
      el("Title").textContent = ref.label;
      el("Filename").textContent = descriptor.filename;
      el("Location").textContent = `参照先：PDF ${ref.page} / ${descriptor.pageCount}ページ（PDFの表示順）`;
      el("File").value = ""; el("Page").max = String(descriptor.pageCount);
      controls(Boolean(loaded?.sha256 === descriptor.sha256));
      if (!dialog.open) {
        dialog.showModal(); doc.body.classList.add("source-viewer-open");
        historyToken = `source-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try { root.history.pushState({...root.history.state, bierkompassSource: historyToken}, ""); }
        catch { historyToken = null; }
      }
      el("Back").focus();
      if (loaded?.sha256 === descriptor.sha256) renderPage(true);
      else message("この資料のPDFを端末から選ぶと、該当箇所が開きます。");
    }
    doc.addEventListener("click", event => {
      const button = event.target.closest?.("button[data-source-question]");
      if (!button) return;
      const group = currentCatalog.groups.get(keyFor(button.dataset.sourceQuestion, button.dataset.sourceVariant));
      const targetRef = group?.choices.get(Number(button.dataset.sourceChoice))?.[Number(button.dataset.sourceRef)];
      if (targetRef) open(targetRef, button);
    });
    el("Choose").addEventListener("click", () => el("File").click());
    el("File").addEventListener("change", async () => {
      const file = el("File").files?.[0];
      el("File").value = "";
      if (!file || !dialog.open) return;
      cancelLoad(); cancelRender();
      const ticket = epoch, expected = descriptor;
      el("Choose").disabled = true; el("File").disabled = true;
      controls(false); message("PDFの版を照合しています。ファイルは送信しません。");
      let candidate = null;
      try {
        const bytes = await verifyFile(file, expected);
        if (ticket !== epoch || !dialog.open) return;
        pdfModule ||= import(new URL("pdf.min.mjs", assetURL).href).catch(error => { pdfModule = null; throw error; });
        const pdfjs = await pdfModule;
        if (ticket !== epoch || !dialog.open) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", assetURL).href;
        candidate = pdfjs.getDocument({data: bytes.slice(), isEvalSupported: false, enableXfa: false, useSystemFonts: false,
          useWorkerFetch: false, BinaryDataFactory: createResourceFactory(assetURL),
          cMapUrl: new URL("cmaps/", assetURL).href, cMapPacked: true,
          standardFontDataUrl: new URL("standard_fonts/", assetURL).href, wasmUrl: new URL("wasm/", assetURL).href,
          disableAutoFetch: true, disableStream: true, disableRange: true, stopAtErrors: true});
        loading = candidate;
        // Do not ask for or store passwords for an unexpected encrypted file.
        candidate.onPassword = () => { candidate.destroy().catch(() => {}); };
        const pdf = await candidate.promise;
        if (ticket !== epoch || !dialog.open) { await candidate.destroy(); return; }
        if (pdf.numPages !== expected.pageCount) throw new Error("資料のページ数が一致しません。指定された元のPDFを選んでください。");
        const previous = loaded;
        loaded = {sha256: expected.sha256, pdf}; loading = null; candidate = null;
        if (previous) await previous.pdf.destroy();
        if (ticket !== epoch || !dialog.open || loaded?.pdf !== pdf) return;
        pageNumber = ref.page; zoom = 1;
        await renderPage(true);
      } catch (error) {
        if (candidate) await candidate.destroy().catch(() => {});
        if (ticket !== epoch || !dialog.open) return;
        controls(false);
        const known = /資料|PDFファイル|100MB|HTTPS/.test(error.message || "");
        message(known ? error.message : "PDFを表示できませんでした。指定された元のPDFを選び直すか、新しいSafariで開いてください。解説には「問題へ戻る」で戻れます。", true);
      } finally {
        if (ticket === epoch) { loading = null; el("Choose").disabled = false; el("File").disabled = false; }
      }
    });
    async function renderPage(jumpToReference = false) {
      if (!loaded || loaded.sha256 !== descriptor.sha256 || !dialog.open) return;
      cancelRender();
      const ticket = renderEpoch, pdf = loaded.pdf, targetPage = pageNumber;
      controls(true); message("ページを表示しています…");
      el("Page").value = String(pageNumber); el("Total").textContent = `/ ${pdf.numPages}`;
      el("Previous").disabled = pageNumber <= 1; el("Next").disabled = pageNumber >= pdf.numPages;
      el("ZoomOut").disabled = zoom <= 0.75; el("ZoomIn").disabled = zoom >= 3;
      el("ZoomLabel").textContent = `${Math.round(zoom * 100)}%`;
      el("Highlights").replaceChildren();
      let page;
      try {
        page = await pdf.getPage(targetPage);
        if (ticket !== renderEpoch || !dialog.open) return;
        const natural = page.getViewport({scale: 1});
        const size = renderSize(natural.width, natural.height, el("Viewport").clientWidth - 24, zoom, root.devicePixelRatio);
        const viewport = page.getViewport({scale: size.scale});
        const canvas = el("Canvas"), paper = el("Paper");
        canvas.width = Math.ceil(size.width * size.outputScale); canvas.height = Math.ceil(size.height * size.outputScale);
        canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`;
        canvas.setAttribute("aria-label", `${descriptor.filename}、PDF ${targetPage}ページ`);
        paper.style.width = `${size.width}px`; paper.style.height = `${size.height}px`;
        rendering = page.render({canvasContext: canvas.getContext("2d", {alpha: false}), viewport,
          transform: [size.outputScale, 0, 0, size.outputScale, 0, 0], annotationMode: 0});
        await rendering.promise;
        if (ticket !== renderEpoch || !dialog.open) return;
        rendering = null;
        const rects = targetPage === ref.page ? ref.rects : [];
        for (const r of rects) {
          const mark = doc.createElement("span"); mark.className = "source-highlight"; mark.setAttribute("aria-hidden", "true");
          Object.assign(mark.style, {left: `${r[0]*100}%`, top: `${r[1]*100}%`, width: `${(r[2]-r[0])*100}%`, height: `${(r[3]-r[1])*100}%`});
          el("Highlights").append(mark);
        }
        if (jumpToReference && rects.length) el("Viewport").scrollTo({top: Math.max(0, rects[0][1]*size.height-64), left: Math.max(0, rects[0][0]*size.width-24), behavior: "auto"});
        else el("Viewport").scrollTo({top: 0, left: 0, behavior: "auto"});
        message(targetPage === ref.page ? (rects.length ? "黄色い枠が参照箇所です。拡大や前後ページの確認もできます。" : "参照ページです。本文を確認してください。") : "前後のページを表示中です。「該当箇所へ」で参照ページに戻れます。");
      } catch (error) {
        if (ticket !== renderEpoch || error.name === "RenderingCancelledException" || !dialog.open) return;
        controls(false);
        message("このページを表示できませんでした。PDFを選び直してください。解説と回答は保持されています。", true);
      } finally {
        // Release per-page image/operator data; the displayed canvas retains its pixels.
        // If another render is using this page, PDF.js defers cleanup until it is safe.
        try { page?.cleanup(); } catch { /* A concurrently destroyed PDF is already released. */ }
      }
    }
    function changePage(number) {
      if (!loaded || !Number.isInteger(number) || number < 1 || number > descriptor.pageCount) {
        el("Page").value = String(pageNumber); message(`1〜${descriptor.pageCount}のページ番号を入力してください。`, true); return;
      }
      pageNumber = number; renderPage(pageNumber === ref.page);
    }
    el("Previous").addEventListener("click", () => changePage(pageNumber-1));
    el("Next").addEventListener("click", () => changePage(pageNumber+1));
    el("PageForm").addEventListener("submit", event => { event.preventDefault(); changePage(Number(el("Page").value)); });
    el("Reference").addEventListener("click", () => changePage(ref.page));
    el("ZoomOut").addEventListener("click", () => { zoom = Math.max(0.75, zoom-0.25); renderPage(true); });
    el("ZoomIn").addEventListener("click", () => { zoom = Math.min(3, zoom+0.25); renderPage(true); });
    el("Fit").addEventListener("click", () => { zoom = 1; renderPage(true); });
    el("Forget").addEventListener("click", () => {
      cancelLoad(); cancelRender();
      const previous = loaded; loaded = null; previous?.pdf.destroy().catch(() => {});
      controls(false); el("Canvas").width = 1; el("Canvas").height = 1; el("Highlights").replaceChildren();
      message("PDFをメモリから外しました。もう一度確認するときはPDFを選んでください。");
    });
    let resizeTimer;
    root.addEventListener("resize", () => {
      root.clearTimeout(resizeTimer); resizeTimer = root.setTimeout(() => { if (dialog.open) renderPage(true); }, 180);
    });
    return {close};
  }
  return {init, choiceLinks: (q, i) => choiceLinks(catalog, q, i), contentSignature, createCatalog,
    passageKey, validDriveViewLink, createPassageCatalog, loadPassages,
    renderChoiceLinks: choiceLinks, verifyFile, validRect, digest, createResourceFactory, renderSize};
});
