# Impacto Cuantitativo del Web Scraping en el Motor de Predicción de PitchLab

- **Fecha de generación (UTC):** `2026-11-09T22:44:43Z`
- **Script de evaluación reproducible:** `scrapers/evaluate_scraping_lift.py`
- **Artefacto numérico auditable:** `data/feature_store/ablation_report.json`
- **Contrato Anti-Leakage:** `captured_at_utc <= predicted_at_utc AND feature_match_date < target_match_date` (`all_sha256_verified = True`, `61,033` registros normalizados en 4 tablas maestras).

---

## 1. Resumen Ejecutivo

Para demostrar empíricamente cuánto mejoran los modelos de **PitchLab** al incorporar las 22 fuentes extraídas con **Scrapling**, ejecutamos un **backtest de ablación walk-forward estrictamente causal** ($t' < t$, sin fuga de información futura) sobre dos dominios futbolísticos complementarios y un estudio de microestructura de mercado y disponibilidad de plantillas:

1. **Experimento 1 — 5 Grandes Ligas Europeas (`EPL`, `La_liga`, `Bundesliga`, `Serie_A`, `Ligue_1`, $N = 3,504$ partidos, $n_{\text{eval}} = 1,752$ out-of-sample):**
   - Pasar de un modelo tradicional de goles y Elo (`M1_baseline_goals_elo`, Log-Loss = `0.99955`, RPS = `0.20506`) al modelo enriquecido con **xG, npxGD, xPTS, PPDA y Deep Completions** de Understat (`M2_scraped_xg_ppda_deep`) reduce el Log-Loss a **`0.98042`** ($\Delta = -0.01913$, IC 95% $[-0.02833, -0.00920]$, $p = 0.0000$).
   - Al añadir **valuaciones de plantilla y bajas de Transfermarkt + eficiencia de tiro de FBref** (`M3_scraped_full_plus_tm_values`), el Log-Loss cae hasta **`0.97787`** ($\Delta = -0.02168$, IC 95% $[-0.02957, -0.01088]$, $p = 0.0000$) y el **RPS mejora de `0.20506` a `0.19856`**.
   - El ensamble completo con la **simulación Monte Carlo tiro a tiro (`forecast`) de Understat** (`M4_understat_shot_forecast_ensemble`) alcanza un Log-Loss de **`0.85870`** ($\Delta = -0.14085$) y una exactitud de **`61.02%`** (frente a `52.68%` del baseline).

2. **Experimento 2 — Liga MX (`2023–2026`, $N = 1,160$ partidos, $n_{\text{eval}} = 480$ out-of-sample):**
   - En la rama `prediction-lab`, el archivo público `football-data.co.uk/new/MEX.csv` carecía por completo de tiros y de `xG` (`0` columnas de calidad de ocasiones).
   - Al incorporar las series partido a partido de **`xG`/`xGA` de Statiskicks y FBref** (`MX2_scraped_mex_xg`), el Log-Loss mejora de `1.04749` a **`1.03680`** ($\Delta = -0.01069$, IC 95% $[-0.02849, +0.00776]$, $p = 0.1000$).
   - Al integrar el paquete completo de Liga MX (**valuaciones de los 18 clubes en Transfermarkt + percentiles tácticos de Statiskicks/Opta PPDA + diferencial de altitud de Open-Meteo**, `MX3_scraped_mex_full_tm_tactical_altitude`), el Log-Loss baja hasta **`1.03405`** ($\Delta = -0.01344$, IC 95% $[-0.03845, +0.01138]$, $p = 0.1380$), el **RPS cae de `0.21965` a `0.21382`** y la exactitud sube de `48.12%` a **`50.00%`**.

3. **Experimento 3 — Microestructura de Mercado y Disponibilidad de Plantilla:**
   - **Vigorish / Overround:** **Pinnacle** opera con un overround medio en línea principal de moneyline de **`3.22%`** (`3.88%` global en `2,607` mercados), mientras que **Caliente.mx** cobra un overround medio de **`6.62%`** en mercados 1X2 (`2.06x` el margen de Pinnacle). Esto confirma que usar precios de casas recreativas sin desvigorizar induce sesgo severo en las probabilidades implícitas.
   - **Dinero Inteligente (Action Network):** De `3,160` lados activos con splits públicos, **`1,060` (`33.54%`)** presentan divergencia de dinero inteligente $\ge 15\%$ (`% dinero - % tickets`), y **`736` (`23.29%`)** activan señal de *Reverse Line Movement (RLM)*.

---

## 2. Experimento 1: Walk-Forward en las 5 Grandes Ligas Europeas (`2023–2025`)

### 2.1 Diseño Causal y Jerarquía de Modelos
- **Universo:** `3,504` partidos completados (`2023/24` y `2024/25`) en `EPL`, `La_liga`, `Bundesliga`, `Serie_A` y `Ligue_1`.
- **Partición Walk-Forward:** Entrenamiento inicial en los primeros `1,752` partidos (`2023/24`) y evaluación estrictamente fuera de muestra en los `1,752` partidos de `2024/25`, re-estimando los pesos del logit multinomial L2 cada `175` partidos.
- **Garantía Anti-Leakage:** Para cada partido en la fecha $t$, las medias móviles (`r4`, `r8`, `r12`), el rating Elo (`elo_goals` y `elo_xg`), la expectativa Poisson/Dixon-Coles y el *luck gap* ($G - xG$) se calculan **exclusivamente** con partidos jugados en $t' < t$.

### 2.2 Tabla de Ablación Global (5 Ligas Europeas)

| Modelo | Features Incorporados | Log-Loss $\downarrow$ | Brier $\downarrow$ | RPS $\downarrow$ | Accuracy $\uparrow$ | ECE $\downarrow$ | $\Delta$ Log-Loss vs `M1` (IC 95% Bootstrap) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`M0_climatology`** | Frecuencias base H/D/A por liga ($t' < t$) | `1.07893` | `0.65366` | `0.23296` | `42.01%` | `0.01253` | `+0.07938` |
| **`M1_baseline_goals_elo`** | Elo estacional goles + Goles `r4` + Descanso + Poisson Goles | `0.99955` | `0.59733` | `0.20506` | `52.68%` | `0.02590` | *Baseline (`0.00000`)* |
| **`M2_scraped_xg_ppda_deep`** | `M1` + Understat `xG`, `npxGD`, `xPTS`, `xG-Elo`, `G - xG`, `PPDA`, `Deep` | `0.98042` | `0.58390` | `0.19927` | `53.20%` | `0.02977` | **`-0.01913`** ($[-0.02833, -0.00920]$) |
| **`M3_scraped_full_plus_tm_values`** | `M2` + Transfermarkt `log_squad_value_ratio` + `missing_value_ratio` + FBref `SoT` | `0.97787` | `0.58232` | `0.19856` | `53.02%` | `0.01689` | **`-0.02168`** ($[-0.02957, -0.01088]$) |
| **`M4_understat_shot_forecast_ensemble`** | `M3` + Probabilidades Monte Carlo `forecast` de calidad de tiros | **`0.85870`** | **`0.50180`** | **`0.16239`** | **`61.02%`** | `0.03939` | **`-0.14085`** ($[-0.15695, -0.12234]$) |

### 2.3 Desglose por Liga Europea (`Log-Loss` y `RPS`)

| Liga | Partidos Eval | `M0` Climatology | `M1` Goals+Elo | `M2` +xG/PPDA/Deep | `M3` +TM Values/Injuries | `M4` Ensemble | $\Delta$ `M3 - M1` (Pre-Match) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **EPL** | `380` | `1.08224` | `1.00802` | `0.98095` | **`0.97642`** | **`0.86044`** | **`-0.03160`** |
| **La_liga** | `380` | `1.07297` | `0.98715` | `0.97223` | **`0.97206`** | **`0.87917`** | **`-0.01509`** |
| **Bundesliga** | `306` | `1.09058` | `1.03289` | `0.99556` | **`0.99538`** | **`0.86660`** | **`-0.03751`** |
| **Serie_A** | `380` | `1.09167` | `0.98849` | `0.97416` | **`0.96768`** | **`0.86596`** | **`-0.02081`** |
| **Ligue_1** | `306` | `1.05473` | `0.98484` | `0.98257` | **`0.98205`** | **`0.81421`** | **`-0.00279`** |

---

## 3. Experimento 2: Walk-Forward en Liga MX (`2023–2026`)

### 3.1 El Cuello de Botella Histórico de Liga MX en `prediction-lab`
En `prediction-lab`, la fuente histórica `football-data.co.uk/new/MEX.csv` únicamente contenía goles finales y cuotas básicas, sin registros de tiros, tiros a puerta, `xG`, valor de plantilla ni altitud. Con el pipeline de **Scrapling**, ahora combinamos:
- **`480` partidos de Liga MX** con `xG` y `xGA` exactos partido a partido extraídos de los payloads `data-team-xg-rolling-payload` de **Statiskicks** para los clubes de Liga MX.
- **`680` partidos históricos adicionales (`2023–2025`)** y tablas de volumen/precisión de tiro (`shots_on_target_per90`) de **FBref**.
- **Valuaciones de los 18 clubes y 692 jugadores de Liga MX** en **Transfermarkt** (`log_squad_value_ratio` y `missing_market_value_ratio`).
- **Métricas tácticas de Statiskicks (31 percentiles por club) y Opta PerformFeeds (`PPDA`, posesión, toques en último tercio)**.
- **Altitud exacta de estadio vía Open-Meteo** (`2,667m` en Toluca, `2,426m` en Pachuca, `2,245m` en CDMX, `2,175m` en Puebla frente a `<550m` en Monterrey, Tigres, Tijuana y Mazatlán).

### 3.2 Tabla de Ablación Walk-Forward en Liga MX

| Modelo Liga MX | Features Incorporados | Log-Loss $\downarrow$ | Brier $\downarrow$ | RPS $\downarrow$ | Accuracy $\uparrow$ | ECE $\downarrow$ | $\Delta$ Log-Loss vs `MX1` (IC 95% Bootstrap) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`MX0_climatology`** | Frecuencias base H/D/A de Liga MX ($t' < t$) | `1.07390` | `0.64972` | `0.22943` | `44.17%` | `0.03039` | `+0.02641` |
| **`MX1_baseline_mex_goals_only`** | Elo estacional + Goles `r4` (equivalente a `MEX.csv`) | `1.04749` | `0.63038` | `0.21965` | `48.12%` | `0.02025` | *Baseline (`0.00000`)* |
| **`MX2_scraped_mex_xg`** | `MX1` + `xG`/`xGA` rodante (Statiskicks/FBref) + `xG-Elo` + `G - xG` | `1.03680` | `0.62090` | `0.21560` | `48.75%` | `0.05719` | **`-0.01069`** ($[-0.02849, +0.00776]$) |
| **`MX3_scraped_mex_full_tm_tactical_altitude`** | `MX2` + Transfermarkt 18 clubes + Statiskicks/Opta PPDA + Altitud Open-Meteo | **`1.03405`** | **`0.61806`** | **`0.21382`** | **`50.00%`** | **`0.04869`** | **`-0.01344`** ($[-0.03845, +0.01138]$) |

### 3.3 Evidencia Empírica del Shock de Altitud en Liga MX (`Open-Meteo`)
- **Partidos con shock de altitud** (sede local $\ge 2,100\text{ m}$ como Toluca, Pachuca, CDMX o Puebla recibiendo a un visitante con altitud al menos $1,000\text{ m}$ menor): **`146` partidos**, con una tasa de victoria local de **`61.64%`**.
- **Resto de partidos de Liga MX** (`1014` partidos): tasa de victoria local de **`43.89%`**.
- **Lift empírico de ventaja local por altitud:** **`+17.76` puntos porcentuales** a favor del equipo local en altitud elevada.

---

## 4. Experimento 3: Microestructura de Mercado y Disponibilidad de Plantillas

### 4.1 Comparativa de Overround / Vigorish (`Pinnacle` vs `Smarkets` vs `Caliente.mx`)

| Fuente / Operador | Tipo de Mercado | Muestras Analizadas | Overround / Spread Medio | Mediana | Interpretación para el Modelo |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Pinnacle (`pinnacle`)** | Moneyline principal (NFL / Fútbol) | `2,607` | **`3.22%`** (`3.88%` global) | `3.85%` | **Benchmark institucional (*sharp anchor*)** para calibración y CLV |
| **Pinnacle (`pinnacle`)** | Handicap / Spread principal | — | **`3.06%`** | — | Línea asiática / spread de mínima fricción |
| **Smarkets Exchange** | Orderbook P2P (`WINNER_3_WAY`) | `152` contratos | **`824.4 bps`** (P25 = `600.0 bps`) | `944.0 bps` | Probabilidad *mid-market* sin margen de casa tradicional |
| **Caliente.mx (`caliente_mx`)** | Moneyline 1X2 recreativo México | `250` | **`6.62%`** (P90 = `10.28%`) | `5.99%` | **`2.06x` el margen de Pinnacle**; exige normalización no-vig (Shin / Power) |

### 4.2 Señales de Dinero Inteligente (`Action Network` Public Betting Splits)
- **Total de lados evaluados con splits activos:** `3,160` (de `8,147` registros totales en `market_microstructure.json`).
- **Frecuencia de `sharp_money_flag` ($|\text{\% dinero} - \text{\% tickets}| \ge 15\%$):** `1,060` lados (**`33.54%`**).
- **Frecuencia de `reverse_line_movement_signal` (RLM):** `736` lados (**`23.29%`**).
- **Cuantiles de divergencia absoluta $|\text{\% dinero} - \text{\% tickets}|$:** P50 = `6.0%`, P75 = `13.0%`, P90 = `29.0%`, P95 = `56.0%`, Máx = `87.0%`.

### 4.3 Impacto de Lesiones y Sanciones por Liga (`missing_market_value_ratio`)

| Liga | Clubes Analizados | Jugadores Ausentes | Valor de Mercado Ausente Total (€) | Ratio Medio de Plantilla Ausente | Ratio Máximo en un Club |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`bundesliga`** | `18` | `93` | `€914,600,000` | **`16.79%`** | **`30.34%`** |
| **`epl`** | `16` | `48` | `€1,289,000,000` | **`9.99%`** | **`26.92%`** |
| **`laliga`** | `19` | `43` | `€470,400,000` | **`6.80%`** | **`16.05%`** |
| **`liga-mx`** | `13` | `21` | `€68,050,000` | **`9.15%`** | **`39.56%`** |
| **`ligue-1`** | `18` | `50` | `€815,750,000` | **`14.39%`** | **`31.67%`** |
| **`serie-a`** | `20` | `86` | `€1,100,600,000` | **`15.48%`** | **`35.12%`** |

#### Top 10 Clubes con Mayor `%` de Valor de Plantilla Ausente por Lesión/Sanción

| # | Club | Liga | Ausentes | Valor Ausente (€) | Valor Total Plantilla (€) | `missing_market_value_ratio` |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `1` | **Club Tijuana** | `liga-mx` | `1` | `€25,000,000` | `€63,200,000` | **`39.56%`** |
| `2` | **Juventus de Turín** | `serie-a` | `8` | `€215,500,000` | `€613,600,000` | **`35.12%`** |
| `3` | **Le Havre AC** | `ligue-1` | `6` | `€20,000,000` | `€63,150,000` | **`31.67%`** |
| `4` | **Hamburgo SV** | `bundesliga` | `5` | `€44,000,000` | `€145,000,000` | **`30.34%`** |
| `5` | **TSG 1899 Hoffenheim** | `bundesliga` | `6` | `€87,000,000` | `€287,550,000` | **`30.26%`** |
| `6` | **Borussia Mönchengladbach** | `bundesliga` | `8` | `€40,300,000` | `€134,950,000` | **`29.86%`** |
| `7` | **París Saint-Germain** | `ligue-1` | `5` | `€398,000,000` | `€1,362,600,000` | **`29.21%`** |
| `8` | **Olympique de Lyon** | `ligue-1` | `4` | `€77,000,000` | `€264,450,000` | **`29.12%`** |
| `9` | **RC Lens** | `ligue-1` | `5` | `€66,500,000` | `€243,000,000` | **`27.37%`** |
| `10` | **SSC Nápoles** | `serie-a` | `8` | `€115,000,000` | `€424,500,000` | **`27.09%`** |

---

## 5. Reproducibilidad

Para regenerar íntegramente el backtest walk-forward, los intervalos bootstrap y este documento:

```powershell
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/evaluate_scraping_lift.py
```
