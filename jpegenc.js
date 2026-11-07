/* Codificador JPEG baseline por franjas. Permite guardar fotos más grandes que el límite de lienzo
   del navegador (en iPhone ~16 MP): se le entregan las filas por tandas y va devolviendo bytes. */
(function (root) {
  'use strict';
  const ZZ = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
  const QY = [16,11,10,16,24,40,51,61, 12,12,14,19,26,58,60,55, 14,13,16,24,40,57,69,56, 14,17,22,29,51,87,80,62,
              18,22,37,56,68,109,103,77, 24,35,55,64,81,104,113,92, 49,64,78,87,103,121,120,101, 72,92,95,98,112,100,103,99];
  const QC = [17,18,24,47,99,99,99,99, 18,21,26,66,99,99,99,99, 24,26,56,99,99,99,99,99, 47,66,99,99,99,99,99,99,
              99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99];
  const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

  const DC_Y = { bits: [0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0], vals: [0,1,2,3,4,5,6,7,8,9,10,11] };
  const DC_C = { bits: [0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0], vals: [0,1,2,3,4,5,6,7,8,9,10,11] };
  const AC_Y = { bits: [0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,0x7d], vals: [
    0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,
    0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,
    0x29,0x2a,0x34,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,
    0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,
    0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,
    0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,
    0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa] };
  const AC_C = { bits: [0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,0x77], vals: [
    0x00,0x01,0x02,0x03,0x11,0x04,0x05,0x21,0x31,0x06,0x12,0x41,0x51,0x07,0x61,0x71,0x13,0x22,0x32,0x81,0x08,0x14,0x42,0x91,
    0xa1,0xb1,0xc1,0x09,0x23,0x33,0x52,0xf0,0x15,0x62,0x72,0xd1,0x0a,0x16,0x24,0x34,0xe1,0x25,0xf1,0x17,0x18,0x19,0x1a,0x26,
    0x27,0x28,0x29,0x2a,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,
    0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x82,0x83,0x84,0x85,0x86,0x87,
    0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,
    0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,
    0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa] };

  function buildHuff(t) {
    const code = new Int32Array(256), len = new Uint8Array(256);
    let c = 0, k = 0;
    for (let l = 1; l <= 16; l++) {
      for (let i = 0; i < t.bits[l - 1]; i++) { const v = t.vals[k++]; code[v] = c; len[v] = l; c++; }
      c <<= 1;
    }
    return { code, len };
  }
  const H = { dcY: buildHuff(DC_Y), dcC: buildHuff(DC_C), acY: buildHuff(AC_Y), acC: buildHuff(AC_C) };

  function scaleTable(base, quality) {
    const q = Math.max(1, Math.min(100, quality | 0));
    const s = q < 50 ? 5000 / q : 200 - 2 * q;
    return base.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
  }
  function fdTable(q) { // factor que combina cuantización y escala del DCT rápido (AAN)
    const f = new Float32Array(64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) f[r * 8 + c] = 1 / (q[r * 8 + c] * AASF[r] * AASF[c] * 8);
    return f;
  }

  class StreamingJpegEncoder {
    /* opts: { width, height, quality (1-100), subsample (true = 4:2:0), segments: [Uint8Array APPn completos] } */
    constructor(opts) {
      this.W = opts.width; this.Hh = opts.height;
      this.sub = !!opts.subsample;
      this.qY = scaleTable(QY, opts.quality); this.qC = scaleTable(QC, opts.quality);
      this.fY = fdTable(this.qY); this.fC = fdTable(this.qC);
      this.mcuW = this.sub ? 16 : 8; this.mcuH = this.mcuW;
      this.pred = [0, 0, 0];
      this.chunks = []; this.buf = new Uint8Array(1 << 16); this.n = 0; this.acc = 0; this.nb = 0;
      this.segments = opts.segments || [];
      this.blk = new Float32Array(64); this.zq = new Int32Array(64);
    }
    /* ---- salida de bits ---- */
    _push(b) { if (this.n === this.buf.length) { this.chunks.push(this.buf); this.buf = new Uint8Array(1 << 16); this.n = 0; } this.buf[this.n++] = b; }
    _put(code, len) {
      this.acc = (this.acc << len) | code; this.nb += len;
      while (this.nb >= 8) {
        const b = (this.acc >> (this.nb - 8)) & 255;
        this._push(b); if (b === 255) this._push(0);
        this.nb -= 8;
      }
      this.acc &= (1 << this.nb) - 1;
    }
    _take() {
      const parts = this.chunks; parts.push(this.buf.subarray(0, this.n));
      let total = 0; for (const p of parts) total += p.length;
      const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      this.chunks = []; this.buf = new Uint8Array(1 << 16); this.n = 0;
      return out;
    }
    /* ---- cabeceras ---- */
    header() {
      const out = []; const w8 = (...a) => out.push(...a); const w16 = (v) => out.push(v >> 8, v & 255);
      w8(0xFF, 0xD8);
      w8(0xFF, 0xE0); w16(16); w8(0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0); w16(1); w16(1); w8(0, 0); // JFIF
      let bytes = Uint8Array.from(out);
      const extra = [bytes];
      for (const s of this.segments) extra.push(s);
      const rest = [];
      const dqt = (id, q) => { rest.push(0xFF, 0xDB, 0, 67, id); for (let k = 0; k < 64; k++) rest.push(q[ZZ[k]]); };
      dqt(0, this.qY); dqt(1, this.qC);
      rest.push(0xFF, 0xC0, 0, 17, 8, this.Hh >> 8, this.Hh & 255, this.W >> 8, this.W & 255, 3,
                1, this.sub ? 0x22 : 0x11, 0, 2, 0x11, 1, 3, 0x11, 1);
      const dht = (tcth, t) => { rest.push(0xFF, 0xC4, 0, 19 + t.vals.length, tcth, ...t.bits, ...t.vals); };
      dht(0x00, DC_Y); dht(0x10, AC_Y); dht(0x01, DC_C); dht(0x11, AC_C);
      rest.push(0xFF, 0xDA, 0, 12, 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0);
      extra.push(Uint8Array.from(rest));
      let total = 0; for (const p of extra) total += p.length;
      const res = new Uint8Array(total); let o = 0; for (const p of extra) { res.set(p, o); o += p.length; }
      return res;
    }
    /* ---- DCT + cuantización + Huffman de un bloque 8x8 (this.blk ya con -128) ---- */
    _block(fd, comp, dcH, acH) {
      const d = this.blk;
      for (let i = 0; i < 8; i++) {
        const o = i * 8;
        const t0 = d[o] + d[o + 7], t7 = d[o] - d[o + 7], t1 = d[o + 1] + d[o + 6], t6 = d[o + 1] - d[o + 6];
        const t2 = d[o + 2] + d[o + 5], t5 = d[o + 2] - d[o + 5], t3 = d[o + 3] + d[o + 4], t4 = d[o + 3] - d[o + 4];
        const t10 = t0 + t3, t13 = t0 - t3, t11 = t1 + t2, t12 = t1 - t2;
        d[o] = t10 + t11; d[o + 4] = t10 - t11;
        const z1 = (t12 + t13) * 0.707106781; d[o + 2] = t13 + z1; d[o + 6] = t13 - z1;
        const u10 = t4 + t5, u11 = t5 + t6, u12 = t6 + t7;
        const z5 = (u10 - u12) * 0.382683433, z2 = 0.5411961 * u10 + z5, z4 = 1.306562965 * u12 + z5, z3 = u11 * 0.707106781;
        const z11 = t7 + z3, z13 = t7 - z3;
        d[o + 5] = z13 + z2; d[o + 3] = z13 - z2; d[o + 1] = z11 + z4; d[o + 7] = z11 - z4;
      }
      for (let i = 0; i < 8; i++) {
        const t0 = d[i] + d[56 + i], t7 = d[i] - d[56 + i], t1 = d[8 + i] + d[48 + i], t6 = d[8 + i] - d[48 + i];
        const t2 = d[16 + i] + d[40 + i], t5 = d[16 + i] - d[40 + i], t3 = d[24 + i] + d[32 + i], t4 = d[24 + i] - d[32 + i];
        const t10 = t0 + t3, t13 = t0 - t3, t11 = t1 + t2, t12 = t1 - t2;
        d[i] = t10 + t11; d[32 + i] = t10 - t11;
        const z1 = (t12 + t13) * 0.707106781; d[16 + i] = t13 + z1; d[48 + i] = t13 - z1;
        const u10 = t4 + t5, u11 = t5 + t6, u12 = t6 + t7;
        const z5 = (u10 - u12) * 0.382683433, z2 = 0.5411961 * u10 + z5, z4 = 1.306562965 * u12 + z5, z3 = u11 * 0.707106781;
        const z11 = t7 + z3, z13 = t7 - z3;
        d[40 + i] = z13 + z2; d[24 + i] = z13 - z2; d[8 + i] = z11 + z4; d[56 + i] = z11 - z4;
      }
      const zq = this.zq;
      for (let k = 0; k < 64; k++) { const n = ZZ[k]; const v = d[n] * fd[n]; zq[k] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0; }
      // DC
      const diff = zq[0] - this.pred[comp]; this.pred[comp] = zq[0];
      let a = diff < 0 ? -diff : diff, cat = 0; while (a) { cat++; a >>= 1; }
      this._put(dcH.code[cat], dcH.len[cat]);
      if (cat) this._put(diff < 0 ? (diff - 1) & ((1 << cat) - 1) : diff, cat);
      // AC
      let run = 0;
      for (let k = 1; k < 64; k++) {
        const v = zq[k];
        if (v === 0) { run++; continue; }
        while (run > 15) { this._put(acH.code[0xF0], acH.len[0xF0]); run -= 16; }
        let m = v < 0 ? -v : v, c = 0; while (m) { c++; m >>= 1; }
        const sym = (run << 4) | c;
        this._put(acH.code[sym], acH.len[sym]);
        this._put(v < 0 ? (v - 1) & ((1 << c) - 1) : v, c);
        run = 0;
      }
      if (run > 0) this._put(acH.code[0], acH.len[0]);
    }
    /* Codifica una franja de filas RGBA. Todas las franjas menos la última deben tener un número de
       filas múltiplo de 16. Devuelve los bytes que ya se pueden escribir. */
    encodeStrip(rgba, rows) {
      const W = this.W, mw = this.mcuW, mh = this.mcuH;
      const PW = Math.ceil(W / mw) * mw, PH = Math.ceil(rows / mh) * mh;
      const Y = new Float32Array(PW * PH), CB = new Float32Array(PW * PH), CR = new Float32Array(PW * PH);
      for (let y = 0; y < PH; y++) {
        const sy = y < rows ? y : rows - 1;
        for (let x = 0; x < PW; x++) {
          const sx = x < W ? x : W - 1, i = (sy * W + sx) * 4;
          const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], p = y * PW + x;
          Y[p] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          CB[p] = -0.168736 * r - 0.331264 * g + 0.5 * b;
          CR[p] = 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
      const blk = this.blk;
      for (let my = 0; my < PH; my += mh) {
        for (let mx = 0; mx < PW; mx += mw) {
          if (this.sub) {
            for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
              for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) blk[r * 8 + c] = Y[(my + by * 8 + r) * PW + mx + bx * 8 + c];
              this._block(this.fY, 0, H.dcY, H.acY);
            }
            for (const [pl, comp] of [[CB, 1], [CR, 2]]) {
              for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                const p = (my + r * 2) * PW + mx + c * 2;
                blk[r * 8 + c] = (pl[p] + pl[p + 1] + pl[p + PW] + pl[p + PW + 1]) * 0.25;
              }
              this._block(this.fC, comp, H.dcC, H.acC);
            }
          } else {
            for (const [pl, comp, fd, dh, ah] of [[Y, 0, this.fY, H.dcY, H.acY], [CB, 1, this.fC, H.dcC, H.acC], [CR, 2, this.fC, H.dcC, H.acC]]) {
              for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) blk[r * 8 + c] = pl[(my + r) * PW + mx + c];
              this._block(fd, comp, dh, ah);
            }
          }
        }
      }
      return this._take();
    }
    finish() {
      if (this.nb > 0) this._put((1 << (8 - this.nb)) - 1, 8 - this.nb); // relleno con 1s
      this._push(0xFF); this._push(0xD9);
      return this._take();
    }
  }

  const api = { StreamingJpegEncoder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StreamingJpegEncoder = StreamingJpegEncoder;
})(typeof self !== 'undefined' ? self : globalThis);
