# Documentación del motor de predicciones — índice y estado

> **Informe final del programa (ciclos 1–10):** [`research/prediction-lab/FINAL_REPORT.md`](../../research/prediction-lab/FINAL_REPORT.md) — resumen ejecutivo, evidencia de verificación y cómo continuar.

Esta carpeta contiene los **14 documentos** exigidos por la misión. Cada uno se apoya en artefactos
reproducibles del laboratorio (`research/prediction-lab/`), no en afirmaciones.

**Estado global: 14/14 completados** · 2026-11-09 · rama `prediction-lab` · commit **`a680a4f`** ·
cierre de test ejecutado **una sola vez** sobre candidatos congelados (`artifacts/FREEZE.md`).

| Doc | Contenido | Fuente principal | Estado |
|---|---|---|---|
| `01_AUDITORIA_ACTUAL.md` | Arquitectura legacy, motores, paridad vs validez, leakage MX/NHL, build roto y datos instantánea | A01, A09 | **completado** → [abrir](01_AUDITORIA_ACTUAL.md) |
| `02_INVESTIGACION_CIENTIFICA.md` | Paper obligatorio (Sallis et al. 2026), 28 referencias y los 17 experimentos | A02 | **completado** → [abrir](02_INVESTIGACION_CIENTIFICA.md) |
| `03_FUENTES_DATOS_GRATUITOS.md` | Inventario verificado de 22 fuentes, licencias y riesgos legales | A03 | **completado** → [abrir](03_FUENTES_DATOS_GRATUITOS.md) |
| `04_ARQUITECTURA_MOTORES.md` | Motor A/B, contratos, artefactos e integración TS con paridad 4,997×10⁻¹³ | A06, A07, A10 | **completado** → [abrir](04_ARQUITECTURA_MOTORES.md) |
| `05_FEATURE_ENGINEERING.md` | Catálogo de 198 columnas, fórmulas, leakage S+1→S−1 y ablación | A05 | **completado** → [abrir](05_FEATURE_ENGINEERING.md) |
| `06_METODOLOGIA_BACKTESTING.md` | Particiones, métricas, bootstrap por bloques, permutación y 83 tests | A08 | **completado** → [abrir](06_METODOLOGIA_BACKTESTING.md) |
| `07_EXPERIMENTOS_RESULTADOS.md` | EXP01–EXP17 con cifras finales, veredictos y retractaciones | A06, A07, A08, FREEZE | **completado** → [abrir](07_EXPERIMENTOS_RESULTADOS.md) |
| `08_COMPARACION_CON_MERCADO.md` | Mercado vs Motor A vs Motor B, de-vig, eficiencia, cierre>apertura | A07, FINAL | **completado** → [abrir](08_COMPARACION_CON_MERCADO.md) |
| `09_MEJORAS_IMPLEMENTADAS.md` | Cambios aceptados y rechazados con evidencia antes/después | todas | **completado** → [abrir](09_MEJORAS_IMPLEMENTADAS.md) |
| `10_ROADMAP_PREDICCIONES.md` | Siguiente ciclo: cuotas con timestamp, ensemble, xG, NFL, licencias | A03, A07, A09b | **completado** → [abrir](10_ROADMAP_PREDICCIONES.md) |
| `11_LIMITACIONES_Y_RIESGOS.md` | Licencias, cobertura, timestamps, xG, leakage, sobreajuste y mercados no operables | A03, A04, A05, A09 | **completado** → [abrir](11_LIMITACIONES_Y_RIESGOS.md) |
| `12_REPRODUCIBILIDAD.md` | Comandos, versiones, semilla 20261109, hashes y verificación del leakage | A11 | **completado** → [abrir](12_REPRODUCIBILIDAD.md) |
| `13_COORDINACION_SUBAGENTES.md` | Contratos, reparto real, paralelismo, hallazgos cruzados y estados | A11 | **completado** → [abrir](13_COORDINACION_SUBAGENTES.md) |
| `14_AUDITORIA_ADVERSARIAL.md` | A09 legacy + A09b lab, veredicto “no apto” y resolución | A09, A09b | **completado** → [abrir](14_AUDITORIA_ADVERSARIAL.md) |
| `15_REPORTE_COMPARATIVO_V2_VS_V1_VS_MERCADO.md` | Comparativa `Spacetime Suite v2.0` (`Tachyon v2.0`, `Singularity v2.0`, `Minkowski v2.0`) vs `v1.0` vs Casas de Apuestas vs Resultado Real | A23 | **completado** → [abrir](15_REPORTE_COMPARATIVO_V2_VS_V1_VS_MERCADO.md) |
| `16_INTEGRACION_REA_STATISKICKS.md` | Integración forense y cuantitativa de `REA-stats` (`statiskicks.com`) en `PitchLab Spacetime Suite v2.1`: Piedra Rosetta 40 ligas + 177 traits Opta, `xGOT` / `gk_prevented`, Radar Táctico `RankBands`, `SKORE` y Monte Carlo de Temporada/Liguilla | A24 | **completado** → [abrir](16_INTEGRACION_REA_STATISKICKS.md) |
| `17_MEJORA_MODELOS_SPACETIME_V21.md` | Mejora cuantitativa integral `PitchLab Spacetime Suite v2.1` (`Tachyon v2.1`, `Singularity v2.1`, `Minkowski v2.1`) sobre los datasets históricos locales | A25 | **completado** → [abrir](17_MEJORA_MODELOS_SPACETIME_V21.md) |
| `18_INTEGRACION_WEB_SCRAPING_FEATURE_STORE.md` | Evolución a `PitchLab Spacetime Suite v3.0`: integración del Feature Store v2.0 y las 28 fuentes de `web-scraping` (`376` equipos, `11` ligas, `6` deportes, `Tachyon v3.0`, `Singularity v3.0` + `Geodesic v2.0`, `Minkowski v3.0`, `Multi-Sport v3.0` y motor `< 1 ms` sobre `242` enfrentamientos vivos) | A26 | **completado** → [abrir](18_INTEGRACION_WEB_SCRAPING_FEATURE_STORE.md) |
| `19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md` | Hoja de ruta estratégica (`v3.1 → v4.0`): mejora intrínseca de los 6 motores deportivos + arquitectura `Geodesic v3.0` para predicción de apuestas y picks ganadores (`AH`/`O/U`/`BTTS`, *Player Props*, *Stale Lines*, gatillo `T-60m`, *Meta-Labeling*, Kelly con incertidumbre y `CLV`) | A27 | **completado** → [abrir](19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md) |
| `20_SWARM_V3_2_GEMINI.md` | Consolidación de `PitchLab Spacetime Suite v3.2`: `MatchOutlook` multi-mercado calibrado, auditoría Red Team y bloqueo de `sealed_holdout_2025` | v3.2 | **completado** → [abrir](20_SWARM_V3_2_GEMINI.md) |
| `21_MOTOR_SELECCIONES_MERIDIAN_V1.md` | Motor dedicado de Selecciones Nacionales `PitchLab Meridian v1.0 → v2.0 / v3.0` (`EXP_V33`/`EXP_V35`): pila `CC0` (`martj42` + `goalscorers` + `transfermarkt-datasets` Top-23 € y copas élite), Banco Mundial (`PDDL`/`CC-BY-4.0`), altitud ISA/diáspora/clima, FIFA SUM y paridad `< 10⁻¹²` (`v2.0 LL = 0.89535` significativa; `v3.0 LL = 0.89488`) | EXP_V33 / EXP_V35 | **completado** → [abrir](21_MOTOR_SELECCIONES_MERIDIAN_V1.md) |
| `22_CATALOGO_FUENTES_GRATUITAS_V2_Y_CLUBES_V33.md` | Catálogo de 11 fuentes abiertas (Olas 1 y 2: `appearances`, `transfers`, fatiga UEFA/Copas, `StatsBomb P1-1`) y motores `PitchLab Tachyon v3.4 Candidate` (`LL = 1.00845`) + `Tachyon v3.4 Live-Complete` (`52` cols, `100%` cobertura viva, `LL = 1.00794`, `ECE = 0.00470`, `ΔLL = -0.00756` vs modo vivo actual y `-0.00200` vs `v3.0` completo en `n = 68,638`) | EXP_V34 / EXP_V36 | **completado** → [abrir](22_CATALOGO_FUENTES_GRATUITAS_V2_Y_CLUBES_V33.md) |
| `23_REPORTE_CIERRE_JORNADA_PREDICTION_LAB.md` | Reporte ejecutivo de cierre de jornada: Olas 1–2 completadas, solver coherente 3-parámetros `Horizon-Goals v3.5` (`horizon_goals.ts`), `NFL Minkowski Totals v3.5` (`ΔLL = -0.01256` significativa), estado exacto de los 3 scripts `v3.5` y checklist de reanudación | EXP_V33–EXP_V39 | **completado** → [abrir](23_REPORTE_CIERRE_JORNADA_PREDICTION_LAB.md) |
| `24_MOTORES_V35_V36_Y_SINTESIS_FORENSE.md` | Consolidación de motores candidatos `v3.5` (`Club Tachyon v3.5` + `Horizon-Goals v3.5`, `Meridian v3.5`, `NFL Minkowski v3.5`) y `v3.6` (`EXP_V40` Micro-Mercados/Árbitros EB/Mitades, `EXP_V41` Player Props Jerárquicos/`sub_cover`/Knockout, `EXP_V42` Multi-Sport MLB/NHL/NBA) + síntesis forense vs Scout Picks y Astra AI | EXP_V37–EXP_V42 | **completado** → [abrir](24_MOTORES_V35_V36_Y_SINTESIS_FORENSE.md) |
| `25_SUITE_UNIFICADA_V40_COPULAS_Y_CALIBRACION.md` | Evolución a `PitchLab Spacetime & Copula Suite v4.0 Candidate` (`EXP_V43`–`EXP_V49`): Matriz 4-Param Diagonal-Inflada (`1.55e-15` coherencia 1X2), Micro-Mercados Bivariados Sarmanov `v4.0` (`5/5` significativos vs `v3.6` y climatología), NFL Números Clave + Props PBP reales (`8,275` juegos-jugador), Props `v4.0` (`Shots/SoT/Assists` + `sub_cover` empírico `+5.41 pp` + `PAVA`), `Multi-Sport v4.0` (`226` franquicias incl. `NCAAF Horizon v4.0`), Motor Institucional de Cópulas `SGP` Halton QMC y Hub `UnifiedMatchIntelligenceV4` (`242/242` `"ok"`) + Guardrail Anti-Alucinaciones | EXP_V43–EXP_V49 | **completado** → [abrir](25_SUITE_UNIFICADA_V40_COPULAS_Y_CALIBRACION.md) |
| `26_SUITE_V50_INPLAY_EARLY_PAYOUT_Y_EPISTEMICA.md` | Evolución a `PitchLab Spacetime, In-Play & Epistemic Suite v5.0 Candidate` (`EXP_V50`–`EXP_V56`): Escala Global `22` Ligas (`111,113` juegos) + `Meridian v5.0` 4-Param (`1.55e-15` coherencia 1X2) + Microestructura Modo B (`ΔLL = -0.00044` sig. vs Pinnacle Open), Micro-Mercados `HGB-Poisson` + `Red Cards` + `Booking Points` (`35.5/45.5/55.5` sig.), NFL Totales Clave Discretos sin deriva (`ECE 4.99% → 2.10%`) + `Overtime` + `qb_sacks_taken`/`qb_rush_attempts`, Props `v5.0` Logit-PAVA Baricéntrico (`7/7` sig., incl. Multi-Línea `1.5+`), Motor *In-Play* `HT→FT` (`ΔLL = -0.00530` sig.) + *Early Payout* Exacto (`+2 Goles / +17 NFL / +20 NBA / +5 MLB`), Cópula `Student-t` + *Bet Builder* Raikov Jugador-Equipo (`ΔLL = -0.02371` sig.) y Bandas Epistémicas Conformales `90%` en `UnifiedMatchIntelligenceV5` (`242/242` `"ok"`) | EXP_V50–EXP_V56 | **completado (rectificado en doc 27)** → [abrir](26_SUITE_V50_INPLAY_EARLY_PAYOUT_Y_EPISTEMICA.md) |
| `27_AUDITORIA_REMEDIACION_V51.md` | **Auditoría Adversarial y Remediación Integral `PitchLab v5.1 Candidate` (`REM_00`–`REM_08`)**: tabla completa `Antes (v5.0) → Después (v5.1)` sobre los `22` hallazgos (`A1`–`A6`, `B1`–`B4`, `C1`–`C5`, `D1`–`D7`), `0/130` bypass `v3`, `0/84` violaciones Early Payout, NFL Real ATS `0.69286` (`Std 13.31`), poda HGB `540 KB → 14.1 KB`, `γ_R = 0.1680` + árbitros Big-7 `94.3%`, Knockout limpio (`1,025` tandas purgadas), SGP Genz Rao-Blackwell (`0.0270 pp` vs MVN), `nflverse` In-Play Q3 OOS (`n=1,407`, `ΔLL = -0.21272`), `Inductive Venn-Abers` (`92.5%` / `100.0%` OOS), manifiesto `candidate_registry_v5_1.json` + barrel `v5_index.ts` y batería permanente de `12` axiomas Red-Team (`238/238` Vitest, `31/31` Pytest, `0` errores `tsc --strict`) | REM_00–REM_08 | **completado** → [abrir](27_AUDITORIA_REMEDIACION_V51.md) |

---

## Hechos de la versión documentada (v1.1, post-cierre)

- **Datos:** `matches.parquet` **182.414 × 88** (23 divisiones, 42 etiquetas, 182.410 con resultado);
  `features.parquet` **182.410 × 198**; `features_market.parquet` **182.410 × 192**;
  `validation_report.json` regenerado (73 checks, 0 críticos).
- **Motor A desplegado:** `logit` multinomial (`motor_a_logistic_v1`, v1.0.0), 54 features + 23 dummies,
  exportado a JSON y verificado en TypeScript con **|Δ| ≤ 4,997×10⁻¹³** y **21/21** tests.
- **Motor B:** de-vig *power* sobre cuotas de **apertura** (operable). **No** se adopta *stacking*.
- **Test (16.126 partidos, una sola vez):** `logit` **1,01802** · `hgb` 1,01860 · `ensemble` **1,01652** ·
  `base_rate` 1,07506 · **mercado cierre 0,99770** · mercado apertura 0,99176 (n=11.295).
  Brecha Motor A–mercado: **0,0188 (ensemble) / 0,0203 (logit)**.
- **Conclusión:** el sistema bate al baseline y **no** al mercado; no hay *edge* demostrable.
- **Verificación:** `eval/` 83/83 · `etl/` 11/11 · `tests/prediction` 21/21 · `npx tsc --noEmit`
  74 errores legacy (**0** en rutas A10).

---

## Convenciones

- Cada cifra debe poder reproducirse con un comando listado en el propio documento.
- Estados de evidencia: `OBSERVADO` (salida de comando/archivo), `INFERIDO` (razonamiento),
  `DESCONOCIDO` (no verificado). No se mezclan.
- Si un dato no existe en un informe o artefacto, se escribe **«pendiente de cierre»** o
  **«no verificado»**; no se estima.
- Los números de test solo aparecen una vez congelados los candidatos; lo anterior a esa fecha es
  exploratorio y no puede usarse para seleccionar modelo.
- Cifras de v1.0 (181.268 filas / priors con leakage) están **retiradas**: ver doc 07 §3.
- Rutas del laboratorio relativas a `research/prediction-lab/`; documentos enlazados entre sí.
