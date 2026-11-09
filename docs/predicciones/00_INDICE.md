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
