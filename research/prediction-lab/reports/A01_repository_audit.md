# A01 — Auditoría del repositorio y de los motores existentes

**Worktree:** `/Users/jairbonilla/PitchLab-Prediction-Lab` · **Rama:** `prediction-lab` · **Commit:** `8424876` (2026-11-08)
**Fecha:** 2026-11-09 · **Alcance:** arquitectura, motores, datos, tests y riesgos de integración. No se modificó código ni git.

---

## 0. Veredicto ejecutivo

**OBSERVADO:** el repositorio contiene una reconstrucción de alta fidelidad de motores heurísticos de terceros (TOUCH IQ: NFL/NCAA/props; AztecaVet: fútbol/NHL/MLB/picks/bankroll). La fidelidad se demuestra contra oráculos extraídos del bundle: 324 tests de paridad con tolerancia 1e-9 y 24 tests dorados contra la UI. La suite pasa: **416/416 tests en 9 archivos (3.52 s)**.

**OBSERVADO:** esa fidelidad **no es validez predictiva**. No hay entrenamiento, parámetros estimados con datos, calibración, partición temporal ni cuotas históricas. Los únicos "backtests" son auditorías retrospectivas del propio sitio: 1 juego NFL, 5 NCAA, 213 fútbol, 11 NHL y 17 MLB.

**INFERIDO:** los motores sirven como **baselines congelados y especificación de features** (Pitágoras, Log5, Poisson+Dixon-Coles, shrinkage), no como el "motor de predicciones validado" del laboratorio.

---

## 1. Arquitectura observada

### 1.1 Capas y frameworks

| Capa | Contenido | Dependencias | Estado |
|---|---|---|---|
| Dominio | `src/domain/{stats,types,betting,props}.ts`, `engine-nfl.ts`, `engine-ncaa.ts`, `aztecavet/*` | TS puro; solo `stats.ts` y tipos | OBSERVADO |
| Datos | `src/data/*.json` + fachada `src/data/index.ts` | Importa tipos del dominio (`src/data/index.ts:29-32`) | OBSERVADO |
| Shell/UI | `src/shell/{main,store,audio,art,assistant}.ts` | DOM nativo, sin framework; Vite | OBSERVADO |
| Tests | `tests/domain/*.test.ts`, `tests/linemate_*.test.ts` | Vitest 2.1.9; oráculos `reference/aztecavet/*.mjs` | OBSERVADO |

No hay dependencias de runtime: `package.json:12-17` solo declara `playwright`, `typescript`, `vite` y `vitest` como `devDependencies`. El build es `tsc --noEmit && vite build` (`package.json:8`).

### 1.2 Entrypoints reales

- `aztecavet.html:4` carga `/src/shell/main.ts`. Ese shell importa `store`, `audio`, `art`, `assistant` y **solo el tipo** `Bet` del dominio (`src/shell/main.ts:7-12`). **Ningún motor se instancia en runtime**: `grep "new (NflEngine|NcaaEngine|FootballEngine|HockeyEngine|BaseballEngine)" src` no devuelve resultados.
- `football.html:4`, `mlb.html:4` y `nhl.html:4` cargan `/src/pages/{football,mlb,nhl}.ts`, pero `src/pages/` solo contiene `*-dom.html`; los módulos TS no existen (OBSERVADO). El iframe usa `"/" + s.pg + ".html"` (`src/shell/main.ts:222`) y las entradas `pg: "fb"` (`:22-28`), mientras el archivo es `football.html`, no `fb.html`: **404** (INFERIDO).
- El gate hace `fetch("/api/access")` (`main.ts:50`) sin servidor en el repo: bloquea la UI en Vite puro (INFERIDO).

**OBSERVADO:** el único camino de ejecución real de los motores hoy son los tests.

### 1.3 Grafo de dependencias

```
data/index.ts ──(tipos)──> domain/types.ts
                         ├─ engine-nfl.ts ──> stats.ts, types.ts
                         ├─ engine-ncaa.ts ─> stats.ts, types.ts
                         ├─ props.ts ───────> stats.ts, types.ts
                         └─ betting.ts ─────> stats.ts

aztecavet/football.ts ──> ../stats.ts, constants.ts, types.ts
aztecavet/hockey.ts ────> stats, constants, types, football.ts (pois/over)
aztecavet/baseball.ts ──> stats, constants, types, football.ts (pois)
aztecavet/bankroll.ts ──> stats, constants, ../betting.ts (tipos)
aztecavet/index.ts ─────> reexporta todo
tests/domain/* ─────────> domain + data + reference/*.mjs
shell/main.ts ──(tipo)──> aztecavet/index.ts
```

Dos acoplamientos: `hockey.ts:14` y `baseball.ts:14` importan `pois`/`over` de `football.ts`; y la capa de datos importa tipos de los motores (`src/data/index.ts:30-31`). No hay barrel raíz ni alias de paths; todos los imports usan `.js` sobre TS (`football.ts:11-15`), convención que el módulo nuevo debe respetar.

### 1.4 Build y typecheck

**OBSERVADO:** `npx tsc --noEmit` **falla con 74 errores** en 12 archivos: `src/data/index.ts:37` (casts de JSON a tuplas), `engine-nfl.ts:69-78` y `engine-ncaa.ts:85-90` (`noUncheckedIndexedAccess`), `props.ts:49-70`, `betting.ts:60-64`, `shell/store.ts` (14) y `shell/audio.ts:99,153`. `tsconfig.json:6-7` activa `strict` y `noUncheckedIndexedAccess`; `:16` incluye `src` y `tests`.

`npm run build` no puede completarse: se detiene en `tsc`. Los tests pasan porque Vitest transpila sin typecheck. Cualquier archivo en `src/domain/prediction/` será typechecked junto con esos 74 errores, sin señal limpia hasta sanear el baseline.

---

## 2. Inventario de motores

| Motor | Archivo (bajo `src/domain/`) | Entradas | Salidas | Fórmulas / parámetros duros | ¿Entrenado? | ¿Calibrado? | ¿OOS? | Evidencia (líneas) |
|---|---|---|---|---|---|---|---|---|
| NFL | `engine-nfl.ts` | 32 equipos PF/PA 2025, 121 resultados, 154 lesiones | 14–15 mercados, `pH`, `mu`, pick | Pitágoras E=2.37, Log5, HFA=.55, K=6, SDM=13.4, SDT=13.3 | No | No | No (1 juego) | `:50-89`, `:122-128`, `:149-164`, `:166-187` |
| NCAA | `engine-ncaa.ts` | 99 equipos, 121 resultados | 14 mercados, `pH`, pick | K=3, SHR=.85, E=2.37, HFA=.56, SDM=15.5 | No | No | No (5 juegos; replay 2-3 vs 4-1) | `:65-96`, `:121-130`, `:146-177` |
| Fútbol | `aztecavet/football.ts` | 115 equipos, 242 fixtures, 215 bajas, cuotas de usuario | 18–19 mercados, matriz Poisson, pick | K=6, E=1.7, HFA=.54, SHR=.85, ρ=−.14 MX / −.08 resto | No | No | No (213 auditorías) | `:158-172`, `:198-232`, `:264-319` |
| NHL | `aztecavet/hockey.ts` | 32 equipos, 224 resultados, 88 noticias | 15 mercados, pick | K=15, prior 250/82, E=2.15, HFA=.525, forma 30% | No | No | No (11 auditorías) | `:86-141`, `:181-242` |
| MLB | `aztecavet/baseball.ts` | 8 equipos, 29 abridores, 29 bateadores, 17 juegos | 6 mercados, pick máximo | E=1.83, HFA=.54, σ=3√2, ERA prior IP=80, factor=.55 | No | No | No (17 juegos) | `:78-104`, `:106-139` |
| Props | `props.ts` | 144 jugadores, 28 defensas, priors | mercados normal/Poisson | `shr=(tot+2·prior)/(g+2)`, `fct=1+.5(v/lg−1)` | No | No | No | `:16-19`, `:37-72` |
| Picks/bankroll | `picks.ts`, `bankroll.ts` | probabilidades y cuotas de usuario | score, parlay, sizing, EV, noVig | rango 60–80%, EV≥4%, 5/10% | No aplica | No aplica | No aplica | `picks.ts:28-64`; `bankroll.ts:27-49` |

### 2.1 Pipelines reales

**NFL (OBSERVADO).** `build()` normaliza PF/PA por 17 juegos y mezcla con 2026 vía `w=n/(n+6)`; `eff()` aplica lesiones `impacto×estatus` con piso 8 (`engine-nfl.ts:50-114`). Pitágoras → Log5 → localía odds-ratio → `pH` (`:122-128`); margen `mu=SDM·Φ⁻¹(pH)` y colas normales para líneas (`:130-146`); 14 mercados (`:149-164`); pick con bandas 72/58 (`:166-187`).

**NCAA (OBSERVADO).** `rs=(avg·G+LGP·K+pts)/(G+K+n)` con K=3 y ajuste por conferencia (`engine-ncaa.ts:65-96`); shrink extra `pH=.5+SHR·(Log5+HFA−.5)` (`:121-130`); pick de tres ramas (`:146-177`).

**Fútbol (OBSERVADO).** `base()` shrink K=6 con fase 2026-27 ×3 (`football.ts:158-172`) → `rate()` escala UEFA (`:176-181`) → `inj()` con piso .3 (`:184-196`) → Pitágoras 1.7 → Log5 → HFA .54 → SHR .85 (`:203-209`) → **tilt por bisección (16 iteraciones)** (`:64-74`, `:210`) → Poisson 0..13 con Dixon-Coles τ (`:216-232`) → 18 mercados (`:233-262`) → pick jerárquico (`:264-294`) → empate≥.28 pasa a DC y DC barata a DC+Over 1.5 (`:291-319`) → combinada "favorito claro" que sustituye al pick (`:365-407`).

**NHL (OBSERVADO).** Prior 250/82 con `w=n/(n+15)` y forma reciente 30% de últimos 5 si ≥7 (`hockey.ts:86-141`); noticias con piso 1.5 (`:158-174`); Pitágoras 2.15 → Log5 → HFA .525 → SHR .85; Poisson 0..21 sin Dixon-Coles (`:181-202`); 15 mercados y pick dominio/ML (`:211-242`); combinada con filtro `OVR≥.5` (`:250-267`).

**MLB (OBSERVADO).** Bateadores fuera y regresión `ERA_reg=(ERA·IP+ERA_eq·80)/(IP+80)`, `f=1+.55·(ERA_reg/ERA_eq−1)` (`baseball.ts:78-104`); Pitágoras 1.83 → Log5 → HFA .54 → SHR .85; normal σ=3√2 (`:106-134`); 6 mercados y pick máximo (`:135-139`).

**Props (OBSERVADO).** `shr` frena dos juegos al prior de posición; `fct` aplica mitad del exceso defensivo; yardas normal, recepciones/TD Poisson (`props.ts:16-19`, `:37-100`). Sin validación contra resultados.

### 2.2 ¿De dónde salen HFA=.54, ρ=−.14/−.08, K=6, E=1.7?

**OBSERVADO:** son literales transcritos del bundle. `constants.ts:2-5` lo declara; los valores están en `:17` (E=1.7), `:19` (HFA=.54), `:27` (K=6), `:33-34` (ρ). `STR` es "suposición mínima del original" (`:12`) y `EST_BASE=55` un prior para equipos sin dato (`:35-36`). NFL/NCAA están en `nfl-constants.json:1` y `ncaa-constants.json:1`, también extraídos del cliente.

**OBSERVADO:** no hay estimación con datos. Buscar `calibr|optim|fit|MLE|backtest|cross-valid|train` en `src/` y `scripts/` solo devuelve etiquetas de UI, `calibration()` del historial de apuestas (`bankroll.ts:113-126`) y comentarios de tests. No existe script de ajuste.

**INFERIDO:** son elecciones editoriales del autor (probablemente de literatura: exponentes 1.83/2.15/2.37, HFA .54–.56, ρ≈−.1). Su justificación es **DESCONOCIDA**.

**OBSERVADO:** los motores AztecaVet no permiten recalibrar: `FootballEngine` no recibe constantes (`football.ts:76-82`), `HockeyEngine` tampoco (`hockey.ts:19-26`) ni `BaseballEngine` (`baseball.ts:19-25`); importan `FB`/`NHL`/`MLB` directamente. NFL/NCAA aceptan `constants` (`engine-nfl.ts:23-28`, `engine-ncaa.ts:30-37`), pero es configuración estática.

La documentación ya lo distingue: `docs/09-football-engine.md:60` ("no hay calibración ajustable en el original"); `Reportes/18-engine-nfl-report.md:112` (calibración formal "NO es posible"); `Reportes/19-engine-ncaa-report.md:82` (5 picks, muestra insuficiente). El riesgo es que el README ("362/362", "motores 100% verificados") se lea como validación predictiva.

---

## 3. Inventario de datos

| Dataset | Archivo | Volumen | Contenido | ¿Serie histórica? |
|---|---|---|---|---|
| Fútbol equipos | `aztecavet-fb-teams.json` | 115 | `[código,nombre,liga,GF,GC,PJ,[GF,GC,PJ 26-27]|0,bandera,comps]` | No: agregado 25-26 + fase 26-27 |
| Fútbol fixtures | `aztecavet-fb-fixtures.json` | 242 juegos | 213 con `sc` (auditorías) + 29 futuros; 3–6 jornadas | Parcial |
| Fútbol bajas | `aztecavet-fb-injuries.json` | 215 | `id,t,n,r,i,st,h,d` con cita | Instantánea 6 nov |
| NFL | `nfl-*.json` | 32 equipos, 121 resultados, 15 juegos, 154 lesiones | `[visita,local,ptsV,ptsL]`; sin fecha ni cuota | Parcial (~7.6 juegos/equipo) |
| NCAA | `ncaa-*.json` | 99 equipos, 121 resultados, 37 juegos | 32 futuros + 5 auditados | Parcial (~1.2 juegos/equipo) |
| NHL | `aztecavet-nhl-*.json` | 32 equipos, 224 resultados, 61 juegos, 88 noticias | `[local,visita,golesL,golesV]`; 50 futuros + 11 auditados | Parcial (14 juegos/equipo) |
| MLB | `aztecavet-mlb-*.json` | 8 equipos, 29 pitchers, 29 bateadores, 17 juegos | timeline 8–28 oct | Solo 17 juegos |
| Cuotas | — | 0 | No hay archivo; `OddsMap` se llena con input | No |
| Splits | `money.json` | 14 juegos | % de boletos/dinero (DraftKings), no precios | Instantánea |

**OBSERVADO:** la fachada declara "instantánea del 7 nov 2026" (`src/data/index.ts:3-4`; `DATA_AS_OF` en `:52`); `aztecavet-meta.json:1` fija `dataDate: 2026-11-06`. Los resultados no tienen `season`, `match_date`, `match_id` ni `odds_*`; son listas de marcadores (p. ej. `["SJ","LA",5,4]`), lo que impide un join temporal exacto.

**OBSERVADO:** no hay cuotas históricas. `docs/09-football-engine.md:15` lo dice; los tests construyen motores con `odds: {}` (`aztecavet-parity.test.ts:34,49,56`). El EV solo existe cuando el usuario teclea una cuota (`football.ts:410-424`).

**INFERIDO:** cobertura insuficiente para entrenar o validar: 17 MLB, 11 NHL y 5 NCAA no permiten calibrar con intervalos útiles; los 213 de fútbol cubren 3–5 jornadas de 5 competiciones y no son independientes (equipos y fechas repetidos).

---

## 4. Tests: qué garantizan y qué no

### 4.1 Ejecución real

```
$ npx vitest run
Test Files  9 passed (9)
Tests       416 passed (416)
Duration    3.52s
```

**OBSERVADO:** 392 tests son del dominio (324 paridad + 30 matemáticas + 24 dorados + 8 experimentos + 3 batch + 3 sensibilidad). Los 24 restantes son **tres copias** del mismo test de Linemate (8 cada una), descubiertas en `tests/`, `Reportes/analisis-linemate/...` y `research/linemate/...` porque no hay `vitest.config.*` que limite el `include`. El README habla de 362, ya desactualizado.

**OBSERVADO:** `npx tsc --noEmit` falla con 74 errores, pero `npm test` no ejecuta typecheck: suite verde ≠ proyecto compilable.

### 4.2 Qué garantizan

- **Paridad verbatim (324):** 242 juegos de fútbol, 61 NHL + sim y 17 MLB + sim; compara IDs, etiquetas, probabilidades (ε<1e-9), pick y `why` contra el oráculo (`aztecavet-parity.test.ts:59-70`, `:72-141`); también `bestOf`/`NOB` (`:143-175`).
- **Identidades matemáticas (30):** `dec`, borde EV=+4%, `noVig` normalizado, `slipSummary`, `registerBet`, las tres ramas de `calibration`, scoring y parlay (`aztecavet-math.test.ts:14-262`).
- **Dorados de UI (24):** WAS@LAR 67.8%, LAC@HOU 66.2%, SEA −3.5 66.2%, IND +5.5 65.5%, MICH 71.5% (`golden.test.ts:54-126`).
- **Determinismo:** E3 restaura una baja y comprueba que el resultado vuelve exactamente (`aztecavet-experiments.test.ts:126-142`).

### 4.3 Qué NO garantizan

- **Calidad predictiva, calibración o generalización temporal.** No hay split train/val/test, walk-forward, comparación contra cuotas de cierre ni IC. La paridad es identidad contra el mismo bundle, no prueba contra la realidad.
- **Que los backtests se cumplan.** `batch-verify.test.ts` **no tiene ningún `expect`**: solo `console.log`; el "Δmax=0" (`:57-58`, `:81`) es un log. Su backtest NCAA imprime `2-3` frente al registro `4-1` y **no falla** (`:84-109`, especialmente `:108`). `sensitivity.test.ts:10-35` también es solo logging. En `aztecavet-experiments.test.ts`, E4 fútbol solo exige `hit>0` (`:156`) y NHL `hit>=0` (`:179`); solo MLB fija `9/17` y `11/17` (`:198-199`), con n=17.
- **Que los motores estén conectados a la app.** No hay call sites en `src/shell`.
- **Hermeticidad:** `aztecavet-experiments.test.ts:233-238` escribe `evidence/statistical-tests/aztecavet-experiments.json` durante la suite. En esta auditoría se modificó por la ejecución y se restauró con `git restore`; el módulo nuevo no debe repetir ese patrón.

---

## 5. Evidencia predictiva propia (no paridad)

Recalculé métricas sobre las auditorías del bundle con un script temporal fuera del repo (`npx vite-node --script /tmp/pitchlab_eval.ts`), con las condiciones declaradas (`au=true`/`nn=true`). **OBSERVADO (cálculo propio, sin IC):**

| Conjunto | n | Acierto pick | Prob. media declarada | Brier | Log loss |
|---|---:|---:|---:|---:|---:|
| Fútbol, auditorías | 213 | 131 (61.5%) | 52.1% | 0.2424 | 0.6777 |
| NHL, 5 nov | 11 | 8 (72.7%) | 58.6% | 0.2360 | 0.6623 |
| MLB, postemporada | 17 | 9 (52.9%) | 60.8% | 0.2523 | 0.6980 |

Para el 1X2 de fútbol (`m.w/m.d/m.l`, no el pick heterogéneo):

| Métrica | Valor | Referencia |
|---|---:|---|
| Accuracy argmax | 55.4% | — |
| Brier multiclase | 0.6010 | 0.6362 base-rate |
| Log loss | 1.0072 | — |
| Brier skill score | +5.5% | — |
| Prob. media H/D/A | .3895/.2590/.3516 | real .4413/.1643/.3944 |

**INFERIDO:** hay señal débil (5.5% de mejora en Brier), pero el modelo **sobreestima el empate ~9.5 pp** y subestima la victoria local. El acierto del pick (61.5%) no es comparable con la probabilidad media (52.1%) porque el pick se elige entre mercados heterogéneos (DC, Under 3.5), no es una probabilidad calibrada de un evento binario. Con 213 juegos de 5 competiciones y equipos repetidos no hay base para afirmar generalización.

**Veredicto:** "paridad validada", no "predicción validada". Sirven como baseline honesto y referencia de implementación, no como modelo del laboratorio.

---

## 6. Riesgos para `src/domain/prediction/`

| # | Riesgo | Evidencia | Impacto |
|---|---|---|---|
| R1 | `tsc` roto y build bloqueado | `package.json:8`; errores en `data/index.ts:37`, `engine-nfl.ts:69-78`, `props.ts:49-70`, `store.ts` | P0: el módulo nuevo no tendrá typecheck limpio |
| R2 | Contratos legacy no canónicos | `types.ts:36-42` (`Market.f(p,q)` con firmas incompatibles), `:59-77`; `aztecavet/types.ts:71-99` | P0: no reutilizar `Model`/`Market`; crear `Prediction` con simplex validado |
| R3 | Sin config de Vitest | `package.json:9`; 9 archivos, 3 copias Linemate | P1: tests nuevos enterrados entre duplicados |
| R4 | Dependencia datos→dominio | `data/index.ts:29-32` | P1: el módulo no debe ser importado por `data`; evitar ciclos |
| R5 | Constantes no inyectables en AztecaVet | `football.ts:76-82`, `hockey.ts:19-26`, `baseball.ts:19-25` | P1: no se puede calibrar sin editar; el lab debe envolver |
| R6 | UI sin entrypoints de deporte | `football.html:4`, `mlb.html:4`, `nhl.html:4`; `src/pages/` solo `*-dom.html`; `main.ts:222` | P1: integración UI imposible; no acoplar el modelo al shell |
| R7 | Sin dataset temporal ni odds | `data/index.ts:3-4`; `docs/09:15`; resultados sin fecha | P0: features/entrenamiento/backtest requieren ETL externo |
| R8 | Tests que escriben en el repo | `aztecavet-experiments.test.ts:233-238` | P2: tests nuevos herméticos |
| R9 | Resolución ESM `.js` y JSON | `tsconfig.json:5,12`; `football.ts:11-15` | P2: respetar specifiers y no importar JSON en runtime |
| R10 | Colisiones de nombres | `aztecavet/index.ts:1-7`; `Bet`/`Market`/`Model` repetidos | P2: nombres únicos o namespaces |

---

## 7. Recomendaciones priorizadas

### P0 — bloqueantes de validez

| ID | Acción | Criterio de aceptación verificable |
|---|---|---|
| P0-1 | Sanear typecheck o aislar baseline | `npx tsc --noEmit` sale 0; `npm run build` completa; el módulo nuevo no añade errores |
| P0-2 | Congelar contrato canónico | `src/domain/prediction/types.ts` con `matchId`, `pHome+pDraw+pAway=1±1e-6`, `modelId`, `modelVersion`, `generatedAt`; tests de simplex, NaN y determinismo |
| P0-3 | Construir dataset temporal (multi-temporada, fecha, resultado y cuotas open/close) | Cobertura por liga/temporada; ≥5 temporadas; 0 duplicados de `match_id`; test anti-leakage `match_date < fecha de predicción` |
| P0-4 | Evaluación walk-forward real antes de afirmar validez | Log loss/Brier/RPS/ECE en `dev/val/test` congelados; baselines base-rate, Elo y mercado; IC bootstrap; test usado una vez |

### P1 — ingeniería y trazabilidad

| ID | Acción | Criterio de aceptación |
|---|---|---|
| P1-1 | Configurar Vitest y eliminar tests vacíos | `include: ["tests/**/*.test.ts"]`; `batch-verify` y `sensitivity` con asserts; mutar una fórmula clave rompe al menos un test |
| P1-2 | Registro de procedencia de parámetros | Cada constante nueva con `source` (paper/bundle/estimación), fecha y owner; ninguna sin justificar |
| P1-3 | Separar legacy de lab | `prediction/` no importa `aztecavet/*`; si necesita Pitágoras/Log5, los reimplementa con parámetros inyectables y tests propios |
| P1-4 | Arreglar o desacoplar UI | `vite build` genera artefactos y `aztecavet.html` carga sin 404; o se declara UI fuera de alcance |

### P2 — calidad y operación

| ID | Acción | Criterio de aceptación |
|---|---|---|
| P2-1 | Calibración isotónica/Platt solo en validación | ECE y Brier mejoran con IC95 que no cruza 0; calibración por clase reportada |
| P2-2 | Registro de modelos/artefactos | `config.json` con seed, commit, features y hash; predicciones reproducibles bit a bit |
| P2-3 | Veracidad documental | README/Reportes con matriz "paridad vs validez"; ninguna afirmación de "motor validado" sin P0-4 |

---

## 8. Reproducibilidad y referencias

**Comandos ejecutados (solo lectura):** `git status --short`; `git log --oneline -15`; `npx vitest run` (9 archivos, 416 tests, 3.52 s); `npx tsc --noEmit` (74 errores, exit 2); `npx vite-node --script /tmp/pitchlab_eval.ts`.

**Referencias `archivo:línea` verificadas** (las tablas usan la ruta de su columna «Archivo»; aquí van completas):

1. `package.json:8` — build `tsc --noEmit && vite build`.
2. `tsconfig.json:6-7` — `strict` + `noUncheckedIndexedAccess`.
3. `src/data/index.ts:3-4` — datos como instantánea.
4. `src/data/index.ts:29-32` — datos importan tipos del dominio.
5. `src/shell/main.ts:10-12` — el shell solo importa el tipo `Bet`.
6. `src/shell/main.ts:222` — iframe; `:22-28` usa `pg:"fb"`.
7. `football.html:4`, `mlb.html:4`, `nhl.html:4` — entrypoints a `src/pages/*.ts` inexistentes.
8. `src/domain/aztecavet/constants.ts:12-36` — constantes transcritas, `STR` "suposición mínima", E/HFA/K/ρ.
9. `src/domain/aztecavet/football.ts:158-172` — shrink K=6 y fase ×3.
10. `src/domain/aztecavet/football.ts:198-232` — Pitágoras, Log5, HFA, tilt, Poisson+Dixon-Coles.
11. `src/domain/aztecavet/football.ts:264-319` — pick jerárquico y DC+Over 1.5.
12. `src/domain/aztecavet/hockey.ts:123-141` — forma reciente 30%.
13. `src/domain/aztecavet/baseball.ts:88-94` — regresión ERA.
14. `src/domain/engine-nfl.ts:50-89` — build NFL K=6.
15. `src/domain/engine-nfl.ts:166-187` — bandas de pick 72/58.
16. `src/domain/engine-ncaa.ts:65-96` — build NCAA con conferencia.
17. `tests/domain/aztecavet-parity.test.ts:59-70` — tolerancia 1e-9.
18. `tests/domain/aztecavet-parity.test.ts:96` — 242 partidos (29 + 213).
19. `tests/domain/aztecavet-experiments.test.ts:156` — E4 fútbol solo `hit>0`.
20. `tests/domain/aztecavet-experiments.test.ts:179` — E4 NHL solo `hit>=0`.
21. `tests/domain/batch-verify.test.ts:108` — backtest NCAA 2-3 vs 4-1 sin assert.
22. `tests/domain/sensitivity.test.ts:10-35` — solo `console.log`.
23. `src/domain/aztecavet/bankroll.ts:113-126` — "calibración" es feedback de apuestas.
24. `docs/09-football-engine.md:60` — "no hay calibración ajustable".
25. `docs/11-mlb-engine.md:55` — 17 juegos no permiten calibración a largo plazo.

**Limitaciones:** no se levantó el servidor ni se ejecutó la UI; las métricas de §5 son descriptivas, sin IC ni corrección por dependencia entre partidos.
