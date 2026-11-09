# 13 — Coordinación de subagentes: contratos, propiedad y evidencia

**Documento:** consolidación de la capa de coordinación del laboratorio (2026-11-09).
**Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY (él mismo un subagente de esta sesión).
**Fuentes:** [`MASTER.md`](../../research/prediction-lab/coordination/MASTER.md) · [`TASKS.md`](../../research/prediction-lab/coordination/TASKS.md) · [`MASTER_SUMMARY.md`](../../research/prediction-lab/coordination/MASTER_SUMMARY.md) · contratos · `coordination/status/*.json` · informes en `reports/`.

> **Honestidad sobre el método.** Los subagentes fueron **delegaciones reales** (herramienta `subagent`, contextos aislados, sistema de archivos compartido), no una narrativa: existen artefactos, informes, `status/*.json` con hora de inicio y fin, y ventanas temporales **solapadas** que solo se explican por ejecución concurrente. Lo que **no** se puede verificar desde aquí es el contenido de las conversaciones internas de cada subagente; este documento se limita a lo que quedó escrito en disco.

---

## 1. Modelo de delegación

| Pieza | Cómo funcionó |
|---|---|
| Orquestador | Principal AI Engineer / Lead Quantitative Researcher: escribe contratos, `MASTER.md`, `TASKS.md`, `pipeline/`, `config/`; aprueba decisiones |
| Subagentes | 10 roles (A01–A10) + este A11; cada uno recibe un contrato autocontenido, lee el repositorio, escribe **solo** sus rutas y devuelve un `status/<ID>.json` |
| Aislamiento | worktree separado (`prediction-lab`, base `8424876`); `main` intacto; `src/`, `tests/`, `docs/` legacy no se tocan |
| Sistema de archivos | **compartido**: el orquestador ve en tiempo real lo que escribe cada subagente (y por eso pudo corregir `features.parquet` a las 02:53) |
| Contextos | **aislados**: ningún subagente ve el razonamiento de otro; solo sus artefactos. De ahí la importancia de los contratos y de los `status/*.json` |
| Herramientas | `subagent`, `subagent_fork`, `workflow` disponibles (MASTER §1). En esta sesión A11 no pudo delegar a su vez (profundidad máxima 1) y trabajó de forma directa |

**Evidencia de que la delegación es real, no simulada:**

1. **Ocho** archivos `coordination/status/A0*.json` con `started_at`/`finished_at` en ISO-8601 con zona `-06:00`, `files_written` con rutas absolutas y `summary` con cifras que se pueden contrastar contra los artefactos.
2. **Ventanas solapadas** (§3): cuatro agentes empiezan en el mismo segundo (`01:25:41–42`) y otros dos en el mismo (`01:39:44`).
3. **Artefactos con marcas de tiempo coherentes** con esas ventanas (`artifacts/`, `logs/`, `features/audit_features.py`, `eval/`).
4. **Informes que se corrigen entre sí** (§5): A09 corrige el BSS de A01 y A05 corrige el `features.parquet` del orquestador. Eso no ocurre en una narración de un solo agente.

---

## 2. Reparto exacto

| ID | Agente (rol) | Inicio | Fin | Duración | Informe | `status` | Archivos declarados |
|---|---|---|---:|---:|---|---|---:|
| A01 | REPOSITORY AUDITOR | 01:25:41 | 01:31:39 | 5 min 58 s | `reports/A01_repository_audit.md` | sí | 2 |
| A02 | SCIENTIFIC RESEARCHER | 01:25:42 | 01:36:00 | 10 min 18 s | `reports/A02_scientific_research.md` | sí | 2 |
| A03 | DATA SOURCE RESEARCHER | 01:25:42 | 01:38:52 | 13 min 10 s | `reports/A03_data_sources.md` | sí | 2 |
| A08 | BACKTESTING & STATISTICS ENGINEER | 01:28:11 | 01:47:07 | 18 min 56 s | `reports/A08_backtesting_framework.md` | sí | 14 |
| A09 | ADVERSARIAL MODEL AUDITOR | 01:25:41 | 01:50:38 | 24 min 57 s | `reports/A09_adversarial_preliminary.md` | sí | 2 |
| A04 | DATA ENGINEER | 01:39:44 | 02:30:00 | 50 min 16 s | `reports/A04_data_quality.md` | sí | 6 |
| A05 | FEATURE ENGINEERING SPECIALIST | 01:39:44 | 02:44:08 | 64 min 24 s | `reports/A05_features.md` | sí | 4 |
| A06 | MODEL RESEARCHER MOTOR A | ~02:03 (inf.) | ~02:53 (inf.) | ~50 min | `reports/A06_motor_a_experiments.md` | **NO** | no declara |
| A07 | MARKET INTELLIGENCE | 02:08:00 | 02:45:00 | 37 min | `reports/A07_market_intelligence.md` | sí | 32 |
| A10 | INTEGRATION | ~03:05 | (en curso) | — | `src/domain/prediction/*`, `tests/prediction/*` | **no** | **en curso** (sin cierre) |
| A11 | DOCUMENTATION & REPRODUCIBILITY | 02:54:46 | (este documento) | — | `docs/predicciones/**` | sí | 10 |

**Notas de la tabla:**

- **A06 no tiene `coordination/status/A06.json`.** Su evidencia son el informe (`reports/A06_motor_a_experiments.md`, mtime 02:53), los cuatro scripts `models/a/experiments/*.py` y los logs `logs/{exp02_full,exp06,exp03,exp10}.log` (02:26–02:44). Las horas de inicio/fin son **inferidas** de esos mtimes; se marcan como tales.
- A08 arrancó **antes** que A04 y A05 y terminó antes: su contrato solo dependía de `CONTRACT_PREDICTIONS.md`, no de los datos.
- A07 arrancó a las 02:08, cuando A04 ya había entregado `matches.parquet` (01:56) y A05 estaba en curso.
- A10 (integración TS) **arrancó a las 03:05–03:10**, mientras A11 redactaba: `src/domain/prediction/{types.ts,engine.ts}`, `src/data/prediction/{features_snapshot.json,model_motor_a.json}` (248 KB y 12,7 KB) y `tests/prediction/engine.test.ts`. **No tiene `status` ni informe** al cierre de este documento; se registra como **en curso**, no como completado.

---

## 3. Paralelismo: quién coincidió con quién

```
01:25  A01 ██████
       A02 ██████████
       A03 ████████████
       A08   ████████████████
       A09 ████████████████████████
01:39        A04 ████████████████████████████████████████████████
             A05 ████████████████████████████████████████████████████████████
02:03              A06 ███████████████████████████████████████████
02:08                    A07 ████████████████████████████████
02:54                                                          A11 ████████████
03:05                                                            A10 ██████ (en curso)
```

- **Máximo de concurrencia observado: 5** subagentes simultáneos (01:28–01:31: A01, A02, A03, A08, A09).
- **Segunda ola de 3** (01:39–01:47: A04, A05, A08) y **tercera de 3** (02:08–02:30: A04, A05, A07).
- El cuello de botella fue **A05** (64 min, la ablación de 16 folds) y **A04** (50 min, reconciliación de 465 CSV y 73 checks).

---

## 4. Contratos y propiedad de archivos

### 4.1 Contratos vigentes

| Contrato | Contenido | Propietario | Aprobación |
|---|---|---|---|
| [`CONTRACT_DATASET.md`](../../research/prediction-lab/coordination/CONTRACT_DATASET.md) | esquema canónico de `matches.parquet` (88 columnas), `match_id` determinista y 7 reglas anti-leakage | A04 / orquestador | aprobado |
| [`CONTRACT_PREDICTIONS.md`](../../research/prediction-lab/coordination/CONTRACT_PREDICTIONS.md) | 12 columnas de `predictions.csv`, etiqueta `y`, definiciones exactas de log-loss/Brier/RPS/ECE, bootstrap y particiones | orquestador (implementa A08) | aprobado |
| [`TASKS.md`](../../research/prediction-lab/coordination/TASKS.md) | objetivo, contexto, alcance, restricciones, entregables, validación y dependencias de cada tarea | orquestador | — |
| Reglas de evidencia (MASTER §6) | cada afirmación `OBSERVADO` / `INFERIDO` / `DESCONOCIDO`; nada inventado; cifras con comando y fecha | orquestador | — |

### 4.2 Propiedad declarada y cumplimiento

| ID | Escribe únicamente en | Cumplido |
|---|---|---|
| A01 | `reports/A01_*.md`, `coordination/status/A01.json` | sí |
| A02 | `reports/A02_*.md`, `coordination/status/A02.json` | sí |
| A03 | `reports/A03_*.md`, `coordination/status/A03.json` | sí |
| A04 | `etl/**`, `data/**`, `reports/A04_*.md` | sí (añadió `etl/validators.py`, `etl/tests/`) |
| A05 | `features/**`, `reports/A05_*.md` | sí |
| A06 | `models/a/**`, `reports/A06_*.md` | sí (`models/a/experiments/`, `artifacts/A06_*`) |
| A07 | `models/b/**`, `reports/A07_*.md` | sí (32 archivos, incluidos 19 artefactos de `run_all.py`) |
| A08 | `eval/**`, `reports/A08_*.md` | sí (14 archivos) |
| A09 | `reports/A09_*.md`, `coordination/status/A09.json` | sí |
| A10 | `src/domain/prediction/**`, `tests/prediction/**` | en curso (2 fuentes, 2 JSON, 1 test; sin status) |
| A11 | `docs/predicciones/**`, `reports/A11_*.md` | sí (docs + `status/A11.json`) |

**Conflictos de propiedad detectados:** ninguno material. Dos artefactos **generados** viven fuera de la propiedad estricta de su autor porque los produce el pipeline:

- `reports/A05_feature_dictionary.md` lo escribe `features/build_features.py` (código de A05).
- `reports/A07_market_features.md` lo escribe `features/build_market_features.py` (código de A07, ejecutado por el orquestador).

Ningún subagente modificó `src/`, `tests/` ni `docs/` legacy. A04 y A08 lo verificaron con `git status --porcelain` (`?? .venv/` y `?? research/prediction-lab/` como únicos cambios).

---

## 5. Hallazgos cruzados (lo que un agente encontró en el trabajo de otro)

### 5.1 A05 → orquestador: el leakage de priors en `features.parquet`

El hallazgo más importante de la coordinación. A05 auditó el `features.parquet` que había generado el **orquestador** y encontró que los 10 priors de equipo (`home_prev_*`, `away_prev_*`) se unían con `prev_of` sin desplazar las estadísticas: cada partido de la temporada S recibía las de **S+1** (100,00 % de 166.615 filas).

- **Reacción del orquestador:** `MASTER_SUMMARY.md` §6-bis documenta el hallazgo, la corrección (`groupby(["div","team"])[stat_cols].shift(1)` + join por `target_season`) y la **obligación de reejecutar** Motor A/B. El `features.parquet` se regeneró a las 02:53 con 182.410 filas.
- **Coste medido:** el 88 % de la ganancia aparente de los priors era futuro (−0,00368 → −0,00045).
- **Consecuencia abierta:** los modelos de A06 y `EXP01_baselines` se entrenaron **antes** de la corrección; hay un relanzamiento en curso (`artifacts/EXP01_final_20261109/`, `logs/EXP01_final.log`).

### 5.2 A09 → A01: corrección del BSS y del ρ

A01 (01:31) y A09 (01:50) auditaron el mismo bundle **en paralelo**, sin verse. A09, al recalcular las mismas 213 auditorías, corrigió dos cosas:

| Afirmación de A01 | Corrección de A09 | Explicación |
|---|---|---|
| BSS **+5,5 %** (Brier 0,6010 vs 0,6362) | **+3,48 %** (0,6010 vs **0,62272** climatología in-sample) | distinta definición de baseline; la conclusión no cambia |
| — | con ρ=0 el Brier baja a **0,59619** y el log-loss a **0,99901**; el ρ óptimo in-sample es **+0,30** | A01 no había aislado el efecto de τ |
| «tests vacíos» (A01 §4.3) | confirma y añade que el backtest NCAA usa el ML del motor, no `g.pk` (`batch-verify.test.ts:103-104`) | A09 reprodujo la causa raíz |

Ambos coinciden en lo esencial (paridad ≠ validez, 416 tests inflados, 74 errores `tsc`, datos instantánea). **A01 no pudo citar a A09** porque terminó 19 minutos antes; la consolidación de ambas lecturas está en [`01_AUDITORIA_ACTUAL.md`](01_AUDITORIA_ACTUAL.md) §6.

### 5.3 A02 → diseño (MASTER, A06, A07, A08)

- Corrigió `MASTER.md` §1: el PDF tiene **25 páginas**, no 6 (el `file(1)` reportaba un nodo interno).
- Cambió la lectura del paper: los modelos con cuotas **no empatan** al de-vig, son **significativamente peores** (Tabla 13).
- Fijó criterios que A06/A07/A08 adoptaron: aceptar por RPS/log-loss (no accuracy), prohibir decidir empate por argmax, bootstrap por bloques en vez de i.i.d., y **no** construir un clasificador que consuma cuotas.

### 5.4 A04 → A05/A06/A08: exclusiones y hueco G1

- A04 detectó que **1.142 partidos de G1** (2000/01–2004/05) no entraban por cabeceras `HT`/`AT`; el orquestador lo corrigió en v1.1 (182.414 filas). A04 no podía corregir el ETL (fuera de su alcance).
- Fijó las exclusiones que el resto debe respetar: 4 sin resultado, 1 fila ARG 2015, 2026/27 y 2026 fuera de evaluación, BFE excluido, `max` no es libro.
- A08 verificó la cobertura por partición sobre el canónico y encontró la representación (`match_date` texto, goles `float64`) que contradecía el contrato.

### 5.5 A08 → A06/A07: el contrato de predicciones

A08 entregó `eval/` y el formato `artifacts/<exp_id>/predictions.csv` con 12 columnas; A06 y A07 adaptaron sus artefactos. A08 también fijó que `test` no se toca y que la comparación es por intersección exacta de `match_id`.

### 5.6 A07 → A06: el Motor A no bate al mercado

A07 comparó el Motor A de A06 contra el de-vig en los mismos partidos: +0,0188 (logit) y +0,0174 (HGB) en val, perdiendo en **23/23 divisiones** y **4/4 bandas**; mezclar no aporta (peso óptimo del mercado 1,00/0,90). Esto cierra la pregunta de EXP07/EXP08 con evidencia, no con opinión.

### 5.7 A06 → nadie (hueco de coordinación)

A06 no dejó `status` ni mensaje de cierre; su recomendación (`hgb` + Dirichlet + blend de empate) y sus cifras viven solo en el informe. Al no haber `status`, **no hay `next` formal** que el orquestador pueda encadenar, y su informe no declara los archivos escritos. Es la única tarea completada sin el contrato de estado cumplido.

---

## 6. Estados: lo declarado vs lo real

| Fuente | A04 | A05 | A06 | A07 | A09 |
|---|---|---|---|---|---|
| `TASKS.md` (mtime 01:48) | en progreso | en progreso | en progreso | **pendiente** | en progreso |
| `status/*.json` | completed | completed | **no existe** | completed | completed |
| Informe en `reports/` | sí | sí | sí | sí | sí |

**Discrepancias:**

1. `TASKS.md` está **desactualizado** (01:48) respecto a los `status` (hasta 02:45). El tablero dice «pendiente» para A07 cuando A07 ya había entregado 32 archivos.
2. **A06 completó sin `status`**: no hay `started_at`/`finished_at` ni lista de archivos; su evidencia es indirecta (informe + logs).
3. `MASTER_SUMMARY.md` (02:52) sí refleja el estado real, incluido el leakage corregido, pero **no** actualiza el conteo de `features.parquet` (dice 192 columnas; son 198) ni el de filas tras v1.1.
4. A10 y A11 no aparecen en `TASKS.md` como iniciadas; A10 arrancó a las 03:05 **sin `status`** y sin constar en el tablero.

**Recomendación de coordinación:** un único artefacto de estado (los `status/*.json`) y regenerar `TASKS.md` desde ellos; exigir `status` como parte del entregable (A06 lo incumplió y su trabajo es el más difícil de encadenar).

---

## 7. Evidencia de delegación (rutas exactas)

| Evidencia | Ruta | Qué prueba |
|---|---|---|
| Estado A01 | `coordination/status/A01.json` | 2 archivos, 5 min 58 s, 74 errores `tsc`, 416 tests |
| Estado A02 | `coordination/status/A02.json` | 28 referencias verificadas, 1 no verificada, 25 pp |
| Estado A03 | `coordination/status/A03.json` | 13 fuentes OK / 9 fallidas, 24 peticiones |
| Estado A04 | `coordination/status/A04.json` | 73 checks, 0 críticos, hueco G1 de 1.142 |
| Estado A05 | `coordination/status/A05.json` | leakage L1/L2/L3, ablación con 8 bloques |
| Estado A07 | `coordination/status/A07.json` | 32 archivos, de-vig power, 4 poblaciones |
| Estado A08 | `coordination/status/A08.json` | 83 tests, cobertura dev/val/test/live |
| Estado A09 | `coordination/status/A09.json` | 21 riesgos (3 críticos, 9 altos, 6 medios, 3 bajos) |
| Informes | `reports/A01…A09*.md` (11 archivos) | narrativa verificable con `archivo:línea` |
| Logs | `logs/exp02_full.log`, `exp06.log`, `exp03.log`, `exp10.log`, `EXP01_motorA.log`, `EXP01_final.log`, `EXP08_motorB_open*.log` | ejecuciones reales con fecha |
| Artefactos | `artifacts/<exp_id>/`, `models/b/analysis/artifacts/`, `eval/artifacts/smoke/` | resultados con hash |

**Límite de esta evidencia:** los `status` son autodeclaraciones del subagente. Se han contrastado contra los artefactos (existen, tienen las filas y hashes que dicen) y contra las horas de modificación; **no** contra una traza de conversación, que no está disponible.

---

## 8. Qué falló en la coordinación (y qué hacer)

| Problema | Consecuencia | Acción |
|---|---|---|
| `TASKS.md` no se regenera | estado contradictorio con los `status` | generar el tablero desde `status/*.json` |
| A06 sin `status` | no hay `next` ni inventario de archivos | exigir `status` como puerta de entrega |
| Sin `status` para A10/A11 al inicio | el orquestador no sabe qué falta | crear el `status` al arrancar, no al terminar |
| Cambios de datos (v1.1) posteriores a los informes | cifras de A04/A05/A08 y de A06/EXP01 quedan **pre-corrección** | reejecutar y anotar hash+fecha en cada informe |
| Tests de aceptación con cifras hardcodeadas (`etl/tests/test_validators.py:52`) | la suite pasa a rojo con un cambio legítimo de datos | aserciones relativas (`rows > 180.000` o leer `coverage.json`) |
| Un solo dueño de `data/processed/` es el orquestador | A04 no pudo corregir el ETL G1 ni regenerar el validador | declarar explícitamente quién puede escribir `data/processed/` tras el cierre |

**Lo que funcionó bien:** contratos autocontenidos (cada subagente pudo trabajar sin preguntar), sistema de archivos compartido (el orquestador corrigió el leakage en minutos), regla de evidencia `OBSERVADO/INFERIDO` (permitió que A01 y A09 discreparan sin invalidarse) y separación worktree/`main` (el repositorio original quedó intacto).

**Conclusión:** la delegación es real y paralela, con ocho entregas verificables y tres correcciones cruzadas entre agentes. El punto débil no fue la ejecución sino el **cierre**: el estado se declaró en JSON y el tablero no se actualizó, y una tarea (A06) terminó sin su contrato de estado.
