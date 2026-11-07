# ERS — FilmFer (web de filtros para fotos)

Documento vivo. Última actualización: 2026-11-06 · Versión de la app: 1.3.0

## 1. Objetivo
Web estática (GitHub Pages / PWA) donde el usuario sube una foto, elige un preset, ajusta la
intensidad y descarga la foto procesada **sin perder calidad**. Todo ocurre en el dispositivo; la foto
nunca se sube a un servidor.

## 2. Requisitos
| ID | Requisito | Estado |
|----|-----------|--------|
| R1 | Biblioteca amplia de presets ORIGINALES (no copias ni extracción de presets de pago) | Hecho: 56 en 8 categorías (Cálidos 9, Fríos 7, Cine 7, Película 9, Vívidos 6, Suaves 6, B&N 6, Oscuros 6). Ampliable. |
| R2 | Conservar la calidad: resolución original, procesado en flotante, dither final | Hecho |
| R3 | Vista previa en vivo + comparar con original (arrastrar el control sobre la foto) | Hecho |
| R4 | Intensidad, grano y ajustes finos (exposición, calidez, saturación, contraste) | Hecho |
| R5 | Exportar JPG 100% / 95% o PNG sin pérdida | Hecho |
| R6 | Conservar EXIF y perfil de color (Display P3) en JPG | Hecho (probado EXIF; P3 sin probar con foto real de iPhone) |
| R7 | Exportar el preset como LUT .cube (video en CapCut escritorio / DaVinci / Premiere) | Hecho |
| R8 | Instalable en iPhone (PWA); "Guardar en galería" abre la hoja de compartir (un toque en "Guardar imagen"). Una web NO puede escribir directo en Fotos. La foto se deja lista en segundo plano para que el toque sea inmediato. | Hecho; usuario probó v1.0 en iPhone |
| R12 | Fotos de cualquier tamaño (p. ej. 48 MP de iPhone) se guardan COMPLETAS, sin reducir ni recortar: se procesan y codifican por franjas (jpegenc.js), sin lienzo completo | Hecho en 1.2.0. Probado en Chrome (12 MP y 48.8 MP); pendiente probar en iPhone real |
| R11 | Interfaz estilo Apple (fuente del sistema, cristal translúcido, carrusel de filtros tipo Fotos, categorías en píldoras, hoja inferior de ajustes, control segmentado e interruptor iOS; claro/oscuro automático). Ver el original: mantener presionada la foto. | Hecho en 1.3.0 |
| R13 | Pantalla de carga animada al abrir (ícono, nombre, barra); se cierra al estar lista la primera vista previa (mínimo 1.5 s) | Hecho en 1.3.0 |
| R14 | Foto de ejemplo al abrir sin personas (atardecer en la playa con palmera y velero) | Hecho en 1.3.0 |
| R9 | Aplicar el filtro a video dentro de la web | Pendiente (fase 2, ver §5) |
| R10 | Exportar presets como .xmp de Lightroom | Pendiente (fase 2, será aproximado) |

## 3. Arquitectura
- `engine.js`: motor de color por píxel (exposición y balance en luz lineal, sombras/luces, curva S,
  negros levantados, saturación/vibrance, bandas HSL, B&N, tono dividido, viñeta, grano, dither). También genera .cube.
- `presets.js`: lista de presets (solo datos).
- `worker.js`: procesa en segundo plano para no congelar la página.
- `app.js`: interfaz, carga, vista previa, exportación, metadatos JPEG.
- `index.html`, `manifest.json`, `sw.js`, iconos: página y PWA.

## 4. Decisiones de calidad
- Se exporta a la resolución original. Hasta 16 MP (iOS) / 64 MP (otros) se usa un lienzo normal; por encima se usa el modo por franjas (codificador JPEG propio, baseline, franjas de 256 filas, mismos resultados que procesar entera: grano, viñeta y dither coinciden). En modo por franjas: JPG máxima = calidad 98 4:4:4, JPG alta = calidad 95 4:2:0; PNG no disponible (sale JPG y se avisa).
- Si el JPG original trae perfil Display P3 y el navegador lo soporta, se procesa en P3 y se copia el perfil.
  Si no, se procesa en sRGB.
- Se copian los datos EXIF y se pone Orientation = 1 (los píxeles ya salen derechos).
- Lo único que no se puede garantizar sin pérdida es el re-codificado JPG; para cero pérdida usar PNG.

## 5. Video (fase 2)
Opciones: (a) LUT .cube en CapCut escritorio/DaVinci (ya disponible); (b) en la web con WebCodecs
(Chrome/Edge bien, Safari limitado), con riesgo de pérdida de calidad y de audio. Se decide con el usuario.

## 6. Pruebas realizadas
- Motor probado con imagen sintética (8 presets, sin NaN; 12 MP en ~2 s).
- Extremo a extremo en Chrome: carga con EXIF rotado, miniaturas, exportación JPG y PNG,
  EXIF conservado (marca, modelo, fecha), orientación = 1.
- Por franjas (1.2.0): franjas == imagen entera (0 bytes de diferencia); JPG decodifica en Pillow/Chrome (46-50 dB); 12 MP impar con EXIF rotado y 48.8 MP en Chrome (9 s, 18.5 MB).
- Pendiente: foto real de iPhone (P3, HEIC), Safari iOS, tiempos y memoria en iPhone con 48 MP.

## 7. Publicación
Publicado: https://festrebillo.github.io/FilmFer/ (repo público festrebillo/FilmFer; GitHub Pages gratis exige repo público). Cada push a main actualiza la web en 1-2 min.

## 8. Historial
- 1.3.0 (2026-11-06): rediseño estilo Apple; pantalla de carga animada; foto de ejemplo sin persona (playa); ver original manteniendo presionada la foto; control de formato segmentado; deslizadores bipolares llenan desde el centro; íconos nuevos; contraste AA en colores de acento.
- 1.2.0 (2026-11-06): fotos más grandes que el límite del navegador ya no se reducen: exportación por franjas con codificador JPEG propio; barra de progreso al guardar.
- 1.1.0 (2026-11-06): interfaz nueva; 56 presets en 8 categorías; comparador arrastrable; guardado en galería con hoja de compartir y preparación en segundo plano; foto de ejemplo al abrir; corregido: el deslizador de contraste no llegaba al motor; motor con curvas por canal y tono en medios tonos.
- 1.0.0 (2026-11-06): primera versión con 8 presets, exportación con metadatos y LUT.
