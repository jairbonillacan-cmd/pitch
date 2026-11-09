# 10 — Roadmap de predicciones

**Documento:** siguiente ciclo de trabajo, prioridades y criterios de aceptación.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY · **Commit:** `a680a4f`.
**Fuentes:** [`A03`](../../research/prediction-lab/reports/A03_data_sources.md) · [`A07`](../../research/prediction-lab/reports/A07_market_intelligence.md) · [`A09b`](../../research/prediction-lab/reports/A09_adversarial_lab.md) · [`A10`](../../research/prediction-lab/reports/A10_integration.md) · [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md) · [`11_LIMITACIONES_Y_RIESGOS.md`](11_LIMITACIONES_Y_RIESGOS.md).

> **Punto de partida:** el ciclo 0 está cerrado con un Motor A desplegado (`logit`), un Motor B de de-vig y una medición honesta de test que dice **“el mercado gana por 0,0188–0,0203; no hay *edge* demostrable”**. El roadmap no promete *edge*: promete **infraestructura para poder demostrarlo o descartarlo**.

---

## 1. Principios del siguiente ciclo

1. **Un test por ciclo, pre-registrado.** El `test` 2024/25–2025/26 ya se usó y **no se reutiliza** para elegir. El próximo cierre usará temporada nueva (2026/27 completa o 2027/28).
2. **Nada se adopta por accuracy.** La decisión es log-loss/RPS con IC95 % por bloques y p de permutación.
3. **Sin datos nuevos no hay modelo nuevo.** Prioridad a producir datos (cuotas con hora, xG, alineaciones) antes que a probar arquitecturas.
4. **Trazabilidad obligatoria:** `config.json`, hashes, semilla y `status` en cada entrega.
5. **La integridad pesa más que la métrica:** no se cambia un modelo congelado porque el test —ya visto— lo favorezca (lección de R9 en [`09`](09_MEJORAS_IMPLEMENTADAS.md)).

---

## 2. Ciclo 1 — cerrar la base (semanas 1–6)

### P0-1 · Snapshots propios de cuotas con timestamp

| Campo | Definición |
|---|---|
| Objetivo | Construir la única serie de cuotas con hora que ninguna fuente gratuita vende |
| Entregable | *poller* con 2 capturas/día por competición (apertura y ~60 min antes del kickoff) → `data/odds_snapshots/{source}/{date}.parquet` con `captured_at` (UTC), `match_id`, `bookmaker`, `market`, `line`, `odds` |
| Métrica | nº de snapshots por partido; % de partidos con ≥2 capturas; latencia media |
| Aceptación | ≥90 % de los partidos de E0/SP1/MEX con ≥2 capturas durante 8 semanas; `captured_at` monótono y auditable; sin violar ToS |
| Dependencia | A03 §7 (P0-2); endpoints que permitan acceso automatizado |
| Riesgo | fuente sin API pública; bloqueo por *rate limit* |
| Esfuerzo | **estimación** 1–2 semanas de ingeniería + operación continua |

**Por qué primero:** sin `captured_at` no hay CLV, no hay ROI verificable y el movimiento apertura→cierre solo se puede mirar como escenario. Es el bloqueante estructural de todo lo económico.

### P0-2 · Ensemble como candidato pre-registrado

| Campo | Definición |
|---|---|
| Objetivo | Confirmar el único modelo que superó al desplegado en test (−0,00153 [−0,00250, −0,00050]) |
| Entregable | `models/a/train_motor_a.py --models ensemble` con pesos walk-forward versionados; pre-registro en `FREEZE` del ciclo 2 |
| Métrica | Δ log-loss vs `logit` en temporada nueva, con IC95 % por bloques |
| Aceptación | Δ < 0 con IC que excluya 0 **y** p < 0,05 en test nuevo; si no, se mantiene `logit` |
| Dependencia | 2026/27 completa (junio 2027) o 2027/28 |
| Riesgo | que la ventaja de 0,0015 sea específica del test actual |
| Esfuerzo | **estimación** 3–5 días (el código ya existe) |

### P1-1 · xG 2026/27 (football-data `HxG`/`AxG`)

| Campo | Definición |
|---|---|
| Objetivo | Medir si xG aporta sobre tiros (EXP04, hoy sin datos) |
| Entregable | ingesta de `HxG`/`AxG` (E0 90/90, SP1 109/109 en 2026/27), features `xg_for/against_r5`, ablación |
| Métrica | Δ log-loss al añadir xG sobre el bloque de tiros |
| Aceptación | ≥95 % de cobertura en las divisiones con xG; Δ ≤ −0,002 con IC que excluya 0; si no, se documenta y se retira |
| Dependencia | que football-data mantenga xG en 2026/27 y 2027/28 |
| Riesgo | una sola temporada de xG; no comparable con el histórico |
| Esfuerzo | **estimación** 1 semana |

### P1-2 · Cerrar la deuda de integridad

| Ítem | Acción | Aceptación |
|---|---|---|
| Priors “S−1” solo 88,5 % | agregar por `team` (no `div, team`) y caer a `NaN` si falta S−1 | 100 % S−1 o `NaN` justificado; sin cambio de métrica > 0,001 |
| Ablación A05 en v1.1 | reejecutar `audit_features.py` | `feature_audit.json` con 182.410 filas |
| Permutación por bloques | implementar en `eval/compare.py` | p-valor por bloques junto al i.i.d. |
| `fallback_motor_a` | persistir por partido en Motor B | columna en `pred_*.csv`; % de fallback reportado |
| 74 errores `tsc` | sanear o aislar el baseline | `npx tsc --noEmit` = 0 o *baseline* congelado documentado |

### P2-1 · Adaptador de inferencia

| Campo | Definición |
|---|---|
| Objetivo | Llevar el dominio TS a un servicio real |
| Entregable | `POST /v1/predictions` con `match_id` → `Prediction` + `requestedAt`; de-vig previo si hay cuotas |
| Aceptación | paridad 1e-9 con Python en 200 partidos; latencia p95 < 100 ms; `% invalid_features` instrumentado |
| Dependencia | feature service (Python) disponible |
| Esfuerzo | **estimación** 1–2 semanas |

---

## 3. Ciclo 2 — expandir con datos que sí existen (semanas 6–14)

### P0-3 · NFL con nflverse (licencia comercial clara)

| Campo | Definición |
|---|---|
| Objetivo | Primer deporte fuera del fútbol con datos **CC BY 4.0** (372 columnas, `epa`, `wpa`, `spread_line`, 1999→2024) |
| Entregable | ETL + baseline (Elo/regresión) + evaluación vs `spread_line` con el mismo marco de `eval/` |
| Aceptación | pipeline reproducible; log-loss reportado con IC; comparación contra el mercado de spread |
| Dependencia | ninguna de licencia (atribución obligatoria) |
| Riesgo | menor familiaridad con el dominio; mercado de spread ≠ 1X2 |
| Esfuerzo | **estimación** 3–4 semanas |

### P1-3 · Modelo de xG de evento (StatsBomb Open Data)

| Campo | Definición |
|---|---|
| Objetivo | Entrenar un modelo de xG con `statsbomb_xg` como etiqueta y aplicarlo a tiros de football-data |
| Entregable | modelo de xG offline + validación; **no** se publican eventos crudos |
| Aceptación | AUC/log-loss reportados; mejora del Motor A ≥ 0,002 al usar xG predicho en vez de tiros |
| Dependencia | licencia de investigación (no comercial) |
| Riesgo | 80 pares competición-temporada, sin temporada actual |
| Esfuerzo | **estimación** 3–5 semanas |

### P1-4 · Modelos por competición y calibración condicionada

| Campo | Definición |
|---|---|
| Objetivo | Explotar la horquilla de eficiencia de 5× entre divisiones (P1 0,9190 vs D2 1,0494) |
| Entregable | modelos por familia de liga; calibración **solo** si el walk-forward la valida con signo estable |
| Aceptación | mejora con IC que excluya 0 en ≥2 temporadas; sin degradar la calibración global |
| Riesgo | sobreajuste por liga con n pequeño (≈380 partidos/temporada) |
| Esfuerzo | **estimación** 2–3 semanas |

### P1-5 · EXP14 — drift y reentrenamiento

| Campo | Definición |
|---|---|
| Objetivo | Responder si reentrenar cada año bate al modelo congelado (≥0,002 RPS) |
| Entregable | ventana expansiva vs congelada sobre 3 ciclos |
| Aceptación | Δ RPS con IC; si no hay diferencia, congelar |
| Dependencia | 2–3 temporadas nuevas |
| Esfuerzo | **estimación** 1 semana de análisis |

### P2-2 · NHL y NCAAF (solo si hay licencia o se acepta el riesgo)

NHL API sin licencia documentada y CFBD «All rights reserved» con clave «for testing»: **no** entran en producto hasta resolver términos. Se pueden explorar en investigación interna con caché y sin redistribución.

---

## 4. Ciclo 3 — producto y gobernanza (semanas 14–24)

| Iniciativa | Objetivo | Aceptación |
|---|---|---|
| Licencia de datos | resolver football-data (o sustituir por CC0/ODbL para lo público) | registro `ok / no_confirmado / prohibido` en código; el build falla si un dataset prohibido entra en artefacto público |
| API y monitorización | servir predicciones y vigilar drift | dashboard con `% invalid_features`, `% fallback`, distribución de `pDraw`, ECE mensual |
| Revisión de modelos | comité de congelación por ciclo | `FREEZE.md` por ciclo y un solo uso de test |
| Seguridad y costes | límites de cuota, caché, *rate limits* | sin dependencia de un endpoint sin SLA |

---

## 5. Tabla maestra de iniciativas

| ID | Iniciativa | Ciclo | Prioridad | Métrica de éxito | Esfuerzo (est.) |
|---|---|---|---|---|---|
| O1 | Snapshots de cuotas con timestamp | 1 | **P0** | ≥90 % partidos con ≥2 capturas; CLV calculable | 1–2 sem |
| O2 | Ensemble pre-registrado | 1 | **P0** | Δ < 0 vs logit en test nuevo (IC + p) | 3–5 días |
| O3 | xG 2026/27 | 1 | P1 | Δ ≤ −0,002 con IC; ≥95 % cobertura | 1 sem |
| O4 | Deuda de integridad (priors, ablación, permutación, fallback) | 1 | P1 | 100 % S−1; tests actualizados | 1 sem |
| O5 | Adaptador/API de inferencia | 1 | P2 | paridad 1e-9; p95 < 100 ms | 1–2 sem |
| O6 | NFL con nflverse | 2 | **P0** | pipeline + log-loss vs spread con IC | 3–4 sem |
| O7 | xG de evento (StatsBomb) | 2 | P1 | mejora ≥0,002 sobre tiros | 3–5 sem |
| O8 | Modelos por competición | 2 | P1 | mejora en ≥2 temporadas | 2–3 sem |
| O9 | Drift (EXP14) | 2 | P1 | Δ RPS con IC en 3 ciclos | 1 sem |
| O10 | NHL/NCAAF | 2 | P2 | términos resueltos | 2–4 sem |
| O11 | Licencias y gobernanza | 3 | **P0** | registro en código + build que falla | 2 sem |
| O12 | API pública + monitorización | 3 | P1 | dashboard y SLA | 3–4 sem |

**Estimaciones:** son órdenes de magnitud de A11 (INFERIDO), no compromisos; dependen de que los datos lleguen.

---

## 6. Qué **no** hacer

1. **No** reutilizar el `test` 2024/25–2025/26 para elegir ni para “confirmar” el ensemble.
2. **No** adoptar *stacking* de cuotas ni clasificadores que las consuman en crudo (resultado negativo ya medido).
3. **No** añadir calibración por defecto sin walk-forward que la valide.
4. **No** perseguir accuracy ni el sesgo de empate por argmax.
5. **No** prometer CLV, ROI ni *edge* sin cuotas con `captured_at`.
6. **No** integrar Understat (caída), FBref (403) ni ESPN (ToS).
7. **No** mezclar cifras de v1.0 con v1.1 en un mismo informe.

---

## 7. Hitos y gobernanza

| Hito | Fecha objetivo | Criterio de cierre |
|---|---|---|
| Snapshots operativos | +2 semanas | primer `odds_snapshots` con 2 capturas/día y hash |
| Informe de CLV preliminar | +8 semanas | CLV medio con IC sobre ≥5.000 snapshots |
| Pre-registro ciclo 2 | antes de mirar 2026/27 | `FREEZE.md` firmado y candidatos congelados |
| Cierre de test ciclo 2 | junio 2027 (2026/27 completa) | `metrics.json` con hashes, B=2000, 10.000 permutaciones |
| Decisión Motor A ciclo 2 | tras el cierre | ensemble vs logit con IC y p; se publica gane o pierda |

**Regla de oro:** si un resultado no se puede reproducir con `(comando, hash del dataset, semilla, n)`, no es un resultado: es una observación.

---

## 9. Estado del ciclo 2 (2026-11-09, tras el cierre del ciclo 1)

**Monitorización live 2026/27** (3.398 partidos, parcial; `artifacts/FINAL/monitoring_live.md`):

| Sistema | Log-loss live | ECE |
|---|---:|---:|
| mercado cierre (mejor precio) | 0,99591 | 0,0095 |
| stack_logit (Motor B exp.) | 1,01361 | 0,0242 |
| ensemble (candidato) | 1,01959 | 0,0197 |
| hgb | 1,02005 | 0,0097 |
| logit (desplegado) | 1,02659 | 0,0094 |

El `logit` desplegado es el que más se degrada en la temporada en curso (−0,016 vs su val 1,0103),
mientras el ensemble aguanta mejor. No se cambia el modelo con datos observados: se ha abierto un
**pre-registro** (`artifacts/PREREGISTRATION_CYCLE2.md`) para decidir con la muestra prospectiva
(partidos de 2026/27 posteriores al 2026-11-09 + 2027/28), con regla de significancia fijada.

**Trabajo en curso del ciclo 2:**
1. **A13 — snapshots propios de cuotas:** `football-data.co.uk/fixtures.csv` publica ~160 partidos
   próximos con cuotas; se captura el primer snapshot con `captured_at_utc` y se construye el
   monitor de CLV. Resuelve parcialmente el P0 de "sin timestamps".
2. **A12 — expansión NFL:** nflverse (`games.csv`, CC BY 4.0, 1999–2026) para dataset, features
   causales y benchmark contra el mercado. Primer deporte de la expansión.
3. **A09c — tercera auditoría adversarial** del estado final (documentos, artefactos y cierre).

### 9.1 Resultados del arranque del ciclo 2

**A12 — NFL:** primer motor de otro deporte con datos propios. Test 2020–2025: `logit` 0,65906 vs
mercado 0,62655 (Δ +0,0322 [0,0262; 0,0382]). HGB empeora (0,72144). Conclusión: extender el
contrato de predicción y el pipeline de evaluación funciona; el modelo debe ser específico del
deporte (empates 0,23 %, descanso semanal, mercado con 2,5 % de margen).

**A13 — snapshots de cuotas:** primera captura real con `captured_at_utc` y sha256 (160 partidos,
94 columnas). El feed tenía 70,79 h de staleness y 159/160 partidos ya habían empezado, así que
**CLV todavía no es calculable** (0 observaciones, correctamente rechazadas). Se añadió regla de
plausibilidad de overround (0,9–1,2) tras detectar 2 filas BFE con 2,13/1,95. Siguiente paso:
capturar lunes/jueves/viernes antes del kickoff.

**A09c:** verificación acotada del cierre (no independiente) — 5/5 comprobaciones correctas;
veredicto "defendible" con la salvedad de exposición parcial a test ya documentada.

### 9.2 Ciclo 3 — integración NFL y EPA

- El contrato `Prediction` ya soporta `sport: "football" | "nfl"`; `nfl_logistic_v1` se sirve en
  TypeScript con paridad 4,996×10⁻¹³ y 448 tests.
- EPA no aportó de forma concluyente (Δ −0,002, IC cruza 0). El ciclo 4 debe probar DVOA,
  lesiones/alineaciones y un feature store NFL, no acumular features sin significancia.
- Priors v1.2 (fútbol) cerrado como resultado negativo: no mejora val.

### 9.3 Expansión multi-deporte — estado y decisión (ciclo 4)

| Deporte | Fuente candidata | Datos de partido | Licencia | Decisión |
|---|---|---|---|---|
| NFL | nflverse `games.csv` + `stats_team_week` | 1999–2026, 7.102 partidos, moneylines | **CC BY 4.0** | **Hecho** (motor + TS + EPA probado) |
| NCAAF | sportsdataverse `cfb_paper_index_games` | métricas equipo-partido 2004+ (sin marcador ni cuotas) | repo MIT, **datos sin licencia propia** | **No-go** hasta aclarar derechos |
| NHL | NHL API / hockeyR-data | API responde 200 pero sin SLA; releases sin partidos | **NO CONFIRMADO** | **No-go** para producción; solo investigación |

**Conclusión:** la arquitectura (contrato `Prediction`, laboratorio `eval/`, export a JSON, tests de
paridad) es extensible, pero **no se debe construir producto sobre datos sin licencia clara**. El
siguiente paso no es código: es conseguir una fuente con derechos para NHL/NCAAF o limitar su uso a
investigación interna documentada. NFL queda como el caso de referencia (CC BY 4.0 con atribución).
