/* Procesa en segundo plano para que la página no se congele.
   - kind 'preview' / 'export': procesa una imagen completa.
   - kind 'tbegin' / 'tstrip' / 'tend' / 'tabort': guarda fotos gigantes por franjas (JPEG por franjas). */
importScripts('engine.js', 'presets.js', 'jpegenc.js');

const jobs = new Map(); // id -> { enc, preset, opts, w, h }

self.onmessage = (e) => {
  const m = e.data;

  if (m.kind === 'tbegin') {
    const enc = new self.StreamingJpegEncoder({
      width: m.width, height: m.height, quality: m.quality, subsample: m.subsample, segments: m.segments || []
    });
    jobs.set(m.id, {
      enc, w: m.width, h: m.height,
      preset: self.PRESETS.find((p) => p.id === m.presetId),
      opts: { intensity: m.intensity, adj: m.adj, grainScale: m.grainScale, seed: m.seed }
    });
    const head = enc.header();
    self.postMessage({ id: m.reqId, kind: 'tbegin', bytes: head.buffer }, [head.buffer]);
    return;
  }
  if (m.kind === 'tstrip') {
    const j = jobs.get(m.id);
    const data = new Uint8ClampedArray(m.buffer);
    if (j.preset) {
      self.PresetEngine.processImage(data, j.w, m.rows, j.preset,
        Object.assign({}, j.opts, { fullW: j.w, fullH: j.h, y0: m.y0 }));
    }
    const bytes = j.enc.encodeStrip(data, m.rows);
    self.postMessage({ id: m.reqId, kind: 'tstrip', bytes: bytes.buffer }, [bytes.buffer]);
    return;
  }
  if (m.kind === 'tend') {
    const j = jobs.get(m.id);
    const bytes = j.enc.finish();
    jobs.delete(m.id);
    self.postMessage({ id: m.reqId, kind: 'tend', bytes: bytes.buffer }, [bytes.buffer]);
    return;
  }
  if (m.kind === 'tabort') { jobs.delete(m.id); return; }

  const preset = self.PRESETS.find((p) => p.id === m.presetId);
  const data = new Uint8ClampedArray(m.buffer);
  if (preset) {
    self.PresetEngine.processImage(data, m.width, m.height, preset, {
      intensity: m.intensity, adj: m.adj, grainScale: m.grainScale, seed: m.seed
    });
  }
  self.postMessage({ id: m.id, kind: m.kind, width: m.width, height: m.height, buffer: data.buffer }, [data.buffer]);
};
