(() => {
  'use strict';
  const VERSION = '1.2.0';
  const $ = (id) => document.getElementById(id);
  $('ver').textContent = 'v' + VERSION;

  const ua = navigator.userAgent;
  const IS_IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const IS_MOBILE = IS_IOS || /Android/.test(ua);
  // Por encima de este tamaño la foto no cabe en un lienzo del navegador y se guarda por franjas (sin recortarla).
  const QMAX = +new URLSearchParams(location.search).get('maxpx');
  const MAX_EXPORT_PX = QMAX > 0 ? QMAX : (IS_IOS ? 16000000 : 64000000);
  const STRIP_ROWS = 256; // múltiplo de 16
  const PREVIEW_MAX = 1280;

  const PRESETS = self.PRESETS;
  const CATS = [{ id: 'all', name: 'Todos' }, ...self.PRESET_CATS];

  const state = {
    file: null, demo: true, orig: null, w: 0, h: 0, thumbSrc: null,
    cat: 'all', presetId: 'film', reqId: 0, inflight: false, dirty: false,
    proc: null, cache: null, renderKey: null, renderP: null, cmp: 0,
    thumbs: new Map(), idleTimer: 0, saving: false
  };

  const worker = new Worker('worker.js');
  const pending = new Map();
  let exportSeq = 1000000;
  let toastTimer = 0;

  /* ---------- utilidades ---------- */
  const dims = (b) => ({ w: b.width || b.naturalWidth, h: b.height || b.naturalHeight });
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms || 3200);
  }
  const setStatus = (s) => { $('status').textContent = s; };
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
  const presetById = (id) => PRESETS.find((p) => p.id === id);

  /* ---------- foto de ejemplo (para ver los presets antes de elegir una foto) ---------- */
  function makeSample() {
    const W = 960, H = 640, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, '#4c86d6'); g.addColorStop(0.7, '#a9cbe8'); g.addColorStop(1, '#f1dcc0');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(740, 130, 4, 740, 130, 150);
    g.addColorStop(0, '#fff6d8'); g.addColorStop(0.25, '#ffe6a8aa'); g.addColorStop(1, '#ffe6a800');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const ridge = (col, pts) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, H * 0.6); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(W, H * 0.6); x.closePath(); x.fill(); };
    ridge('#5f7f86', [[0, 330], [180, 250], [360, 320], [560, 230], [760, 320], [960, 270]]);
    ridge('#3f6b4f', [[0, 380], [220, 310], [420, 380], [640, 300], [960, 390]]);
    g = x.createLinearGradient(0, 330, 0, 430); g.addColorStop(0, '#5ba6b8'); g.addColorStop(1, '#2a6f86');
    x.fillStyle = g; x.fillRect(0, 380, W, 70);
    g = x.createLinearGradient(0, 430, 0, H); g.addColorStop(0, '#4f8a3e'); g.addColorStop(1, '#2a5a2a');
    x.fillStyle = g; x.fillRect(0, 430, W, H - 430);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const cols = ['#e8d44a', '#e0584a', '#f4f0e6', '#c26ab8'];
    for (let i = 0; i < 160; i++) { x.fillStyle = cols[i % 4]; x.beginPath(); x.arc(rnd() * W, 450 + rnd() * 180, 2 + rnd() * 3, 0, 7); x.fill(); }
    // persona: cabeza, pelo y camiseta
    x.fillStyle = '#2f6fb8'; x.beginPath(); x.roundRect(330, 470, 170, 180, 40); x.fill();
    x.fillStyle = '#d9a186'; x.beginPath(); x.ellipse(415, 410, 52, 64, 0, 0, 7); x.fill();
    x.fillStyle = '#4a2f22'; x.beginPath(); x.ellipse(415, 368, 58, 38, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#3a2a22'; x.beginPath(); x.arc(396, 410, 4, 0, 7); x.arc(434, 410, 4, 0, 7); x.fill();
    x.strokeStyle = '#a5594f'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.arc(415, 428, 16, 0.2, Math.PI - 0.2); x.stroke();
    x.filter = 'blur(1px)'; x.drawImage(c, 0, 0); x.filter = 'none';
    return c;
  }

  /* ---------- cargar imagen (ejemplo o foto del usuario) ---------- */
  function setSource(bmp, isDemo, label) {
    const { w, h } = dims(bmp);
    const sc = Math.min(1, PREVIEW_MAX / Math.max(w, h));
    const pw = Math.max(1, Math.round(w * sc)), ph = Math.max(1, Math.round(h * sc));
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, pw, ph);
    state.orig = x.getImageData(0, 0, pw, ph);
    state.w = pw; state.h = ph; state.fullW = w; state.fullH = h;
    state.thumbSrc = bmp; state.demo = isDemo; state.proc = null; state.cache = null; state.renderKey = null;
    state.thumbs.clear();
    for (const id of ['view', 'viewOrig']) { const v = $(id); v.width = pw; v.height = ph; }
    $('viewOrig').getContext('2d').putImageData(state.orig, 0, 0);
    $('view').getContext('2d').putImageData(state.orig, 0, 0);
    $('save').textContent = isDemo ? 'Elegir mi foto' : (IS_MOBILE && navigator.canShare ? 'Guardar en galería' : 'Guardar foto');
    $('change').hidden = isDemo;
    setStatus(label);
    renderStrip();
    selectPreset(state.presetId);
  }

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setStatus('Cargando…');
    let bmp;
    try { bmp = await decode(file); }
    catch (e) { setStatus('Foto de ejemplo'); toast('No pude abrir esa imagen. Prueba con una foto JPG o PNG.'); return; }
    state.file = file;
    const { w, h } = dims(bmp);
    setSource(bmp, false, `${w}×${h} px`);
    if (w * h > MAX_EXPORT_PX) toast(`Foto de ${(w * h / 1e6).toFixed(0)} MP: se guardará completa, sin recortar. Tardará un poco más.`, 5000);
  }

  /* ---------- categorías y rollo ---------- */
  function renderCats() {
    const box = $('cats'); box.innerHTML = '';
    for (const c of CATS) {
      const n = c.id === 'all' ? PRESETS.length : PRESETS.filter((p) => p.cat === c.id).length;
      const b = document.createElement('button');
      b.className = 'cat'; b.type = 'button'; b.role = 'tab';
      b.setAttribute('aria-selected', c.id === state.cat);
      b.innerHTML = `${c.name}<small>${n}</small>`;
      b.addEventListener('click', () => { state.cat = c.id; renderCats(); renderStrip(); $('strip').scrollLeft = 0; });
      box.append(b);
    }
  }

  function thumbFor(p) {
    if (state.thumbs.has(p.id)) return state.thumbs.get(p.id);
    const TW = 236, TH = 176, bmp = state.thumbSrc, { w, h } = dims(bmp);
    if (!state.thumbBase) {
      const s = Math.max(TW / w, TH / h);
      const base = document.createElement('canvas'); base.width = TW; base.height = TH;
      const bx = base.getContext('2d', { willReadFrequently: true });
      bx.imageSmoothingQuality = 'high';
      bx.drawImage(bmp, (TW - w * s) / 2, (TH - h * s) / 2, w * s, h * s);
      state.thumbBase = bx.getImageData(0, 0, TW, TH);
    }
    const img = new ImageData(new Uint8ClampedArray(state.thumbBase.data), TW, TH);
    if (p.id !== 'none') self.PresetEngine.processImage(img.data, TW, TH, p, { intensity: 1, grainScale: 0.35 });
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    cv.getContext('2d').putImageData(img, 0, 0);
    state.thumbs.set(p.id, cv);
    return cv;
  }

  function renderStrip() {
    state.thumbBase = null; // la base cambia con cada foto
    const list = state.cat === 'all' ? PRESETS : PRESETS.filter((p) => p.cat === state.cat);
    const reel = $('reel'); reel.innerHTML = '';
    const items = [{ id: 'none', name: 'Original', desc: 'Sin filtro' }, ...list];
    items.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'frame'; b.type = 'button'; b.dataset.id = p.id;
      b.setAttribute('aria-pressed', p.id === state.presetId);
      b.setAttribute('aria-label', p.name);
      const src = thumbFor(p);
      const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      const cap = document.createElement('div'); cap.className = 'cap';
      cap.innerHTML = `<i>${String(i).padStart(2, '0')}</i><span></span>`;
      cap.querySelector('span').textContent = p.name;
      b.append(cv, cap);
      b.addEventListener('click', () => selectPreset(p.id));
      reel.append(b);
    });
  }

  function selectPreset(id) {
    state.presetId = id; state.cache = null; state.renderKey = null;
    for (const b of $('reel').children) b.setAttribute('aria-pressed', b.dataset.id === id);
    const p = id === 'none' ? { name: 'Original', desc: 'Sin filtro' } : presetById(id);
    $('about').textContent = p ? p.desc : '';
    $('badge').textContent = p ? p.name : '';
    $('cube').disabled = id === 'none';
    requestPreview();
  }

  /* ---------- vista previa en segundo plano ---------- */
  function requestPreview() {
    if (!state.orig) return;
    if (state.inflight) { state.dirty = true; return; }
    state.inflight = true; state.dirty = false;
    const id = ++state.reqId;
    const copy = state.orig.data.slice();
    const pr = getParams();
    worker.postMessage({
      id, kind: 'preview', presetId: state.presetId, width: state.w, height: state.h,
      intensity: pr.intensity, adj: pr.adj, grainScale: pr.grainScale, seed: 1, buffer: copy.buffer
    }, [copy.buffer]);
    scheduleIdle();
  }

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.kind === 'preview') {
      state.inflight = false;
      const img = new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height);
      state.proc = img;
      $('view').getContext('2d').putImageData(img, 0, 0);
      if (state.dirty) requestPreview();
    } else if (m.kind === 'tbegin' || m.kind === 'tstrip' || m.kind === 'tend') {
      if (pending.has(m.id)) { pending.get(m.id)({ buffer: m.bytes, bytes: m.bytes }); pending.delete(m.id); }
    } else if (pending.has(m.id)) {
      pending.get(m.id)(new Uint8ClampedArray(m.buffer));
      pending.delete(m.id);
    }
  };

  /* En celular, deja la foto lista en segundo plano para que "Guardar" sea inmediato. */
  function scheduleIdle() {
    clearTimeout(state.idleTimer);
    if (!IS_MOBILE || state.demo || !navigator.canShare) return;
    if (state.fullW * state.fullH > MAX_EXPORT_PX) return; // las gigantes tardan: se procesan al tocar Guardar
    state.idleTimer = setTimeout(() => { renderFull().then(() => setStatus('Lista para guardar')).catch(() => {}); }, 1400);
  }

  /* ---------- comparar con el original (arrastrar) ---------- */
  const win = $('window'), handle = $('handle');
  function setCmp(p) {
    p = Math.max(0, Math.min(100, p)); state.cmp = p;
    $('stage').style.setProperty('--cmp', p + '%');
    handle.setAttribute('aria-valuenow', Math.round(p));
  }
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = win.getBoundingClientRect(); setCmp((e.clientX - r.left) / r.width * 100);
  });
  ['pointerup', 'pointercancel'].forEach((t) => handle.addEventListener(t, () => { dragging = false; }));
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { setCmp(state.cmp + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { setCmp(state.cmp - 5); e.preventDefault(); }
  });

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
    let exif = null; const icc = []; const iccAll = [];
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
  function renderFull() {
    const fmt = $('fmt').value, keep = $('keepmeta').checked;
    const key = JSON.stringify([state.file.name, state.file.size, state.presetId, getParams(), fmt, keep]);
    if (state.cache && state.cache.key === key) return Promise.resolve(state.cache);
    if (state.renderP && state.renderKey === key) return state.renderP;
    state.renderKey = key;
    state.renderP = doRender(key, fmt, keep).finally(() => { if (state.renderKey === key) state.renderP = null; });
    return state.renderP;
  }

  async function doRender(key, fmt, keep) {
    const file = state.file, presetId = state.presetId, pr = getParams();
    const ab = await file.arrayBuffer();
    const meta = keep ? extractMeta(ab) : null;
    const withP3 = !!(meta && meta.isP3 && p3Supported());

    const bmp = await decode(file);
    const { w, h } = dims(bmp);
    if (w * h > MAX_EXPORT_PX) return doRenderTiled(key, fmt, file, meta, bmp, w, h, withP3, presetId, pr);
    const cs = withP3 ? 'display-p3' : 'srgb';
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { colorSpace: cs, willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const img = cx.getImageData(0, 0, w, h, { colorSpace: cs });

    if (presetId !== 'none') {
      const id = ++exportSeq;
      const copy = img.data.slice();
      const out = await new Promise((res) => {
        pending.set(id, res);
        worker.postMessage({
          id, kind: 'export', presetId, width: w, height: h,
          intensity: pr.intensity, adj: pr.adj, grainScale: pr.grainScale, seed: 1, buffer: copy.buffer
        }, [copy.buffer]);
      });
      img.data.set(out);
    }
    cx.putImageData(img, 0, 0);

    const isPng = fmt === 'png';
    const q = fmt === 'jpg95' ? 0.95 : 1;
    let blob = await new Promise((res) => cv.toBlob(res, isPng ? 'image/png' : 'image/jpeg', q));
    if (!isPng && meta) blob = await injectMeta(blob, meta, withP3);
    const base = file.name.replace(/\.[^.]+$/, '');
    const result = { key, blob, name: `${base}_${presetId}.${isPng ? 'png' : 'jpg'}`, w, h };
    if (state.file === file) state.cache = result;
    return result;
  }


  /* Foto gigante: se procesa y codifica por franjas, así nunca hace falta un lienzo del tamaño completo. */
  const workerCall = (msg, transfer) => new Promise((res) => {
    const id = ++exportSeq; pending.set(id, res);
    worker.postMessage(Object.assign({ reqId: id }, msg), transfer || []);
  });
  async function doRenderTiled(key, fmt, file, meta, bmp, w, h, withP3, presetId, pr) {
    const quality = fmt === 'jpg95' ? 95 : 98, subsample = fmt === 'jpg95';
    const segments = [];
    if (meta && meta.exif) segments.push(meta.exif);
    if (meta && withP3) for (const s of meta.icc) segments.push(s);
    const jobId = ++exportSeq;
    const cs = withP3 ? 'display-p3' : 'srgb';
    const sc = document.createElement('canvas'); sc.width = w; sc.height = STRIP_ROWS;
    const cx = sc.getContext('2d', { colorSpace: cs, willReadFrequently: true });
    const parts = [];
    const take = (r) => new Uint8Array(r);
    try {
      parts.push(take((await workerCall({ kind: 'tbegin', id: jobId, width: w, height: h, quality, subsample, segments,
        presetId, intensity: pr.intensity, adj: pr.adj, grainScale: pr.grainScale, seed: 1 })).buffer));
      for (let y0 = 0; y0 < h; y0 += STRIP_ROWS) {
        if (state.renderKey !== key) { worker.postMessage({ kind: 'tabort', id: jobId }); throw new Error('cancelado'); }
        const rows = Math.min(STRIP_ROWS, h - y0);
        cx.clearRect(0, 0, w, STRIP_ROWS);
        cx.drawImage(bmp, 0, y0, w, rows, 0, 0, w, rows);
        const img = cx.getImageData(0, 0, w, rows, { colorSpace: cs });
        const out = await workerCall({ kind: 'tstrip', id: jobId, y0, rows, buffer: img.data.buffer }, [img.data.buffer]);
        parts.push(new Uint8Array(out.bytes));
        if (state.onProgress) state.onProgress(Math.round((y0 + rows) / h * 100));
      }
      parts.push(new Uint8Array((await workerCall({ kind: 'tend', id: jobId })).bytes));
    } finally { if (bmp.close) bmp.close(); }
    const blob = new Blob(parts, { type: 'image/jpeg' });
    const base = file.name.replace(/\.[^.]+$/, '');
    const result = { key, blob, name: `${base}_${presetId}.jpg`, w, h, tiled: true };
    if (state.file === file) state.cache = result;
    return result;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  function setSaving(on, label) {
    state.saving = on;
    $('save').disabled = on; $('saveFile').disabled = on;
    if (label) $('save').textContent = label;
  }
  const idleLabel = () => (state.demo ? 'Elegir mi foto' : (IS_MOBILE && navigator.canShare ? 'Guardar en galería' : 'Guardar foto'));

  /* Guardar: en celular abre la hoja de compartir (ahí se toca "Guardar imagen" y queda en la galería);
     en computadora descarga el archivo. */
  async function onSave() {
    if (state.demo) { $('file').click(); return; }
    if (state.saving) return;
    const wasReady = !!(state.cache && state.cache.key === JSON.stringify([state.file.name, state.file.size, state.presetId, getParams(), $('fmt').value, $('keepmeta').checked]));
    setSaving(true, wasReady ? 'Abriendo…' : 'Preparando foto…');
    state.onProgress = (p) => { $('save').textContent = `Procesando ${p}%`; };
    try {
      const r = await renderFull();
      if (r.tiled && $('fmt').value === 'png') toast('Foto muy grande: se guardó como JPG para conservar todos sus píxeles.', 5000);
      const f = new File([r.blob], r.name, { type: r.blob.type });
      if (IS_MOBILE && navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f] });
        toast(IS_IOS ? 'Si tocaste “Guardar imagen”, ya está en tu galería.' : 'Listo.');
      } else {
        downloadBlob(r.blob, r.name);
        toast(`Guardada: ${r.name} (${r.w}×${r.h} px, ${(r.blob.size / 1048576).toFixed(1)} MB)`);
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') toast('La foto ya está lista. Toca “Guardar en galería” otra vez.', 5000);
      else if (e.name !== 'AbortError') toast('No se pudo guardar: ' + e.message, 5000);
    }
    state.onProgress = null;
    setSaving(false, idleLabel());
  }

  async function onSaveFile() {
    if (state.demo) { $('file').click(); return; }
    setSaving(true);
    state.onProgress = (p) => { $('saveFile').textContent = `Procesando ${p}%`; };
    try {
      const r = await renderFull();
      downloadBlob(r.blob, r.name);
      toast(`Descargada: ${r.name} (${r.w}×${r.h} px, ${(r.blob.size / 1048576).toFixed(1)} MB)`);
    } catch (e) { toast('No se pudo exportar: ' + e.message, 5000); }
    state.onProgress = null; $('saveFile').textContent = 'Descargar como archivo';
    setSaving(false, idleLabel());
  }

  function onCube() {
    const p = presetById(state.presetId);
    if (!p) return;
    const pr = getParams();
    const text = self.PresetEngine.makeCube(p, p.name, 33, { intensity: pr.intensity, adj: pr.adj });
    downloadBlob(new Blob([text], { type: 'text/plain' }), 'filmfer-' + p.id + '.cube');
    toast('LUT guardado. Incluye color y contraste; el grano y la viñeta no viajan en un LUT.', 5000);
  }

  /* ---------- hoja de ajustes ---------- */
  const sheet = $('sheet'), backdrop = $('backdrop');
  const openSheet = (on) => { sheet.classList.toggle('open', on); backdrop.classList.toggle('on', on); };
  $('openSheet').addEventListener('click', () => openSheet(true));
  $('closeSheet').addEventListener('click', () => openSheet(false));
  backdrop.addEventListener('click', () => openSheet(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSheet(false); });

  /* ---------- eventos ---------- */
  $('file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('change').addEventListener('click', () => $('file').click());
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));
  document.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

  for (const id of ['intensity', 'grain', 'ev', 'temp', 'sat', 'contrast']) {
    $(id).addEventListener('input', () => { refreshOutputs(); state.cache = null; state.renderKey = null; requestPreview(); });
  }
  for (const id of ['fmt', 'keepmeta']) $(id).addEventListener('change', () => { state.cache = null; state.renderKey = null; scheduleIdle(); });
  $('save').addEventListener('click', onSave);
  $('saveFile').addEventListener('click', onSaveFile);
  $('cube').addEventListener('click', onCube);
  refreshOutputs();
  renderCats();
  self.__presetsTest = { renderFull, state, selectPreset, loadFile };

  /* ---------- arranque ---------- */
  setSource(makeSample(), true, 'Foto de ejemplo');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
