# ERS — FilmFer (web de filtros para fotos)

Documento vivo. Última actualización: 2026-11-06 · Versión de la app: 1.0.0

## 1. Objetivo
Web estática (GitHub Pages / PWA) donde el usuario sube una foto, elige un preset, ajusta la
intensidad y descarga la foto procesada **sin perder calidad**. Todo ocurre en el dispositivo; la foto
nunca se sube a un servidor.

## 2. Requisitos
| ID | Requisito | Estado |
|----|-----------|--------|
| R1 | Varios presets originales (no copias de presets de pago) | Hecho: 8 (Film, Golden Hour, Clean Bright, Moody, Cinematic, Mar Turquesa, B&N Cálido, Matte) |
| R2 | Conservar la calidad: resolución original, procesado en flotante, dither final | Hecho |
| R3 | Vista previa en vivo + comparar con original (mantener pulsado) | Hecho |
| R4 | Intensidad, grano y ajustes finos (exposición, calidez, saturación, contraste) | Hecho |
| R5 | Exportar JPG 100% / 95% o PNG sin pérdida | Hecho |
| R6 | Conservar EXIF y perfil de color (Display P3) en JPG | Hecho (probado EXIF; P3 sin probar con foto real de iPhone) |
| R7 | Exportar el preset como LUT .cube (video en CapCut escritorio / DaVinci / Premiere) | Hecho |
| R8 | Instalable en iPhone (PWA) y guardar en Fotos con "Compartir" | Hecho, pendiente de probar en iPhone |
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
- Se exporta a la resolución original (límite del lienzo: 16 MP en iOS, 64 MP en otros; por encima se reduce y se avisa).
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
- Pendiente: foto real de iPhone (P3, HEIC), Safari iOS, compartir a Fotos.

## 7. Publicación
Aún NO publicado. Pendiente de confirmar con el usuario: nombre del repositorio y si será público
(un repositorio público deja ver los ajustes de los presets).

## 8. Historial
- 1.0.0 (2026-11-06): primera versión con 8 presets, exportación con metadatos y LUT.
