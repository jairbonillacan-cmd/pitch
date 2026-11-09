# Resumen maestro del orquestador — estado 2026-11-09 02:00 (America/Mexico_City)

## 1. Infraestructura creada (verificada)

- **Worktree aislado:** `/Users/jairbonilla/PitchLab-Prediction-Lab` (rama `prediction-lab`, base `8424876`).
  El repo original (`/Users/jairbonilla/Desktop/Pitch Lab`, `main`) no se ha modificado.
- **Laboratorio:** `research/prediction-lab/` con `etl/`, `features/`, `models/{a,b}/`, `eval/`,
  `pipeline/`, `data/`, `artifacts/`, `reports/`, `coordination/`.
- **Python:** `.venv` (3.9.6) con numpy 2.0.2, pandas 2.2.3, scipy 1.13.1, scikit-learn 1.6.1,
  pyarrow 17.0.0. LightGBM no es instalable (falta `libomp`); se usa `HistGradientBoostingClassifier`.
- **Node:** vitest 2.1 operativo (`node_modules` copiado).

## 2. Datos (OBSERVADO)

- Fuente: football-data.co.uk, 465 archivos descargados (manifest con sha256 en
  `data/raw/manifest.json`). 17 divisiones principales × 27 temporadas (2000/01–2026/27) + 6 ligas
  extra (MEX, ARG, BRA, USA, JPN, SWE) desde 2012.
- **`matches.parquet`: 181.272 partidos, 23 divisiones, 42 etiquetas de temporada.**
  - 181.268 con resultado; 4 sin resultado; 0 duplicados de `match_id`; 0 incoherencias
    resultado/goles; 20 cuotas inválidas (≤1) puestas a nulo.
  - Cobertura: cierre Pinnacle 58,6 %; cierre B365 24,5 % (solo 2019/20+); apertura B365 76,2 %;
    Betfair Exchange cierre 9,9 %; tiros 51 %.
  - 2026/27 es parcial (90–134 partidos/liga) y **nunca** se usa como test.
  - Corregido: los CSV antiguos añadían columnas al final de algunas filas y el parser de pandas
    descartaba 45 partidos por temporada; ahora se normaliza la longitud de fila (+5.077 partidos).
- **`features.parquet`: 181.268 × 192**, causales (shift(1) por equipo; Elo pre-partido).
  Nulos: Elo 0 %, forma r5 0,22 %, prior temporada anterior 8,1 %, media de liga previa 4,2 %.
- **`features_market.parquet`:** de-vig proporcional/power/Shin para apertura y cierre.
  Márgenes medios: Pinnacle 3,1 %/2,9 %; B365 7,4 %/6,4 %; Betfair Exchange cierre 0,81 %.

## 3. Hallazgos de la auditoría (A01/A09, verificados por el orquestador)

- `npx vitest run` → **416/416** (392 de dominio + 24 de 3 copias del test Linemate).
- `npx tsc --noEmit` → **74 errores**; `npm run build` roto (A01).
- Los motores actuales son **paridad validada**, no predicción validada: sin entrenamiento,
  sin calibración, sin partición temporal, sin cuotas.
- **Leakage real en los motores legacy:** Liga MX usa totales de la temporada en curso
  (backtest J15 8/9 → 5/9 al excluir el partido); NHL duplica las 11 auditorías (8/11 → 7/11).
- **Empate descalibrado:** 25,90 % predicho vs 16,43 % observado (z ≈ −3,16); ρ negativo empeora
  Brier (0,6010 con ρ=−0,08/−0,14 vs 0,5962 con ρ=0).
- **Tests que no verifican:** `batch-verify` no tiene ningún `expect`; `sensitivity` solo loguea.
- `NOB` roto en fútbol/NHL/MLB: marca "sin valor" si hay cualquier cuota, aunque el EV sea +19,6 %.

## 4. Paper obligatorio (A02, verificado contra PDF)

- Sallis, Georgoulas, Tsoulos (2026), *Computation* 14(9):195, DOI `10.3390/computation14090195`,
  25 páginas, CC BY 4.0. 225.474 partidos (2018–2026), split cronológico.
- 6 clasificadores; con cuotas **todos son significativamente peores que el de-vig** en
  log-loss/Brier/RPS (Tabla 13, IC95 % > 0). Sin cuotas: 48,0 % accuracy vs 43,4 % trivial vs
  51,9 % bookmaker. El techo lo pone la información, no el algoritmo.
- Su bootstrap es i.i.d. sobre 583 competiciones: IC probablemente subestimados → usar bootstrap
  por bloques (A08).

## 5. Primeros resultados propios (val 2023/24, 8.152 partidos, Motor A)

| Sistema | Log-loss | Brier | RPS | Accuracy |
|---|---|---|---|---|
| base_rate (climatología por división) | 1,0736 | 0,6494 | 0,2265 | 0,439 |
| Elo ordenado (1 feature) | 1,0166 | 0,6092 | 0,2072 | 0,488 |
| Mercado Pinnacle cierre (power) | 0,9898 | 0,5910 | 0,1989 | 0,511 |

- El mercado gana por **0,0268** de log-loss a un Elo de una sola feature: el listón es alto pero
  no inalcanzable. Los valores de Brier son coherentes con el paper (bookmaker 0,5865).
- Pendiente: logit/poisson/HGB/ensemble de este run (en ejecución).

## 6. Riesgos y limitaciones ya documentados

- football-data.co.uk **no tiene licencia publicada**; uso comercial NO CONFIRMADO (A03).
  Es aceptable para investigación interna; antes de producción hay que resolverlo.
- No existe cuota histórica gratuita con timestamp → no se puede simular CLV; apertura/cierre
  se tratan como escenarios separados.
- xG histórico no disponible gratis con licencia clara (Understat caída, FBref 403,
  StatsBomb solo investigación). football-data añadió HxG/AxG en 2026/27 (90–109 partidos/liga).
- Los motores legacy se conservan como baseline congelado; no se modifican.

## 6-bis. Leakage encontrado y corregido (A05, 2026-11-09)

**Hallazgo crítico de A05 sobre el trabajo del orquestador:** los 10 priors de equipo
(`home_prev_*`, `away_prev_*`) se unían con `prev_of` **sin desplazar las estadísticas**, de modo
que cada partido de la temporada S recibía las estadísticas de **S+1** (leakage futuro).
Comprobación independiente: el PPG de Arsenal en partidos de 2018/19 era 1,842 (el de 2018/19)
en vez de 1,658 (el de 2017/18).

- **Corregido:** `groupby(["div","team"])[stat_cols].shift(1)` antes del rename y merge por
  `target_season`. Además, `season_progress` ya no usa `max(match_date)` de la temporada
  (calendario futuro), sino un calendario fijo jul–jun / ene–dic.
- **Impacto medido por A05:** el 88 % de la ganancia aparente de los priors era futuro
  (−0,00368 → −0,00045 con priors causales). Los modelos con priors estaban ~0,003 sobreestimados.
- **Reejecución obligatoria** de Motor A/B y de cualquier métrica offline que usara esos bloques.
- **Otras observaciones de A05:** 21 columnas post-partido (`elo_*_post`, `shots_*`, `ht_*`) y 5 de
  target viven en `features.parquet` (necesarias para auditoría, nunca en `FEATURES`); lista blanca
  añadida en `train_motor_a.py`. `days_rest` tiene máximos absurdos (8.477 días) → clip pendiente.
- **Datos v1.1 (02:50):** ETL corregido para cabeceras `HT`/`AT` de G1 (+1.142 partidos) y alias
  de equipos (Colón, Las Palmas, Extremadura, Lommel). `matches.parquet` = 182.414 filas.

## 7. Cola inmediata

1. Terminar run Motor A (poisson/hgb) y reejecutar Poisson con fallback de equipos nuevos.
2. Exportar `predictions.csv` (contrato) y correr `eval/report.py` sobre dev/val.
3. Motor B con cuotas de **apertura** (operable) + benchmark de cierre; comparaciones A–E.
4. Auditoría adversarial del laboratorio nuevo (A09 fase 2) antes de test.
5. Cierre de test **una sola vez** con candidatos congelados.
6. Documentación 01–14 e integración TS del modelo aprobado.

---

# CIERRE DEL CICLO 1 (2026-11-09 04:00) — resultados finales

## Motor A (sin cuotas) — test 2024/25 + 2025/26 (16.126 partidos)

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| base_rate | 1,07506 | 0,65044 | 0,22784 | 0,4376 | 0,0154 |
| **logit (desplegado)** | **1,01802** | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| hgb | 1,01860 | 0,61043 | 0,20835 | 0,4904 | 0,0055 |
| ensemble (logit+hgb+poisson) | 1,01652 | 0,60907 | 0,20789 | 0,4901 | 0,0047 |
| mercado cierre (mejor precio) | 0,99770 | 0,59645 | 0,20203 | 0,5062 | 0,0063 |

- `logit` vs mercado cierre: **+0,0203** de log-loss [0,0175; 0,0231] a favor del mercado.
- `ensemble` vs `logit`: −0,00153 [−0,00250; −0,00050], p=0,001 → el ensemble es mejor en test.
  No se cambia el modelo desplegado retroactivamente; pasa a candidato del ciclo 2.

## Motor B (con cuotas)

- `stack_logit` test: 1,00527 (mejor que Motor A, peor que el mercado).
- `market_open` vs `stack_logit` en los mismos 11.295 partidos: Δ +0,0007 [−0,0000; +0,0015], p=0,97
  → **sin diferencia significativa**. La mezcla con Motor A no aporta.
- Cierre vs apertura: −0,0034 [−0,0047; −0,0021] → el cierre es más eficiente.
- **Decisión:** Motor B = de-vig power sobre apertura; sin edge demostrable.

## Entregables del ciclo

- 11 subagentes reales (A01–A11, con A09b) + orquestador; informes y `status/*.json` en el repo.
- Dataset v1.1 (182.414 partidos) + features causales (182.410 × 198) + features de mercado.
- Laboratorio `eval/` (83 tests) y pipeline reproducible (`etl/`, `features/`, `models/`, `pipeline/`).
- Integración TS (`src/domain/prediction/`) con paridad 4,997×10⁻¹³ y 20 tests.
- Documentación 01–14 en `docs/predicciones/`.
- Commit `345b930` en la rama `prediction-lab`; `main` intacto.

## Pendientes para el ciclo 2 (ver 10_ROADMAP_PREDICCIONES.md)

1. Promover el ensemble con validación pre-registrada en datos nuevos.
2. Capturar snapshots propios de cuotas con timestamp (CLV real) y licencia de datos.
3. Incorporar xG (HxG/AxG de football-data 2026/27) cuando haya cobertura.
4. Calibración por liga y drift por temporada con las features ya construidas.
5. Expandir a NFL/NHL/NCAAF con nflverse (CC BY 4.0) y validar contratos.

## Nota de entorno (2026-11-09 03:48)

Durante la sesión, el checkout principal (`/Users/jairbonilla/Desktop/Pitch Lab`) pasó de `main`
(`8424876`) a la rama `feat/pre-mvp` (`a320d53`, trabajo de otros agentes). El worktree
`prediction-lab` sigue **basado en `main` 8424876** y no toca ninguna de esas ramas. Para integrar
en el futuro habrá que rebasar sobre `feat/pre-mvp` o sobre el estado que corresponda y revisar
conflictos en `src/data/index.ts`, `tests/` y `docs/`. `git diff --name-only main prediction-lab`
lista 90 archivos, todos del laboratorio (ninguno de ellos existía en `main`).
