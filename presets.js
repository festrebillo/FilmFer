/* Presets originales. Cada uno es solo una lista de ajustes (estilo Lightroom).
   Matiz de bandas: valores negativos acercan el color hacia el anterior en la rueda
   (p. ej. azul -> cian), positivos hacia el siguiente. */
(function (root) {
  'use strict';
  const PRESETS = [
    {
      id: 'film', name: 'Film Nostálgico', desc: 'Grano, negros levantados y colores cálidos de película',
      ev: 0.05, temp: 0.25, tint: 0.05, shadows: 0.15, highlights: -0.2, contrast: 0.15,
      lift: 0.05, drop: 0.03, sat: -0.12,
      bands: { orange: { h: -4, s: 0.05, l: 0.05 }, green: { h: 12, s: -0.25, l: -0.05 }, blue: { h: -8, s: -0.2, l: -0.1 } },
      split: { sh: [215, 0.12], hi: [40, 0.14] },
      grain: { amt: 0.45, size: 1.1 }, vig: 0.18
    },
    {
      id: 'golden', name: 'Golden Hour', desc: 'Dorado cálido de atardecer, luces suaves',
      ev: 0.12, temp: 0.5, tint: 0.08, shadows: 0.2, highlights: -0.3, contrast: 0.1,
      lift: 0.02, sat: 0.05, vib: 0.25,
      bands: { orange: { s: 0.12, l: 0.06 }, yellow: { h: -8, s: 0.1 }, blue: { h: -10, s: -0.3, l: -0.15 } },
      split: { sh: [25, 0.1], hi: [45, 0.2] },
      grain: { amt: 0.12, size: 1 }, vig: 0.15
    },
    {
      id: 'clean', name: 'Clean Bright', desc: 'Luminoso, limpio y natural, ideal para Instagram',
      ev: 0.2, temp: 0.08, shadows: 0.35, highlights: -0.25, contrast: 0.08, vib: 0.2,
      bands: { orange: { s: -0.05, l: 0.08 }, green: { s: -0.1 } }
    },
    {
      id: 'moody', name: 'Moody Natural', desc: 'Oscuro y envolvente pero realista',
      ev: -0.2, temp: 0.05, shadows: 0.1, highlights: -0.3, contrast: 0.25,
      lift: 0.03, sat: -0.18,
      bands: { green: { h: 15, s: -0.35, l: -0.2 }, orange: { s: -0.05, l: -0.02 }, blue: { s: -0.15, l: -0.2 } },
      split: { sh: [200, 0.15], hi: [35, 0.1] },
      grain: { amt: 0.25, size: 1 }, vig: 0.3
    },
    {
      id: 'cine', name: 'Cinematic', desc: 'Sombras azul-verdoso y piel cálida, contraste alto',
      temp: 0.1, highlights: -0.2, contrast: 0.28, vib: 0.1,
      bands: { orange: { s: 0.12, l: 0.04 }, blue: { h: -15, s: 0.1, l: -0.1 }, aqua: { s: 0.1 }, green: { s: -0.25 } },
      split: { sh: [195, 0.3], hi: [30, 0.25] },
      grain: { amt: 0.15, size: 1 }, vig: 0.22
    },
    {
      id: 'mar', name: 'Mar Turquesa', desc: 'Azules y turquesas vivos para playa y viajes',
      ev: 0.1, temp: -0.05, shadows: 0.15, highlights: -0.2, contrast: 0.12, sat: 0.05, vib: 0.3,
      bands: { aqua: { h: -5, s: 0.3, l: -0.05 }, blue: { h: -10, s: 0.2, l: -0.08 }, green: { h: 20, s: 0.1 }, orange: { l: 0.05 } },
      split: { hi: [50, 0.08] },
      grain: { amt: 0.05, size: 1 }
    },
    {
      id: 'bn', name: 'B&N Cálido', desc: 'Blanco y negro con tono de película antigua',
      mono: { r: 0.4, g: 0.45, b: 0.15 }, ev: 0, shadows: 0.1, highlights: -0.2, contrast: 0.3, lift: 0.04,
      split: { sh: [35, 0.07], hi: [45, 0.11] },
      grain: { amt: 0.4, size: 1 }, vig: 0.25
    },
    {
      id: 'matte', name: 'Matte Suave', desc: 'Contraste bajo, negros grises y tonos pastel',
      ev: 0.05, temp: 0.1, shadows: 0.1, highlights: -0.15, contrast: -0.05,
      lift: 0.08, drop: 0.05, sat: -0.1, vib: 0.1,
      split: { sh: [220, 0.1], hi: [30, 0.08] },
      grain: { amt: 0.1, size: 1 }
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS;
  root.PRESETS = PRESETS;
})(typeof self !== 'undefined' ? self : globalThis);
