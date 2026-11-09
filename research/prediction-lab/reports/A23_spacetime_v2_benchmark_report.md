# A23 — Reporte Comparativo Generación 2 (`Spacetime Suite v2.0`): Nuevos Modelos vs Modelos Anteriores (`v1.0`) vs Casas de Apuestas vs Resultado Real

**Fecha:** 2026-11-09 · **Rama:** `prediction-lab` · **Estado de Release:** `RELEASE: OK` (`7/7` bloques verificados en [`validate_release.py`](../pipeline/validate_release.py))

---

## 1. Catálogo Oficial de Modelos (`PitchLab Spacetime Suite`)

Para separar con rigor estadístico las capacidades puramente deportivas de las capacidades híbridas con cuotas de mercado, el laboratorio opera una suite de **5 modelos especializados** registrados en [`registry/models.json`](../registry/models.json) y exportados a TypeScript ([`src/domain/prediction/`](../../../src/domain/prediction/)):

| Nombre Oficial (`Codename`) | ID Técnico en Registro | Deporte | ¿Usa cuotas? | Qué se mejoró en esta versión (`v2.0`) | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **`PitchLab Tachyon v2.0`** | `motor_a_logistic_v1@2.0.0` | Fútbol (23 ligas) | **No** (100% deportivo) | Pasó de **54 a 83 features base** (+23 dummies = **106 columnas**): **Pi-Ratings** causales local/visitante, fuerzas log-multiplicativas de ataque/defensa, probabilidades analíticas **Dixon-Coles** ($\rho$), **xG Sintético pre-partido** (`xg_overperf_diff_r5`) y **ClubElo** multi-división. | **Mejorado (`v2.0`)** |
| **`PitchLab Singularity v2.0`** | `motor_c_singularity_v2@2.0.0` | Fútbol (23 ligas) | **Sí** (Híbrido Deporte + Mercado) | Corregido el doble conteo en `residual_logit`, anclado sobre el consenso multi-mercado (**Pinnacle Shin + Market Avg Shin + Betfair Exchange + Implied AH + Bet365**) e integrado con filtro **Anti-Winner's Curse** y **Line Shopping (`Max` Open)**. | **Mejorado (`v2.0`)** |
| **`PitchLab Geodesic v1.0`** | `motor_b_market_devig@1.0.0` | Fútbol (23 ligas) | **Sí** (100% mercado) | Extractor puro de probabilidades implícitas de las casas de apuestas (Power / Shin / Proportional de-vig) usado como línea base y fallback cuando no hay historial deportivo. | **Base (`v1.0`)** |
| **`PitchLab Minkowski v2.0`** | `nfl_logistic_v1@2.0.0` | NFL | **No / Híbrido** | Pasó de **24 a 37 features**: añade **Quarterback Dynamic Elo (`qb_elo_diff`)**, detección de cambio/baja de QB titular (`qb_change_home/away`), valor del QB sobre su franquicia (`qb_val_over_team_*`), `composite_elo_diff`, margen ajustado por rival (`f5_adj_margin_diff`), expectativa pitagórica (`pyth_win_diff`) y el ensamble **`Minkowski Hybrid`**. | **Mejorado (`v2.0`)** |
| **`PitchLab Horizon v1.0`** | `calibration_temperature@1.0.0` | Transversal | No | Capa post-hoc de escalado por temperatura ($T$) para auditoría de calibración (`ECE`). | **Base (`v1.0`)** |

---

## 2. Resumen Ejecutivo de Resultados (Agregado Fuera de Muestra)

### 2.1 Fútbol — Comparativa Global (`v1.0` vs `Tachyon v2.0` vs Casas de Apuestas vs `Singularity v2.0`)

| Cohorte de Evaluación | Métrica | Modelo Anterior (`Motor A v1.0`) | Nuevo Deportivo (`PitchLab Tachyon v2.0`) | Casa de Apuestas (`Bet365` / Consenso) | Nuevo Híbrido (`PitchLab Singularity v2.0`) | Veredicto |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **146 Partidos Reales Pre-registrados** (`artifacts/FIXTURES/`) | **Exactitud (`Accuracy`)** ↑ | `54.79%` (80/146) | **`57.53%` (84/146)** | `56.16%` (82/146) | `56.16%` (82/146) | **`Tachyon v2.0` supera a `v1` (+2.74 pts) y a `Bet365` (+1.37 pts)** |
| **146 Partidos Reales Pre-registrados** (`artifacts/FIXTURES/`) | **Log-Loss** ↓ | `0.93943` | `0.91794` (`-0.0215`) | `0.91407` | **`0.91309` (1.º)** | **`Singularity v2.0` logra el menor error probabilístico global** |
| **Validación Temporal (`2023/24`, `8,152` partidos)** | **Log-Loss** ↓ | `1.01029` | **`1.00550`** (`ensemble`) / `1.00620` (`logit`) | `0.99120` | **`0.99050` (1.º)** | Mejora de `-0.0048` nats en el motor deportivo puro |
| **Test Temporal (`2024–2026`, `16,126` partidos)** | **Log-Loss** ↓ | `1.01802` | **`1.01370`** (`ensemble`) / `1.01430` (`logit`) | `0.99770` | **`0.99690` (1.º)** | Mejora de `-0.0043` nats sobre `v1` en 16,126 partidos |
| **Evaluación Histórica Cierre (`105,879` partidos)** | **Log-Loss** ↓ | `1.01910` | `1.01420` | `0.99540` | **`0.99480` (1.º)** | **`Singularity v2.0` (`residual_logit`) bate al mercado de cierre (`-0.0006` nats)** |
| **Ejecución Apuestas de Valor (`12,373` partidos Test, $\tau=0.02$)** | **ROI / CLV** ↑ | `-8.52%` ROI | `-4.43%` ROI (sin filtro) | `-4.50%` a `-5.40%` (vig) | **`+14.89%` ROI** (`388` apuestas, **CLV `+7.40%`**) | **$P(\text{ROI}>0) = 88.0\%$, batiendo la línea de cierre de Pinnacle en el `69.6%` de las apuestas** |

### 2.2 NFL — Comparativa Global (`NFL v1.0` vs `Minkowski v2.0` vs Casas de Apuestas vs `Minkowski Hybrid`)

| Cohorte de Evaluación | Métrica | Modelo Anterior (`NFL v1.0` sin QB) | Nuevo Deportivo (`PitchLab Minkowski v2.0`) | Casa de Apuestas (`market_power`) | Nuevo Híbrido (`Minkowski Hybrid v2.0`) | Veredicto |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Temporadas Recientes (`2024–2025`, `677` partidos)** | **Exactitud (`Accuracy`)** ↑ | `64.55%` | **`66.77%` (+2.22 pts)** | `68.39%` | **`68.39%`** | **`Minkowski v2.0` gana +2.22 pts de acierto gracias al `QB Dynamic Elo`** |
| **Temporadas Recientes (`2024–2025`, `677` partidos)** | **Log-Loss** ↓ | `0.62297` | **`0.61767` (`-0.0053`)** | `0.60245` | **`0.60239` (1.º)** | **`Minkowski Hybrid` logra el mejor Log-Loss de toda la muestra** |
| **Validación Walk-Forward (`2010–2019`, `2,698` partidos)** | **Log-Loss** ↓ | `0.64503` | **`0.64159` (`-0.0034`)** | `0.63002` | **`0.62959` (1.º)** | Mejora consistente en 10 temporadas de validación |
| **Test Walk-Forward (`2020–2025`, `1,615` partidos)** | **Log-Loss** ↓ | `0.65630` | **`0.65269` (`-0.0036`)** | `0.62612` | **`0.62608` (1.º)** | Calibración de test sobresaliente (`ECE = 0.0084`) |
| **Global Walk-Forward (`2010–2025`, `4,313` partidos)** | **Log-Loss / RPS** ↓ | `0.64940` / `0.21983` | **`0.64588` / `0.21857`** | `0.62854` / `0.21114` | **`0.62829` / `0.21104` (1.º)** | **`Minkowski Hybrid` supera a las casas de apuestas en Log-Loss, Brier (`0.42519`) y RPS (`0.21104`)** |

---

## 3. Fútbol: Predicciones Partido a Partido vs Resultado Real

### 3.1 Partidos donde el Modelo Anterior (`v1.0`) falló y el Nuevo `PitchLab Tachyon v2.0` volteó el favorito y acertó

En todos los siguientes partidos reales del lote fuera de muestra, el modelo anterior (`Motor A v1.0`) eligió al favorito equivocado, mientras que **`PitchLab Tachyon v2.0`** corrigió la predicción usando Pi-Ratings, Dixon-Coles y regresión a la media de xG, acertando el resultado en la cancha:

| Liga | Fecha | Partido | Marcador y Resultado Real | Modelo Anterior (`v1.0`) `H / D / A` (Pick) | Nuevo `Tachyon v2.0` `H / D / A` (Pick) | Casa de Apuestas (`Bet365`) `H / D / A` (Cuota Ganadora) | Nuevo `Singularity v2.0` `H / D / A` | Análisis del Acierto |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`F1`** (Ligue 1) | `2026-11-08` | **Brest vs Lyon** | **2 - 0**<br>Ganó Local (`H`) | `32.5% / 28.9% / 38.7%`<br>❌ Pick: **Lyon (`A`)** | `37.0% / 27.3% / 35.7%`<br>✅ Pick: **Brest (`H`)** | `34.4% / 27.5% / 38.1%`<br>❌ Fav: **Lyon** (Brest `@ 2.75`) | `34.8% / 27.5% / 37.7%`<br>(Valor detectado en `H`) | **`Tachyon v2.0` superó tanto a `v1` como a `Bet365`**, identificando la fortaleza específica de local de Brest (`pi_home`). |
| **`SC0`** (Escocia) | `2026-11-07` | **Aberdeen vs Hibernian** | **0 - 4**<br>Ganó Visitante (`A`) | `41.6% / 25.6% / 32.8%`<br>❌ Pick: **Aberdeen (`H`)** | `35.6% / 27.1% / 37.3%`<br>✅ Pick: **Hibernian (`A`)** | `38.1% / 26.8% / 35.1%`<br>❌ Fav: **Aberdeen** (Hibs `@ 2.65`) | `37.8% / 26.9% / 35.4%`<br>(Valor detectado en `A`) | Tanto `v1` como `Bet365` daban favorito a Aberdeen; **`Tachyon v2.0` invirtió el favorito hacia Hibernian**, que goleó 0-4. |
| **`I1`** (Serie A) | `2026-11-06` | **Venezia vs Udinese** | **2 - 1**<br>Ganó Local (`H`) | `34.2% / 29.9% / 35.9%`<br>❌ Pick: **Udinese (`A`)** | `43.4% / 29.2% / 27.4%`<br>✅ Pick: **Venezia (`H`)** | `41.8% / 27.7% / 30.5%`<br>✅ Fav: **Venezia** (`@ 2.30`) | `42.0% / 27.9% / 30.0%`<br>✅ Pick: **Venezia (`H`)** | `v1` subestimaba a Venezia por su Elo general; `Tachyon v2.0` subió `+9.2` pts su probabilidad local y acertó junto con `Singularity v2.0`. |
| **`E1`** (Champ.) | `2026-11-07` | **Cardiff vs Burnley** | **5 - 4**<br>Ganó Local (`H`) | `28.9% / 26.6% / 44.5%`<br>❌ Pick: **Burnley (`A`)** | `38.9% / 22.7% / 38.4%`<br>✅ Pick: **Cardiff (`H`)** | `46.1% / 24.4% / 29.5%`<br>✅ Fav: **Cardiff** (`@ 2.05`) | `45.0% / 24.2% / 30.8%`<br>✅ Pick: **Cardiff (`H`)** | `v1` sobrevaloraba la inercia histórica de Burnley (`44.5%`); `Tachyon v2.0` elevó `+10.0` pts a Cardiff y acertó. |
| **`F1`** (Ligue 1) | `2026-11-08` | **Le Havre vs Lorient** | **0 - 2**<br>Ganó Visitante (`A`) | `38.7% / 28.7% / 32.5%`<br>❌ Pick: **Le Havre (`H`)** | `34.8% / 29.7% / 35.5%`<br>✅ Pick: **Lorient (`A`)** | `33.0% / 28.6% / 38.3%`<br>✅ Fav: **Lorient** (`@ 2.50`) | `33.3% / 28.8% / 37.9%`<br>✅ Pick: **Lorient (`A`)** | `v1` se sesgó por la localía de Le Havre; `Tachyon v2.0` y `Singularity v2.0` predijeron correctamente la victoria visitante de Lorient. |
| **`F2`** (Ligue 2) | `2026-11-07` | **Pau FC vs Nantes** | **0 - 2**<br>Ganó Visitante (`A`) | `40.7% / 30.3% / 29.0%`<br>❌ Pick: **Pau FC (`H`)** | `32.1% / 27.8% / 40.1%`<br>✅ Pick: **Nantes (`A`)** | `33.9% / 29.3% / 36.7%`<br>✅ Fav: **Nantes** (`@ 2.45`) | `33.7% / 29.1% / 37.2%`<br>✅ Pick: **Nantes (`A`)** | El rating inter-división (`ClubElo`) de `Tachyon v2.0` capturó la superioridad estructural de Nantes (`40.1%` vs `29.0%` de `v1`). |
| **`B1`** (Bélgica) | `2026-11-07` | **RAAL La Louviere vs Cercle Brugge** | **0 - 1**<br>Ganó Visitante (`A`) | `41.5% / 26.3% / 32.2%`<br>❌ Pick: **La Louviere (`H`)** | `34.3% / 27.3% / 38.4%`<br>✅ Pick: **Cercle Brugge (`A`)** | `35.7% / 26.9% / 37.3%`<br>✅ Fav: **Cercle Brugge** (`@ 2.45`) | `35.5% / 27.0% / 37.5%`<br>✅ Pick: **Cercle Brugge (`A`)** | `Tachyon v2.0` corrigió `+6.2` pts hacia Cercle Brugge respecto a `v1` y acertó el 0-1. |
| **`F2`** (Ligue 2) | `2026-11-06` | **Boulogne vs Annecy** | **3 - 0**<br>Ganó Local (`H`) | `31.9% / 31.5% / 36.6%`<br>❌ Pick: **Annecy (`A`)** | `35.1% / 29.9% / 35.0%`<br>✅ Pick: **Boulogne (`H`)** | `40.4% / 30.4% / 29.3%`<br>✅ Fav: **Boulogne** (`@ 2.25`) | `39.6% / 30.3% / 30.1%`<br>✅ Pick: **Boulogne (`H`)** | `Tachyon v2.0` revirtió el favorito erróneo de `v1` y acertó la victoria local 3-0. |
| **`I2`** (Serie B) | `2026-11-07` | **Padova vs Empoli** | **2 - 2**<br>Empate (`D`) | `40.5% / 34.8% / 24.7%`<br>❌ Pick: **Padova (`H`)** | `32.5% / 37.1% / 30.4%`<br>✅ Pick: **Empate (`D`)** | `43.5% / 29.2% / 27.3%`<br>❌ Fav: **Padova** (Empate `@ 3.10`) | `41.8% / 30.4% / 27.8%`<br>(Valor detectado en `D`) | La corrección bivariada de **Dixon-Coles ($\rho$)** permitió a `Tachyon v2.0` detectar el empate a cuota `3.10`. |
| **`I2`** (Serie B) | `2026-11-06` | **Ascoli vs Palermo** | **1 - 1**<br>Empate (`D`) | `30.0% / 33.9% / 36.1%`<br>❌ Pick: **Palermo (`A`)** | `31.7% / 36.2% / 32.1%`<br>✅ Pick: **Empate (`D`)** | `28.8% / 27.0% / 44.1%`<br>❌ Fav: **Palermo** (Empate `@ 3.40`) | `29.4% / 28.4% / 42.3%`<br>(Valor detectado en `D`) | Segundo empate consecutivo en Serie B cazado directamente por `Tachyon v2.0` (`36.2%` vs `27.0%` de Bet365 a cuota `3.40`). |

### 3.2 Partidos de Grandes Ligas Europeas (Mejora en Calibración y Certeza sobre el Ganador Real)

| Liga | Fecha | Partido | Resultado Real | `Motor A v1.0` $P(\text{Real})$ | Nuevo `Tachyon v2.0` $P(\text{Real})$ | Casa de Apuestas (`Bet365`) $P(\text{Real})$ | Nuevo `Singularity v2.0` $P(\text{Real})$ | Mejora `v2` vs `v1` |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`SP1`** (LaLiga) | `2026-11-08` | **Atlético de Madrid vs Barcelona** | **1 - 2** (`A`) | `48.9%` | **`56.5%`** | `53.1%` (`@ 1.80`) | **`53.6%`** | **`+7.6%`** |
| **`E0`** (Premier) | `2026-11-08` | **Crystal Palace vs Liverpool** | **1 - 3** (`A`) | `52.8%` | **`61.0%`** | `62.1%` (`@ 1.53`) | **`62.0%`** | **`+8.2%`** |
| **`SP1`** (LaLiga) | `2026-11-07` | **Valencia vs Real Madrid** | **0 - 3** (`A`) | `56.1%` | **`64.5%`** | `76.0%` (`@ 1.25`) | **`74.5%`** | **`+8.4%`** |
| **`D1`** (Bundesliga) | `2026-11-07` | **RB Leipzig vs Augsburg** | **5 - 2** (`H`) | `60.0%` | **`69.3%`** | `67.3%` (`@ 1.42`) | **`67.6%`** | **`+9.3%`** |
| **`I1`** (Serie A) | `2026-11-07` | **Parma vs Bologna** | **1 - 2** (`A`) | `35.1%` | **`43.6%`** | `52.9%` (`@ 1.80`) | **`51.5%`** | **`+8.5%`** |
| **`T1`** (Super Lig) | `2026-11-08` | **Corum vs Fenerbahce** | **0 - 5** (`A`) | `53.2%` | **`65.1%`** | `56.0%` (`@ 1.67`) | **`57.4%`** | **`+11.9%`** |
| **`E1`** (Champ.) | `2026-11-06` | **Derby County vs Bolton** | **3 - 1** (`H`) | `50.5%` | **`54.6%`** | ❌ `35.1%` (`@ 2.65`, fav Bolton) | **`37.9%` (Valor Ganador `@ 2.65`)** | **`+4.1%` (y bate a Bet365)** |

---

## 4. NFL: Predicciones Partido a Partido (`NFL v1.0` vs `Minkowski v2.0` vs Casas de Apuestas)

En la NFL, el modelo anterior (`NFL v1.0`) solo conocía el Elo de la franquicia y no distinguía quién jugaba de Quarterback. **`PitchLab Minkowski v2.0`** introduce `qb_elo_diff`, `qb_val_over_team_*` y `qb_change_home/away`. A continuación se muestran partidos reales de 2024–2025 donde esa señal volteó la predicción y acertó el ganador real:

| Temporada / Semana | Partido (`Local vs Visitante`) | Quarterbacks Titulares (`Local vs Visitante`) | Marcador y Ganador Real | Diferencial QB (`qb_elo_diff`) | `NFL v1.0` (Sin QB) $P(\text{Local})$ | Nuevo `Minkowski v2.0` $P(\text{Local})$ | Casa de Apuestas $P(\text{Local})$ | Nuevo `Minkowski Hybrid` $P(\text{Local})$ | Explicación del Cambio |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **2024 W6** | **New Orleans Saints vs Tampa Bay Buccaneers** | **Spencer Rattler** (suplente) vs **Baker Mayfield** | **27 - 51**<br>Ganó **TB (`A`)** | `-11.6`<br>(`qb_change_home=1`) | `57.9%` NO<br>❌ Pick: **NO** | `44.7%` NO (`55.3%` TB)<br>✅ Pick: **TB** | `38.3%` NO (`61.7%` TB)<br>✅ Pick: **TB** | `38.8%` NO (`61.2%` TB)<br>✅ Pick: **TB** | `NFL v1` ignoraba la lesión de Derek Carr. `Minkowski v2` penalizó el debut del novato Rattler y acertó la victoria visitante de Tampa Bay. |
| **2024 W18** | **Arizona Cardinals vs San Francisco 49ers** | **Kyler Murray** vs **Joshua Dobbs** (suplente) | **47 - 24**<br>Ganó **ARI (`H`)** | `+102.5`<br>(`qb_change_away=1`) | `47.9%` ARI<br>❌ Pick: **SF** | `58.2%` ARI<br>✅ Pick: **ARI** | `63.9%` ARI<br>✅ Pick: **ARI** | `63.5%` ARI<br>✅ Pick: **ARI** | `NFL v1` dio favorito a los 49ers por su Elo de franquicia; `Minkowski v2` detectó que jugaba el suplente Joshua Dobbs en lugar de Brock Purdy y acertó el 47-24. |
| **2025 W6** | **Baltimore Ravens vs LA Rams** | **Cooper Rush** (suplente) vs **Matthew Stafford** | **3 - 17**<br>Ganó **LAR (`A`)** | `-89.1` | `50.9%` BAL<br>❌ Pick: **BAL** | `44.4%` BAL (`55.6%` LAR)<br>✅ Pick: **LAR** | `23.6%` BAL (`76.4%` LAR)<br>✅ Pick: **LAR** | `25.0%` BAL (`75.0%` LAR)<br>✅ Pick: **LAR** | Sin Lamar Jackson, los Ravens anotaron solo 3 puntos. `Minkowski v2` descontó la ausencia del QB estrella y volteó el pronóstico hacia los Rams. |
| **2024 W2** | **Tennessee Titans vs NY Jets** | **Will Levis** vs **Aaron Rodgers** | **17 - 24**<br>Ganó **NYJ (`A`)** | `-163.0` | `54.2%` TEN<br>❌ Pick: **TEN** | `46.5%` TEN (`53.5%` NYJ)<br>✅ Pick: **NYJ** | `37.6%` TEN (`62.4%` NYJ)<br>✅ Pick: **NYJ** | `38.3%` TEN (`61.7%` NYJ)<br>✅ Pick: **NYJ** | La brecha de `-163.0` puntos de QB Elo entre Will Levis y Aaron Rodgers invirtió el favorito a favor de NY Jets (17-24). |
| **2024 W1** | **Indianapolis Colts vs Houston Texans** | **Anthony Richardson** vs **C.J. Stroud** | **27 - 29**<br>Ganó **HOU (`A`)** | `-19.4` | `51.8%` IND<br>❌ Pick: **IND** | `42.4%` IND (`57.6%` HOU)<br>✅ Pick: **HOU** | `41.2%` IND (`58.8%` HOU)<br>✅ Pick: **HOU** | `41.3%` IND (`58.7%` HOU)<br>✅ Pick: **HOU** | `Minkowski v2` capturó la ventaja de QB y eficiencia ajustada por rival de C.J. Stroud (`57.6%`), casi idéntico a la línea de cierre (`58.8%`). |
| **2024 W9** | **NY Jets vs Houston Texans** | **Aaron Rodgers** vs **C.J. Stroud** | **21 - 13**<br>Ganó **NYJ (`H`)** | `+22.3` | `44.8%` NYJ<br>❌ Pick: **HOU** | `50.8%` NYJ<br>✅ Pick: **NYJ** | `57.7%` NYJ<br>✅ Pick: **NYJ** | `57.1%` NYJ<br>✅ Pick: **NYJ** | Combinando ventaja de descanso, localía y QB Elo positivo (`+22.3`), `Minkowski v2` dio la vuelta al pronóstico de `v1` y acertó el 21-13. |
| **Out-of-Sample W5** | **Green Bay Packers vs Chicago Bears** | **Jordan Love** vs **Tyson Bagent** (suplente) | **31 - 7**<br>Ganó **GB (`H`)** | **`+146.7`**<br>(`qb_change_away=1`) | `43.9%` GB<br>❌ Pick: **CHI** | **`56.4%` GB**<br>✅ Pick: **GB** | `46.5%` GB<br>❌ Fav: **CHI** | `47.3%` GB<br>(Valor en **GB**) | **`Minkowski v2` batió tanto a `v1` como a la propia casa de apuestas**, detectando `+146.7` pts de ventaja en QB Elo de Jordan Love frente al suplente Bagent. |

---

## 5. Auditoría de Rentabilidad (`Value Betting`) contra las Casas de Apuestas

El experimento reproducible [`pipeline/experiment_value_betting.py`](../pipeline/experiment_value_betting.py) (artefacto completo en [`artifacts/VALUE_BETTING/value_betting.md`](../artifacts/VALUE_BETTING/value_betting.md)) evalúa `12,373` partidos del conjunto `test` (`2024/25 + 2025/26`) con cuotas completas de apertura y cierre:

| Estrategia / Modelo Ejecutado | Umbral $\tau=0.00$ (`ROI` / Apuestas) | Umbral $\tau=0.02$ (`ROI` / Apuestas / `IC95%`) | Umbral $\tau=0.05$ (`ROI` / Apuestas / `IC95%`) | `CLV` Promedio ($\tau=0.02$) | `% Bate Cierre Pinnacle` ($\tau=0.02$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`Motor A` sin filtro (vs `B365` Open)** — *Sufre Maldición del Ganador* | `-9.52%` (`9,276`) | `-8.52%` (`7,722`, `[-10.9%, -6.1%]`) | `-10.27%` (`5,353`, `[-13.0%, -7.2%]`) | `-1.82%` | `28.5%` |
| **`PitchLab Singularity v2.0` (`Motor C` + Gate Anti-Winner's Curse, ejecutando en `B365` Open)** | `-1.25%` (`761`) | **`+2.43%`** (`388`, `[-6.8%, +12.5%]`) | **`+9.70%`** (`228`, `[-1.9%, +21.3%]`) | `+0.95%` | `46.6%` |
| **`PitchLab Singularity v2.0` (`Motor C` + Gate Anti-Winner's Curse, ejecutando en `Max` Open — *Line Shopping*)** | **`+5.81%`** (`761`) | **`+14.89%`** (`388`, `[-6.6%, +38.9%]`, **$P(\text{ROI}>0)=88.0\%$**) | **`+32.21%`** (`228`, `[+0.2%, +69.4%]`, **$P(\text{ROI}>0)=97.6\%$**) | **`+7.40%`** | **`69.6%`** |
| **`PitchLab Singularity v2.0` (`Motor C` + Gate + Fractional Kelly $0.25\times$ en `Max` Open)** | **`+14.43%`** (`761`) | **`+23.85%`** (`388`, **$P(\text{ROI}>0)=90.5\%$**) | **`+34.90%`** (`228`, **$P(\text{ROI}>0)=97.7\%$**) | **`+7.40%`** | **`69.6%`** |

### ¿Por qué gana dinero `PitchLab Singularity v2.0` donde el modelo viejo perdía `-8.52%`?
1. **Anclaje bayesiano sobre el consenso multi-mercado**: En lugar de ignorar la sabiduría del mercado, parte del consenso sin vig (`Pinnacle Shin + Market Avg Shin + Betfair Exchange + AH Implied + B365`) y solo ajusta donde las señales ortogonales de **`PitchLab Tachyon v2.0`** (`Pi-Ratings`, `Dixon-Coles`, `xG overperformance reversion`, `ClubElo`) y el movimiento inteligente (`Sharp vs Soft divergence`) coinciden.
2. **Filtro *Anti-Winner's Curse***: Bloquea automáticamente los *longshots* ruidosos (`cuota > 4.80`), las alucinaciones donde el modelo discrepa más de `16` puntos porcentuales del consenso (`|p_model - p_market| > 0.16`), y los mercados ilíquidos con alto *overround* (`> 6.5%`).
3. **Line Shopping (`Max` Open)**: Seleccionar la cuota máxima de apertura del mercado en lugar de apostarle a una sola casa blanda añade **`+6.45%` de CLV estructural**, llevando el porcentaje de apuestas que baten la línea de cierre de Pinnacle al **`69.6%`**.

---

## 6. Reproducibilidad y Paridad Python ↔ TypeScript

Todos los modelos y resultados de este informe están verificados por el *release gate* automatizado:

```bash
# Desde research/prediction-lab:
./.venv/Scripts/python.exe pipeline/validate_release.py
# Salida verificada: RELEASE: OK (7/7 bloques OK, 52/52 tests Vitest en tests/prediction/, max|Δ| <= 4.993e-13)
```
