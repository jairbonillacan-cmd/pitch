# A26 — Evolución a `PitchLab Spacetime Suite v3.0`: Integración del Feature Store v2.0 y las 28 Fuentes de `web-scraping`

**Fecha:** 2026-11-10  
**Rama:** `prediction-lab` (base `810077c`, consumiendo `.worktrees/web-scraping@3a8b3c0` en modo estricto `read-only`)  
**Codenames Desplegados (`v3.0.0`):**
- **Fútbol (Deportivo Puro):** `PitchLab Tachyon v3.0` (`motor_a_logistic_v1@3.0.0`, `113` features base + `23` divisiones = `136` columnas, `C = 0.02`, + Ensamble `Logit + Calibrated HistGradientBoosting`).
- **Fútbol & Multi-Mercado (Híbrido + Valor):** `PitchLab Singularity v3.0` & `PitchLab Geodesic v2.0` (Desvigorización adaptativa Power/Shin al overround, corrección de sesgo recreativo MX, flujo institucional `Action Network` y compuerta anti-*Reverse Line Movement*).
- **NFL (Deportivo Puro + Capa Prospectiva):** `PitchLab Minkowski v3.0` (`nfl_logistic_v1@3.0.0`, `29` features base con invariante física de altitud + capa bayesiana en vivo con `SumerSports EPA`, `Ourlads`, `NFLPenalties` y `Open-Meteo`).
- **Deportes EE. UU. Calibrados (`NHL`, `MLB`, `NBA`, `NCAAF`):** `PitchLab Spacetime Multi-Sport v3.0` (`multisport_spacetime_v3@3.0.0`: `NHL Curvature v3.0`, `MLB Kepler v3.0`, `NBA Tensor v3.0`, `NCAAF Horizon v3.0`).
- **Inferencia Unificada en Tiempo Real (`< 1 ms`):** `src/domain/prediction/service.ts` + `research/prediction-lab/pipeline/predict_live_matchday.py` sobre **`242` enfrentamientos activos** en **`11` ligas** (`0.1028 ms/partido` en V8 TypeScript, `0.4567 ms/partido` en Python, paridad **`max|Δ| = 4.441 × 10⁻¹⁶`**).

---

## 1. Resumen Ejecutivo: Salto Cuantitativo `v1.0` $\rightarrow$ `v2.0` $\rightarrow$ `v2.1` $\rightarrow$ **`v3.0`** vs Casas de Apuestas

Todas las comparaciones históricas fuera de muestra respetan de forma innegociable las particiones congeladas en `FREEZE.md` (`VAL 2023`, `TEST 2024–25` en fútbol; `VAL 2010–19`, `TEST 2020–25` en NFL; transiciones estrictas inter-temporada $S-1 \to S$ en `NHL`/`MLB`/`NBA`/`NCAAF`) sobre la intersección exacta de partidos.

### 1.1. Tabla Maestra de Motores Principales (`Fútbol` y `NFL`)

| Motor | Rol / Universo | Partición Out-of-Sample | `v1.0` | `v2.0` | `v2.1` (Pre-WS) | **`v3.0` (Nuevo)** | Casas de Apuestas (De-Vig) | Ganancia Verificada (`Δ` e IC 95%) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Tachyon v3.0 (`logit`)** | Fútbol · Deportivo Puro (`23` ligas, `wf_cut`) | **VAL 2023** (`n = 8,152`) | `1.00903` | `1.00596` | `1.00569` | **`1.00485`** | `0.98984` (PS Cierre) | **`-0.00083` nats vs `v2.1`** ($P(\text{v3.0} < \text{v2.1}) = 97.45\%$) |
| **Tachyon v3.0 (`logit`)** | Fútbol · Deportivo Puro (`23` ligas, `wf_cut`) | **TEST 2024–25** (`n = 16,126`) | `1.01658` | `1.01408` | `1.01378` | **`1.01311`** | `0.99765` (Avg Cierre) | **`-0.00067` nats vs `v2.1`**, **IC 95% `[-0.00128, -0.00009]`** ($98.55\%$) |
| **Tachyon v3.0 (`ensemble`)** | Fútbol · Deportivo Puro (`Logit + GBM`) | **TEST 2024–25** (`n = 16,126`) | `1.01652` | `1.01375` | `1.01378` | **`1.01228`** | `0.99765` (Avg Cierre) | **`-0.00150` nats vs `v2.1`**; `-0.00083` vs `v3.0 logit` (**IC 95% `[-0.00136, -0.00029]`**) |
| **Tachyon v3.0 (`MEX`)** | Liga MX · Deportivo Puro (`xG` real + Altitud) | **TEST 2024–25** (`n = 676`) | `0.98784` | `0.98692` | `0.98715` | **`0.98477` (`logit`) · `0.98346` (`ens`)** | `0.96695` (`53.70%` Acc) | **`-0.00369` nats vs `v2.1`**; **Accuracy `54.73%` (`ens`) / `53.85%` (`logit`) > Mercado (`53.70%`)** |
| **Tachyon v3.0 (`Top-5 + MEX`)** | Clubes con `xG`/Táctica Real (`E0,SP1,D1,I1,F1,MEX`) | **TEST 2024–25** (`n = 4,180`) | `0.98640` | `0.98350` | `0.98349` | **`0.98148` (`logit`) · `0.98028` (`ens`)** | `0.96806` (Avg Cierre) | **`-0.00321` nats (`ens`) / `-0.00201` nats (`logit`) vs `v2.1`** |
| **Singularity v3.0 (`open`)** | Fútbol · Híbrido Apertura (Subconjunto con cuota) | **VAL 2023** (`n = 5,782`) | `0.98061` | `0.97946` | `0.97932` | **`0.97902` (`52.28%` Acc)** | `0.98018` (`52.14%` Acc) | **`-0.00115` nats MEJOR que Apertura**, **IC 95% `[-0.00173, -0.00056]`** |
| **Singularity v3.0 (`open`)** | Fútbol · Híbrido Apertura (Subconjunto con cuota) | **TEST 2024–25** (`n = 11,295`) | `0.99210` | `0.99120` | `0.99095` | **`0.99061` (`51.34%` Acc)** | `0.99148` (`51.07%` Acc) | **`-0.00087` nats MEJOR que Apertura**, **IC 95% `[-0.00149, -0.00024]`** |
| **Singularity v3.0 (`close`)** | Fútbol · Híbrido Cierre (Universo Completo) | **VAL 2023** (`n = 8,152`) | `0.99040` | `0.98950` | `0.98925` | **`0.98893` (`51.24%` Acc)** | `0.98989` (`51.08%` Acc) | **`-0.00096` nats MEJOR que Cierre**, **IC 95% `[-0.00140, -0.00050]`** |
| **Singularity v3.0 (`close`)** | Fútbol · Híbrido Cierre (Universo Completo) | **TEST 2024–25** (`n = 16,126`) | `0.99840` | `0.99785` | `0.99760` | **`0.99731`** | `0.99791` | **`-0.00060` nats MEJOR que Cierre**, **IC 95% `[-0.00111, -0.00010]`** |
| **Geodesic v2.0 (`Kelly 0.25x`)** | Ejecución Histórica de Valor + Gate Anti-RLM | **OOS Apertura vs B365** (`41,560` juegos) | ROI `-9.73%` | ROI `-1.20%` | ROI `+0.42%` | **ROI `+1.35%` (`3,670` apuestas)** | Benchmark `-5.2%` vig | Apuestas ejecutables logran **`+1.35%` ROI OOS**; apuestas vetadas por Anti-RLM caen `-100%` |
| **Minkowski v3.0 (`NFL`)** | NFL · Deportivo Puro (`logit` / `blend`) | **TEST 2020–25** (`n = 1,615`) | `0.65617` | `0.65269` | `0.65017` / `0.64967` | **`0.65015` (`logit`) · `0.64963` (`blend`, `65.76%` Acc)** | `0.62655` (`66.50%` Acc) | Mejora en `VAL` y `TEST` + capa bayesiana en vivo (`32` franquicias, `19` cuadrillas arbitrales) |

### 1.2. Tabla Maestra `PitchLab Spacetime Multi-Sport v3.0` (`NHL`, `MLB`, `NBA`, `NCAAF`)

Evaluación estrictamente causal inter-temporada $S-1 \to S$ (`0` fuga intra-temporada) más auditorías suplementarias sobre partidos individuales reales observados frente a los motores heurísticos legacy (los cuales permanecen 100% intactos en el código fuente):

| Motor (`v3.0.0`) | Universo Canónico | Partición Causal $S-1 \to S$ | `RMSE Win%` (`v3.0` vs Naive / Legacy) | `Game Log-Loss` (`v3.0` vs Naive / Legacy) | Auditoría en Partidos Reales Observados / Física |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`NHL Curvature v3.0`** | `32` franquicias NHL | `64` equipo-temp (`3,194` juegos) | **`0.0970`** vs `0.1149` / `0.1048` | **`0.69304`** vs `0.70132` / `0.69633` (**IC 95% vs Legacy `[-0.00664, -0.00030]`**) | `n = 235` juegos reales: **`0.65113` vs `0.66913` (`hockey.ts`, `-0.01800` nats)** |
| **`MLB Kepler v3.0`** | `30` franquicias MLB | `30` equipo-temp (`4,858` juegos) | **`0.0588`** vs `0.0665` / `0.0610` | **`0.69109`** vs `0.69317` / `0.69171` ($r = 0.5679$) | Física barométrica Coors Field (`1,580 m` / `842 hPa`): multiplicador **`1.1803x`** carreras |
| **`NBA Tensor v3.0`** | `30` franquicias NBA | `60` equipo-temp (`2,768` juegos) | **`0.1590`** vs `0.1660` / `0.1613` | **`0.68106`** vs `0.68690` / `0.68282` ($r = 0.5237$) | Four Factors (`eFG%`, `Opp eFG%`, `NetRtg`, `SRS`, `Pace`) + choque de altitud Denver/Utah |
| **`NCAAF Horizon v3.0`** | `138` programas FBS | `136` equipo-temp (`1,228` juegos) | **`0.1837`** vs `0.2287` / `0.2088` | **`0.66775`** vs `0.74778` / `0.69619` (**IC 95% vs Legacy `[-0.04848, -0.01062]`**) | `n = 121` juegos reales: **`0.59812` vs `0.63712` (`engine-ncaa.ts`, `-0.03900` nats)** |

---

## 2. Arquitectura Anti-Leakage e Integridad Criptográfica (`etl/ingest_web_scraping.py`)

### 2.1. Verificación Criptográfica de las 28 Fuentes (`55 / 55` Snapshots)
El puente ETL (`research/prediction-lab/etl/ingest_web_scraping.py`) consume `.worktrees/web-scraping` estrictamente en modo lectura y verifica el hash SHA-256 canónico del `payload` de cada uno de los **55 snapshots JSON crudos** frente a `manifest_summary.json`:
- `snapshots_total = 55`, `snapshots_verified = 55`, **`all_sha256_verified = true`**.
- `108,167` registros normalizados auditados en 4 dominios: `xg_and_team_ratings` (`78,898`), `market_microstructure` (`22,412`), `roster_availability` (`5,908`) y `news_and_environment` (`949`).

### 2.2. Separación Estricta entre Series *Point-in-Time* y Snapshots Prospectivos (`2026-11-09/10`)
Durante la auditoría forense de `historical_matches_xg.json` (`15,344` filas) se detectó una trampa potencial de fuga temporal que fue neutralizada antes de tocar cualquier modelo:
1. **Exclusión de imputaciones transversales 2026 en Liga MX (`2024/25`):** En `historical_matches_xg`, `997` partidos de Liga MX donde FBref no tenía `xG` partido a partido habían sido rellenados en origen con la media de temporada 2026 de Statiskicks (`source_id = statiskicks_fallback_cross_section`). En `ingest_web_scraping.py`, toda fila con fallback transversal se marca con `is_exact_xg = False` y sus campos `home_xg_ws` / `away_xg_ws` se anulan en el entrenamiento histórico, conservando únicamente las **`14,332` filas con `xG` real por partido** (`12,533` Europa Top-5 + `1,799` Liga MX FBref/Opta).
2. **Exclusión total de `forecast_p_*` de Understat:** Las probabilidades `forecast_p_home/draw/away` de un partido $t$ son simulaciones Monte Carlo *post-tiro* de ese mismo partido; están bloqueadas por contrato y verificadas mediante test unitario (`test_02_strict_anti_leakage_in_historical_features`) para que jamás entren como feature pre-partido.
3. **Aislamiento de snapshots `2026-11-09/10`:** Variables como `missing_market_value_ratio`, bajas de `RotoWire`/`Transfermarkt`/`Ourlads`, cuotas vivas de `Pinnacle`/`Caliente.mx`/`Smarkets`, splits de `Action Network` y pronóstico meteorológico a 7 días de `Open-Meteo` viven exclusivamente en `ws_live_inference_context.parquet`/`.json` para inferencia prospectiva (`captured_at_utc <= kickoff_utc`).
4. **Resolución Universal de Entidades y Física de Estadios:**
   - `ws_soccer_match_xg_2018_2026.parquet`: **`15,317 / 15,329` partidos cruzados (`99.92%`)** contra `matches.parquet` (`100.0%` en `E0`, `SP1`, `D1`, `F1`; `99.96%` en `I1`; `99.61%` en `MEX`).
   - `ws_understat_team_match_tactical.parquet`: **`21,560 / 21,560` filas cruzadas (`100.00%`)**.
   - `ws_stadium_physics.parquet`: **`398` registros** (`175` estadios primarios `Open-Meteo` + clubes históricos), desambiguando correctamente relocalizaciones históricas como `Monarcas Morelia` (`1,920 m`, `802.88 hPa`) vs `Mazatlan FC` (`38 m` / `12 m`, nivel del mar) y sedes de choque hipóxico como `Toluca` (`2,678 m`, `730.27 hPa`, `altitude_shock_venue_flag = True`) y `CDMX` (`2,245 m`, `771.07 hPa`).

---

## 3. Detalle Técnico por Motor en `PitchLab Spacetime Suite v3.0`

### 3.1. `PitchLab Tachyon v3.0` (Fútbol · Motor Deportivo Puro y Especialización Liga MX)
- **Jerarquía Causal `Real xG > Proxy xG` (`features/xg_proxy.py`):** Resuelve de raíz el cuello de botella histórico de `MEX.csv` (que carecía de columnas `HS`/`AS`/`HST`/`AST`). Donde existe `xG` real verificado (`is_exact_xg = True`), reemplaza al proxy de tiros y activa el indicador `has_real_xg_history`.
- **Rating Dinámico `xG-Elo` y *Clinical Luck Gap* (`features/build_features.py`):** Nuevo tracker Elo continuo alimentado por el margen esperado de goles (`xg_elo_diff`) y su divergencia frente al Elo de marcador (`xg_elo_vs_elo_diff`), junto con sobre-ejecución de puntos esperados (`pts_minus_xpts_diff_r10`, `xpts_diff_r10`) para capturar regresión a la media antes que el mercado.
- **Táctica Real Understat (`features/tactical_optaproxies.py`):** Incorpora presión alta `PPDA` (`ppda_diff_r10`) y pases profundos al área (`deep_completions_diff_r10`) con ventana causal `.shift(1)` estricta (`min_periods = 2`).
- **Geofísica Hipóxica Invariante:** `altitude_diff_m`, `altitude_shock_flag` ($\text{alt}_{\text{local}} \ge 2,100\text{ m}$ y $\Delta\text{alt} \ge 1,000\text{ m}$) y `surface_pressure_diff` (hPa).
- **Prior Bayesiano Prospectivo de Plantilla y Bajas (`lineup_availability_delta`):** En inferencia en vivo (`fixture_features.py` / `service.ts`), ajusta los log-odds pre-partido según el diferencial de `log_squad_value` y la penalización asimétrica de `missing_market_value_ratio` y `rotowire_injured_out_count` sin contaminar el entrenamiento histórico. Validación en `200` partidos reales: **`200 / 200` exactos (`0` discrepancias en las `113` features)**.

### 3.2. `PitchLab Singularity v3.0` & `Geodesic v2.0` (Microestructura de Mercado, De-Vig MX y Sharp Money)
- **Auditoría Empírica de Overround (`22,412` registros):** `Pinnacle` Moneyline Sharp exhibe un margen medio de **`3.22%`** (`IC 95% [3.17%, 3.26%]`), mientras que `Caliente.mx` exhibe **`6.62%` global** y **`7.05%` en fútbol 1X2** (`IC 95% [6.77%, 7.35%]`, llegando a `13.91%`), y `Smarkets Exchange` opera con spread medio líquido de `319.5 bps` (`82.8 bps` en mercados ultra-líquidos).
- **Calibrador `devigAdaptive1X2` (`src/domain/prediction/devig.ts`):** Interpola de forma suave entre desvigorización **Power** (óptima en libros institucionales de bajo margen como Pinnacle) y **Shin** (óptima cuando existe asimetría recreativa y alto *overround*, con peso $w_{\text{Shin}} = 0.85$ en el ancla recreativa de `6.62%`). Sobre `11,158` partidos históricos de alto margen ($\ge 6.5\%$) pareados contra Pinnacle Sharp como *ground truth*, alcanza el mínimo global **`RMSE = 0.013657`** (superando Proporcional `0.015656`, Power puro `0.014093` y Shin puro `0.013669`).
- **Corrección de Sesgo Recreativo MX (`debiaseRecreationalLigaMx`):** Descuenta la inflación pública sobre clubes de alta afición (`CF América`, `Chivas`, `Cruz Azul`, `Pumas UNAM`, `Tigres UANL`, `Monterrey`) cuando el libro supera `5.0%` de margen.
- **Inclinación Institucional `Action Network` y Compuerta Anti-RLM (`Geodesic v2.0`):** Audita `17,145` outcomes de splits (`% tickets` vs `% money`) y `208` resúmenes de juego. En el backtest histórico sobre `Tachyon v3.0`, `Singularity v3.0` bate estadísticamente tanto al mercado de **Apertura** (`TEST 2024–25`: **`0.99061` vs `0.99148`**, `Δ = -0.00087`, IC 95% `[-0.00149, -0.00024]`) como al mercado de **Cierre** (`TEST 2024–25`: **`0.99731` vs `0.99791`**, `Δ = -0.00060`, IC 95% `[-0.00111, -0.00010]`). En simulación ejecutable Quarter-Kelly (`41,560` partidos con cuota de apertura `B365`), `Geodesic v2.0` obtiene **`+1.35%` de ROI OOS real (`3,670` apuestas)** mientras bloquea las trampas de *Reverse Line Movement* en contra.

### 3.3. `PitchLab Minkowski v3.0` (`NFL`) y `Spacetime Multi-Sport v3.0` (`NHL`, `MLB`, `NBA`, `NCAAF`)
- **`Minkowski v3.0` (`NFL`):** Integra el invariante físico de altitud (`Mile High = 1,588 m`, `+18` Elo equivalentes en localía hipóxica) mejorando simultáneamente `VAL 2010–19` (`0.64077`) y `TEST 2020–25` (`0.64963`, `Acc = 65.76%`), y añade `nfl_live.ts` / `live_context.py` con diferenciales de `SumerSports EPA/play` y `Success%`, bajas ponderadas `Ourlads`/`NFL Official Injuries` (`QB`, `OL`, `pass-rush`, `secondary`), propensión de castigos de las `19` cuadrillas arbitrales (`54` filas `NFLPenalties`) y viento/precipitación `Open-Meteo` en estadios abiertos.
- **`Spacetime Multi-Sport v3.0` (`src/domain/prediction/multisport.ts`):** Modelos regularizados entrenados en `models/multisport/train_multisport.py` bajo contrato estricto $S-1 \to S$ y exportados a `src/data/prediction/model_multisport.json`:
  - **`NHL Curvature v3.0`:** `xG%` 5v5, `Corsi%`, `Fenwick%`, `High-Danger xG` (MoneyPuck) y `Pythagorean 2.15`.
  - **`MLB Kepler v3.0`:** `OPS+`, `wOBA`, `FIP`, `WHIP`, `ERA-FIP luck gap`, `Pythagorean 1.83` y física barométrica de altitud/domo para proyección de carreras totales.
  - **`NBA Tensor v3.0`:** `ORtg`, `DRtg`, `NetRtg`, `SRS`, `Pace`, `eFG%` ofensivo/defensivo (`Four Factors`) y choque de altitud (`Denver 1,609 m`, `Utah 1,300 m`).
  - **`NCAAF Horizon v3.0`:** `ESPN FPI`, `SRS`, `SOS`, `Off/Def YPP` y `Pythagorean 2.37` sobre los **`138` programas FBS**, superando el motor estático `engine-ncaa.ts` por **`-0.02844` nats** en $S-1 \to S$ y **`-0.03900` nats** en partidos observados reales.

---

## 4. Inferencia Unificada `< 1 ms` y Paridad IEEE-754 Python ↔ TypeScript

El servicio unificado `src/domain/prediction/service.ts` (`predictMatch`, `predictMatchBatch`, `predictLiveMatchup`, `predictLiveEdgeMatrix`) y su gemelo CLI `research/prediction-lab/pipeline/predict_live_matchday.py` resuelven los **`242` enfrentamientos activos** de las **`11` ligas** (`liga-mx`, `epl`, `laliga`, `bundesliga`, `serie-a`, `ligue-1`, `nfl`, `nhl`, `mlb`, `nba`, `ncaaf`) cruzando `live_matchups_edge_matrix.json` con los **`376` equipos canónicos** de `team_master_features.json` (`100%` de resolución, incluyendo clubes europeos en cruces continentales y fallback automático `smarkets_anchor_v3` / `sports_only` cuando falta cuota tradicional).

| Suite / Artefacto de Paridad | Casos Verificados | Latencia Total / Por Partido | Error Máximo Python ↔ TS (`max\|Δ\|`) | Tolerancia Contrato | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `features_snapshot.json` (`Tachyon v3.0` Histórico) | `200` partidos (`600` probs) | `< 3 ms` total | **`<= 4.997 × 10⁻¹³`** | `1.0 × 10⁻¹²` | **OK** |
| `fixture_requests.json` (`Tachyon v3.0` Fixtures) | `150` fixtures (`113` feats) | `< 3 ms` total | **`<= 9.416 × 10⁻¹³`** (`200/200` feats `0` diff) | `1.0 × 10⁻¹²` | **OK** |
| `market_v3_snapshot.json` (`Singularity v3.0` + `Geodesic v2.0`) | `64` vectores dorados | `< 2 ms` total | **`1.110 × 10⁻¹⁶`** | `1.0 × 10⁻¹²` | **OK** |
| `nfl_snapshot.json` (`Minkowski v3.0` Base + Live) | `200` base + `40` live | `< 3 ms` total | **`1.110 × 10⁻¹⁶`** (live) / `< 5 × 10⁻¹³` (base) | `1.0 × 10⁻¹²` | **OK** |
| `multisport_snapshot.json` (`NHL`, `MLB`, `NBA`, `NCAAF`) | `140` casos (`35` × deporte) | `< 2 ms` total | **`1.110 × 10⁻¹⁶`** (prob) / `4.441 × 10⁻¹⁶` (total) | `1.0 × 10⁻¹²` | **OK** |
| **`live_matchday_v3_snapshot.json` (Matriz Viva `11` Ligas)** | **`242` enfrentamientos vivos** | **`24.88 ms` V8 (`0.1028 ms/juego`)** · `110.52 ms` Py (`0.4567 ms/juego`) | **`4.441 × 10⁻¹⁶`** | `1.0 × 10⁻¹²` | **OK** |

En la corrida viva de los `242` enfrentamientos (`live_matchday_v3_snapshot.json`), el motor identifica **`63` oportunidades ejecutables Quarter-Kelly** tras aplicar los filtros `Geodesic v2.0`, de las cuales **`25` cuentan con confirmación institucional explícita** (`Action Network` sharp divergence a favor) y `1` trampa residual post-tilt es bloqueada por el gate anti-RLM.

---

## 5. Estado del Release Gate y Verificación Automatizada

| Bloque de Verificación | Comando Ejecutado | Resultado Observado |
| :--- | :--- | :--- |
| **Integración & Anti-Leakage A26 (`unittest`)** | `python -m unittest eval/tests/test_web_scraping_integration.py -v` | **`5 / 5` tests OK** (SHA-256 `55/55`, `0` leakage, joins `99.92%`/`100%`, física altitud, `242` matchups) |
| **Suite Completa `eval/tests` (`unittest`)** | `python -m unittest discover -s eval/tests -p "test_*.py"` | **`88 / 88` tests OK** |
| **Suites `etl/tests` y `pipeline/tests`** | `python -m unittest discover -s etl/tests` + `pipeline/tests` | **`11 / 11` ETL OK** · **`7 / 7` Registry OK** |
| **Suite TypeScript Predicción (`vitest`)** | `npx vitest run tests/prediction` | **`7 / 7` archivos · `97 / 97` tests OK** |
| **Release Gate Oficial (`validate_release.py`)** | `python pipeline/validate_release.py` | **`7 / 7` bloques `true` (`RELEASE: OK`)** — `motor_a_logistic_v1@3.0.0`, `nfl_logistic_v1@3.0.0`, `multisport_spacetime_v3@3.0.0` |
| **Aislamiento de `.worktrees/web-scraping`** | `git -C .worktrees/web-scraping status --short` | **Vacío (`0` archivos tocados, `read-only` estricto)** |
| **Integridad de Motores Heurísticos Legacy** | `git diff src/domain/aztecavet/{hockey,baseball}.ts src/domain/engine-ncaa.ts` | **Vacío (`0` líneas modificadas)** |

---

## 6. Comandos Exactos de Reproducción End-to-End

```powershell
# Desde .worktrees/prediction-lab/research/prediction-lab
$py = ".\.venv\Scripts\python.exe"

# 1. Ingesta read-only y verificación SHA-256 (55/55 snapshots) desde .worktrees/web-scraping
& $py etl/ingest_web_scraping.py

# 2. Reconstrucción causal de features de fútbol y mercado + entrenamiento Tachyon v3.0 y Singularity v3.0
& $py features/build_features.py
& $py models/a/train_motor_a.py --tag EXP01_baselines --no-test
& $py pipeline/export_model.py
& $py pipeline/fixture_features.py --validate 200
& $py pipeline/export_fixture_requests.py
& $py features/build_market_features.py
& $py models/b/market_microstructure_v3.py
& $py models/b/train_motor_b.py --motor-a artifacts/EXP01_baselines_20261109 --phase open --tag EXP_A26_singularity_v3_open
& $py models/b/train_motor_b.py --motor-a artifacts/EXP01_baselines_20261109 --phase close --tag EXP_A26_singularity_v3_close

# 3. Entrenamiento y exportación Minkowski v3.0 (NFL) + Spacetime Multi-Sport v3.0 (NHL, MLB, NBA, NCAAF)
& $py pipeline/export_model_nfl.py
& $py models/multisport/train_multisport.py
& $py models/multisport/export_multisport.py

# 4. Inferencia unificada pre-jornada sobre los 242 enfrentamientos vivos (11 ligas)
& $py pipeline/predict_live_matchday.py --export-snapshot --league liga-mx

# 5. Verificación completa de paridad TS, anti-leakage y Release Gate v3.0
& $py pipeline/validate_release.py
```
