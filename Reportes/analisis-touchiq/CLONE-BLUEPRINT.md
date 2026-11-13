# TOUCH IQ — Blueprint de clonación completa

> Especificación extraída por ingeniería inversa (REA + ejecución offline verificada).
> Fecha del análisis: 2026-11-08 · Datos de la app congelados al "7 nov 2026".
> **Nota de ownership:** este blueprint asume que touchiq.com.mx es un proyecto propio/autorizado.
> Si no lo fuera, reutilizar su diseño y datos tal cual sería copiar el trabajo de otro — el
> documento sirve igualmente para construir una app propia con la misma arquitectura.

## 0. Dos caminos para "clonar"

| Camino | Qué es | Cuándo usarlo |
|---|---|---|
| **A. Desplegar el artefacto** | `index.html` (2.4 MB) YA ES la app completa y byte-idéntica. Subirlo a Netlify = página igual. | Recuperar/replicar exacto |
| **B. Reconstrucción limpia** | Reescribir cada módulo siguiendo este blueprint (código propio, misma lógica). | Tener fuente mantenible, quitar hardcode, agregar backend |

Artefactos en este directorio:
- `index.html` — la app entera (fuente única de verdad)
- `js-tree/script_{0,1,2}.js` — shell separado
- `page_nfl.html`, `page_ncaa.html` — documentos embebidos decodificados
- `page_nfl_s{0..10}.js`, `page_ncaa_s{0..2}.js` — scripts internos separados
- `engine/engine-nfl.js` — motor extraído y ejecutable (verificación 5/5 vs UI)
- `app-evidence.json` — Evidence REA (15 MB)

---

## 1. Arquitectura general

```
┌─────────────────────────── index.html (2.4 MB, Netlify) ───────────────────────────┐
│ CSS inline (dark theme + light app theme)                                          │
│ <div id="lock"> intro canvas + pad PIN  ──►  <div id="app"> home + <iframe #fr>    │
│ script_0: shell completo + PAGES={nfl, ncaa} (HTML base64)                         │
│ script_1: trío de robots (JPEG base64, decorativo)                                 │
│ script_2: asistente IA (local + window.claude)                                     │
└────────────────────────────────────────────────────────────────────────────────────┘
                                          │ openSport(i): dec(b64) + inyecta
                                          │ <head><script>window.__START="NFL"  ← código muerto (nadie lo lee)
                                          ▼
┌───────────────────── <iframe srcdoc> "TOUCH IQ · NFL" (1.34 MB) ───────────────────┐
│ s1: MOTOR + RENDER (44 fns)   s3: props   s4: avatares/feed/noticias               │
│ s5: mascotas (webp b64)       s6: avatar helper  s7: video robot (webm b64)        │
│ s8: animaciones scroll        s9: tab DINERO (DK)   s10: fix visibilidad paneles   │
└────────────────────────────────────────────────────────────────────────────────────┘
        ▲│ postMessage (protocolo §6)
        └▼ 0 requests de red en toda la app
```

**Principios de diseño observados:** un solo archivo autosuficiente · datos embebidos y
congelados (el autor los transcribe a mano) · cálculo 100% cliente · persistencia dual
(puente Claude → BD; fallback → localStorage) · fallbacks silenciosos con toast.

---

## 2. Mapa de módulos del shell (`script_0`, tail)

| Sección (@offset) | Funciones | Responsabilidad |
|---|---|---|
| utilidades [86] | `hex` | color → "r,g,b" |
| Piedra del Sol HUD [257] | `sunSVG`, `playSVG`, `tqLogo`, `rot` | SVGs del logo/hero |
| pizarrón de jugadas [4330] | — | canvas del intro |
| pirámide + rejilla [8150] | — | capas del intro |
| balón 3D [9288] | `loop` | balón flotante |
| intro: sonido, código, canvas [12524] | `buf`, `stage`, `T0`, `intro` | estado del lock |
| motor de audio [12789] | `AU`, `PENT` (escala pentatónica), `initAudio`, `actx`, `muteApply`, `out`, `env`, `noiseBuf`, `bell`, `drum`, `conch`, `ocarina`, `sweep`, `drone`, `chimeLoop`, `beat`, `openingCue` | banda sonora sintetizada (WebAudio, sin samples) |
| selector (PIN) [25191] | `portal`, `unlockSound`, `keySound`, `tick`, `failSound`, `navSound`, `backSound`, `startScore`, `onFirst`, `tryAuto`, `goStage2`, `key`, `fail`, `success` | flujo: stage1 → stage2 → `buf===CODE` |
| intro canvas [23079] | `rs`, `rb`, `pill`, `frame`, `spark` | partículas/ondas/ticker |
| tarjetas [28245] | `emblem`, `bc`, `tilt` | escudos SVG + tarjetas 3D |
| home/nav [119675] | `drawHome`, `lv2`, `lv1`, `clk`, `openSport`, `closeSport` | niveles LV1/LV2, iframe |
| boleto/bankroll [122207] | `AV`, `money`, `pct`, `decO`, `esc`, `profit`, `curBank`, `unitOf`, `lsSave/Load`, `save/flush`, `saveBet`, `delBet`, `avInit`, `pushCfg`, `toast`, `renderSlip`, `BRK`, `openSlip`, `closeSlip` | estado AV + persistencia + UI del boleto |

Constantes del shell: `CODE="[REDACTED_PIN]"` (hardcodeada), `SP=[NFL (#1f6bff), NCAA (#e63946)]`,
`ROB=[robots con img webp]`, `AV={cfg:{start:1000, th:.6}, odds:{}, slip:[], bets:[], ovr, u, tab, db, base, ready, arm}`.

### script_2 — Asistente IA
- Chips fijos: "Mejor pick de hoy" · "Bajas importantes" · "¿Cómo decide la IA?" · "Resumen de esta pantalla".
- `ctx()`: describe pantalla + `pageText()` (texto del iframe, 9k chars) + `inj()` (top 45 bajas por impacto, lee `N` del iframe).
- Ruta LLM: `window.claude.use("sample")` → prompt en español, máx 100 palabras, solo datos en pantalla, "no consejo de apuesta".
- Ruta local: `local(q)` — regex por intención (bajas/pick/fórmula) + matching de palabras sobre el texto de pantalla.
- Fuente mostrada: "Respuesta de Claude…" vs "Modo local: responde con los datos de esta pantalla".

---

## 3. Esquema de datos (todo embebido, con fuente citada)

| Array | Formato | Fuente citada en código |
|---|---|---|
| `T` (NFL) | `{COD:[nombre, PF_2025, PA_2025]}` (totales de temporada) | Pro-Football-Reference |
| `R` | `[[visitante, local, ptsV, ptsL], …]` temporada 2026 | cosecha propia |
| `D` | `[[día, [[h, a, hora, ref?, sc?, pick?], …]], …]` + día "Resultados…" para auditoría | calendario oficial (transcripción) |
| `N` | `[[id, equipo, jugador(pos), "gf"\|"ga", impacto(0.2–2), estatus(0/.25/.5/1), detalle+fuente, fecha], …]` | NFL.com / Yahoo / CBS, fecha por renglón |
| `AUD` | juegos auditados (mismo formato que R) | marcadores oficiales |
| `PJ` | `[[equipo, nombre, pos, JJ, ydsPase, TDPase, acarreos, ydsT, TDT, recep, ydsR, TDR, estatus, nota], …]` | PFR al 19 oct + reportes de equipo |
| `DF` | `{COD:[JJ, ptsPermitidos, ydsPasePermitidos, ydsTierraPermitidos]}` | "(Pro-Football-Reference, al 19 oct)" |
| `JN` | números de camiseta `{equipo\|jugador: #}` | "(rosters de CBS Sports, 20 oct)" |
| `MONEY` | `{src:"DraftKings (DK Network, «Betting Splits»)", ts:"sáb 7 nov 2:08–3:41 PM CDMX", …}` splits por mercado/juego | DK Network |
| `NEWS` | `[[importancia 1–3, equipo, titular, detalle, fecha], …]` | manual |
| `T` (NCAA) | `{COD:[nombre, PF/juego, PA/juego, JJ, conferencia]}` | — |
| `CONF` | multiplicador de fuerza por conferencia (default 0.9) | — |
| PAGES | `{nfl: b64(1.34MB), ncaa: b64(97KB)}` | — |

Constantes del motor NFL: `E=2.37, HFA=.55, K=6, NG=76, SDM=13.4, SDT=13.3, SDP=9.5,
LGPF=395, NEUT={"JAX-PHI","JAX-HOU"} (Londres), ed={} (overrides manuales, vacío)`.
NCAA: `E=2.37, HFA=.56, K=3, SHR=.85, NG=96, SDM=15.5, LGP/LGS` propios.

---

## 4. El motor NFL (fórmulas exactas, verificadas por ejecución)

```js
// 1) Fuerza de equipo (con freno K=6)
w  = n/(n+K)                                  // n = juegos 2026 jugados
rs = (PF_2025/17)*(1-w) + (PF_2026_juego)*w   // ídem ra
LG = promedio(rs) de los 32 equipos           // LGPF=395 fallback

// 2) Lesiones (efectivo)
d  = impacto × estatus                        // QB titular ≈ 4–5 pts
rs -= d (ofensa "gf") | ra += d (defensa "ga") // piso 8 pts

// 3) Modelo por partido
py(t) = rs^2.37 / (rs^2.37 + ra^2.37)         // Pitágoras
pn    = (x − x·y) / (x + y − 2·x·y)           // Log5 (neutral)
hf    = .55 (o .50 si NEUT)                   // localía
pH    = o/(1+o),  o = odds(pn)·odds(hf)       // P(gana local)
tot   = rs_H·ra_A/LG + rs_A·ra_H/LG           // total proyectado
mu    = 13.4 · Φ⁻¹(pH)                        // margen (φ: Abramowitz-Stegun; Φ⁻¹: bisección 50 iter)
lh/la = tot/2 ± mu/2                          // puntos proyectados por equipo

// 4) Mercados (todas las probabilidades = colas normales)
spread  L = half(|mu|)  (mín 1.5, a .5)   p(cover L) = 1−Φ((L−|mu|)/13.4)
total   line = half(tot)                  p(over)    = 1−Φ((line−tot)/13.3)
team totals lH/lA = half(lh/la)           p(over)    = 1−Φ((l−media)/9.5)
alt lines   −3.5 / −7.5                   mismas curvas

// 5) Pick por partido (bandas)
pF ≥ .72 → favorito por x=half(mf−13.4·Φ⁻¹(.62))   ("FAVORITO CLARO · GANA POR N O MÁS")
.58–.72 → ML del favorito                          ("ML · FAVORITO/DOMINA EN OF. Y DEF.")
pF < .58 → no-favorito +xd, xd=half(mf+13.4·Φ⁻¹(.65)) ("JUEGO PAREJO · PUNTOS AL NO FAVORITO")
dom = domina ofensiva y defensiva (rs> y ra<)

// 6) Pick del día / parlays (fórmula 80/20, comentario del autor verbatim en código)
PCONS(p) = .5 + .85·(p−.5)                 // encoge 15% hacia 50%
SC       = .8·p + .2·(PCONS(p)·cuota)      // puntaje; +0.05 si es el mejor EV del juego
QMIN     = 1.40; pool: p∈[pmin, .85]
PLC      = parlay seguro: CAND con p≥.60, top 5 → 3 mejores
PLR      = parlay arriesgado: p≥.52, top 14, cuota total ∈[3,7] más cercana a 5 (RKT=5)
cuota default si no hay: 1/(p·1.05) (×1.10 en combinadas)   // por eso el "≈ 1.40"

// 7) Combinadas cb_ (DESACTIVADAS en UI: CMB(){return ""})
cmbOT(P,Q): matriz conjunta de marcadores, empates repartidos 50/50 (sin push)
P(fav y B) = P(fav) · P(B | fav)  desde la matriz

// 8) Props (s3)
shr(tot, JJ, pr) = (tot + pr·2)/(JJ + 2)   // freno 2 juegos hacia promedio de posición
fct(v, lg)       = 1 + .5·(v/lg − 1)       // defensa rival: MITAD del exceso vs liga
PRI = {QB:{py:225,ptd:1.4,ry:15,td:.15}, RB:{ry:60,rec:2.5,rcy:18,td:.5},
       WR:{rec:4.5,rcy:55,td:.35}, TE:{rec:3.5,rcy:38,td:.3}}
LGP=220, LGR=110, LGS=23.1 (promedios liga por equipo/juego)
fP/fR/fS = fct(DF rival / juego, LG·)
QB: ydsPase~N(shr·fP,62), TDPase~Poisson(shr·fS), ydsT~N(·,max(12,.55·ry)) si ry≥18
RB: ydsT~N(·,max(15,.45·μ)), recep Poisson si ≥1.5/JJ, "Anota TD"~Poisson(shr(TD+TDR)·fS)
WR/TE: ydsR~N(·,max(14,.55·μ)), recep~Poisson, TD~Poisson
pprob: td→1−e^(−μ); recep→1−poisCDF(⌊L⌋,μ); yds→1−Φ((L−μ)/σ)
safeAlt: línea con P(over)≈0.68 (Poisson) o redondeo a .5 (yardas)
top props: TD con P≥.45; yds/recep con P∈[.64,.78], mínimos 20 yds / 3.5 recep

// 9) Auditoría
juegos pasados: se recalcula con SA=build(R) (sin el juego) y SIN lesiones
cada mercado evalúa su f(ptsLocal, ptsVisit) → ✓/✗; tally de picks pre-partido ("1-0", "4-1")
badge UI: "Modo auditoría · sin reporte de lesiones" / "Leyendo reporte de lesiones · N ajustes"
```

**Verificación (harness `engine/engine-nfl.js`):** WAS@LAR→LAR ML 67.8% ≈1.40 ·
LAC@HOU→HOU 66.2% ≈1.44 · SEA−3.5 66.2% · IND+5.5 65.5% · etiquetas idénticas. 5/5.

### Motor NCAA (diferencias)
`T` en promedios por juego + conferencia; `build()` propio:
`rs = (avg·G + LGP·K + pts)/(G + K + n)` (K=3) y luego **ajuste de conferencia**
`rs×cf, ra÷cf` (`cf=CONF[conf]`, default .9). `SDM=15.5` (márgenes más dispersos).
Pick por umbral 55% (sin bandas 58/72, sin 80/20, sin combinadas: "los marcadores
colegiales son muy disparejos"). Tabs: PARTIDOS | SIMULADOR | NOTAS | EQUIPOS.

---

## 5. Protocolo shell ↔ iframe (postMessage)

| Dirección | Mensaje | Campos |
|---|---|---|
| iframe → shell | `{av:"ready"}` | handshake al cargar |
| shell → iframe | `{av:"cfg", bank, th, odds, inSlip}` | bankroll, umbral sizing, mapa de cuotas `SO`, claves en boleto |
| iframe → shell | `{av:"odd", k, v}` | cuota escrita por el usuario (k=`"NFL:dom:AW-AL\|mercado"`) |
| iframe → shell | `{av:"add", pk:{k, gk, sp, m, l, p, d, t}}` | agregar/quitar del boleto |
| iframe → shell | `"home"` (string) | botón Atrás del iframe |
| inyección | `<head><script>window.__START="NFL"` | código muerto (0 consumidores) |

El iframe expone `AVX` (`addBtn`, `unit`, `odds`) y el shell `pushCfg()` tras cada cambio.
Render del iframe: `h.replace("<head>", "<head><script>window.__START=…<\/script>")` + `srcdoc`.

---

## 5b. Capa de dinero dentro del iframe (`page_nfl_s0.js` — puente AVX)

```js
A.unit(p,d)   = EV≤0 → 0 · p≥th → 10% · else 5%      // sizing local (igual que el shell)
A.noVig(g,od) = p_i = (1/d_i)/Σ(1/d_j); margen = Σ(1/d_j)−1   // "casa N%" sin vig en las filas
A.stakeBox    = "APUESTA SUGERIDA · EV +N%" + "+ BOLETO" · "Sin valor a X · no apostar ·
                necesitas cuota ≥ 1/p" (break-even) · animación count-up de %
A.setOdd/add  → postMessage al shell; escucha {av:"cfg"} para bank/th/odds/inSlip
A.anim        = ease-out cúbico en los % y delays escalonados por fila
```

## 5c. Tab 💰 DINERO (`page_nfl_s9.js`) — esquema y lógica exactos

```js
MONEY = {src:"DraftKings (DK Network, «Betting Splits»)", ts:"…",
  g:{"ATL-CIN":{sp:{l:"CIN -3", bh:26,ba:74, mh:21,ma:79},     // línea, % boletos, % dinero
                ml:{l:"ATL +145 / CIN -175", bh:17,ba:83, mh:18,ma:82},
                tot:{l:"52.5", bo:83,bu:17, mo:58,mu:42}}, …}}  // 14 juegos × 3 mercados
tags:  💵 "Dinero fuerte en X"  si dinero−boletos ≥ 12 pts (señal de apuestas grandes)
       👥 "Público con X"       si boletos ≥ 75%
       🤖 chip IA = modelo REAL en vivo: model(h,a,S,false) → "IA: gana {fav} {p}%" /
          "IA: total {line} · Over {pO}%"   [verificado: CIN 56.2→"56%", NO 73%, DAL 50%]
paneles: "MÁS DINERO · {mercado}" (top 4 por % dinero) · "DINERO FUERTE" (dif ≥12, top 4)
INJ box: top 3 bajas del juego ordenadas por impacto×estatus ("fuera"/"duda")
disclaimer: una sola casa, cambia hasta kickoff, "apuesta solo lo que puedas perder"
IMPORTANTE: MONEY NO alimenta al modelo (independientes) y las líneas DK NO se
precargan como cuotas — son contraste informativo; el usuario escribe sus cuotas.
```

## 6. Estado y persistencia

```
AV = {cfg:{start:1000, th:.6}, odds:{}, slip:[], bets:[], ovr:"", u:null, tab:"b", db:null, base:null, ready:false, arm:null}
apuesta = {id:"b"+ts36+rand, ts, legs:[{l,m,sp,t,p,d}], p, d, stake, u(%), st:"p"|"w"|"l"|"v"}
```
- **Con puente Claude** (`window.claude.use("db"/"user")` → `data/users/<id>/cfg|odds|slip` + `…/cfg/bets`): doc.set/get, `bets` con `orderBy("ts","desc").limit(1000)`.
- **Sin puente**: `localStorage["azteca_av"]` = `{cfg, odds, slip, bets}`.
- Errores `invalid_argument|revoked|not_granted` → `db=null`, fallback local + toast.
- Guardado con debounce 500 ms (`save` → `flush`), cola con busy/again por nombre.
- Sizing: `unitOf(p,d)` → 10% si p≥th y EV>0; 5% si EV>0; 0 = "No apostar".
- EV = p·d − 1; cuotas aceptan decimal o americana (`decO`: ±100 → conversión).
- ROI por liga y por tipo (Sencilla/Parlay/"Combinada (gana + over)"/"Doble oportunidad"), nota de calibración (<30 = suerte; ±4% = calibrado).

---

## 7. Inventario UI (pantallas y componentes)

1. **Lock stage 1**: canvas synthwave (pirámide, rejilla perspectiva, partículas, ticker
   "FÚTBOL NHL MLB UCL", balón 3D), Piedra del Sol HUD, trío de robots, botón "Entra a la cancha".
2. **Lock stage 2**: pad 4 dígitos (1–9, hueco, 0, ⌫), 4 dots, mensajes ("BIENVENIDO",
   "CÓDIGO INCORRECTO", "ACCESO CONCEDIDO"), shake/flash/warp.
3. **Home LV1**: hero "Cada jugada, calculada", chip "MODELO ACTIVO · NFL + NCAA · fecha",
   bento con robots (tilt 3D, glow), reloj `clk()` (20 s), botón ✦ IA, botón BOLETO(n).
4. **Home LV2**: grid de deportes con escudos `emblem()` (NFL azul / NCAA rojo).
5. **Deporte (iframe)**: header + tabs (g/s/w/n/e/j/m NFL · g/s/w/e NCAA), chips de día,
   topPanel (Resultados ✓, 🎯 Parlay seguro, 🔥 Parlay arriesgado), ⭐ Pick del día (prob ·
   cuota default · fórmula explicada · ANALIZAR ▸), Ranking del día (5 mejores por SC),
   tarjetas de juego (`card`) con mercados agrupados (`GR`) y filas `row` (barra de prob,
   cuota justa, input de cuota, EV, % bank).
6. **SIMULADOR**: selects LOCAL/VISITA (32 equipos / Top NCAA) → `tile(SIM)` reusa el
   modelo; botón ANALIZAR → canvas que "descodifica" al robot (26→1 px, 2.6 s, easing
   1−(1−p)^2.2) + líneas SVG de escritura + SALTAR ▸.
7. **LESIONES**: feed con importancia (AFECTA POCO/IMPORTANTE/MUY IMPORTANTE) + **editor
   en vivo** (select estado + input impacto) — mini-CMS del autor.
8. **NOTICIAS**: feed manual `NEWS()` por importancia.
9. **EQUIPOS**: tabla PF 2025/PA 2025/JJ 2026.
10. **JUGADORES**: props con líneas editables (`PLINE`), top 5 TDs + top 6 líneas alternativas.
11. **💰 DINERO**: splits DK (Boletos vs Dinero por lado, tabs Spread/ML/Total), chips
    "Dinero fuerte en X (+N pts vs boletos)" (umbral 12 pts), "Público con X", "IA: gana X N%"
    + bajas clave del juego.
12. **BOLETO (panel)**: tabs Boleto/Historial/Config; legs con cuota por pierna, warn de
    correlación (mismo juego), parlay: prob combinada, cuota justa, cuota casa/override,
    EV, sizing 5%/10%, REGISTRAR/VACIAR; historial: 6 stats + calibración + ROI por liga/tipo
    + apuestas con Ganó/Perdió/Nula/Deshacer/Borrar (armado en 2 clicks); config: bankroll
    inicial, umbral 10% (55/60/65/70), dónde se guarda.
13. **Asistente IA**: panel flotante con chips y chat.
14. **Toast** global (2.2 s).

---

## 8. Sonido y arte

- **WebAudio 100% sintetizado** (sin archivos): drone base, chimeLoop (campanas
  pentatónicas `PENT=[440…1568]`), beat (huehuetl), caracol (conch), ocarina, sweeps.
  Cada dígito del PIN = nota pentatónica (`keySound(d)`); hover de tarjetas = campanita
  (rate-limit 250 ms); nav = sweep+drum; fail = drum+semitono descendente.
- Imágenes: robots y mascotas **webp base64 embebido** (versiones sanas/vendadas por
  lesión), trío de la intro JPEG, video del robot "estudiando" (webm base64), logo/sol SVG.
- Estética: NFL azul `#1f6bff`, NCAA rojo `#e63946`, oro `#f5c26b`, turquesa `#5ee7ff`;
  dark lock + light app; bordes redondeados, glass, tilt 3D con `--mx/--my/--rx/--ry`.

---

## 9. Flujo de actualización semanal (el trabajo humano que el código no hace)

1. PFR → actualizar `R` (resultados) y `DF`/`PJ` (defensas y jugadores) con fecha citada.
2. Reportes de lesiones (NFL.com/Yahoo/CBS) → `N` (rol, impacto, estatus, fuente, fecha).
3. DK Network → `MONEY` (boletos/dinero por mercado, con timestamp de la toma).
4. Calendario → `D`; tras jugar, mover a "Resultados" con marcador y pick pre-partido → `AUD`.
5. Noticias → `NEWS`; baselines de T solo cambian de temporada.
6. Recomputar `S/SA` es automático al cargar; deploy del `index.html` a Netlify.

---

## 10. Infraestructura y despliegue

- **Hosting**: Netlify (static, HTTP/2, HSTS, `cache-control: public,max-age=0,must-revalidate`).
- **Deploy**: un solo `index.html` → drag-and-drop / git en Netlify. Sin build, sin env vars.
- **Opcional**: host con `window.claude` (AgentEnv/ZCode) que provea `db`, `user.id()`,
  `sample(messages,{cache,onText})` para persistencia por usuario y IA con LLM.
- **Seguridad observada**: `CODE` hardcodeada (cosmética), `postMessage(…, "*")` sin origen,
  sin backend de datos propio → el "privado por usuario" solo existe bajo puente Claude.

---

## 11. Checklist de reconstrucción limpia (orden sugerido)

1. Shell HTML/CSS: lock 2 etapas + pad + `CODE`; intro canvas + audio engine.
2. Home: SP/ROB, bento, lgrid, tilt, reloj, nav LV1/LV2.
3. Contrato iframe: `openSport` (srcdoc + inyección), postMessage (§5), `AVX`.
4. Motor NFL: `build/rebuild/eff/model0` (§4) — **validar contra el harness**.
5. Mercados y pick rule; picks del día/parlays (SC/PCONS/QMIN).
6. Boleto/bankroll completo (AV, renderSlip, BRK, sizing, EV).
7. Props (PJ/DF/PRI/shr/fct/pprob/safeAlt) y LESIONES editable + NOTICIAS.
8. Tab DINERO (splits DK + "dinero fuerte" ≥12 pts + chips IA).
9. SIMULADOR + ANALIZAR (animación) + auditoría (SA, sin lesiones, ✓/✗).
10. NCAA con conferencias (build propio, SDM 15.5, pick 55%).
11. Asistente IA (local + puente LLM) y persistencia dual (§6).
12. Actualización de datos semanal (§9) + Netlify (§10).

> Referencia cruzada: cada función citada existe con offset en los archivos de este
> directorio (`script_0_tail.js`, `page_nfl_s1.js`, …) — el código fuente de la lógica
> completa está ahí; este blueprint es su mapa.
