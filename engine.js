/* Motor de filtros — trabaja a resolución completa, en flotantes, con dither final.
   Funciona en navegador, Web Worker y Node (para pruebas). */
(function (root) {
  'use strict';

  // ---- Tablas de conversión sRGB <-> lineal ----
  const N = 4096;
  const G2L = new Float32Array(N + 1);
  const L2G = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const c = i / N;
    G2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    L2G[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }
  const toGamma = (l) => (l <= 0 ? 0 : l >= 1 ? 1 : L2G[(l * N + 0.5) | 0]);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // ---- Bandas de color (tipo HSL de Lightroom) ----
  const BAND_CENTER = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 225, purple: 270, magenta: 320 };
  const BAND_WIDTH = 45;

  function hueToRgb(h) { // h en grados, s=1, l=0.5 -> [r,g,b]
    h = ((h % 360) + 360) % 360;
    const x = 1 - Math.abs(((h / 60) % 2) - 1);
    if (h < 60) return [1, x, 0];
    if (h < 120) return [x, 1, 0];
    if (h < 180) return [0, 1, x];
    if (h < 240) return [0, x, 1];
    if (h < 300) return [x, 0, 1];
    return [1, 0, x];
  }

  // ---- Preparación de parámetros (se hace una vez por imagen) ----
  function prepare(preset, adj, opts) {
    adj = adj || {}; opts = opts || {};
    const p = Object.assign({
      ev: 0, temp: 0, tint: 0, shadows: 0, highlights: 0, contrast: 0,
      lift: 0, drop: 0, sat: 0, vib: 0, bands: null, split: null, mono: null, vig: 0, grain: null
    }, preset);
    p.ev += adj.ev || 0;
    p.temp += adj.temp || 0;
    p.sat += adj.sat || 0;
    p.contrast += adj.contrast || 0;
    p.gain = Math.pow(2, p.ev);
    // curvas por canal: [sombras, medios, luces], cada valor -1..1 (±0.1 de señal)
    p.curv = null;
    if (p.curves) {
      const z = [0, 0, 0];
      p.curv = { r: p.curves.r || z, g: p.curves.g || z, b: p.curves.b || z };
    }
    p.rGain = 1 + 0.22 * p.temp;
    p.bGain = 1 - 0.22 * p.temp;
    p.gGain = 1 - 0.12 * p.tint;

    p.bandList = [];
    if (p.bands) {
      for (const k of Object.keys(p.bands)) {
        const b = p.bands[k];
        p.bandList.push({ c: BAND_CENTER[k], h: b.h || 0, s: b.s || 0, l: b.l || 0 });
      }
    }
    p.hasBands = p.bandList.length > 0;

    p.sh = null; p.hi = null; p.mid = null;
    if (p.split) {
      if (p.split.mid) p.mid = { rgb: hueToRgb(p.split.mid[0]), amt: p.split.mid[1] };
      if (p.split.sh) p.sh = { rgb: hueToRgb(p.split.sh[0]), amt: p.split.sh[1] };
      if (p.split.hi) p.hi = { rgb: hueToRgb(p.split.hi[0]), amt: p.split.hi[1] };
      p.bal = p.split.bal || 0;
    }
    p.grainAmt = p.grain ? p.grain.amt * (opts.grainScale == null ? 1 : opts.grainScale) : 0;
    p.grainSize = p.grain ? p.grain.size : 1;
    return p;
  }

  // ---- Núcleo de color: píxel (gamma 0..1) -> píxel (gamma 0..1) ----
  const O = new Float32Array(3);
  function core(r, g, b, P) {
    // 1) Exposición y balance de blancos en luz lineal
    let lr = G2L[(r * N + 0.5) | 0] * P.gain * P.rGain;
    let lg = G2L[(g * N + 0.5) | 0] * P.gain * P.gGain;
    let lb = G2L[(b * N + 0.5) | 0] * P.gain * P.bGain;
    r = toGamma(lr); g = toGamma(lg); b = toGamma(lb);

    // 2) Sombras / altas luces
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (P.shadows || P.highlights) {
      const d = P.shadows * 0.5 * Math.pow(1 - y, 3) + P.highlights * 0.5 * Math.pow(y, 2.5);
      r = clamp01(r + d); g = clamp01(g + d); b = clamp01(b + d);
    }

    // 3) Contraste (curva S suave)
    const c = P.contrast;
    if (c > 0) {
      r += (r * r * (3 - 2 * r) - r) * c;
      g += (g * g * (3 - 2 * g) - g) * c;
      b += (b * b * (3 - 2 * b) - b) * c;
    } else if (c < 0) {
      const k = 1 + c;
      r = 0.5 + (r - 0.5) * k; g = 0.5 + (g - 0.5) * k; b = 0.5 + (b - 0.5) * k;
    }

    // 4) Negros levantados / blancos suavizados (efecto película)
    if (P.lift) { const L = P.lift; r = r * (1 - L) + L; g = g * (1 - L) + L; b = b * (1 - L) + L; }
    if (P.drop) { const D = 1 - P.drop; r *= D; g *= D; b *= D; }

    // 5) Saturación y vibrance
    if (P.sat || P.vib) {
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let k = 1 + P.sat + P.vib * (1 - (mx - mn));
      if (k < 0) k = 0;
      r = y + (r - y) * k; g = y + (g - y) * k; b = y + (b - y) * k;
    }
    r = clamp01(r); g = clamp01(g); b = clamp01(b);

    // 6) Ajustes por color (matiz / saturación / luminosidad por banda)
    if (P.hasBands) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const d = mx - mn;
      if (d > 0.002) {
        let h;
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
        const l = (mx + mn) / 2;
        let s = d / (1 - Math.abs(2 * l - 1));
        let dh = 0, ds = 0, dl = 0;
        for (let i = 0; i < P.bandList.length; i++) {
          const B = P.bandList[i];
          let dist = Math.abs(h - B.c); if (dist > 180) dist = 360 - dist;
          const w = 1 - dist / BAND_WIDTH;
          if (w > 0) { dh += B.h * w; ds += B.s * w; dl += B.l * w; }
        }
        h = (h + dh * Math.min(1, s * 1.5) + 360) % 360;
        s = clamp01(s * (1 + ds));
        const l2 = clamp01(l + dl * 0.25 * s);
        // HSL -> RGB
        const C = (1 - Math.abs(2 * l2 - 1)) * s;
        const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l2 - C / 2;
        let rr, gg, bb;
        if (h < 60) { rr = C; gg = X; bb = 0; }
        else if (h < 120) { rr = X; gg = C; bb = 0; }
        else if (h < 180) { rr = 0; gg = C; bb = X; }
        else if (h < 240) { rr = 0; gg = X; bb = C; }
        else if (h < 300) { rr = X; gg = 0; bb = C; }
        else { rr = C; gg = 0; bb = X; }
        r = rr + m; g = gg + m; b = bb + m;
      }
    }

    // 7) Blanco y negro (mezcla de canales)
    if (P.mono) {
      const m = clamp01(r * P.mono.r + g * P.mono.g + b * P.mono.b);
      r = g = b = m;
    }

    // 8) Tono dividido (sombras / luces)
    if (P.sh || P.hi || P.mid) {
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const t = clamp01(y + P.bal * 0.5);
      if (P.mid) {
        const w = 4 * t * (1 - t) * P.mid.amt;
        const q = P.mid.rgb, ql = 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
        r += (q[0] - ql) * w; g += (q[1] - ql) * w; b += (q[2] - ql) * w;
      }
      if (P.sh) {
        const w = (1 - t) * (1 - t) * P.sh.amt;
        const q = P.sh.rgb, ql = 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
        r += (q[0] - ql) * w; g += (q[1] - ql) * w; b += (q[2] - ql) * w;
      }
      if (P.hi) {
        const w = t * t * P.hi.amt;
        const q = P.hi.rgb, ql = 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
        r += (q[0] - ql) * w; g += (q[1] - ql) * w; b += (q[2] - ql) * w;
      }
    }

    // 9) Curvas por canal (cross-process, tintes de película)
    if (P.curv) {
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const wl = (1 - y) * (1 - y), wh = y * y, wm = 4 * y * (1 - y);
      const cr = P.curv.r, cg = P.curv.g, cb = P.curv.b;
      r += 0.1 * (cr[0] * wl + cr[1] * wm + cr[2] * wh);
      g += 0.1 * (cg[0] * wl + cg[1] * wm + cg[2] * wh);
      b += 0.1 * (cb[0] * wl + cb[1] * wm + cb[2] * wh);
    }

    O[0] = clamp01(r); O[1] = clamp01(g); O[2] = clamp01(b);
  }

  // ---- Ruido determinista (grano y dither) ----
  function hash(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* Procesa un ImageData.data (RGBA 8 bits) EN SITIO.
     opts: { intensity 0..1, adj:{ev,temp,sat,contrast}, grainScale, spatial (false = sin efectos de posición), seed,
             fullW, fullH, y0 (para procesar por franjas; y0 debe ser múltiplo de 128) }
     Efectos de posición del preset: pixel (divisiones del lado largo), levels, palette, rgbShift, scan, leak, vig, grain. */
  function processImage(data, w, h, preset, opts) {
    opts = opts || {};
    const intensity = opts.intensity == null ? 1 : opts.intensity;
    const spatial = opts.spatial !== false;
    const seed = opts.seed || 1;
    const P = prepare(preset, opts.adj, opts);
    // Si se procesa por franjas: fullW/fullH = tamaño de la foto entera, y0 = fila donde empieza esta franja
    const FW = opts.fullW || w, FH = opts.fullH || h, Y0 = opts.y0 || 0;
    const maxDim = Math.max(FW, FH);
    const cell = Math.max(1, Math.round(P.grainSize * maxDim / 2000));
    const doGrain = spatial && P.grainAmt > 0;
    const vig = spatial ? P.vig : 0;
    const hw = FW / 2, hh = FH / 2;
    const GR = 0.09; // amplitud máxima del grano (fracción de 1)

    // Pixelado: bloques de tamaño potencia de 2 (divide las franjas de 256 filas, así no hay costuras)
    let B = 0, bw = 0, bavg = null;
    if (spatial && P.pixel) {
      const t = Math.round(maxDim / P.pixel);
      B = Math.min(128, Math.max(2, Math.pow(2, Math.round(Math.log2(Math.max(2, t))))));
      bw = Math.ceil(w / B);
      const bh = Math.ceil(h / B);
      bavg = new Float32Array(bw * bh * 3);
      const cnt = new Float32Array(bw * bh);
      for (let y = 0; y < h; y++) {
        const by = (y / B) | 0;
        for (let x = 0, i = y * w * 4; x < w; x++, i += 4) {
          const k = by * bw + ((x / B) | 0);
          bavg[k * 3] += data[i]; bavg[k * 3 + 1] += data[i + 1]; bavg[k * 3 + 2] += data[i + 2]; cnt[k]++;
        }
      }
      for (let k = 0; k < cnt.length; k++) {
        const c = (cnt[k] || 1) * 255;
        bavg[k * 3] /= c; bavg[k * 3 + 1] /= c; bavg[k * 3 + 2] /= c;
      }
    }
    const SH = spatial && P.rgbShift ? Math.max(1, Math.round(P.rgbShift * maxDim)) : 0;
    const rowBuf = SH ? new Uint8ClampedArray(w * 4) : null;
    const scanP = spatial && P.scan ? Math.max(2, Math.round(FH / P.scan.lines)) : 0;
    const LV = spatial && P.levels ? P.levels : 0;
    const pal = spatial && P.palette ? P.palette : null;
    const leak = spatial && P.leak ? { x: P.leak.x, y: P.leak.y, rad: P.leak.rad, amt: P.leak.amt, c: hueToRgb(P.leak.hue) } : null;

    for (let y = 0, i = 0; y < h; y++) {
      const Y = y + Y0;
      const gy = (Y / cell) | 0;
      const ny = (Y - hh) / hh;
      if (SH) rowBuf.set(data.subarray(i, i + w * 4));
      for (let x = 0; x < w; x++, i += 4) {
        const r0 = data[i] / 255, g0 = data[i + 1] / 255, b0 = data[i + 2] / 255;
        let sr = r0, sg = g0, sb = b0;
        if (B) {
          const k = (((y / B) | 0) * bw + ((x / B) | 0)) * 3;
          sr = bavg[k]; sg = bavg[k + 1]; sb = bavg[k + 2];
        } else if (SH) {
          sr = rowBuf[Math.max(0, x - SH) * 4] / 255;
          sb = rowBuf[Math.min(w - 1, x + SH) * 4 + 2] / 255;
        }
        core(sr, sg, sb, P);
        let r = O[0], g = O[1], b = O[2];

        if (vig) {
          const nx = (x - hw) / hw;
          const d = Math.sqrt(nx * nx + ny * ny) / 1.4142;
          let t = (d - 0.45) / 0.55; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const m = 1 - vig * t * t * (3 - 2 * t);
          r *= m; g *= m; b *= m;
        }
        if (doGrain) {
          const gx = (x / cell) | 0;
          const n = hash(gx, gy, seed) + hash(gx, gy, seed + 7) - 1;
          const ly = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const k = 1 - Math.pow(Math.abs(2 * ly - 1), 2) * 0.7;
          const a = n * P.grainAmt * GR * k;
          const cn = (hash(gx, gy, seed + 13) - 0.5) * 0.25 * P.grainAmt * GR * k;
          r += a + cn; g += a; b += a - cn;
        }
        if (leak) { // fuga de luz de película (mezcla tipo "screen")
          const dx = x / FW - leak.x, dy = Y / FH - leak.y;
          const q = Math.sqrt(dx * dx + dy * dy) / leak.rad;
          if (q < 1) {
            const f = (1 - q) * (1 - q) * leak.amt;
            r = 1 - (1 - clamp01(r)) * (1 - f * leak.c[0]);
            g = 1 - (1 - clamp01(g)) * (1 - f * leak.c[1]);
            b = 1 - (1 - clamp01(b)) * (1 - f * leak.c[2]);
          }
        }
        if (scanP && (((Y / scanP) | 0) & 1)) { const m = 1 - P.scan.amt; r *= m; g *= m; b *= m; }
        if (pal || LV) { // pocos colores con tramado ordenado (estilo 8 bits / Game Boy)
          const bx = B ? (x / B) | 0 : x, by = B ? (Y / B) | 0 : Y;
          const t = (BAYER[((by & 3) << 2) | (bx & 3)] + 0.5) / 16 - 0.5;
          if (pal) {
            const ly = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let idx = Math.floor(ly * (pal.length - 1) + 0.5 + t * 0.9);
            idx = idx < 0 ? 0 : idx > pal.length - 1 ? pal.length - 1 : idx;
            r = pal[idx][0]; g = pal[idx][1]; b = pal[idx][2];
          } else {
            const q = LV - 1;
            r = Math.floor(clamp01(r) * q + 0.5 + t * 0.5) / q;
            g = Math.floor(clamp01(g) * q + 0.5 + t * 0.5) / q;
            b = Math.floor(clamp01(b) * q + 0.5 + t * 0.5) / q;
          }
        }

        if (intensity < 1) {
          r = r0 + (r - r0) * intensity; g = g0 + (g - g0) * intensity; b = b0 + (b - b0) * intensity;
        }
        // Dither triangular de ±1 nivel: evita bandas en degradados al pasar a 8 bits (no en paletas)
        const dn = (pal || LV) ? 0 : (hash(x, Y, 91) + hash(x, Y, 92) - 1) * 1.0;
        data[i] = clamp01(r) * 255 + dn + 0.5;
        data[i + 1] = clamp01(g) * 255 + dn + 0.5;
        data[i + 2] = clamp01(b) * 255 + dn + 0.5;
        // alfa intacto
      }
    }
  }

  // ---- Exportar el preset como LUT 3D (.cube) para CapCut / DaVinci / Premiere ----
  function makeCube(preset, title, size, opts) {
    size = size || 33;
    opts = Object.assign({}, opts, { spatial: false });
    const P = prepare(preset, opts.adj, opts);
    const intensity = opts.intensity == null ? 1 : opts.intensity;
    const lines = ['TITLE "' + title + '"', 'LUT_3D_SIZE ' + size, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0', ''];
    const f = (v) => v.toFixed(6);
    for (let bi = 0; bi < size; bi++) {
      for (let gi = 0; gi < size; gi++) {
        for (let ri = 0; ri < size; ri++) {
          const r = ri / (size - 1), g = gi / (size - 1), b = bi / (size - 1);
          core(r, g, b, P);
          lines.push(f(r + (O[0] - r) * intensity) + ' ' + f(g + (O[1] - g) * intensity) + ' ' + f(b + (O[2] - b) * intensity));
        }
      }
    }
    return lines.join('\n') + '\n';
  }

  const api = { processImage, makeCube, prepare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PresetEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
