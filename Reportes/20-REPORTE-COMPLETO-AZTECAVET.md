# REPORTE COMPLETO — Ingeniería inversa y reconstrucción de AZTECA VET

**Sitio:** https://aztecavet.com/ · **Fecha del análisis:** 2026-11-08 · **Datos de la app congelados al 6 nov 2026**
**Herramienta principal:** REA — Reverse Engineer Anything (rea-agents + MCP, verificado con CDP y Playwright)
**Autorización:** clave de acceso proporcionada por el propietario del sitio; reconstrucción local independiente.
**Alcance:** investigación total (fases 1–7 del prompt maestro) + reconstrucción de los tres motores con paridad exacta + esta síntesis. La UI del rebuild está en progreso (motores 100%).

---

## Resumen ejecutivo

AZTECA VET es una plataforma de estadística y picks de **fútbol (5 torneos), NHL y MLB** que opera **íntegramente en el navegador**: un único archivo HTML de **1.22 MB** servido por **Netlify**, con **cero llamadas de red** en runtime (verificado con REA por CDP, Evidence `ev_cab4b9f5` / `ev_8e62f11f`: la única transacción es el `GET /` del documento). Toda la información (equipos, calendarios, auditorías, bajas con cita periodística y fecha, robots e imágenes, sonido) está **embebida** en el bundle, y **las probabilidades se calculan en vivo con fórmulas estadísticas explícitas en el cliente**: Pitágoras → Log5 → ventaja de local → distribución de marcadores (Poisson con corrección Dixon-Coles en fútbol; curvas normales en MLB) → 6–19 mercados por partido → capa de valor (EV ≥ +4%) con sizing binario de bankroll (5%/10%) → boleto/parlay/historial con `localStorage["azteca_av"]`.

Los tres motores fueron **extraídos verbatim, reconstruidos en TypeScript y comparados contra el oráculo original en TODOS los partidos del bundle — 242 de fútbol (29 próximos + 213 auditorías), 61 de NHL (50 futuros + 11 auditoría) + simulador, y 17 de postemporada MLB + simulador — con desviación máxima Δ = 0 (ε < 1e-9)**. La suite pasa **362/362 tests**, incluye los valores exactos de la interfaz viva observada con REA (NEC–TIJ "TIJ gana 47.9%", ATL–SAN "Empate o SAN + Over 1.5" 51.1%, NHL 41.4/74.9/58.5, MLB 9/17 y 11/17 de auditoría).

**Lo que esto NO es:** no se recuperó código de servidor ni parámetros privados (no existen: todo es cliente); el origen aguas arriba de los datos embebidos no es observable desde el artefacto; y los impactos editoriales de lesiones (p. ej. 0.35 a un portero) son constantes del autor cuyo fundamento no está documentado. La equivalencia es **exacta dentro del dominio observable** — no una aproximación.

**Nota de seguridad:** el código de acceso de 4 dígitos del gate está en texto plano dentro del bundle público de ambos sitios del mismo autor (`const CODE="…"`); su protección es cosmética (sin hash, sin lockout, sin servidor). No constituye secreto: cualquier visitante puede verlo con view-source.

---

## 1. Configuración, acceso y entorno (Fase 1)

- **REA verificado real:** `capture_browser_scenario` (Brave/Chromium headless vía Playwright), `analyze_javascript_application` (12,488 nodos AST), `inspect_web_page` CDP (720 nodos DOM), `inspect_web_event_listeners`, `discover_webmcp_tools`, `trace_application_feature`, `export_evidence_bundle` (16 records en `raw/session2.json`).
- **Acceso:** pantalla de bienvenida (stage 1) → clic/tecla tras 900 ms (stage 2) → pad virtual de 4 dígitos (también teclado físico) → comparación client-side `buf===CODE` → `success()` (sonido, warp, `#app`). Sin servidor, sin hash, sin lockout, **sin persistencia del acceso** (cada recarga pide el código). En el rebuild el gate se valida **server-side** (mejora documentada en `docs/09…11`).
- **Auditoría del entorno:** Netlify Edge (headers `server`/`x-nf-request-id`), `www`→301 apex, 404 genérico (3,449 B) sin `robots.txt` ni `sitemap.xml`, `<head>` mínimo (charset+viewport), favicon 404, título "AZTECA VET" en DOM runtime.
- **Móvil verificado:** 390×844@2x con locale es-MX — mismo flujo de desbloqueo y home (captura `ev_007e8_home-settle.png`).

## 2. Reconocimiento total de la aplicación (Fase 2)

**Grafo de navegación confirmado:**

```
AZTECA VET
├── Puerta (stage1 bienvenida → stage2 pad)   [código client-side]
├── Home (robots MLB/FÚTBOL/NHL + grid de 7 ligas; Explorar → bento)
├── Fútbol → iframes srcdoc por torneo (MX/ES/EN/UCL/UEL comparten fb.html con __START)
│   ├── PARTIDOS (chips por día + auditorías; tiles → overlay "ANALIZANDO")
│   ├── SIMULADOR (pareja por defecto: AME/MTY, BAR/RMA, ARS/MCI, BMU/PSG, SLB/B04)
│   ├── BAJAS (feed editable: estado 0/.5/1 + impacto goles/juego)
│   ├── EQUIPOS (tabla editable GF/J GC/J → overrides `ed`)
│   ├── PICK DEL DÍA + PARLAY DEL DÍA (cross-liga por fecha)
│   └── Overlay de análisis (robot, tinta, radar, log 420 ms/línea, SALTAR) → tarjeta con mercados/cuotas/badges
├── NHL → PARTIDOS/SIMULADOR/NOTICIAS/EQUIPOS (mismo patrón; ML/±1.5/60min)
├── MLB → PARTIDOS/SIMULADOR/EQUIPOS/JUGADORES CLAVE + auditoría postemporada (temporada terminada)
├── MI BOLETO (BOLETO/HISTORIAL/BANKROLL) → localStorage["azteca_av"]
└── ASISTENTE IA (chips + pregunta; Claude vía window.claude si existe, si no modo local)
```

**Estados registrados:** gate (stage1/stage2/éxito/fallo), sin datos ("Ningún partido llega a 55%…"), sin valor ("NO APOSTAR · sin valor a X"), mejor valor, pendiente/ganó/perdió/nula, boleto vacío, advertencia de correlación en parlay, y error 404 (favicon). Ninguna URL cambia (SPA de un documento).

## 3. Arquitectura y red (Fases 3–4)

- **Stack:** JavaScript vanilla minificado inline (sin framework, sin workers, sin WASM); CSS inline; arte por canvas (balón 3D ray-traced por píxel, icosaedro 12v/20f) y SVG (Piedra del Sol con 104 ticks/20 celdas/5 glifos); **WebAudio** generado por síntesis (5 instrumentos: campana 3 parciales, huehuetl 135→46 Hz, caracol saw/tri/sine con lowpass 380→1500→500, ocarina con vibrato 5.5 Hz, barridos 180↔7000 Hz; escala pentatónica; reverb por convolución 2.6 s).
- **Páginas deportivas en base64** (`PAGES={fb,nhl,mlb}` → `dec()`=atob→TextDecoder → iframe `srcdoc` mismo origen, con `window.__START=<liga>` inyectado). Tema: shell claro (verde jade + oro azteca) y páginas en tema uniforme.
- **Comunicación padre↔iframe:** `postMessage` `{av:"cfg"|…}` (padre→) y `{av:"ready"|"odd"|"add"}` + `"home"` (iframe→padre). Claves de mercado `"FB:comp:fecha:local-visitante|mercado"`, `"NHL:…"`, `"MLB:…:serie"`.
- **Red:** **0 endpoints**. La fase D es el trabajo manual del autor; la app consume la instantánea embebida. `window.claude` (`db`/`user`/`sample`, estilo Firestore `data/users/<id>/…`) existe solo en ciertos entornos de hospedaje; en la web pública todo cae a localStorage. WebMCP: **0 herramientas declaradas**.
- **Teatralidad documentada:** el overlay "ANALIZANDO EN TIEMPO REAL" es puesta en escena (log a 420 ms/línea) — el cálculo real ya está hecho al abrir el partido.

## 4. Motores por deporte (Fases 5–6) — informes completos en `docs/20/21/22`

### 4.1 Fútbol (242 partidos; informe completo: `docs/20-engine-futbol-aztecavet.md`)
- **Pipeline (OBSERVADO):** shrink bayesiano `rs=(GF+6·LG)/(PJ+6)` con fase 2026-27 ×3 → escala UEFA (`STR`, LGU=1.45) → bajas (impacto×estado, piso .3) → **Pitágoras E=1.7** → Log5 + localía **.54** + shrink **.85** → goles `H.rs·A.ra/LG` ajustados por **bisección (16 iter)** hasta igualar el share → **Poisson 0..13 con Dixon-Coles τ (ρ=−.14 MX / −.08 resto)** → 18 mercados (1X2, O/U half-line, ±1.5, O/U 3.5, DC, totales por equipo, BTTS) → pick jerárquico (dominio≥.42 → DC → favorito≥.5 → opción segura → U3.5; empate≥.28 → DC; DC sola → **DC+O1.5** si ≥.42) → combinada "FAVORITO CLARO · GANA + GOLES" (fav≥.62, Over 2.5 si tot≥2.6 o GF/j≥3) que **reemplaza al pick**.
- **Valor:** EV≥+4% (cuotas decimales **y americanas** ±100), sizing 5%/10% con th=.60, noVig por grupos complementarios, límite 800 cuotas.
- **Validación:** paridad Δ=0 en 242×mercados; E1 UI exacta (47.9%, proy 1.2–1.7, 51.1%); E2 umbrales; E3 baja +0.86pp determinista; E4 auditoría MX J15 8/9 y 6/7.

### 4.2 NHL (61 juegos + auditoría; `docs/21-engine-nhl-aztecavet.md`)
- **Pipeline:** build() con prior `250/82` y freno **K=15** → **forma reciente 30%** (últimos 5 de ≥7) → noticias con impacto en goles (porteros 0.25–0.40; incluye el traspaso Hellebuyck→NJ) → **Pitágoras E=2.15** → Log5 + localía **.525** + shrink .85 → Poisson 0..21 **sin corrección de empate** (OT lo absorbe) → 15 mercados (ML, ±1.5, O/U, **60 min**, totales por equipo, BTTS) → pick (dominio+ML≥.52 → ML≥.58 → opción más segura) → combinada Over 5.5/4.5 con **filtro de consistencia OVR≥.5**.
- **Validación:** paridad Δ=0 (61+sim); E1 UI exacta (41.4/74.9/58.5); E4 auditoría 5 nov 8/11 y 9/11, **Brier 0.236**.

### 4.3 MLB (17 juegos de postemporada; `docs/22-engine-mlb-aztecavet.md`)
- **Pipeline:** RS/RA por juego + bateadores fuera (`rs−=i`) → **regresión bayesiana del abridor** `ERA_reg=(ERA·IP+ERA_eq·80)/(IP+80)`, `f=1+.55·(ERA_reg/ERA_eq−1)` sobre RA → **Pitágoras EX=1.83** → Log5 + localía .54 + shrink .85 → **curvas normales** `1−φ((line−tot)/(3√2))` y run line `1−φ((1.5−dif)/SD)` → 6 mercados → pick = máximo. Auditorías con `nn=true` (sin ajustes del día, como declara la UI).
- **Validación:** paridad Δ=0 (17+sim con abridores mis/sku); E4 reproduce **exactamente** los contadores de la UI: **9/17 y 11/17**; Brier **0.2523**; E4b tarjeta "CLE +1.5 ✓ 5–9".

## 5. Boleto, historial y bankroll (Fases 7–8, OBSERVADO)

- **Esquema persistido** `azteca_av = {cfg:{start,th}, odds, slip, bets}`; cuotas decimales **y americanas**; máximo 800 cuotas (FIFO); guardado con debounce 500 ms; puente opcional a nube por usuario (`window.claude`, colección `bets` con `orderBy("ts","desc").limit(1000)` y degradación controlada a localStorage en `invalid_argument/revoked/not_granted`).
- **Slip:** 1 selección = sencilla; 2+ = parlay (producto de p y de cuotas) con **cuota opcional del parlay**, cuota justa `1/p`, **advertencia de correlación** si hay 2+ selecciones del mismo partido; EV y sizing en vivo; "Si acierta: +u×(d−1)% bank".
- **Registro:** `st: p/w/l/v` (pendiente/ganó/perdió/nula) con deshacer y borrado en dos toques; stake `= round(bank·u/100, 2)`.
- **Historial:** bankroll (piso 0), ganancia neta, ROI (neto/apostado), aciertos W/S, % crecimiento, pendientes, **calibración** (prob. media del modelo vs acierto real con 3 mensajes según n<30 / |Δ|<4pp / mayor / menor) y **ROI por liga y por tipo** (Parlay / Combinada gana+over / Doble oportunidad / Sencilla).
- **Asistente IA:** chips fijos + pregunta libre; con `window.claude.use("sample")` responde en streaming con el contexto de la pantalla (9,000 chars); si no, **modo local determinista** por coincidencias sobre el texto visible — nunca inventa datos (etiqueta honesta "Modo local").

## 6. Reconstrucción y validación (Fase 6–7 del prompt maestro)

- **Oráculos verbatim:** `reference/aztecavet/{football,hockey,baseball}-ref.mjs` — el código original extraído del bundle con stubs mínimos (mismo patrón que touchiq), regenerable con `scripts/extract-aztecavet-reference.mjs` desde `Reportes/analisis-aztecavet/scripts/pages/`.
- **Motores limpios:** `src/domain/aztecavet/{football,hockey,baseball,picks,bankroll}.ts` con constantes en `constants.ts` y tipos en `types.ts`; datos en `src/data/aztecavet-*.json` (16 colecciones normalizadas).
- **Suite: 362/362** —
  - **324 paridad**: todos los partidos × mercados/pick/etiquetas/razones/líneas (Δ=0, ε<1e-9) contra el oráculo, incl. `bestOf`/`NOB` con cuotas del usuario.
  - **30 matemáticas**: `dec` (decimal/americana/coma), `unitOf` en el borde exacto EV=+4%, `noVig` por id con margen, `slipSummary`/`registerBet`/`calibration` (3 ramas exactas), scoring y parlay 60–80% con respaldo ×1.05/×1.10 y formato americano.
  - **8 experimentos controlados** (una entrada a la vez, determinismo, backtests con Brier) → `evidencia/statistical-tests/aztecavet-experiments.json`.
- **Sin filtración:** las auditorías corren con tabla `SA` (previa a la jornada auditada) y `nn=true` — las condiciones que el propio sitio declara. No hay parámetros calibrables en el original; nada se ajustó con datos futuros.

## 7. Trazabilidad maestra (Fase 15)

| Componente | Nivel |
|---|---|
| Hosting (Netlify), documento único, 0 red | **OBSERVADO** (headers REA + CDP) |
| Gate client-side (código en texto plano, 2 etapas, teclado físico) | **OBSERVADO** |
| Datos embebidos + transformaciones (est/cur/peso ×3; prior 250/82; ERA_reg) | **OBSERVADO** |
| Motores completos (constantes, fórmulas, reglas de pick, combinadas, noVig, valor, picks del día) | **OBSERVADO** (código cliente público) |
| Valores de UI (47.9/51.1/41.4/74.9/58.5; auditorías 8/9, 8/11, 9/11, 9/17, 11/17) | **OBSERVADO** (capturas REA + experimentos) |
| Teatralidad del overlay de análisis | **OBSERVADO** |
| Motores reconstruidos en TS | **RECONSTRUIDO** con **equivalencia exacta** demostrada (no aproximación) |
| Impactos editoriales de lesiones (fundamento) | **OBSERVADO** como constantes / **DESCONOCIDO** su justificación |
| Origen aguas arriba de los datos embebidos | **DESCONOCIDO** |
| Puente `window.claude` del hosting (persistencia/asistente; no afecta al motor) | **DESCONOCIDO** (solo contrato público) |
| Elección normal-vs-Poisson en MLB (motivo del autor) | **INFERIDO** (práctica clásica de totales de carreras) |

## 8. Seguridad (observaciones, sin juicio)

1. El gate es una cortina cosmética: código en texto plano ×4 en el bundle público, sin lockout, sin servidor, sin persistencia; el teclado físico también lo acepta. El código es visible con view-source — no es un secreto.
2. Nada de lo "protegido" está cifrado: las páginas de datos viajan en base64 en el HTML público.
3. Sin CSP ni SRI; un compromiso del bundle de Netlify sería indetectable para el usuario.
4. Privacidad fuerte por omisión: sin cookies, sin analítica, sin tracking; el boleto vive en localStorage salvo hosting con puente `window.claude` (cuya segregación por usuario depende de ese servicio).
5. El rebuild valida el acceso server-side (mejora deliberada documentada).

## 9. Limitaciones y estado del proyecto

- **Completo y verificado:** los tres motores de predicción, valor/sizing/noVig, boleto/bankroll, picks del día/parlay, oráculos, datos y suite de pruebas (362/362, tsc limpio en el dominio).
- **En progreso:** la UI del rebuild (shell con audio/arte/store/boleto/asistente escrito; páginas deportivas TS y servidor `/api/access` pendientes de conectar); verificación E2E/visual del rebuild con REA.
- **Fuera de alcance observable:** actualización de datos (trabajo manual del autor), proveedor LLM del asistente, comportamiento con datos que el bundle no contiene.

## 10. Índice de materiales

| Material | Ubicación |
|---|---|
| Este reporte | `Reportes/20-REPORTE-COMPLETO-AZTECAVET.md` |
| Informes de motor (por deporte) | `Reportes/docs/20/21/22-engine-*-aztecavet.md` |
| Análisis completo (raw + decodificado + herramientas) | `Reportes/analisis-aztecavet/` (INFORME.md, INFORME-PROFUNDO.md, data/, readable/, scripts/, tools/, raw/ con evidencia REA de sesión) |
| Evidencia de experimentos y backtests | `Reportes/evidencia/statistical-tests/aztecavet-experiments.json` |
| Motores reconstruidos | `src/domain/aztecavet/` · **Oráculos verbatim** `reference/aztecavet/` · **Datos** `src/data/aztecavet-*.json` |
| Suite de pruebas | `tests/domain/aztecavet-{parity,math,experiments}.test.ts` (362 tests) |
| Extractores reproducibles | `scripts/extract-aztecavet-reference.mjs`, `scripts/extract-aztecavet-ui.mjs` (apuntan a `Reportes/analisis-aztecavet/`) |
| Informes previos de la investigación | `Reportes/analisis-aztecavet/INFORME.md` (fase 1) y `INFORME-PROFUNDO.md` (fase 2) |
