# A27 — Hoja de Ruta Estratégica (`v3.1 → v4.0`): Evolución de todos los Motores y Arquitectura de Generación de Picks de Nivel Sindicato

**Fecha:** 2026-11-10  
**Rama:** `prediction-lab` (sobre `PitchLab Spacetime Suite v3.0`, commit base `666c5c7`)  
**Alcance:** Diagnóstico cuantitativo de techos actuales en `Tachyon v3.0`, `Singularity v3.0`, `Geodesic v2.0`, `Minkowski v3.0` y `Spacetime Multi-Sport v3.0`, junto con el diseño técnico para transformar motores de probabilidad global en un **sistema de selección de apuestas y emisión de picks ganadores (`+EV`, `+CLV`, varianza controlada y cobertura multi-mercado)**.

---

## 1. Principio Rector: Predecir Todos los Partidos vs Dar Buenos Picks

En modelado deportivo existen dos objetivos relacionados pero matemáticamente distintos:
1. **Forecasting Global (minimizar Log-Loss en el 100% del calendario):** Evalúa la calibración del motor en `16,126` partidos de fútbol o `1,615` de NFL, incluyendo el ~85% de encuentros donde el precio de cierre institucional (`Pinnacle` / `Smarkets`) ya absorbió toda la información pública.
2. **Generación de Picks y Apuestas (`Sniper Selectivity`):** No requiere batir a Pinnacle en todos los juegos de la jornada; requiere **identificar con precisión quirúrgica el `5%–10%` de mercados, horarios y casas recreativas (`Caliente.mx`, `Codere.mx`, `Bet365`) donde existe una asimetría real de precio (`EV > 0` y `CLV > 0`)**, controlando la varianza para no exponer al usuario a rachas destructivas.

La evolución `v3.1 → v4.0` ataca **ambos frentes en paralelo**: (Parte I) elevar la precisión intrínseca de cada motor deportivo y (Parte II) construir la maquinaria de microestructura, mercados derivados y filtrado de picks.

---

## 2. Parte I — Cómo Mejorar la Precisión Intrínseca de Todos los Motores

### 2.1. Inferencia No Lineal en Producción: Exportación de Árboles `GBM` a TypeScript (`< 0.1 ms`)
- **Diagnóstico actual (`OBSERVADO` en `A26`):**
  - En Python (`services/models/train_gbm.py` y `services/models/nfl_blend.py`), el ensamble **`Logit + Calibrated HistGradientBoosting`** ya supera al `Logit` lineal puro por **`-0.00083` nats** en el test global de fútbol (`1.01228` vs `1.01311`, IC 95% `[-0.00136, -0.00029]`) y por **`-0.00131` nats en Liga MX** (`0.98346` vs `0.98477`, subiendo Accuracy a **`54.73%`** vs `53.70%` del mercado).
  - Sin embargo, el motor TypeScript en vivo (`src/domain/prediction/engine.ts`) hoy evalúa únicamente los coeficientes lineales de `model_motor_a.json` y `model_nfl.json`.
- **Solución técnica:**
  - Exportar la estructura plana de los árboles de decisión (`feature_idx`, `threshold`, `left_child`, `right_child`, `leaf_value`) más la calibración de temperatura/Dirichlet a un artefacto JSON compacto e implementar un *tree-walker* sin dependencias en `src/domain/prediction/engine.ts`.
  - **Costo computacional:** `< 0.08 ms` adicionales por partido en V8 (manteniendo holgadamente el presupuesto `< 1 ms`) y captura inmediata del 100% de las interacciones no lineales (altitud × fatiga, `ppda` × calidad técnica, descanso × spread).

### 2.2. `Spacetime Multi-Sport` (`NHL`, `MLB`, `NBA`, `NCAAF`): De Transición Anual (`S-1 → S`) a *Walk-Forward* Diario + Variables Críticas de Partido
- **Diagnóstico actual:** `research/prediction-lab/models/multisport/train_multisport.py` entrena hoy sobre `716` filas equipo-temporada bajo contrato `S-1 → S`. Pasar a **histórico partido-por-partido (*game logs*)** con las variables que dominan la varianza diaria producirá la mayor ganancia de Log-Loss disponible en todo el repositorio (**`-0.015` a `-0.040` nats**):
  1. **`MLB Kepler` (`MLB`):**
     - **Lanzador Abridor Exacto (*Starting Pitcher*):** En béisbol, quién abre en la lomita explica `>60%` de la varianza del juego. Cruzar `multisport_probable_starter` (`roster_availability.json`) con métricas individuales de pitcheo de `MLB StatsAPI` / FanGraphs (`SIERA`, `xFIP`, `K-BB%`, `GB%` y *splits* contra zurdos/derechos `wRC+ vs LHP/RHP`).
     - **Fatiga del Bullpen (últimos 3 días)** + **Vector eólico en estadios abiertos** (viento soplando hacia jardines vs hacia *home* en sedes como Wrigley Field o Fenway Park).
  2. **`NHL Curvature` (`NHL`):**
     - **Portero Titular Confirmado (`GSAE` / *Goals Saved Above Expected* 5v5 y *All-Situations* de MoneyPuck):** El salto entre el portero `#1` y el suplente mueve `4%–7%` de probabilidad de victoria.
     - **Penalización de *Back-to-Back* (`B2B`) con viaje inter-divisional** y ajuste de *Special Teams* (`PP xG/60` vs `PK xGA/60`).
  3. **`NBA Tensor` (`NBA`):**
     - **Impacto *On/Off* Individual (`EPM` / `BPM` / `RAPM`) de bajas confirmadas:** En temporada regular NBA, el *load management* de un jugador Top-15 desplaza el spread real entre `4.5` y `9.0` puntos.
     - **Densidad de calendario y fatiga circadiana:** Indicadores exactos de `B2B`, `3-en-4 noches`, `4-en-6` y cruce de husos horarios Este ↔ Oeste + altitud (`Denver 1,609 m`, `Utah 1,300 m`).
  4. **`NCAAF Horizon` (`NCAAF` — `138` programas FBS):**
     - **Prior Pretemporada de *Returning Production* + *Transfer Portal* + Reclutamiento:** En fútbol colegial la rotación anual por portal de transferencias degrada rápido la señal cruda de `S-1`.
     - **Filtro de Kalman / Elo Dinámico Semana a Semana (`Semana 1 → Semana 15`):** Actualiza la fuerza ofensiva/defensiva ajustada por rival después de cada sábado.

### 2.3. `PitchLab Tachyon` (`Fútbol`): Ratings *Bottom-Up* por Jugador + Cabeza Generativa Bivariante + `xG` en las 23 Ligas
1. **Valoración *Bottom-Up* del XI Titular (`T-60 min`):**
   - Ya poseemos en `.worktrees/web-scraping/data/normalized/` las tablas granulares de jugadores (`803` jugadores Opta en Liga MX, `1,600` filas con `SKORE` de Statiskicks, `3,824` jugadores de Understat, `2,816` de Sofascore y `1,968` slots de alineación en `RotoWire`).
   - Reemplazar el proxy escalar `missing_market_value_ratio` por tres diferenciales posicionales sobre el XI proyectado/confirmado:
     - **Calidad de Portería:** `PSxG - GA` / `gk_prevented` del guardameta que inicia hoy.
     - **Creación y Progresión:** `xA/90 + SCA/90 + deep_completions` de mediocampistas y extremos titulares.
     - **Finalización Clínica:** `npxG/90 + xGOT/90` del frente de ataque disponible.
2. **Cabeza Bivariante Dinámica de Goles (Diagonal-Inflated Bivariate Poisson / Weibull-Count):**
   - Estimar conjuntamente $(\lambda_H(x), \lambda_A(x), \rho(x))$ condicionado en `ppda`, `field_tilt`, `altitude_shock_flag` y `tot_implied_goals`. Garantiza coherencia simultánea entre `1X2`, `Over/Under`, `BTTS`, `Hándicap Asiático` y el simulador de torneos `src/domain/prediction/montecarlo.ts`.
3. **Cobertura `xG` real en las `17` ligas restantes de `matches.parquet`:**
   - Ampliar el scraper histórico (`FBref` / `FotMob` / `Opta`) más allá de `Top-5 Europa + Liga MX` hacia `Championship (E1)`, ` Eredivisie (N1)`, `Primeira Liga (P1)`, `Segunda España (SP2)`, `Bundesliga 2 (D2)`, `Bélgica (B1)`, etc. Ganancia esperada: **`-0.0010` a `-0.0015` nats** en el Log-Loss global.

### 2.4. `PitchLab Minkowski` (`NFL`): Play-by-Play Histórico `nflverse` + `CPOE/EPA` del QB Titular
- **Diagnóstico actual:** `SumerSports EPA` alimenta hoy la inferencia prospectiva 2026 (`src/domain/prediction/nfl_live.ts`), pero el backtest histórico (`2002–2025`, Log-Loss `0.64963` vs `0.62655` del mercado) usa márgenes ajustados por Elo.
- **Solución técnica:** Construir desde el dataset abierto *play-by-play* de `nflverse` (`CC BY 4.0`) las features semanales estrictamente causales ($w' < w$) de **Dropback EPA, Rush EPA, Success Rate en *early downs*, Pressure Rate permitido, Red-Zone TD% y el `CPOE + EPA/dropback` específico del QB anunciado como titular en la semana $w$** (capturando de inmediato caídas por suplencia `QB1 → QB2`). Ganancia esperada: **`-0.008` a `-0.012` nats** OOS.

---

## 3. Parte II — Cómo Mejorar la Predicción de Apuestas y Emisión de Buenos Picks (`Geodesic v3.0`)

### 3.1. Expansión a Mercados de 2 Vías con Mitad de Comisión (`AH`, `DNB`, `Spreads` y `Totales`)
- **Problema práctico del `1X2`:** En casas recreativas mexicanas (`Caliente.mx`: `6.62%` global, `7.05%` en fútbol 3-vías), el apostador paga casi el doble de peaje implícito que en mercados asiáticos o de 2 vías (`3.2%–4.5%`), y un gol fortuito de empate en el 90+4' destruye apuestas donde la lectura táctica del partido fue perfecta.
- **Mejora:**
  - Derivar de $(\lambda_H, \lambda_A, \rho)$ y de los márgenes proyectados (`NFL`/`NBA`/`MLB`/`NHL`/`NCAAF`) la escalera completa de **Hándicap Asiático (`AH -1.0, -0.75, -0.5, -0.25, 0.0/DNB, +0.25, +0.5`)**, **Totales (`O/U 2.0, 2.25, 2.5, 2.75, 3.0` y líneas de puntos/carreras)** y **`BTTS` (Ambos Anotan)**.
  - Nuestras variables físicas y tácticas (`altitude_shock_flag`, `surface_pressure_diff`, `ppda_diff_r10`, `nba_pace`, `Open-Meteo` viento/lluvia) tienen **relación señal-ruido significativamente mayor sobre `Totales` y `BTTS`** que sobre el ganador `1X2`.
  - El selector de picks elige automáticamente **el mercado del partido que maximiza el Ratio de Sharpe / crecimiento esperado de Kelly**, en lugar de forzar siempre una recomendación `1X2`.

### 3.2. Motor Especializado de *Player Props* (Explotación de Mercados Blandos)
- **Oportunidad estructural:** Las casas de apuestas concentran su liquidez y modelado cuantitativo en *Moneyline/Spread/Total* de ligas mayores, pero fijan **Props de Jugadores** con márgenes amplios y reglas heurísticas lentas ante cambios de rol o bajas de compañeros.
- **Diseño sobre datos ya capturados en `web-scraping`:**
  - Modelar minutos/oportunidades esperadas $\times$ tasa por minuto mediante **Poisson Jerárquica / Binomial Negativa** ajustada por defensa rival y clima/altitud:
    - **Fútbol (`Liga MX` + `Top-5`):** Tiros totales, Tiros a Puerta (`SoT`), Goles o Asistencias (`npxG + xA` de Opta/Understat + `SKORE`).
    - **MLB:** Ponches del abridor (`K%` abridor $\times$ `K%` lineup rival $\times$ *pitch count* esperado) y Total de Bases.
    - **NFL / NBA:** Yardas aéreas/terrestres, recepciones y `Puntos + Rebotes + Asistencias (PRA)` redistribuyendo el *usage rate* cuando falta un titular en `roster_availability.json`.

### 3.3. Cazador en Tiempo Real de *Stale Lines* y *Line Shopping* Multi-Casa
- **Mecánica real del *edge*:** Cuando entra flujo institucional o se confirma una baja, `Pinnacle` y `Smarkets` ajustan su probabilidad justa en segundos, mientras libros recreativos (`Caliente.mx`, `Codere.mx`, `Bet365`) presentan **ventanas de rezago de 15 a 45 minutos**.
- **Mejora en `pipeline/predict_live_matchday.py` y `src/domain/prediction/service.ts`:**
  1. **Snapshots multi-horizonte (`T-48h → T-24h → T-6h → T-60m → T-15m`):** Ejecutar `run_matchday_refresh.py` periódicamente para calcular **`steam_velocity`** ($\Delta \text{logit}(p_{\text{Pinnacle}}) / \Delta t$).
  2. **Enrutador *Best-Price* y Regla de Doble Llave:** Evaluar el `EV` contra la **mejor cuota real disponible entre las casas del usuario**, otorgando calificación máxima (*Pick Institucional Confirmado*) cuando se cumplen simultáneamente:
     $$p_{\text{PitchLab}} > p_{\text{implícita}}(\text{Cuota Recreativa}) \quad \text{y} \quad p_{\text{Pinnacle/Smarkets No-Vig}} > p_{\text{implícita}}(\text{Cuota Recreativa})$$

### 3.4. *Meta-Labeling*, *Uncertainty-Aware Kelly* y Taxonomía de Picks en 3 Perfiles
Un motor que recomienda únicamente cuotas `4.50` con `+5% EV` somete al usuario a rachas normales de 12–15 derrotas seguidas. Para producir **buenos picks operables y sostenibles**, `evaluateGeodesicV2ValueGate` (`src/domain/prediction/devig.ts`) debe evolucionar a **`Geodesic v3.0`**:
1. ***Meta-Labeling* de Calidad de Pick:** Un modelo secundario predice la probabilidad de que un candidato con `EV > 0` bata la línea de cierre (`P(CLV > 0)`), usando la concordancia entre submodelos (`dispersión(Logit, GBM, Dixon-Coles, Smarkets)`), el tiempo restante al kickoff, la liquidez de la liga y el vector de `Action Network` (`% money - % tickets`).
2. **Kelly Penalizado por Incertidumbre Epistémica ($\sigma_p^2$):**
   $$f_{\text{stake}} = \kappa \cdot \max\left(0,\; \frac{\hat{p} b - (1 - \hat{p})}{b + \lambda \cdot \sigma_p^2 \cdot b^2}\right)$$
   Donde $\sigma_p^2$ mide el desacuerdo entre los submodelos del ensamble. Si un borde proviene de una extrapolación incierta ($\sigma_p$ alto), el stake se contrae automáticamente.
3. **Clasificación Transparente en 3 Perfiles de Pick para el Producto UI:**
   - **Nivel 1 — Pick Ancla / Alta Probabilidad (`Sólido`):** `P_real >= 54%` (priorizando `AH 0.0 / DNB`, `AH -0.25` o `Spread/ML` moderado, cuotas `1.55 – 2.05`), `EV >= +2.5%`, baja dispersión $\sigma_p$ y `0` señal RLM adversa. Maximiza consistencia y tasa de acierto sin regalar valor.
   - **Nivel 2 — Pick Francotirador (`Valor Institucional`):** Cuotas medias (`1.80 – 2.85`), `EV >= +4.0%`, línea recreativa desfasada respecto a `Pinnacle`/`Smarkets` o *steam* institucional confirmado.
   - **Nivel 3 — Tiro de Cuota Alta (`Especulativo Controlado`):** Cuotas `> 2.90` con asimetría fuerte (`EV >= +6.0%`), stake estrictamente acotado (`0.25u – 0.50u`) y advertencia explícita de varianza.

### 3.5. Auditoría Continua de `CLV` (*Closing Line Value*) y Asignación Dinámica de Capital
- Registrar en base prospectiva cada pick emitido con `(timestamp_emision, mercado, cuota_recomendada, casa_objetivo, p_modelo, cuota_pinnacle_momento)` y cruzarlo tras el kickoff con `(cuota_cierre_pinnacle_novig, resultado_real, pnl_unidades)`.
- **Ventaja científica:** Mientras el ROI en unidades tarda `>1,500` apuestas en converger estadísticamente por varianza de resultados, **el `CLV` medio converge en `100–150` picks**, permitiendo verificar en pocas semanas qué ligas y mercados generan alfa genuino y reasignar pesos automáticamente.

---

## 4. Matriz de Priorización e Impacto Esperado (`v3.1 → v4.0`)

| Fase | Iniciativa Técnica | Archivos Destino Principales | Esfuerzo | Impacto en Precisión / Picks |
| :---: | :--- | :--- | :---: | :--- |
| **Fase 1 (`v3.1`)** | Exportación de árboles `GBM` a TS + Cabeza de mercados 2-vías (`AH`, `DNB`, `O/U`, `BTTS`, `Spreads`) | `services/models/train_gbm.py`, `src/domain/prediction/engine.ts`, `multisport.ts`, `service.ts` | Bajo–Medio | **`-0.0008` a `-0.0013` nats** inmediatos en TS + mitad de vig en picks de fútbol |
| **Fase 2 (`v3.2`)** | Snapshots temporales `T-48h..T-5m`, *Line Shopping* (`Caliente/Codere` vs `Pinnacle/Smarkets`), *Uncertainty Kelly*, 3 niveles de Pick y tracker `CLV` | `scrapers/run_matchday_refresh.py`, `src/domain/prediction/devig.ts`, `pipeline/predict_live_matchday.py` | Medio | **`+1.5%` a `+3.0%` CLV esperado** en libros recreativos y caída drástica de *max drawdown* |
| **Fase 3 (`v3.5`)** | `nflverse` Play-by-Play histórico (`EPA`, `Success%`, `QB CPOE` semanal) en `Minkowski` | `research/prediction-lab/models/nfl/features.py`, `pipeline/export_model_nfl.py` | Medio | **`-0.008` a `-0.012` nats** OOS en NFL (`TEST 2020–25`) |
| **Fase 4 (`v3.8`)** | *Game-logs* diarios + **Abridor MLB / Portero NHL / On-Off & Rest NBA / Kalman NCAAF** | `research/prediction-lab/models/multisport/train_multisport.py`, `src/domain/prediction/multisport.ts` | Medio–Alto | **`-0.015` a `-0.040` nats** en los 4 deportes EE. UU. + gatillo `T-60m` real |
| **Fase 5 (`v4.0`)** | XI Titular *Bottom-Up* (`Opta/Understat/SKORE` + `PSxG` portero) + Motor de *Player Props* multi-deporte + `xG` en las 23 ligas | `features/build_features.py`, `pipeline/fixture_features.py`, nuevo `src/domain/prediction/props.ts` | Alto | Cobertura de los mercados más ineficientes (*Props*) y cierre de brecha a `T-60m` |
