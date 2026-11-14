# AZTECA VET — Informe profundo de ingeniería inversa (pase 2)

**Fecha:** 2026-11-08 · Continuación de `INFORME.md`. Objetivo: conocer **todo** el funcionamiento.
**Método:** lectura íntegra de los 5 scripts (copias legibles en `readable/`), extracción de datos a JSON (`data/inventory.json`, evaluada en sandbox node:vm), REA pasivo por CDP, escenario móvil, `trace_application_feature`.

---

## 1. Infraestructura y entrega (completo)

| Aspecto | Dato | Evidencia |
|---|---|---|
| Hosting | Netlify Edge (headers `server`, `x-nf-request-id`, `cache-status`) | `ev_cab4b9f5…` |
| Dominio | `www.aztecavet.com` → **301** a apex; `robots.txt`, `sitemap.xml`, `404.html` y rutas desconocidas → **404 genérico Netlify** (3,449 B) | curl |
| `<head>` | Solo `charset` + `viewport` (viewport-fit=cover). Sin description, OG ni favicon (→404). El `<title>` "AZTECA VET" se observa en el DOM runtime (720 nodos) | curl + `ev_8e62f11f…` |
| Documento | 1 HTML de 1,219,472 B; 2 scripts inline: `inline_1.js` 785,916 B (sha256 `5afba93d…684c`) e `inline_2.js` 4,039 B (sha256 `477d57f9…2692`) | REA inventory |
| Red | **0 llamadas de red en el código** (REA familia request = 0) y en runtime solo `GET /` | `ev_44e130e7…`, capturas |
| Cookies/SW | Ninguno; HSTS activo; service workers bloqueados sin efecto (no hay) | capturas |
| Móvil | Verificado en 390×844@2x, locale es-MX: gate + desbloqueo + home funcionan idénticos (responsive) | `ev_007e8371…`, captura `ev_007e8_home-settle.png` |

## 2. La puerta (código [REDACTED_PIN]) — mecánica completa

- **Constante en texto plano**: `const CODE="[REDACTED_PIN]"` (inline_1 y también dentro de cada página deportiva).
- **Dos etapas**: stage 1 (bienvenida, ignora dígitos) → clic en `#lock` (o **cualquier tecla**, tras 900 ms) → `goStage2()` (sonido "portal", `#stg1`→`#stg2` a los 650 ms) → pad activo (`key()` exige `stage===2`).
- **Entrada**: pad virtual (12 botones, el hueco es invisible) **y teclado físico** — corrección respecto al pase 1: el handler global acepta dígitos `/^\d$/` y Backspace mientras el lock está visible (inline_1 líneas ~1000-1008). Cada dígito suena (`keySound` con la nota pentatónica index = dígito).
- **Al 4º dígito**: `buf===CODE ? success() : fail()` — comparación client-side, sin servidor, sin hash.
- `fail()`: "CÓDIGO INCORRECTO" + shake + acorde dissonante (220/233.1 Hz) + reset 650 ms. `success()`: "ACCESO CONCEDIDO", `unlockSound`, warp=1, flash, `#app` visible a los 650 ms, lock oculto a los 1,800 ms.
- **Sin persistencia del acceso**: ninguna cookie/token; cada carga exige el código. `localStorage["azteca_av"]` solo se escribe al usar el boleto (capturas confirman storage vacío tras desbloquear).
- **Gates internos vestigiales**: cada página deportiva (fb/nhl/mlb) contiene SU PROPIA copia del gate con el mismo código, pero al montarse como srcdoc el shell inyecta `window.__START` y las páginas arrancan con `#app` visible; además el blob de fb trae `<style>#lock{display:none!important}</style>` (descubierto en el fuente capturado por CDP — `ev_42137147…`). fb incluso conservaba navegación por flechas ←/→ + Enter sobre las ligas (hi 0..3).
- Rate-limit/lockout: no existe; intentos infinitos.

## 3. Arquitectura y temas visuales

- **Shell (dark)**: intro canvas (120 partículas + ondas verdes/doradas que se estiran en warp), balón 3D **ray-traced por píxel** (icosaedro 12 vértices/20 caras, proyección pentágonos/hexágonos, luz especular + rim + costuras, parallax con el puntero), Piedra del Sol SVG (`sunSVG`: 16 rayos, 104 ticks, 20 celdas con 5 glifos rotativos, 24 "frets", 4 cartouches), pirámide escalonada, robots webp base64 (`ROB[3]`), tarjetas con tilt 3D por puntero y hover-bell.
- **Páginas deportivas (tema claro)**: los blobs incluyen `<style id="light">` titulado "TEMA BLANCO UNIFORME (verde jade + oro azteca)" — fondo blanco, `--c1:#0e7a46`, `--c2:#13995a`, oro `#c9952b`, patrón zigzag dorado de fondo. Por eso las capturas internas se ven claras y el shell oscuro.
- **Overlay "ANALIZANDO EN TIEMPO REAL"** (teatralidad): robot con ojos que parpadean, lápiz que traza tinta SVG, anillo radar, partículas, revientapíxeles progresivo (1,500 ms), log de 9-10 líneas a 420 ms c/u ("Pitágoras… Log5… Poisson… Escaneando N mercados…"), botón SALTAR. El cálculo real ya estaba hecho; la animación es pura puesta en escena.

## 4. El modelo matemático — constantes exactas por deporte

### 4.1 Fútbol (fb.html)
- Baselines de liga `LG0`: PL 1.45, LL 1.35, **MX 1.51**, Serie A 1.21, Bundesliga 1.62, Ligue 1 1.41, otros 1.40. Fuerza de liga `STR` (PL 1, LL .98, BL/SA .96, L1 .92, MX .8, OT .85) para escalar en UEFA; baseline UEFA `LGU=1.45`.
- **Pitágoras**: exponente **1.7**; **Log5** neutro → odds ratio con **ventaja local .54**; **shrink .85** hacia 50%.
- **Tasa de equipo**: shrink bayesiano `(GF + 6·LG)/(PJ + 6)`; la fase actual 2026-27 entra con **peso ×3** (3 partidos). Equipos sin dato usan promedio de liga; `est(gd)=[55+gd/2, 55−gd/2]` estima GF/GC por diferencia de goles; banderas ESTIMADO/SIN DATO/ASCENDIDO.
- **Bajas** (215 registros): cada una resta goles a favor (atacante) o suma en contra (defensa) según `impacto × estado` (0 disponible, .5 duda, 1 fuera); piso .3. Notas citan fuentes (UEFA, ESPN, TUDN, Sports Mole, FPL, RotoWire, FutMercado, Excélsior, ClaroSports…).
- **Goles**: `lh = H.rs·A.ra/LG` (y espejo); `tilt()` ajusta por bisección (16 iter., multiplicador exp) hasta que el share condicional Poisson respete el Log5+local. **Corrección tipo Dixon-Coles τ** con ρ = **−.14 en Liga MX, −.08 resto** (ajusta 0-0/1-0/0-1/1-1). Rejilla 0..14 goles.
- **18 mercados**: 1X2, O/U línea (total redondeado a .5), favorito −1.5 / perdedor +1.5, O/U 3.5, DC 1X/X2/12, totales por equipo, ambos anotan (`(1−e^−lh)(1−e^−la)`).
- **Lógica del pick** (jerárquica): dominio (mejor ataque Y defensa) con p≥.42 → "GANA · DOMINA"; dominio cerrado → doble oportunidad; favorito ≥.5 → "FAVORITO (sin dominio total)"; DC ≥.65 → "SIN VENTAJA CLARA · OPCIÓN MÁS SEGURA"; si nada → Under 3.5 "TOTAL MÁS SEGURO". Empate ≥28% y pick ganador → DC ("EMPATE PROBABLE"). DC sola que paga poco → combinada **DC + Over 1.5** si condicional ≥.42 ("DOBLE OPORTUNIDAD + GOLES").
- **COMBOS "FAVORITO CLARO · GANA + GOLES"**: si favorito ≥62% y empate <28% → la combinada **ES el pick**. Over 2.5 si total proyectado ≥2.6 o el favorito promedia ≥3 GF/juego; si no Over 1.5. Probabilidad por matriz conjunta condicionada: `P(fav gana) × P(B | fav gana)`; umbral .35.

### 4.2 NHL (nhl.html)
- **32 equipos**, stats 2025-26 (GF/GA de 82 juegos; STL "SIN DATO"), **224 resultados 2026-27** acumulados y **88 noticias** con impacto (porteros pesan: Shesterkin .4 fuera por temporada, Hellebuyck .35 **traspasado a NJ** por Mercer/Daws/Bjugstad/derechos de Command + 2 picks, Ullmark .3, Gustavsson .25, Barkov .22, Barzal .2, Larkin suspendido sin sueldo…).
- Constantes: **E=2.15**, HFA **.525**, K=15 (prior vs 250/82), SHR .85, NG=22, **FORMW=.30** (últimos 5 juegos pesan 30% cuando el equipo lleva ≥7), sin corrección de empate (OT).
- Mercados (15): ML, ±1.5, O/U línea, **60 minutos** (1X2 reglamentario), totales por equipo, ambos anotan. Pick: dominio + ML≥.52 → "ML · DOMINA"; ML≥.58 → "ML FAVORITO"; si no → la más segura de [dog +1.5, Over, Under]. COMBOS: favorito ≥65%, Over 5.5 si total ≥5.8 (si no 4.5), exige **OVR≥.5** (consistencia histórica over del equipo), umbral .40.
- Calendario **6-13 nov (61 juegos)** incl. SEA@CAR en **Helsinki** (11:00 AM) + auditoría del 5 nov (11 juegos, OT/SO anotados).

### 4.3 MLB (mlb.html)
- Solo **8 equipos de playoffs** (RS/RA por juego + ERA de bullpen). **29 abridores** con ERA/IP; ajuste de pitcheo por **regresión bayesiana**: `ERA_reg=(ERA·IP + ERA_equipo·80)/(IP+80)`, factor `1+.55·(ERA_reg/ERA_equipo−1)` sobre RA. **29 bateadores clave** con impacto carreras/juego (Ohtani .50, Freeman .30, Ramírez .35…).
- Constantes: baseline **LG=4.40 carreras**, Pitágoras **EX=1.83**, HFA .54, SHR .85, **SD=3√2≈4.24**.
- **Distribución NORMAL en vez de Poisson**: Over/Under con `1−φ((línea−total)/SD)`; hándicap ±1.5 con `1−φ((1.5−dif)/SD)`. 6 mercados: ganador, O/U, ±1.5. Pick = mercado de mayor probabilidad. COMBOS: favorito ≥65%, Over 7.5 si total ≥8 (si no 6.5).
- Timeline completo de playoffs: ALDS/NLCS/ALCS/Serie Mundial **juego por juego (17)** con narrativa detallada (Misiorowski 103.5 mph récord, barrida 4-0 a LAD con HR de Ohtani, **MIL campeón 4-1**) — todo como auditoría ✓/✗ del modelo.

## 5. Boleto, bankroll y reglas de apuesta (completo)

- **Estado** `AV = {cfg:{start:1000, th:.6}, odds:{}, slip:[], bets:[], ovr, u, tab:"b"|"h"|"c", db, base, ready, arm}`; persistido en `localStorage["azteca_av"]` como `{cfg, odds, slip, bets}`.
- **Cuotas**: acepta **decimales >1 y americanas** (±100 → `1+v/100` / `1+100/−v`); coma decimal tolerada.
- **Regla de monto** (`unit`): EV = p·cuota − 1; si EV < **+4%** → 0 = "NO APOSTAR" (muestra la cuota mínima `(1.04)/p`); si pasa el umbral → **10% del bank** si p ≥ `cfg.th` (seleccionable .55/.60/.65/.70) o **5%** si es menor. Solo dos tamaños, por diseño.
- **Slip**: 1 selección = sencilla; 2+ = parlay (producto de probs y cuotas). **Cuota opcional del parlay** (`ovr`) si la casa paga distinto. **Advertencia de correlación** si dos selecciones son del mismo partido ("probabilidad combinada… puede estar inflada o desinflada"). "Cuota justa (sin margen)" = 1/p. Ganancia si acierta: u·(cuota−1) % del bank.
- **Registro**: `{id:"b"+ts36+rand, ts, legs[{l,m,sp,t,p,d}], p, d, stake=curBank·u/100, u, st:"p"}` → estados **p**endiente / **w**on / **l**ost / **v**nula (deshacer → p; borrar con doble toque "¿Borrar?").
- **Historial**: bankroll actual (piso 0), ganancia neta, ROI (neto/apostado), aciertos W/S y %, % de crecimiento del bank, pendientes + % bank en juego, **calibración** (prob. media del modelo vs acierto real; <30 apuestas "es suerte"; |Δ|<4% "bien calibrado"), y **BRK: ROI por liga y por tipo** (Parlay / Combinada gana+over / Doble oportunidad / Sencilla; aviso si <20 apuestas).
- **noVig**: quita el margen de la casa por grupos complementarios (1X2, totales, etc.) y muestra "Margen casa X: Y%" junto a cada mercado; los EV se calculan contra la cuota que tú escribes.
- **Límite**: máximo 800 cuotas guardadas (FIFO).

## 6. Protocolo iframe ↔ padre y sincronización en la nube

- Padre → iframe: `{av:"cfg", bank, th, odds, inSlip}` (al "ready", al cerrar el boleto y tras cambios).
- Iframe → padre: `{av:"ready"}`; `{av:"odd", k, v}`; `{av:"add", pk:{k,gk,sp,m,l,p,d,t}}` (toggle en el boleto + animación "bump"); texto `"home"` para cerrar el deporte. Claves: `"FB:comp:fecha:local-visitante|mercado"`, `"NHL:fecha:...", "MLB:fecha:...:serie"`.
- **Puente `window.claude`** (no es WebMCP — REA verificó **0 herramientas declaradas**, `ev_42f62932…`): si el entorno de hospedaje provee `claude.use("db")` + `claude.use("user")` → `AV.base="data/users/"+id`, docs `cfg|odds|slip` con cuerpos `{v}`/`{m}`/`{items}` y **colección `bets`** (`orderBy("ts","desc").limit(1000)`); API estilo Firestore (`.doc().get/set/delete`, `.collection()`). En errores `invalid_argument|revoked|not_granted` se degrada a localStorage con toast. En navegador normal **no existe** → todo local. El asistente IA usa `claude.use("sample")` con streaming; si no, **modo local** por keywords sobre el texto de la pantalla (9,000 chars).
- REA `trace_application_feature` (semilla `azteca_av`, `ev_1b6ea0f4…`) confirmó con grafo propio: nodo storage `azteca_av` con edges `persists_to` (setItem línea 195 / getItem 196) y las únicas referencias externas no resueltas: `AV.db.doc(...)`, `user.id()`, `.data()` — es decir, **el perímetro completo de la app es localStorage + ese puente**.

## 7. Motor de audio (WebAudio, todo generado)

- Cadena maestra: compressor (threshold −20, ratio 6) → gain .55; reverb por convolución con IR de ruido 2.6 s decaimiento 2.6.
- **Instrumentos**: campana (parciales 1/2.76/5.4), huehuetl (sine 135→46 Hz + ruido lowpass 950), caracol (3 osciladores saw/tri/sine + lowpass 380→1500→500 + LFO 5.2 Hz), ocarina (sine + vibrato 5.5 Hz + aliento bandpass), barridos (bandpass 180↔7000 + sine glide), drone (55/55.35/110.4/82.4 Hz con LFO en el filtro).
- **Escala pentatónica** PENT = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568].
- **Cues**: openingCue (melodía de ocarina + campanas), portal (stage 2), unlock (7 campanas ascendentes + 2 tambores), keySound (nota por dígito), tick, fail (220+233.1 Hz), nav/back, hover en tarjetas (throttle 250 ms). Ambient: campanas aleatorias cada 1–2.6 s y tambor cada 1.8 s. Arranque en el primer gesto (pointerdown/keydown/touchstart) o auto-resume si el contexto permite; toggles 🔊/🔇 (#snd, #snd2).

## 8. Inventario de datos (`data/inventory.json`)

| Colección | Cantidad | Notas |
|---|---|---|
| FB equipos | **115** | PL 20 · LL 20 · MX 18 · OT 39 · SA 6 · BL 6 · L1 6, con GF/GC/PJ 2025-26 + fase 2026-27 + banderas e/n/p |
| FB partidos | **183** | próximos: MX 9, LL 10, PL 10, UCL 0, UEL 0 (horas CST) · auditados: MX 27, LL 30, PL 30, UCL 54, UEL 72 |
| FB bajas/noticias | **215** | con fuente y fecha; editables en UI (estado + impacto) |
| FB competiciones | 5 | con tema (gradientes) y parejas del simulador: MX AME/MTY, LL BAR/RMA, PL ARS/MCI, UCL BMU/PSG, UEL SLB/B04 |
| NHL equipos | **32** | GF/GA 2025-26 |
| NHL resultados | **224** + 11 auditoría | temporada 2026-27 juego a juego |
| NHL noticias | **88** | incl. traspaso Hellebuyck→NJ, Shesterkin fuera por temporada, Larkin suspendido |
| NHL calendario | **61 juegos**, 9 días | 6–13 nov, incluye Helsinki |
| MLB equipos | 8 | playoffs |
| MLB abridores / bateadores | **29 / 29** | ERA+IP regresión; impactos por jugador |
| MLB timeline | **17 juegos** | ALDS→Serie Mundial, MIL campeón 4-1 |

Todos los datos tienen fecha al **6 nov 2026** y son estáticos (horneados). El reloj del header y los días se generan client-side; "ACTUALIZADO" es una etiqueta fija.

## 9. PICK DEL DÍA y PARLAY DEL DÍA (sistema de recomendación)

- **Universo**: fb = todos los partidos NO-auditoría de **todas las ligas** con la misma fecha ("TODAS LAS LIGAS"); NHL = el día actual; MLB = n/a (temporada cerrada).
- **Puntaje**: sin valor (escribiste cuotas y ninguna pasa EV+4%) → −1; con valor → 2+p; si no hay cuotas: p<.55 → −.5, p>.72 → penalización `.72−2(p−.72)` (los favoritos enormes no pagan), resto → p. El mejor puntaje ≥0 es el **PICK DEL DÍA**; si el mejor es −1 → "Ningún pick tiene valor"; si −.5 → "Ningún partido llega a 55%".
- **Parlay**: elegibles mercados 60–80% de probabilidad (de la lista blanca o combinadas `cb_`); cuota de respaldo ≈ justa/(1.05) o /(1.10) si es combinada; top **3** leg = parlay del día (+ "+AGREGAR LOS 3 AL BOLETO"); si hay ≥5, muestra **TOP 5** con advertencia explícita de que falla más. Cuotas en formato americano también.

## 10. Observaciones de seguridad (pase 2)

1. El código **[REDACTED_PIN] sigue siendo cosmético**: está en texto plano ×4 (shell + 3 páginas), sin hash, sin lockout, sin servidor. El teclado físico también lo acepta.
2. Nada de lo "protegido" está cifrado: los datos están en base64 en el HTML público.
3. El puente `window.claude` depositaría datos privados del boleto en `data/users/<id>/…` del entorno de hospedaje — en un hosting normal no existe y todo queda local; en uno que lo provea, la segregación depende por completo de ese servicio (la app confía ciegamente en `user.id()`).
4. Sin CSP, sin SRI, sin integridad de recursos: un compromiso del bundle de Netlify sería indetectable para el usuario.
5.Sin analítica ni rastreo — privacidad fuerte por omisión, pero también sin telemetría de errores.

## 11. Material y evidencia (pase 2)

| Artefacto | Ruta |
|---|---|
| Informe general (pase 1) | `INFORME.md` |
| Copias legibles | `readable/inline_1_readable.js` (1,132 l.), `inline_2_readable.js`, `fb/nhl/mlb_readable.js` + `_body.html` |
| Inventario de datos | `data/inventory.json` (+16 literales `.lit.js`) |
| Evidencia REA sesión completa (16 records) | `raw/session2.json` |
| Capturas | `raw/screenshots/` — añade `ev_007e8_home-settle.png` (móvil es-MX) |
| Herramientas | `tools/` (+`make_readable.py`, `extract_data.py`, `extract_all_shots.py`) |

**Nuevas evidencias REA:** list_browser_targets `ev_5d2443e9…`; inspect_web_page `ev_8e62f11f…` (720 nodos, título runtime); listeners `#lock` `ev_42137147…` (fuente vivo: tema claro + lock CSS); WebMCP `ev_42f62932…` (0 tools); móvil `ev_007e8371…`; trace `ev_1b6ea0f4…` (storage azteca_av + perímetro externo).

**Limitaciones:** no se ejercitaron en runtime el simulador ni la escritura de boleto dentro del sitio en vivo (cliques bloqueados por animaciones CSS; documentados desde el código, que es completo y sin ofuscación). El asistente IA no tiene backend propio: en un navegador común responde solo con el texto de pantalla.
