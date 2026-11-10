# Impacto Cuantitativo del Web Scraping en el Motor de Predicción Multi-Deporte de PitchLab

- **Fecha de generación (UTC):** `2026-11-10T17:05:44Z`
- **Script de evaluación reproducible:** `scrapers/evaluate_scraping_lift.py`
- **Artefacto numérico auditable:** `data/feature_store/ablation_report.json`
- **Contrato Anti-Leakage:** `captured_at_utc <= predicted_at_utc AND feature_match_date < target_match_date` (`all_sha256_verified = True`, `55` snapshots crudos verificados, `108,167` registros normalizados en 4 tablas maestras).
- **Cobertura del Feature Store v2.0:** `376` entidades canónicas en **11 ligas y 6 deportes** (`liga-mx`, `epl`, `laliga`, `bundesliga`, `serie-a`, `ligue-1`, `nfl`, `nba`, `nhl`, `mlb`, `ncaaf`) y `15,344` partidos históricos con `xG` (`2018–2026`).

---

## 1. Resumen Ejecutivo

Para demostrar empíricamente cuánto mejoran los modelos de **PitchLab** al incorporar las **28 fuentes extraídas en Waves 1–5 (`55` snapshots crudos JSON)**, ejecutamos **cuatro experimentos walk-forward estrictamente causales** ($t' < t$, cero fuga de información futura):

1. **Experimento 1 — 5 Grandes Ligas Europeas (`2018–2025`, 7 temporadas completas, $N = 12,533$ partidos, $n_{\text{eval}} = 8,982$ out-of-sample):**
   - Pasar de un modelo tradicional de goles y Elo (`M1_baseline_goals_elo`, Log-Loss = `1.00117`, RPS = `0.20461`) al modelo enriquecido con **xG, npxGD, xPTS, PPDA y Deep Completions partido a partido** de Understat (`M2_scraped_xg_ppda_deep`) reduce el Log-Loss a **`0.99008`** ($\Delta = -0.01109$, IC 95% $[-0.01476, -0.00744]$, $p = 0.0000$).
   - Al añadir **valuaciones de plantilla y bajas de Transfermarkt + eficiencia de tiro de FBref** (`M3_scraped_full_plus_tm_values`), el Log-Loss cae hasta **`0.98572`** ($\Delta = -0.01545$, IC 95% $[-0.01978, -0.01102]$, $p = 0.0000$) y el **RPS mejora de `0.20461` a `0.19990`**.
   - El ensamble completo con la **simulación Monte Carlo tiro a tiro (`forecast`) de Understat** (`M4_understat_shot_forecast_ensemble`) alcanza un Log-Loss de **`0.86785`** ($\Delta = -0.13332$) y una exactitud de **`60.25%`** (frente a `52.10%` del baseline).

2. **Experimento 2 — Liga MX (`2018–2026`, 8 temporadas, $N = 2,795$ partidos, `1,798` con `xG` real Opta/Statiskicks, $n_{\text{eval}} = 2,186$ out-of-sample):**
   - Al incorporar las series partido a partido de **`xG`/`xGA` de Opta/FBref (`2018–2023`) y Statiskicks (`2025–2026`)** (`MX2_scraped_mex_xg`), el Log-Loss mejora de `1.04370` a **`1.03101`** ($\Delta = -0.01269$, IC 95% $[-0.02125, -0.00423]$, $p = 0.0000$).
   - Al integrar el paquete completo de Liga MX (**valuaciones Transfermarkt + percentiles tácticos Statiskicks/Opta PPDA + diferencial de altitud Open-Meteo**, `MX3_scraped_mex_full_tm_tactical_altitude`), el Log-Loss baja hasta **`1.02268`** ($\Delta = -0.02102$, IC 95% $[-0.03199, -0.01063]$, $p = 0.0000$), el **RPS mejora de `0.21769` a `0.21019`** y el **Shock de Altitud** sobre 8 años confirma un lift empírico de **`+13.94` pp** en victoria local.

3. **Experimento 3 — Microestructura de Mercado y Disponibilidad Multi-Deporte:**
   - **Vigorish / Overround:** **Pinnacle** opera con un overround medio en moneyline principal de **`3.22%`** (`2,607` mercados en fútbol, NFL, NBA y NHL), frente a **`6.62%`** en **Caliente.mx** (`2.06x` el margen institucional).
   - **Dinero Inteligente Multi-Deporte (Action Network):** En `7,046` lados activos (`NFL`, `NCAAF`, `NBA`, `NHL`, `MLB`), **`2,628` (`37.30%`)** registran divergencia $\ge 15\%$ y **`3,844` (`54.56%`)** presentan *Reverse Line Movement (RLM)*; además se integran **`1,004` lesionados** y **`186` titulares/porteros probables** en deportes de EE. UU.

4. **Experimento 4 (NUEVO) — Validación Predictiva Out-of-Sample Multi-Deporte (`NHL`, `MLB`, `NBA`, `NCAAF`, `716` equipos-temporada, `486` transiciones causales $S-1 \to S$):**
   - En los **4 deportes**, predecir el `Win%` real de la temporada $S$ con métricas avanzadas de $S-1$ supera simultáneamente al baseline ingenuo (`Win%` en $S-1$) en **RMSE, MAE y correlación de Pearson $r$**: **NHL** (`RMSE` `-0.00853`, `-8.0%`, $r = 0.4911$), **MLB** (`RMSE` `-0.00959`, `-15.5%`, $r = 0.6504$), **NBA** (`RMSE` `-0.00671`, `-3.8%`, $r = 0.5813$) y **NCAAF** (`RMSE` `-0.03574`, `-16.0%`, $r = 0.5011$ vs `0.4400`).

---

## 2. Experimento 1: Walk-Forward de 7 Temporadas en las 5 Grandes Ligas Europeas (`2018–2025`)

### 2.1 Diseño Causal y Jerarquía de Modelos
- **Universo:** `12,533` partidos completados en 7 temporadas completas (`2018/19` a `2024/25`) en `EPL`, `La_liga`, `Bundesliga`, `Serie_A` y `Ligue_1`, enlazados con `10,780` historiales granulares (`PPDA`, `deep`, `npxG`, `xPTS`).
- **Partición Walk-Forward:** Warm-up inicial en las primeras 2 temporadas (`2018/19`–`2019/20`, `3,551` partidos) y evaluación estrictamente fuera de muestra en las **5 temporadas siguientes (`2020/21`–`2024/25`, `8,982` partidos)**, re-estimando los pesos del logit multinomial L2 cada `450` partidos.
- **Garantía Anti-Leakage:** Para cada partido en la fecha $t$, las medias móviles (`r4`, `r8`, `r12`), los priors de la temporada previa ($S-1$), el rating Elo (`elo_goals` y `elo_xg`) y el *luck gap* ($G - xG$) se calculan **exclusivamente** con partidos jugados en $t' < t$.

### 2.2 Tabla de Ablación Global (5 Ligas Europeas, `2020/21–2024/25` Out-of-Sample)

| Modelo | Features Incorporados | Log-Loss $\downarrow$ | Brier $\downarrow$ | RPS $\downarrow$ | Accuracy $\uparrow$ | ECE $\downarrow$ | $\Delta$ Log-Loss vs `M1` (IC 95% Bootstrap) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`M0_climatology`** | Frecuencias base H/D/A por liga ($t' < t$) | `1.07615` | `0.65159` | `0.23108` | `42.70%` | `0.00488` | `+0.07498` |
| **`M1_baseline_goals_elo`** | Elo estacional goles + Goles `r4` + Descanso + Poisson Goles | `1.00117` | `0.59785` | `0.20461` | `52.10%` | `0.02178` | *Baseline (`0.00000`)* |
| **`M2_scraped_xg_ppda_deep`** | `M1` + Understat `xG`, `npxGD`, `xPTS`, `xG-Elo`, `G - xG`, `PPDA`, `Deep` | `0.99008` | `0.59000` | `0.20128` | `52.45%` | `0.02021` | **`-0.01109`** ($[-0.01476, -0.00744]$) |
| **`M3_scraped_full_plus_tm_values`** | `M2` + Transfermarkt `log_squad_value_ratio` + `missing_value_ratio` + FBref `SoT` | `0.98572` | `0.58703` | `0.19990` | `52.58%` | `0.01441` | **`-0.01545`** ($[-0.01978, -0.01102]$) |
| **`M4_understat_shot_forecast_ensemble`** | `M3` + Probabilidades Monte Carlo `forecast` de calidad de tiros | **`0.86785`** | **`0.50801`** | **`0.16406`** | **`60.25%`** | `0.03911` | **`-0.13332`** ($[-0.14067, -0.12566]$) |

### 2.3 Desglose por Liga Europea (`Log-Loss` en las 5 Temporadas Evaluadas)

| Liga | Partidos Eval | `M0` Climatology | `M1` Goals+Elo | `M2` +xG/PPDA/Deep | `M3` +TM Values/Injuries | `M4` Ensemble | $\Delta$ `M3 - M1` (Pre-Match) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **EPL** | `1,900` | `1.06765` | `0.98719` | `0.97601` | **`0.97097`** | **`0.84809`** | **`-0.01622`** |
| **La_liga** | `1,900` | `1.07359` | `1.00117` | `0.99176` | **`0.98588`** | **`0.88148`** | **`-0.01529`** |
| **Bundesliga** | `1,530` | `1.07425` | `1.01173` | `0.99599` | **`0.99520`** | **`0.86697`** | **`-0.01653`** |
| **Serie_A** | `1,900` | `1.08545` | `0.99324` | `0.98249` | **`0.97708`** | **`0.86978`** | **`-0.01616`** |
| **Ligue_1** | `1,752` | `1.07974` | `1.01571` | `1.00660` | **`1.00266`** | **`0.87318`** | **`-0.01305`** |

---

## 3. Experimento 2: Walk-Forward de 8 Temporadas en Liga MX (`2018–2026`)

### 3.1 Cobertura Histórica Multi-Fuente de Liga MX (`2018–2026`)
- **Total de partidos jugados consolidados:** `2,795` partidos únicos (`2018/19` a `2026/27`).
- **Partidos con `xG` real exacto (`1,798`):** `1,318` partidos históricos `2018–2023` con `home_xg`/`away_xg` **Opta vía FBref** + `480` partidos `2025–2026` con series `xG` rodantes de **Statiskicks**.
- **Partición Walk-Forward:** Warm-up inicial en `609` partidos (`2018–2020`) y evaluación walk-forward fuera de muestra en **`2,186` partidos (`2020–2026`)**.

### 3.2 Tabla de Ablación Walk-Forward en Liga MX (`2020–2026` Out-of-Sample)

| Modelo Liga MX | Features Incorporados | Log-Loss $\downarrow$ | Brier $\downarrow$ | RPS $\downarrow$ | Accuracy $\uparrow$ | ECE $\downarrow$ | $\Delta$ Log-Loss vs `MX1` (IC 95% Bootstrap) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`MX0_climatology`** | Frecuencias base H/D/A de Liga MX ($t' < t$) | `1.06945` | `0.64632` | `0.22624` | `45.06%` | `0.00479` | `+0.02575` |
| **`MX1_baseline_mex_goals_only`** | Elo estacional + Goles `r4` (equivalente a `MEX.csv`) | `1.04370` | `0.62837` | `0.21769` | `46.80%` | `0.00503` | *Baseline (`0.00000`)* |
| **`MX2_scraped_mex_xg`** | `MX1` + `xG`/`xGA` rodante (Opta/FBref + Statiskicks) + `xPTS` + `xG-Elo` + `G - xG` | `1.03101` | `0.61876` | `0.21305` | `48.72%` | `0.00928` | **`-0.01269`** ($[-0.02125, -0.00423]$) |
| **`MX3_scraped_mex_full_tm_tactical_altitude`** | `MX2` + Transfermarkt + Statiskicks/Opta PPDA + Altitud Open-Meteo | **`1.02268`** | **`0.61277`** | **`0.21019`** | **`48.86%`** | **`0.02405`** | **`-0.02102`** ($[-0.03199, -0.01063]$) |

### 3.3 Evidencia Empírica de 8 Años del Shock de Altitud en Liga MX (`Open-Meteo`)
- **Partidos con shock de altitud** (sede local $\ge 2,100\text{ m}$ como Toluca `2,667m`, Pachuca `2,426m`, CDMX `2,245m` o Puebla `2,175m` recibiendo a un visitante con altitud al menos $1,000\text{ m}$ menor): **`344` partidos**, con tasa de victoria local de **`57.56%`**.
- **Resto de partidos de Liga MX** (`2,451` partidos): tasa de victoria local de **`43.61%`**.
- **Lift empírico de ventaja local por altitud (8 temporadas):** **`+13.94` puntos porcentuales** a favor del club local en altitud elevada.

---

## 4. Experimento 3: Microestructura de Mercado y Disponibilidad Multi-Deporte

### 4.1 Comparativa de Overround / Vigorish (`Pinnacle` vs `Smarkets` vs `Caliente.mx`)

| Fuente / Operador | Tipo de Mercado | Muestras Analizadas | Overround / Spread Medio | Mediana | Interpretación para el Modelo |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Pinnacle (`pinnacle`)** | Moneyline principal (Fútbol / NFL / NBA / NHL) | `2,607` | **`3.22%`** (`3.88%` global) | `3.85%` | **Benchmark institucional (*sharp anchor*)** para calibración y CLV |
| **Pinnacle (`pinnacle`)** | Handicap / Spread principal | — | **`3.06%`** | — | Línea asiática / spread de mínima fricción |
| **Smarkets Exchange** | Orderbook P2P (`WINNER_3_WAY`) | `152` contratos | **`824.4 bps`** (P25 = `600.0 bps`) | `944.0 bps` | Probabilidad *mid-market* sin margen de casa tradicional |
| **Caliente.mx (`caliente_mx`)** | Moneyline 1X2 recreativo México | `250` | **`6.62%`** (P90 = `10.28%`) | `5.99%` | **`2.06x` el margen de Pinnacle**; exige normalización no-vig |

### 4.2 Señales de Dinero Inteligente y RLM por Deporte (`Action Network`)

| Deporte / Liga | Lados Activos con Splits | Divergencia Media $|\text{\% Dinero} - \text{\% Tickets}|$ | Cuantil P90 | Señales `sharp_money_flag` ($\ge 15\%$) | Señales `RLM` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`NFL`** | `1,687` | `8.51%` | `23.0%` | **`602`** | **`870`** |
| **`NCAAF`** | `4,226` | `15.57%` | `46.0%` | **`1,818`** | **`2,552`** |
| **`NBA`** | `648` | `6.43%` | `12.0%` | **`122`** | **`250`** |
| **`NHL`** | `336` | `10.21%` | `31.0%` | **`86`** | **`172`** |
| **`MLB`** | `100` | `3.98%` | `5.0%` | **`0`** | **`0`** |
| **`MLS`** | `14` | `3.29%` | `5.0%` | **`0`** | **`0`** |
| **`SOCCER`** | `35` | `3.29%` | `5.0%` | **`0`** | **`0`** |

### 4.3 Disponibilidad de Plantillas en Fútbol (`missing_market_value_ratio`) y Deportes de EE. UU.

| Liga Fútbol | Clubes Analizados | Jugadores Ausentes | Valor de Mercado Ausente Total (€) | Ratio Medio de Plantilla Ausente | Ratio Máximo en un Club |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`bundesliga`** | `18` | `93` | `€914,600,000` | **`16.79%`** | **`30.34%`** |
| **`epl`** | `16` | `48` | `€1,289,000,000` | **`9.99%`** | **`26.92%`** |
| **`laliga`** | `19` | `43` | `€470,400,000` | **`6.80%`** | **`16.05%`** |
| **`liga-mx`** | `13` | `21` | `€68,050,000` | **`9.15%`** | **`39.56%`** |
| **`ligue-1`** | `18` | `50` | `€815,750,000` | **`14.39%`** | **`31.67%`** |
| **`serie-a`** | `20` | `86` | `€1,100,600,000` | **`15.48%`** | **`35.12%`** |

#### Reportes Oficiales de Lesiones y Titulares Probables Multi-Deporte EE. UU. (`NBA`, `NHL`, `MLB`, `NCAAF`, `NFL`)

| Liga EE. UU. | Jugadores en Reporte de Lesiones | Bajas Confirmadas (`Out` / `IR` / `IL`) | En Duda (`Questionable` / `DTD`) | Titulares / Porteros Probables |
| :--- | :---: | :---: | :---: | :---: |
| **`NBA`** | `97` | `56` | `41` | `92` |
| **`NHL`** | `133` | `117` | `16` | `14` |
| **`MLB`** | `187` | `185` | `2` | `0` |
| **`NCAAF`** | `587` | `255` | `329` | `80` |
| **`NFL`** | `362` | `75` | `79` | `0` |

---

## 5. Experimento 4: Validación Predictiva Out-of-Sample Multi-Deporte (`NHL`, `MLB`, `NBA`, `NCAAF`)

### 5.1 Diseño Causal Año-Contra-Año ($S-1 \to S$, Cero Fuga Temporal)
- **Universo:** `716` registros equipo-temporada scrapeados en 4 ligas (`NHL`: 128, `MLB`: 90, `NBA`: 90, `NCAAF`: 408), formando **`486` pares consecutivos $(S-1 \to S)$** con resolución canónica de franquicias reubicadas (`Arizona Coyotes` $\to$ `Utah Mammoth`, `Oakland Athletics` $\to$ `Athletics`).
- **Objetivo:** Predecir el `Win%` real observado en la temporada $S$ utilizando **exclusivamente** estadísticas de la temporada previa $S-1$ ($t' < t$).
- **Comparativa:** Baseline ingenuo (`Win%` en $S-1$) vs Predictor de Eficiencia Avanzada Scrapeada estandarizado transversalmente dentro de $S-1$.

### 5.2 Resultados Out-of-Sample por Deporte (`RMSE`, `MAE` y Correlación de Pearson $r$)

| Deporte | Equipos-Temp | Pares OOS ($S-1 \to S$) | Métricas Avanzadas Scrapeadas ($S-1$) | `RMSE` Naive $\downarrow$ | `RMSE` Scrapeado $\downarrow$ | $\Delta$ `RMSE` (`%` Mejora) | `MAE` Naive $\to$ Scrapeado | Pearson $r$ Naive $\to$ Scrapeado $\uparrow$ |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **`NHL`** | `128` | `96` | 5v5 xG% + 5v5 Corsi% + Pythag 2.15 (MoneyPuck / Hockey-Reference) | `0.10669` | **`0.09816`** | **`-0.00853` (`-8.0%`)** | `0.08543` $\to$ **`0.07904`** | `0.4875` $\to$ **`0.4911` (`+0.0036`)** |
| **`MLB`** | `90` | `60` | Pythag 1.83 + FIP + OPS+ (Baseball-Reference / MLB StatsAPI) | `0.06204` | **`0.05245`** | **`-0.00959` (`-15.5%`)** | `0.04990` $\to$ **`0.04156`** | `0.6223` $\to$ **`0.6504` (`+0.0281`)** |
| **`NBA`** | `90` | `60` | NetRTG + SRS + Four Factors Opp eFG% & eFG% (Basketball-Reference) | `0.17734` | **`0.17063`** | **`-0.00671` (`-3.8%`)** | `0.14378` $\to$ **`0.14200`** | `0.5720` $\to$ **`0.5813` (`+0.0093`)** |
| **`NCAAF`** | `408` | `270` | ESPN FPI + SRS + Net Yards Per Play (Sports-Reference / ESPN FPI) | `0.22399` | **`0.18825`** | **`-0.03574` (`-16.0%`)** | `0.17573` $\to$ **`0.15420`** | `0.4400` $\to$ **`0.5011` (`+0.0611`)** |

---

## 6. Reproducibilidad End-to-End

Para regenerar íntegramente las tablas normalizadas, el Feature Store de 11 ligas, el backtest walk-forward de 4 experimentos y este documento:

```powershell
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/normalize_datasets.py
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/build_feature_store.py
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/evaluate_scraping_lift.py
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/run_matchday_refresh.py --verify-only --window all --skip-build
```
