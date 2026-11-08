# Cómo opera aztecavet.com — Informe de ingeniería inversa con REA

**Fecha:** 2026-11-08 · **Objetivo:** entender cómo funciona el sitio (código de acceso 7779 provisto por el propietario).
**Método:** REA (`capture_browser_scenario` con Brave headless, `analyze_javascript_application`) + extracción estática del HTML servido. Todo el material crudo y capturas está en esta carpeta (`raw/`, `scripts/`).

---

## 1. Resumen en una frase

**AZTECA VET es una SPA de un solo archivo (1.22 MB de HTML) hospedada en Netlify, sin backend propio ni llamadas de red: toda la app (código, datos de partidos, imágenes y sonido) vive embebida en el propio documento; el "código de acceso" 7779 es una comparación client-side en JavaScript, no un login real.**

## 2. Infraestructura y entrega

| Aspecto | Evidencia |
|---|---|
| Hosting: **Netlify Edge** (`server: Netlify`, `x-nf-request-id`, `cache-status: Netlify Edge`) | captura `ev_cab4b9f5782…` (headers de respuesta) |
| Un único documento HTML de **1,219,472 bytes** (br-comprimido); **0 scripts externos, 0 recursos externos** salvo el namespace SVG de w3.org | descarga `raw/index.html`, análisis estático |
| **Sin cookies, sin service worker**, HSTS activo; `favicon.ico` da 404 (único error de consola) | capturas REA |
| Toda la JS app es inline: 2 bloques `<script>` (785 KB + 4 KB) | `scripts/inline_1.js`, `scripts/inline_2.js` |

Análisis estático REA (`analyze_javascript_application`, evidencia `ev_44e130e7…` / padre `ev_a90701d1…`): 2 archivos, 12,488 nodos AST parseados sin fallos, **familia `request`: 0 relaciones** → el código no contiene fetch/XHR/WebSocket. Confirmado en runtime: en cada captura la única transacción de red es el `GET /` del documento.

## 3. La puerta de acceso (código 7779) — 100% client-side

Ubicación: `inline_1.js` línea ~72. Lógica exacta:

```js
const CODE="7779", dots=[...document.querySelectorAll("#dots i")], msg=$("msg"), pad=$("pad");
let buf="", stage=1, busy=false, snd=true;
// teclado numérico construido por JS: "1".."9","","0","⌫" → botones en #pad
function key(k){ if(stage!==2||busy)return; if(k==="⌫"){buf=buf.slice(0,-1)} else if(/\d/.test(k)&&buf.length<4){buf+=k}
  if(buf.length===4){ busy=true; buf===CODE ? success() : fail() } }
function fail(){ /* "CÓDIGO INCORRECTO", animación shake, sonido de fallo, reset en 650ms */ }
function success(){ /* "ACCESO CONCEDIDO", sonido unlock, animación warp/flash,
   oculta #lock, muestra #app, drawHome(), clk(), muestra barra BOLETO */ }
```

Flujo real observado en runtime con REA (evidencias `ev_d800fc83…` y `ev_ac3d791e…`, todos los pasos `completed`):

1. **Stage 1** — pantalla de bienvenida; no acepta dígitos. Un clic en `#lock` (después de 900 ms) avanza a stage 2.
2. **Stage 2** — aparece el pad; cada dígito se acumula en `buf` (máx. 4).
3. Al llegar a 4 dígitos se compara **en texto plano contra la constante `CODE="7779"`** (hardcodeada en el JS que cualquiera puede leer viendo el código fuente).
4. Éxito → animación (~1.8 s) y se revela `#app`. Fallo → mensaje y reset.

**Consecuencias de seguridad (observación, no juicio):**
- No hay servidor, sesión, token ni rate-limiting: el código vive en el bundle público y quien vea el fuente lo conoce.
- **No hay persistencia del acceso**: cada recarga vuelve a la puerta (capturas muestran `localStorage` vacío tras desbloquear; la clave `azteca_av` solo se escribe al usar el boleto).
- Es una cortina cosmética, no un control de acceso real. Los datos detrás (páginas de partidos) están igualmente en el HTML público, solo codificados en base64.

## 4. Arquitectura de la app

```
index.html (1.22 MB)
├── CSS inline (tema oscuro verde/dorado, animaciones, canvas)
├── <script> #1 (785 KB, minificado a ~2 líneas gigantes)
│   ├── Motor de audio WebAudio (escala pentatónica, reverb por convolución — "caracol, huehuetl, ocarina")
│   ├── Intro: stage1→stage2, pad del código, canvas de estrellas/warp
│   ├── SP[7]  → catálogo: Liga MX, La Liga, Premier, Champions, NHL, MLB, Europa League
│   ├── ART{}  → arte SVG/canvas (balón, puck, bate) + ROB[] robots en base64 webp
│   ├── PAGES{fb,nhl,mlb} → páginas HTML completas en BASE64 (dec() = atob→TextDecoder)
│   ├── openSport(i) → decodifica, inyecta window.__START=<código liga>, y lo monta
│   │                  como srcdoc en el iframe #fr (mismo origen)
│   └── AV = estado del boleto/bankroll + lsSave/lsLoad en localStorage["azteca_av"]
│       (cfg: bankroll inicial/umbral; odds: cuotas escritas; slip: boleto; bets: historial)
├── <script> #2 (4 KB) → Asistente IA (panel #aip)
└── DOM: #lock (puerta), #app (home), #fr (iframe de deporte), #slipv (boleto), #aip (IA)
```

**Datos (todos embebidos, decodificados a `scripts/pages/`):**
- `fb.html` (173 KB): una sola página para los **5 torneos de fútbol** (MX/ES/EN/UCL/UEL) con chips, pestañas PARTIDOS/SIMULADOR/BAJAS/EQUIPOS, jornadas por día y **secciones de AUDITORÍA** que recalculan qué habría dicho el modelo con marcadores reales (`g.sc`), ej. "Pick del modelo: 9/17 ✓".
- `nhl.html` (151 KB): 7 días de calendario, ranking del día con etiquetas ("FAVORITO CLARO · GANA + GOLES", "SIN VENTAJA CLARA", "ML FAVORITO").
- `mlb.html` (136 KB): temporada cerrada ("MIL campeón"), auditoría 8–28 OCT con aciertos por mercado (✓/✗ por pick).

**El modelo estadístico** (declarado en pantalla y en código):
- Fútbol: **Pitágoras (exponente 1.7) → Log5 → ventaja de local 55% → goles proyectados (GF×GC rival/LG) → distribución de Poisson** para 1X2, doble oportunidad, totales, ambos anotan y hándicap.
- `COMBOS()`: regla "FAVORITO CLARO · GANA + GOLES" — si favorito ≥62% y sin empate probable, sugiere ganador+over (2.5 si proyecta ≥2.6 goles o el favorito promedia ≥3; si no, 1.5).
- **Pick del día**: exige ≥55% de probabilidad; si ningún partido llega, dice "Mejor no forzar una apuesta" (captura Liga MX).
- **Valor**: comparas probabilidad del modelo contra cuota que tú escribes ("tiene valor si tu casa paga 1.39 o más"; EV = p×cuota−1, umbral ~4%).
- NHL: modelo ML/hándicap con noticias y bajas; MLB: pre-juego con abridores y auditoría.

## 5. Features de usuario

- **Boleto (slip):** agregas mercados desde el iframe; la página deportiva se comunica con el padre vía `parent.postMessage({av:"add"|"odd"|"ready"})`. Con 1 selección es apuesta sencilla; con 2+ calcula **parlay** (probabilidad combinada, cuota justa y valor).
- **Bankroll/Historial:** estado `AV` en `localStorage["azteca_av"]`; bankroll actual = inicial + ganancia neta de apuestas resueltas; % de crecimiento y pendientes.
- **Sincronización opcional en la nube:** `avInit()` intenta `window.claude.use("db")` + `window.claude.use("user")` (puente tipo WebMCP que solo existe en ciertos entornos de hospedaje, p. ej. páginas servidas dentro de Claude/agents). Si existe, guarda en rutas tipo Firestore `data/users/<id>/cfg|odds|slip` y colección `bets`; si no, todo queda en localStorage. **En un navegador normal esto no existe → solo localStorage.**
- **Asistente "IA":** `window.claude.use("sample")` si está disponible (streaming en el panel); si no, **modo local**: respuestas por coincidencia de palabras clave contra el texto de la pantalla abierta (`pageText()`, máx. 9000 chars), sin red. Etiqueta honesta: "Respuesta de Claude con los datos de esta pantalla" vs "Modo local".
- **Sonido:** WebAudio propio (osciladores pentatónicos, reverb por convolución, percusión) iniciado tras gesto de usuario; toggle #snd.

## 6. Qué NO hace (verificado)

- **No consulta APIs externas ni actualiza datos en vivo**: los "datos al 6 nov 2026" son estáticos, horneados en el HTML. La fecha del reloj y los días se generan client-side.
- No rastrea usuarios, no hay analítica, cookies ni telemetría.
- No protege nada realmente: el "acceso" no diferencia a los usuarios ni cifra contenido.

## 7. Material y evidencia

| Artefacto | Ruta |
|---|---|
| HTML original | `raw/index.html` |
| Scripts extraídos | `scripts/inline_1.js` (app), `scripts/inline_2.js` (IA) |
| Páginas de datos decodificadas | `scripts/pages/fb.html`, `nhl.html`, `mlb.html` |
| Evidencia REA completa de la sesión (10 records) | `raw/session.json` · antes: `raw/scenario2.json` |
| Capturas de pantalla | `raw/screenshots/ev_d800f_home-settle.png` (home), `ev_c23a8_settle.png` (Liga MX), `ev_c4bef_settle.png` (NHL), `ev_bd5a2_settle.png` (MLB), `ev_4d3c0_scenario_start.png` (puerta) |
| Herramientas usadas | `tools/extract_scripts.py`, `extract_pages.py`, `summarize_capture.py`, `extract_all_shots.py` |

**IDs de evidencia REA:** gate/headers `ev_cab4b9f5782…`; análisis JS `ev_44e130e74ca…` (padre `ev_a90701d137e…`); desbloqueo runtime `ev_d800fc8365c…` y `ev_ac3d791ea83…`; páginas standalone `ev_c23a844196…` (fb), `ev_c4befc31d29…` (nhl), `ev_bd5a280cf08…` (mlb).

**Limitaciones:** análisis estático y observación controlada no ejecutan toda la app (simulador, escritura de cuotas y boleto no se ejercitaron en runtime; su lógica se leyó del código). El clic para abrir Liga MX dentro del sitio en vivo agotó el plazo de Playwright por las animaciones CSS de las tarjetas (evidencia `ev_ac3d791e…`); por eso las páginas de datos se capturaron servidas localmente — mismo HTML base64, render verificado.
