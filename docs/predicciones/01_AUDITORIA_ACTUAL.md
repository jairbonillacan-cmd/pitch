# 01 — Auditoría actual: arquitectura, motores y deuda técnica

**Documento:** consolidación de A01 (auditoría de repositorio) y A09 (auditoría adversarial preliminar).
**Worktree auditado:** `/Users/jairbonilla/PitchLab-Prediction-Lab` · rama `prediction-lab` · commit `8424876` (2026-11-08).
**Fecha de consolidación:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY.
**Regla de evidencia:** `OBSERVADO` = comando o `archivo:línea`; `INFERIDO` = consecuencia razonada. No hay afirmaciones de validez predictiva sin partición temporal.

> Este documento **no repite** los informes: fija el mapa, conserva las cifras con su `n` y remite al informe fuente para el detalle.
> Fuentes: [`A01_repository_audit.md`](../../research/prediction-lab/reports/A01_repository_audit.md) · [`A09_adversarial_preliminary.md`](../../research/prediction-lab/reports/A09_adversarial_preliminary.md).

---

## 0. Veredicto en una tabla

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Existen motores de predicción? | Sí: 5 motores (fútbol, NHL, MLB, NFL, NCAA) + props/picks | `src/domain/**`, tabla §2 |
| ¿Están entrenados con datos? | **No.** Constantes transcritas de un bundle de terceros | `constants.ts:2-5`, `:12-36` |
| ¿Hay paridad con el original? | **Sí y es real:** 324 tests, ε<1e-9, 242 partidos | `aztecavet-parity.test.ts:59-70`, `:96` |
| ¿Hay validez predictiva? | **No.** Sin split temporal, sin calibración, sin cuotas históricas | A01 §4.3; A09 R04 |
| ¿La suite prueba algo? | 416/416, pero 3 archivos no tienen `expect` y 24 tests son 3 copias | `batch-verify.test.ts:84-109`; `sensitivity.test.ts:10-35` |
| ¿El proyecto compila? | **No:** `npx tsc --noEmit` = 74 errores; `npm run build` se detiene | `package.json:8`; A01 §1.4 |
| ¿Los motores están en la UI? | No: ningún motor se instancia en runtime; entrypoints de deporte rotos | `src/shell/main.ts:7-12`, `:222` |
| ¿Los datos son históricos? | **No:** instantáneas del 6–7 nov 2026 sin fecha por partido ni cuotas | `src/data/index.ts:3-4`, `:52` |
| ¿Hay leakage? | **Sí, localizado:** Liga MX y NHL (§5) | A09 R01, R02 |
| ¿Se puede llamar «motor validado»? | **No.** «Paridad validada, predicción no validada» | A01 §0; A09 §0 |

---

## 1. Arquitectura observada

### 1.1 Capas y frameworks

| Capa | Contenido | Dependencias | Estado |
|---|---|---|---|
| Dominio | `src/domain/{stats,types,betting,props}.ts`, `engine-nfl.ts`, `engine-ncaa.ts`, `aztecavet/*` | TypeScript puro; solo `stats.ts` y tipos | OBSERVADO |
| Datos | `src/data/*.json` + fachada `src/data/index.ts` | Importa tipos del dominio (`src/data/index.ts:29-32`) | OBSERVADO |
| Shell/UI | `src/shell/{main,store,audio,art,assistant}.ts` | DOM nativo, sin framework; Vite | OBSERVADO |
| Tests | `tests/domain/*.test.ts`, `tests/linemate_*.test.ts` | Vitest 2.1.9; oráculos `reference/aztecavet/*.mjs` | OBSERVADO |

No hay dependencias de runtime: `package.json:12-17` solo declara `playwright`, `typescript`, `vite` y `vitest` como `devDependencies`. El build es `tsc --noEmit && vite build` (`package.json:8`). No existe `vitest.config.*`.

### 1.2 Entrypoints reales y el 404 del iframe

- `aztecavet.html:4` carga `/src/shell/main.ts`. Ese shell importa `store`, `audio`, `art`, `assistant` y **solo el tipo** `Bet` del dominio (`src/shell/main.ts:7-12`). `grep "new (NflEngine|NcaaEngine|FootballEngine|HockeyEngine|BaseballEngine)" src` no devuelve resultados: **ningún motor se instancia en runtime**.
- `football.html:4`, `mlb.html:4` y `nhl.html:4` cargan `/src/pages/{football,mlb,nhl}.ts`, pero `src/pages/` solo contiene `*-dom.html`; los módulos TS no existen.
- El iframe usa `"/" + s.pg + ".html"` (`src/shell/main.ts:222`) y las entradas declaran `pg: "fb"` (`:22-28`), mientras el archivo es `football.html`, no `fb.html`: **404** (INFERIDO).
- El gate hace `fetch("/api/access")` (`main.ts:50`) sin servidor en el repo: bloquea la UI en Vite puro (INFERIDO).

**OBSERVADO:** hoy el único camino de ejecución real de los motores son los tests.

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

Dos acoplamientos a vigilar: `hockey.ts:14` y `baseball.ts:14` importan `pois`/`over` de `football.ts`; y la capa de datos importa tipos de los motores (`src/data/index.ts:30-31`). No hay barrel raíz ni alias de paths; todos los imports usan `.js` sobre TS (`football.ts:11-15`).

### 1.4 Build y typecheck

**OBSERVADO:** `npx tsc --noEmit` **falla con 74 errores en 12 archivos** (exit 2):

| Archivo | Cluster |
|---|---|
| `src/data/index.ts:37` | casts de JSON a tuplas |
| `src/domain/engine-nfl.ts:69-78` | `noUncheckedIndexedAccess` |
| `src/domain/engine-ncaa.ts:85-90` | `noUncheckedIndexedAccess` |
| `src/domain/props.ts:49-70` | índices posiblemente `undefined` |
| `src/domain/betting.ts:60-64` | ídem |
| `src/shell/store.ts` | 14 errores |
| `src/shell/audio.ts:99,153` | ídem |

`tsconfig.json:6-7` activa `strict` y `noUncheckedIndexedAccess`; `:16` incluye `src` y `tests`. `npm run build` no puede completarse porque se detiene en `tsc`. Los tests pasan porque Vitest transpila sin typecheck: **suite verde ≠ proyecto compilable**.

**INFERIDO:** cualquier archivo nuevo en `src/domain/prediction/` será typechecked junto con esos 74 errores y no habrá señal limpia hasta sanear el baseline.

**Actualización (A10, 03:19):** el módulo nuevo (`src/domain/prediction/{types,engine}.ts` + tests) **compila limpio** con `tsc` estricto y pasa **21/21** tests; los 74 errores siguen siendo del baseline legacy y **0** caen en rutas A10. La deuda P0-1 (build global) permanece abierta.

---

## 2. Motores: inventario, fórmulas y parámetros

| Motor | Archivo (bajo `src/domain/`) | Entradas | Salidas | Parámetros duros | ¿Entrenado? | ¿Calibrado? | ¿OOS? | Evidencia |
|---|---|---|---|---|---|---|---|---|
| NFL | `engine-nfl.ts` | 32 equipos PF/PA 2025, 121 resultados, 154 lesiones | 14–15 mercados, `pH`, `mu`, pick | Pitágoras E=2.37, Log5, HFA=.55, K=6, SDM=13.4, SDT=13.3 | No | No | No (1 juego) | `:50-89`, `:122-128`, `:149-164`, `:166-187` |
| NCAA | `engine-ncaa.ts` | 99 equipos, 121 resultados | 14 mercados, `pH`, pick | K=3, SHR=.85, E=2.37, HFA=.56, SDM=15.5 | No | No | No (5 juegos; replay 2-3 vs 4-1) | `:65-96`, `:121-130`, `:146-177` |
| Fútbol | `aztecavet/football.ts` | 115 equipos, 242 fixtures, 215 bajas, cuotas de usuario | 18–19 mercados, matriz Poisson, pick | K=6, E=1.7, HFA=.54, SHR=.85, ρ=−.14 MX / −.08 resto | No | No | No (213 auditorías) | `:158-172`, `:198-232`, `:264-319` |
| NHL | `aztecavet/hockey.ts` | 32 equipos, 224 resultados, 88 noticias | 15 mercados, pick | K=15, prior 250/82, E=2.15, HFA=.525, forma 30 % | No | No | No (11 auditorías) | `:86-141`, `:181-242` |
| MLB | `aztecavet/baseball.ts` | 8 equipos, 29 abridores, 29 bateadores, 17 juegos | 6 mercados, pick máximo | E=1.83, HFA=.54, σ=3√2, ERA prior IP=80, factor=.55 | No | No | No (17 juegos) | `:78-104`, `:106-139` |
| Props | `props.ts` | 144 jugadores, 28 defensas, priors | mercados normal/Poisson | `shr=(tot+2·prior)/(g+2)`, `fct=1+.5(v/lg−1)` | No | No | No | `:16-19`, `:37-72` |
| Picks/bankroll | `picks.ts`, `bankroll.ts` | probabilidades y cuotas de usuario | score, parlay, sizing, EV, noVig | rango 60–80 %, EV≥4 %, 5/10 % | No aplica | No aplica | No aplica | `picks.ts:28-64`; `bankroll.ts:27-49` |

### 2.1 Cadenas de cálculo (lo que realmente hacen)

- **Fútbol:** `base()` shrink K=6 con fase 2026-27 ×3 (`football.ts:158-172`) → `rate()` escala UEFA (`:176-181`) → `inj()` con piso .3 (`:184-196`) → Pitágoras 1.7 → Log5 → HFA .54 → SHR .85 (`:203-209`) → **tilt por bisección** (`:64-74`, `:210`) → Poisson 0..13 con Dixon-Coles τ (`:216-232`) → 18 mercados (`:233-262`) → pick jerárquico (`:264-294`) → empate≥.28 pasa a DC y DC barata a DC+Over 1.5 (`:291-319`).
- **NFL:** `build()` normaliza PF/PA por 17 juegos y mezcla con 2026 vía `w=n/(n+6)`; `eff()` aplica lesiones `impacto×estatus` con piso 8 (`engine-nfl.ts:50-114`). Pitágoras → Log5 → localía odds-ratio → `pH` (`:122-128`); margen `mu=SDM·Φ⁻¹(pH)` (`:130-146`); pick con bandas 72/58 (`:166-187`).
- **NCAA:** `rs=(avg·G+LGP·K+pts)/(G+K+n)` con K=3 y ajuste por conferencia (`engine-ncaa.ts:65-96`); shrink `pH=.5+SHR·(Log5+HFA−.5)` (`:121-130`).
- **NHL:** prior 250/82 con `w=n/(n+15)` y forma 30 % de los últimos 5 si ≥7 (`hockey.ts:86-141`); Poisson 0..21 **sin** Dixon-Coles (`:181-202`); 15 mercados (`:211-242`).
- **MLB:** regresión `ERA_reg=(ERA·IP+ERA_eq·80)/(IP+80)`, `f=1+.55·(ERA_reg/ERA_eq−1)` (`baseball.ts:78-104`); normal σ=3√2 (`:106-134`).

### 2.2 ¿De dónde salen E=1.7, HFA=.54, ρ=−.14/−.08, K=6?

**OBSERVADO:** son literales transcritos del bundle. `constants.ts:2-5` lo declara; los valores están en `:17` (E=1.7), `:19` (HFA=.54), `:27` (K=6), `:33-34` (ρ). `STR` es «suposición mínima del original» (`:12`) y `EST_BASE=55` un prior para equipos sin dato (`:35-36`).

**OBSERVADO:** no hay estimación con datos. Buscar `calibr|optim|fit|MLE|backtest|cross-valid|train` en `src/` y `scripts/` solo devuelve etiquetas de UI, `calibration()` del historial de apuestas (`bankroll.ts:113-126`) y comentarios de tests. No existe script de ajuste.

**OBSERVADO:** los motores AztecaVet **no permiten recalibrar**: `FootballEngine` no recibe constantes (`football.ts:76-82`), `HockeyEngine` tampoco (`hockey.ts:19-26`) ni `BaseballEngine` (`baseball.ts:19-25`). NFL/NCAA aceptan `constants` (`engine-nfl.ts:23-28`, `engine-ncaa.ts:30-37`), pero es configuración estática.

La documentación ya lo admitía: `docs/09-football-engine.md:60` («no hay calibración ajustable en el original»), `Reportes/18-engine-nfl-report.md:112`, `Reportes/19-engine-ncaa-report.md:82`. El riesgo es leer el README («362/362», «motores 100 % verificados») como validación predictiva.

---

## 3. Paridad ≠ validez

### 3.1 Qué comparan los 324 tests de paridad

Contra `reference/aztecavet/*.mjs`, código *verbatim* extraído del bundle con **las mismas constantes**: IDs, etiquetas, probabilidades (ε<1e-9), pick y `why` en 242 partidos de fútbol, 61 NHL + simulación y 17 MLB + simulación (`tests/domain/aztecavet-parity.test.ts:59-70`, `:72-141`; 242 partidos en `:96`).

**INFERIDO:** un bug fielmente reproducido —ρ erróneo, `NOB` roto, leakage— **pasa** los 324 tests. La paridad mide fidelidad de transcripción, no calidad de pronóstico.

### 3.2 Inventario de la suite: qué garantiza cada familia

| Familia | n | Qué garantiza | Qué NO garantiza | Evidencia |
|---|---:|---|---|---|
| Paridad | 324 | identidad numérica con el bundle (ε<1e-9) | validez, calibración ni generalización | `aztecavet-parity.test.ts:59-70` |
| Identidades matemáticas | 30 | `dec`, borde EV=+4 %, `noVig` normalizado, scoring, parlay | política de stake ni datos reales | `aztecavet-math.test.ts:14-262` |
| Dorados de UI | 24 | 5 valores puntuales (WAS@LAR 67.8 %, etc.) | nada agregado; tolerancia real 2 decimales | `golden.test.ts:54-126`; A09 R19 |
| Experimentos E1–E5 | 8 | determinismo de E3 (`abs(Δ)<1e-15`) y conteos laxos | que el backtest se cumpla | `aztecavet-experiments.test.ts:126-142` |
| Batch verify | 3 | nada (solo `console.log`) | todo | `batch-verify.test.ts:35-109` |
| Sensibilidad | 3 | nada (solo `console.log`) | todo | `sensitivity.test.ts:10-35` |
| Linemate (×3 copias) | 24 | suite ajena duplicada | nada del motor | A01 §4.1 |

Total `npx vitest run`: **416 tests en 9 archivos (3.52 s)**; los 392 de dominio son los relevantes. El «362» del README está desactualizado.

### 3.3 Tests que no verifican lo que dicen

- `batch-verify.test.ts` **no tiene ningún `expect`**: el «Δmax=0» es un log (`:57-58`, `:81`) y su backtest NCAA imprime `2-3` frente al registro `4-1` y **no falla** (`:84-109`, especialmente `:108`). Además evalúa el ML del motor (`pickSide = m.pH >= .5 ? g.h : g.a`, `:103-104`), no el pick almacenado `g.pk`, que sí daría 4-1.
- `sensitivity.test.ts:10-35` solo hace `console.log`.
- E4 fútbol exige `hit>0` (`aztecavet-experiments.test.ts:156`); E4 NHL `hit>=0` (`:179`); solo MLB fija `9/17` y `11/17` (`:198-199`), con n=17.
- **Hermetismo:** `aztecavet-experiments.test.ts:233-238` escribe `evidence/statistical-tests/aztecavet-experiments.json` durante la suite; en la auditoría se restauró con `git restore`.

---

## 4. Leakage legacy (motores actuales)

> Distinto del leakage de features del laboratorio (priors S+1), que se documenta en [`05_FEATURE_ENGINEERING.md`](05_FEATURE_ENGINEERING.md).

### 4.1 Liga MX: totales de la temporada en curso

**Mecanismo (OBSERVADO).** `base()` usa siempre `t.gf/t.ga/t.gp`; `au=true` solo desactiva `cur` y bajas (`football.ts:158-173`, `:200-201`). Para MX, `gf/ga/gp` son la temporada 2026-27 en curso (15 PJ, `cur=0`), no la 2025-26; con `cur=0`, `au=true` no excluye nada. Fixtures: `aztecavet-fb-teams.json:672-681` (SAN 21/20/15), `:683-692` (NEC 16/28/15), `:507-516` (TOL 31/21/15). El «backtest» está en `tests/domain/aztecavet-experiments.test.ts:145-157` (`MX[3]`, `8/9`).

**Impacto medido (OBSERVADO, sonda que resta la jornada objetivo y las posteriores de `gf/ga/gp`):**

| Jornada | Base (con fuga) | Pre-partido (sin fuga) | Δ |
|---|---:|---:|---:|
| J15 (9 juegos) | **8/9** | **5/9** | −3 |
| J14 (9) | 5/9 | 4/9 | −1 |
| J13 (9) | 7/9 | 7/9 | 0 |
| **Total 27** | **20/27 (74.1 %)** | **16/27 (59.3 %)** | **−4** |

Cambios de pick, no solo de probabilidad: AME–TOL (2-2) `dco15` 61.0 % W → `h` 43.3 % L (−17.7 pp); LEO–TOL `dco15` 55.3 % → `a` 43.2 % (−12.1 pp); JUA–QRO `a` 49.6 % → 57.6 % (−8.0 pp).

### 4.2 NHL: doble conteo de las 11 auditorías

**Mecanismo (OBSERVADO).** Las 11 auditorías están dentro de `aztecavet-nhl-results.json:1281-1345`; `SA=buildWithForm(R)` las incluye y `S=buildWithForm(R.concat(AUD))` las cuenta dos veces (`hockey.ts:143-146`), con forma que usa los últimos 5 incluido el partido auditado (`:123-141`). `docs/10-nhl-engine.md:19,54` afirma que `SA` es «sin la auditoría»: **es falso** (A09 R16).

| Escenario | Picks | ML | Brier | p media |
|---|---:|---:|---:|---:|
| `SA=R` (incluye las 11) | **8/11** | **9/11** | .2360 | .5864 |
| `SA` excluyendo las 11 | **7/11** | **7/11** | .2291 | .6184 |

`S=R+AUD` declara 235 partidos donde solo hay 224 únicos (470 team-games vs 448); pH de «hoy» cambia hasta 0.56 pp (BUF–CBJ .5202 vs .5258) y `OVR` también usa `R.concat(AUD)` (`hockey.ts:152-156`).

### 4.3 Por qué la suite verde no lo detecta

`batch-verify` no tiene asserts, E4 solo comprueba `hit>0`/`hit>=0` y el test de NHL usa `nh.SA`, que es justamente la construcción contaminada. El propio log imprime `BACKTEST-NCAA: 2-3 (UI observada: 4-1)` y nadie falla.

---

## 5. Datos: instantánea, no serie histórica

| Dataset | Archivo | Volumen | Contenido | ¿Serie histórica? |
|---|---|---|---|---|
| Fútbol equipos | `aztecavet-fb-teams.json` | 115 | `[código,nombre,liga,GF,GC,PJ,[GF,GC,PJ 26-27] o 0,bandera,comps]` | No: agregado 25-26 + fase 26-27 |
| Fútbol fixtures | `aztecavet-fb-fixtures.json` | 242 juegos | 213 con `sc` (auditorías) + 29 futuros; 3–6 jornadas | Parcial |
| Fútbol bajas | `aztecavet-fb-injuries.json` | 215 | `id,t,n,r,i,st,h,d` con cita | Instantánea 6 nov |
| NFL | `nfl-*.json` | 32 equipos, 121 resultados, 15 juegos, 154 lesiones | `[visita,local,ptsV,ptsL]`; sin fecha ni cuota | Parcial (~7.6 juegos/equipo) |
| NCAA | `ncaa-*.json` | 99 equipos, 121 resultados, 37 juegos | 32 futuros + 5 auditados | Parcial (~1.2 juegos/equipo) |
| NHL | `aztecavet-nhl-*.json` | 32 equipos, 224 resultados, 61 juegos, 88 noticias | `[local,visita,golesL,golesV]`; 50 futuros + 11 auditados | Parcial (14 juegos/equipo) |
| MLB | `aztecavet-mlb-*.json` | 8 equipos, 29 pitchers, 29 bateadores, 17 juegos | timeline 8–28 oct | Solo 17 juegos |
| Cuotas | — | **0** | No hay archivo; `OddsMap` se llena con input | No |
| Splits | `money.json` | 14 juegos | % de boletos/dinero (DraftKings), no precios | Instantánea |

**OBSERVADO:** la fachada declara «instantánea del 7 nov 2026» (`src/data/index.ts:3-4`; `DATA_AS_OF` en `:52`); `aztecavet-meta.json:1` fija `dataDate: 2026-11-06`. Los resultados no tienen `season`, `match_date`, `match_id` ni `odds_*`: son listas de marcadores (`["SJ","LA",5,4]`), lo que impide un join temporal exacto.

**OBSERVADO:** no hay cuotas históricas; `docs/09-football-engine.md:15` lo dice y los tests construyen motores con `odds: {}` (`aztecavet-parity.test.ts:34,49,56`). El EV solo existe cuando el usuario teclea una cuota (`football.ts:410-424`).

**INFERIDO:** cobertura insuficiente para entrenar o validar: 17 MLB, 11 NHL y 5 NCAA no permiten calibrar con intervalos útiles; los 213 de fútbol cubren 3–5 jornadas de 5 competiciones y no son independientes (equipos y fechas repetidos). No hay `snapshot_id` por fila (A09 R21).

---

## 6. Evidencia predictiva propia (no paridad)

Recálculo sobre las auditorías del bundle con un script temporal fuera del repo (`npx vite-node --script /tmp/pitchlab_eval.ts`), condiciones declaradas (`au=true`/`nn=true`). **OBSERVADO (cálculo propio, sin IC):**

| Conjunto | n | Acierto pick | Prob. media declarada | Brier | Log loss |
|---|---:|---:|---:|---:|---:|
| Fútbol, auditorías | 213 | 131 (61.5 %) | 52.1 % | 0.2424 | 0.6777 |
| NHL, 5 nov | 11 | 8 (72.7 %) | 58.6 % | 0.2360 | 0.6623 |
| MLB, postemporada | 17 | 9 (52.9 %) | 60.8 % | 0.2523 | 0.6980 |

Para el 1X2 de fútbol (`m.w/m.d/m.l`, no el pick heterogéneo):

| Métrica | Valor | Referencia |
|---|---:|---|
| Accuracy argmax | 55.4 % | — |
| Brier multiclase | 0.6010 | 0.6362 base-rate |
| Log loss | 1.0072 | — |
| Prob. media H/D/A | .3895/.2590/.3516 | real .4413/.1643/.3944 |

**A09 corrige dos cosas de esta tabla** (misma muestra de 213):

1. **BSS.** A01 calcula `1 − .60104/.6362 = +5.5 %`; A09 usa climatología **in-sample** `.62272` y obtiene `1 − .60104/.62272 = **+3.48 %**`. La diferencia es la definición de baseline, no un error de cálculo; la conclusión (apenas mejor que la tasa base) no cambia.
2. **ρ.** Con ρ=0 el Brier baja a **0.59619** y el log-loss a **0.99901** (τ hardcodeado: 0.60104 / 1.00722). Diferencia pareada τ−ρ0: Brier +0.00486 IC95 % i.i.d. [+0.00183, +0.00789]; log-loss +0.00820 [+0.00282, +0.01358]. En rejilla in-sample el óptimo es **ρ=+0.30** (frontera), negativo en ninguna liga; el ρ negativo **empeora** en estos datos.

Empate: predicho 25.90 % vs observado 16.43 % (esperado 55.16, observado 35, z≈−3.16). La muestra tiene 16.4 % de empates (UCL 9.3 %), muy por debajo de lo típico (~25 %), así que la afirmación de calibración no está sostenida en ninguna dirección.

**INFERIDO:** hay señal débil (BSS +3.48 % sobre climatología), pero el modelo **sobreestima el empate ~9.5 pp** y subestima la victoria local. El acierto del pick (61.5 %) no es comparable con la probabilidad media (52.1 %) porque el pick se elige entre mercados heterogéneos (`dco15` = 111/213): no es una probabilidad calibrada de un evento binario.

---

## 7. Riesgos de integración y prioridades

| # | Riesgo | Evidencia | Impacto |
|---|---|---|---|
| R1 | `tsc` roto y build bloqueado | `package.json:8`; 74 errores | P0: el módulo nuevo no tendrá typecheck limpio |
| R2 | Contratos legacy no canónicos | `types.ts:36-42` (`Market.f(p,q)`), `:59-77`; `aztecavet/types.ts:71-99` | P0: no reutilizar `Model`/`Market`; crear `Prediction` con simplex validado |
| R3 | Sin config de Vitest | `package.json:9`; 9 archivos, 3 copias Linemate | P1: tests nuevos enterrados entre duplicados |
| R4 | Dependencia datos→dominio | `data/index.ts:29-32` | P1: evitar ciclos |
| R5 | Constantes no inyectables | `football.ts:76-82`, `hockey.ts:19-26`, `baseball.ts:19-25` | P1: no se puede calibrar sin editar |
| R6 | UI sin entrypoints de deporte | `football.html:4`, `mlb.html:4`, `nhl.html:4`; `main.ts:222` | P1: no acoplar el modelo al shell |
| R7 | Sin dataset temporal ni odds | `data/index.ts:3-4`; `docs/09:15` | P0: features/entrenamiento/backtest requieren ETL externo |
| R8 | Tests que escriben en el repo | `aztecavet-experiments.test.ts:233-238` | P2: tests nuevos herméticos |
| R9 | Resolución ESM `.js` y JSON | `tsconfig.json:5,12`; `football.ts:11-15` | P2: respetar specifiers |
| R10 | Colisiones de nombres | `aztecavet/index.ts:1-7` | P2: nombres únicos o namespaces |

**P0 — bloqueantes de validez** (criterio de aceptación verificable):

| ID | Acción | Criterio |
|---|---|---|
| P0-1 | Sanear typecheck o aislar baseline | **abierto**: `tsc` global sigue en 74 errores; el módulo nuevo no añade ninguno (A10) |
| P0-2 | Congelar contrato canónico | **cumplido**: `Prediction` con simplex validado, `modelId`, `modelVersion`, `generatedAt`; 21 tests (A10) |
| P0-3 | Construir dataset temporal | **cumplido**: 182.414 partidos, 23 divisiones, ≥5 temporadas, 0 duplicados, anti-leakage por fecha (A04/A09b) |
| P0-4 | Evaluación walk-forward real | **cumplido**: dev/val/test congelados, baselines base-rate/Elo/mercado, IC bootstrap, test usado una vez (A08/FINAL) |

**P1:** configurar Vitest y eliminar tests vacíos (`include: ["tests/**/*.test.ts"]`; mutar una fórmula debe romper algo); registro de procedencia de cada constante; separar legacy de lab; arreglar o declarar fuera de alcance la UI.
**P2:** calibración solo en validación; `config.json` con seed/commit/hash; matriz «paridad vs validez» en README/Reportes.

**P0 adicionales que A09 añade antes de tocar dinero:** reconstruir el estado point-in-time de MX y deduplicar NHL por `match_id`; convertir los backtests en aserciones; tratar los 324 tests de paridad como fidelidad; corregir `NOB` (`bestOf === null`) y bloquear parlays same-match/fallback sintético.

---

## 8. Lo que sí está bien (para no fabricar problemas)

1. **Paridad real:** 324 tests, ε<1e-9, 242 partidos; la transcripción TS es fiel (fortaleza de ingeniería).
2. **Matriz 1X2:** suma 1 en 242/242, error máximo 7.7×10⁻⁷; **τ no necesita renormalización** (preserva masa analíticamente).
3. **`noVig`:** aritméticamente correcto (2.5/3.2/3.1 → margen 3.508 %, probabilidades que suman 1.000000).
4. **Mercados complementarios:** `ov+un`, `by+bn`, `plf+pld`, `tho+thu`, `tao+tau` suman 1; `h+d+a` suma 1.
5. **Determinismo:** E3 restaura la probabilidad exacta (`|Δ|<1e-15`); `tilt` converge.
6. **NFL/NCAA:** no se observó solapamiento auditoría/resultados (limitación: sin fechas no se puede probar el orden).
7. **MLB:** no hay fuga de target (`BaseballEngine` no actualiza con `g.sc`).

**Conclusión:** los motores actuales son un **baseline congelado y una especificación de features** (Pitágoras, Log5, Poisson+DC, shrinkage), no el motor del laboratorio. El valor nuevo está en `research/prediction-lab/`: dataset canónico, features causales, evaluación walk-forward y comparación contra mercado (docs [05](05_FEATURE_ENGINEERING.md), [06](06_METODOLOGIA_BACKTESTING.md), [11](11_LIMITACIONES_Y_RIESGOS.md)).

---

## 9. Referencias `archivo:línea` verificadas

1. `package.json:8` — build `tsc --noEmit && vite build`.
2. `tsconfig.json:6-7` — `strict` + `noUncheckedIndexedAccess`.
3. `src/data/index.ts:3-4` — datos como instantánea; `:52` — `DATA_AS_OF`.
4. `src/data/index.ts:29-32` — datos importan tipos del dominio.
5. `src/shell/main.ts:7-12` — el shell solo importa el tipo `Bet`; `:222` — iframe; `:22-28` — `pg:"fb"`.
6. `football.html:4`, `mlb.html:4`, `nhl.html:4` — entrypoints a `src/pages/*.ts` inexistentes.
7. `src/domain/aztecavet/constants.ts:12-36` — constantes transcritas (E, HFA, K, ρ).
8. `src/domain/aztecavet/football.ts:158-172` — shrink K=6 y fase ×3; `:198-232` — Pitágoras→Poisson+τ; `:264-319` — pick jerárquico.
9. `src/domain/aztecavet/football.ts:426-431` — `NOB` roto (también `hockey.ts:336-340`, `baseball.ts:226-230`).
10. `src/domain/aztecavet/hockey.ts:143-146` — `S=R.concat(AUD)`; `:123-141` — forma con el partido auditado.
11. `tests/domain/aztecavet-parity.test.ts:59-70`, `:96` — ε=1e-9 y 242 partidos.
12. `tests/domain/batch-verify.test.ts:103-104`, `:108` — ML en vez de `g.pk`; 2-3 vs 4-1 sin assert.
13. `tests/domain/sensitivity.test.ts:10-35` — solo `console.log`.
14. `tests/domain/aztecavet-experiments.test.ts:156`, `:179`, `:198-199` — umbrales laxos y n=17.
15. `docs/09-football-engine.md:15`, `:60` — sin cuotas y sin calibración ajustable.
16. `docs/10-nhl-engine.md:19`, `:54` — afirmación falsa de `SA` «sin la auditoría».
