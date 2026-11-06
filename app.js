(() => {
  'use strict';
  const VERSION = '1.0.0';
  const $ = (id) => document.getElementById(id);
  $('ver').textContent = 'v' + VERSION;

  const ua = navigator.userAgent;
  const IS_IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const MAX_EXPORT_PX = IS_IOS ? 16777216 : 64000000; // límite de lienzo del navegador
  const PREVIEW_MAX = 1280;

  const PRESETS = self.PRESETS;
  const LIST = [{ id: 'none', name: 'Original', desc: 'Sin filtro' }, ...PRESETS];

  const state = {
    file: null, orig: null, w: 0, h: 0, thumbSrc: null,
    presetId: PRESETS[0].id, reqId: 0, inflight: false, dirty: false,
    holding: false, proc: null, cache: null
  };

  const worker = new Worker('worker.js');
  const pending = new Map();
  let exportSeq = 1000000;

  /* ---------- helpers ---------- */
  const dims = (b) => ({ w: b.width || b.naturalWidth, h: b.height || b.naturalHeight });
  async function decode(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      const url = URL.createObjectURL(file);
      const img = new Image(); img.src = url;
      try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
      return img;
    }
  }
  function getParams() {
    return {
      intensity: +$('intensity').value / 100,
      grainScale: +$('grain').value / 100,
      adj: {
        ev: +$('ev').value / 100,
        temp: +$('temp').value / 100,
        sat: +$('sat').value / 100,
        contrast: +$('contrast').value / 100 * 0.6
      }
    };
  }
  function refreshOutputs() {
    for (const id of ['intensity', 'grain', 'ev', 'temp', 'sat', 'contrast']) {
      const el = $(id), v = +el.value;
      el.parentElement.querySelector('output').textContent =
        (id === 'intensity' || id === 'grain') ? v + '%' : (v > 0 ? '+' + v : '' + v);
    }
  }
  const setBusy = (txt) => { const b = $('busy'); b.textContent = txt || 'Procesando…'; b.style.display = txt === false ? 'none' : 'block'; };

  /* ---------- carga de foto ---------- */
  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    state.file = file; state.cache = null;
    setBusy('Cargando…'); $('stage').style.display = 'block';
    let bmp;
    try { bmp = await decode(file); }
    catch (e) { setBusy(false); alert('No pude abrir esa imagen. Prueba con una foto JPG o PNG.'); return; }
    const { w, h } = dims(bmp);
    const sc = Math.min(1, PREVIEW_MAX / Math.max(w, h));
    const pw = Math.max(1, Math.round(w * sc)), ph = Math.max(1, Math.round(h * sc));
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, pw, ph);
    state.orig = x.getImageData(0, 0, pw, ph);
    state.w = pw; state.h = ph;
    state.fullW = w; state.fullH = h;
    state.thumbSrc = bmp;

    $('view').width = pw; $('view').height = ph;
    $('view').getContext('2d').putImageData(state.orig, 0, 0);
    $('drop').style.display = 'none';
    $('editor').hidden = false;
    buildThumbs();
    selectPreset(state.presetId, true);
    const mp = (w * h / 1e6).toFixed(1);
    $('note').textContent = `Foto: ${w}×${h} px (${mp} MP). ` +
      (w * h > MAX_EXPORT_PX ? 'Es más grande de lo que este navegador puede exportar; se reducirá un poco al guardar.' : 'Se exporta a su resolución original.');
  }

  /* ---------- miniaturas ---------- */
  function buildThumbs() {
    const strip = $('strip'); strip.innerHTML = '';
    const bmp = state.thumbSrc, { w, h } = dims(bmp);
    const TW = 208, TH = 156;
    const s = Math.max(TW / w, TH / h);
    const base = document.createElement('canvas'); base.width = TW; base.height = TH;
    const bx = base.getContext('2d', { willReadFrequently: true });
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(bmp, (TW - w * s) / 2, (TH - h * s) / 2, w * s, h * s);
    const src = bx.getImageData(0, 0, TW, TH);
    for (const p of LIST) {
      const b = document.createElement('button');
      b.className = 'th'; b.dataset.id = p.id; b.type = 'button';
      const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
      const img = new ImageData(new Uint8ClampedArray(src.data), TW, TH);
      if (p.id !== 'none') self.PresetEngine.processImage(img.data, TW, TH, p, { intensity: 1, grainScale: 0.35 });
      cv.getContext('2d').putImageData(img, 0, 0);
      const sp = document.createElement('span'); sp.textContent = p.name;
      b.append(cv, sp);
      b.addEventListener('click', () => selectPreset(p.id));
      strip.append(b);
    }
  }

  function selectPreset(id, silent) {
    state.presetId = id; state.cache = null;
    for (const b of $('strip').children) b.classList.toggle('on', b.dataset.id === id);
    const p = LIST.find((q) => q.id === id);
    $('desc').textContent = p ? p.desc : '';
    $('badge').textContent = p ? p.name : '';
    $('cube').disabled = id === 'none';
    requestPreview();
  }

  /* ---------- vista previa (en segundo plano) ---------- */
  function requestPreview() {
    if (!state.orig) return;
    if (state.inflight) { state.dirty = true; return; }
    state.inflight = true; state.dirty = false;
    const id = ++state.reqId;
    setBusy('Procesando…');
    const copy = state.orig.data.slice();
    const pr = getParams();
    worker.postMessage({
      id, kind: 'preview', presetId: state.presetId, width: state.w, height: state.h,
      intensity: pr.intensity, adj: pr.adj, grainScale: pr.grainScale, seed: 1, buffer: copy.buffer
    }, [copy.buffer]);
  }

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.kind === 'preview') {
      state.inflight = false;
      const img = new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height);
      state.proc = img;
      if (!state.holding) $('view').getContext('2d').putImageData(img, 0, 0);
      if (state.dirty) requestPreview(); else setBusy(false);
    } else if (pending.has(m.id)) {
      pending.get(m.id)(new Uint8ClampedArray(m.buffer));
      pending.delete(m.id);
    }
  };

  function showOriginal(on) {
    state.holding = on;
    const p = LIST.find((q) => q.id === state.presetId);
    $('badge').textContent = on ? 'Original' : (p ? p.name : '');
    const img = on ? state.orig : (state.proc || state.orig);
    $('view').getContext('2d').putImageData(img, 0, 0);
  }

  /* ---------- metadatos JPEG (EXIF + perfil de color) ---------- */
  function parseJpeg(u) {
    if (u[0] !== 0xFF || u[1] !== 0xD8) return null;
    const segs = []; let i = 2;
    while (i + 4 <= u.length) {
      if (u[i] !== 0xFF) break;
      const m = u[i + 1];
      if (m === 0xDA || m === 0xD9) break;
      const len = (u[i + 2] << 8) | u[i + 3];
      segs.push({ m, start: i, end: i + 2 + len });
      i += 2 + len;
    }
    return { segs, scan: i };
  }
  const asciiAt = (u, o, s) => { for (let k = 0; k < s.length; k++) if (u[o + k] !== s.charCodeAt(k)) return false; return true; };
  function hasText(u, text) { // busca texto en ASCII o UTF-16BE
    const a = [...text].map((c) => c.charCodeAt(0));
    outer: for (let i = 0; i + a.length <= u.length; i++) {
      for (let k = 0; k < a.length; k++) if (u[i + k] !== a[k]) continue outer;
      return true;
    }
    outer2: for (let i = 0; i + a.length * 2 <= u.length; i++) {
      for (let k = 0; k < a.length; k++) if (u[i + k * 2] !== 0 || u[i + k * 2 + 1] !== a[k]) continue outer2;
      return true;
    }
    return false;
  }
  function patchOrientation(seg) { // pone Orientation=1 (los píxeles ya salen derechos)
    const t = 10, le = seg[t] === 0x49;
    const r16 = (o) => (le ? seg[o] | (seg[o + 1] << 8) : (seg[o] << 8) | seg[o + 1]);
    const r32 = (o) => (le ? (seg[o] | (seg[o + 1] << 8) | (seg[o + 2] << 16) | (seg[o + 3] << 24)) >>> 0
                           : ((seg[o] << 24) | (seg[o + 1] << 16) | (seg[o + 2] << 8) | seg[o + 3]) >>> 0);
    const ifd = t + r32(t + 4);
    if (ifd + 2 > seg.length) return;
    const n = r16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > seg.length) break;
      if (r16(e) === 0x0112) { if (le) { seg[e + 8] = 1; seg[e + 9] = 0; } else { seg[e + 8] = 0; seg[e + 9] = 1; } }
    }
  }
  function extractMeta(ab) {
    const u = new Uint8Array(ab), p = parseJpeg(u);
    if (!p) return null;
    let exif = null; const icc = []; let iccAll = [];
    for (const s of p.segs) {
      if (s.m === 0xE1 && asciiAt(u, s.start + 4, 'Exif\0\0') && !exif) { exif = u.slice(s.start, s.end); patchOrientation(exif); }
      if (s.m === 0xE2 && asciiAt(u, s.start + 4, 'ICC_PROFILE\0')) { icc.push(u.slice(s.start, s.end)); iccAll.push(...u.subarray(s.start + 18, s.end)); }
    }
    return { exif, icc, isP3: iccAll.length > 0 && hasText(Uint8Array.from(iccAll), 'Display P3') };
  }
  async function injectMeta(blob, meta, withIcc) {
    const u = new Uint8Array(await blob.arrayBuffer()), p = parseJpeg(u);
    if (!p) return blob;
    const parts = [u.subarray(0, 2)];
    const keep = [];
    for (const s of p.segs) {
      const isExif = s.m === 0xE1 && asciiAt(u, s.start + 4, 'Exif\0\0');
      const isIcc = s.m === 0xE2 && asciiAt(u, s.start + 4, 'ICC_PROFILE\0');
      if (isExif || isIcc) continue;
      keep.push(s);
    }
    for (const s of keep) if (s.m === 0xE0) parts.push(u.subarray(s.start, s.end)); // JFIF primero
    if (meta.exif) parts.push(meta.exif);
    if (withIcc) for (const s of meta.icc) parts.push(s);
    for (const s of keep) if (s.m !== 0xE0) parts.push(u.subarray(s.start, s.end));
    parts.push(u.subarray(p.scan));
    return new Blob(parts, { type: 'image/jpeg' });
  }
  function p3Supported() {
    try {
      const c = document.createElement('canvas').getContext('2d', { colorSpace: 'display-p3' });
      return !!(c && c.getContextAttributes && c.getContextAttributes().colorSpace === 'display-p3');
    } catch (e) { return false; }
  }

  /* ---------- exportar a resolución completa ---------- */
  async function renderFull() {
    const fmt = $('fmt').value, keep = $('keepmeta').checked;
    const key = JSON.stringify([state.file.name, state.file.size, state.presetId, getParams(), fmt, keep]);
    if (state.cache && state.cache.key === key) return state.cache;

    setBusy('Procesando a calidad completa…');
    const ab = await state.file.arrayBuffer();
    const meta = keep ? extractMeta(ab) : null;
    const withP3 = !!(meta && meta.isP3 && p3Supported());

    const bmp = await decode(state.file);
    let { w, h } = dims(bmp);
    if (w * h > MAX_EXPORT_PX) { const s = Math.sqrt(MAX_EXPORT_PX / (w * h)); w = Math.floor(w * s); h = Math.floor(h * s); }
    const cs = withP3 ? 'display-p3' : 'srgb';
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { colorSpace: cs, willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const img = cx.getImageData(0, 0, w, h, { colorSpace: cs });

    if (state.presetId !== 'none') {
      const pr = getParams(), id = ++exportSeq;
      const copy = img.data.slice();
      const out = await new Promise((res) => {
        pending.set(id, res);
        worker.postMessage({
          id, kind: 'export', presetId: state.presetId, width: w, height: h,
          intensity: pr.intensity, adj: pr.adj, grainScale: pr.grainScale, seed: 1, buffer: copy.buffer
        }, [copy.buffer]);
      });
      img.data.set(out);
    }
    cx.putImageData(img, 0, 0);

    const isPng = fmt === 'png';
    const type = isPng ? 'image/png' : 'image/jpeg';
    const q = fmt === 'jpg95' ? 0.95 : 1;
    let blob = await new Promise((res) => cv.toBlob(res, type, q));
    if (!isPng && meta) blob = await injectMeta(blob, meta, withP3);
    const base = state.file.name.replace(/\.[^.]+$/, '');
    const name = `${base}_${state.presetId}.${isPng ? 'png' : 'jpg'}`;
    state.cache = { key, blob, name, w, h };
    setBusy(false);
    return state.cache;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  async function onSave() {
    const btn = $('save'); btn.disabled = true;
    try {
      const r = await renderFull();
      downloadBlob(r.blob, r.name);
      $('note').textContent = `Listo: ${r.name} · ${r.w}×${r.h} px · ${(r.blob.size / 1048576).toFixed(1)} MB`;
    } catch (e) { setBusy(false); $('note').textContent = 'No se pudo exportar: ' + e.message; }
    btn.disabled = false;
  }
  async function onShare() {
    const btn = $('share'); btn.disabled = true;
    try {
      const r = await renderFull();
      const f = new File([r.blob], r.name, { type: r.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
      else downloadBlob(r.blob, r.name);
    } catch (e) {
      if (e.name === 'NotAllowedError') $('note').textContent = 'La foto ya está lista. Toca el botón otra vez para guardarla.';
      else if (e.name !== 'AbortError') $('note').textContent = 'No se pudo compartir: ' + e.message;
    }
    setBusy(false); btn.disabled = false;
  }
  function onCube() {
    const p = PRESETS.find((q) => q.id === state.presetId);
    if (!p) return;
    const pr = getParams();
    const text = self.PresetEngine.makeCube(p, p.name, 33, { intensity: pr.intensity, adj: pr.adj });
    downloadBlob(new Blob([text], { type: 'text/plain' }), p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + '.cube');
    $('note').textContent = 'LUT guardado. Incluye color y contraste; el grano y la viñeta no viajan en un LUT.';
  }

  /* ---------- eventos ---------- */
  $('file').addEventListener('change', (e) => loadFile(e.target.files[0]));
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

  $('change').addEventListener('click', () => {
    $('file').value = ''; $('editor').hidden = true; $('stage').style.display = 'none';
    drop.style.display = 'grid'; state.orig = null; state.proc = null;
  });
  const hold = $('hold');
  hold.addEventListener('pointerdown', (e) => { hold.setPointerCapture(e.pointerId); showOriginal(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => hold.addEventListener(t, () => { if (state.holding) showOriginal(false); }));

  for (const id of ['intensity', 'grain', 'ev', 'temp', 'sat', 'contrast']) {
    $(id).addEventListener('input', () => { refreshOutputs(); state.cache = null; requestPreview(); });
  }
  for (const id of ['fmt', 'keepmeta']) $(id).addEventListener('change', () => { state.cache = null; });
  $('save').addEventListener('click', onSave);
  $('share').addEventListener('click', onShare);
  $('cube').addEventListener('click', onCube);
  if (navigator.canShare && IS_IOS) $('share').hidden = false;
  refreshOutputs();
  self.__presetsTest = { renderFull, state, selectPreset }; // gancho para pruebas automáticas

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
