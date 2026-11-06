/* Procesa en segundo plano para que la página no se congele. */
importScripts('engine.js', 'presets.js');

self.onmessage = (e) => {
  const m = e.data;
  const preset = self.PRESETS.find((p) => p.id === m.presetId);
  const data = new Uint8ClampedArray(m.buffer);
  if (preset) {
    self.PresetEngine.processImage(data, m.width, m.height, preset, {
      intensity: m.intensity, adj: m.adj, grainScale: m.grainScale, seed: m.seed
    });
  }
  self.postMessage({ id: m.id, kind: m.kind, width: m.width, height: m.height, buffer: data.buffer }, [data.buffer]);
};
