# 19 — Hoja de Ruta Estratégica (`v3.1 → v4.0`): Mejora de Todos los Motores y Generación de Picks Ganadores

> **Fuente técnica primaria:** [`research/prediction-lab/reports/A27_roadmap_picks_and_engine_evolution_v4.md`](../../research/prediction-lab/reports/A27_roadmap_picks_and_engine_evolution_v4.md) · **Base actual desplegada:** [`18_INTEGRACION_WEB_SCRAPING_FEATURE_STORE.md`](18_INTEGRACION_WEB_SCRAPING_FEATURE_STORE.md) (`PitchLab Spacetime Suite v3.0`, commit `666c5c7`).

**Fecha:** 2026-11-10 · **Rama:** `prediction-lab` · **Propósito:** Definir la arquitectura cuantitativa y de producto para elevar simultáneamente (1) la precisión fuera de muestra de los 6 deportes de PitchLab y (2) la calidad, rentabilidad (`+EV` / `+CLV`) y estabilidad de los **picks de apuesta** recomendados al usuario.

---

## 1. Diferencia Clave: Pronosticar el 100% del Calendario vs Emitir Buenos Picks

Un motor académico busca reducir el Log-Loss promedio sobre todos los partidos del año, incluyendo el ~85% de encuentros donde el precio institucional de cierre ya es eficiente. En cambio, un **motor de picks de nivel sindicato** opera con **selectividad francotirador**:
- Dispara únicamente en el **`5%–10%` de mercados, horarios y casas recreativas (`Caliente.mx`, `Codere.mx`, `Bet365`) donde existe ventaja verificable sobre el precio implícito**.
- Elige **el mercado óptimo por partido** (priorizando mercados de 2 vías de bajo margen sobre el `1X2` de alto margen cuando el perfil de riesgo/retorno es superior).
- Controla la **incertidumbre epistémica y la varianza de cuotas altas** para proteger tanto el *bankroll* como la adherencia psicológica del usuario.

---

## 2. Eje A — Mejoras de Precisión Pura en los Motores Deportivos

1. **Árboles `GBM` nativos en TypeScript (`Tachyon` y `Minkowski`, `< 0.1 ms`):**
   - En Python (`services/models/train_gbm.py`), el ensamble `Logit + HistGradientBoosting calibrado` ya mejora `-0.00083` nats global (`1.01228` vs `1.01311`) y `-0.00131` nats en Liga MX (`0.98346`, `54.73%` Acc), pero `src/domain/prediction/engine.ts` hoy solo ejecuta los pesos lineales. Exportar los árboles compactos a JSON + *tree-walker* TS captura de inmediato el 100% de esa ventaja en producción.
2. **Salto de `Multi-Sport` (`NHL`, `MLB`, `NBA`, `NCAAF`) de `S-1 → S` a *Game-Logs* Diarios + Variables Críticas (`-0.015` a `-0.040` nats):**
   - **`MLB Kepler`:** Lanzador abridor confirmado (`SIERA`, `xFIP`, `K-BB%`, *platoon splits* LHP/RHP) + desgaste de bullpen en 3 días + dirección del viento en estadios abiertos.
   - **`NHL Curvature`:** Portero titular confirmado (`GSAE` de MoneyPuck) + fatiga *back-to-back* en gira + *Special Teams*.
   - **`NBA Tensor`:** Impacto *On/Off* (`EPM`/`BPM`) de titulares ausentes + densidad de calendario (`B2B`, `3-en-4`, husos horarios).
   - **`NCAAF Horizon`:** Prior de *Returning Production / Transfer Portal* en semanas tempranas + actualización Kalman/Elo semanal sobre los `138` equipos FBS.
3. **`PitchLab Tachyon` (`Fútbol`) — Modelo *Bottom-Up* del XI Titular + Cabeza Bivariante + `xG` en 23 Ligas:**
   - Reemplazar el escalar agregado de bajas por diferenciales posicionales del XI real (`PSxG - GA` del portero titular, `xA + SCA` de creadores y `npxG + xGOT` de atacantes) usando los datos granulares ya capturados (`Opta`, `Understat`, `Statiskicks SKORE`, `RotoWire`).
   - Entrenar una cabeza bivariante dinámica $(\lambda_H(x), \lambda_A(x), \rho(x))$ e incorporar `xG` real histórico en las `17` ligas secundarias de `matches.parquet`.
4. **`PitchLab Minkowski` (`NFL`) — Play-by-Play Histórico `nflverse` (`-0.008` a `-0.012` nats):**
   - Incorporar series semanales causales ($w' < w$) de `Dropback EPA`, `Rush EPA`, `Early-Down Success%`, `Pressure Rate` y el `CPOE + EPA/play` específico del QB titular de cada semana.

---

## 3. Eje B — Mejoras Específicas para Predecir Apuestas y Dar Buenos Picks (`Geodesic v3.0`)

1. **Mercados 2-Vías de Bajo Margen (`Hándicap Asiático`, `Draw No Bet`, `Spreads`, `Over/Under`, `BTTS`):**
   - Evitar pagar el `6.6%–7.1%` de comisión del `1X2` recreativo cuando el valor táctico/físico (`ppda`, `deep_completions`, `pace`, altitud en Toluca/CDMX/Coors Field, clima `Open-Meteo`) se expresa con mitad de vig (`3.2%–4.5%`) y menor varianza en `AH 0.0`, `AH -0.25` o `Totales`.
2. **Motor de *Player Props* (el mercado más ineficiente de las casas):**
   - Modelos Poisson / Binomial Negativa jerárquicos por jugador (tiros al arco, goles/asistencias, ponches de abridor MLB, yardas NFL, `PRA` en NBA) alimentados por las tablas individuales ya presentes en `.worktrees/web-scraping/data/normalized/`.
3. **Cazador de *Cuotas Rezagadas* (*Stale Lines*) y *Line Shopping* Multi-Casa (`T-48h → T-5m`):**
   - Capturas cada `15–20 min` para medir velocidad de *steam* en `Pinnacle`/`Smarkets` y detectar líneas que `Caliente.mx` o `Codere.mx` aún no ajustaron, exigiendo **doble confirmación** (`P_modelo` y `P_sharp_novig` ambos por encima de la probabilidad implícita de la cuota recreativa).
4. **Gatillo `T-60 min` de Alineaciones Oficiales, Porteros y Lanzadores:**
   - Re-cálculo instantáneo al publicarse el XI confirmado, *inactives* NFL, *starting goalie* NHL o *lineup card* MLB antes de que el mercado absorba por completo la noticia.
5. ***Meta-Labeling*, Kelly con Incertidumbre ($\sigma_p^2$) y 3 Niveles de Pick:**
   - Filtrar falsos positivos exigiendo baja dispersión entre submodelos (`Logit`, `GBM`, `Dixon-Coles`) y ausencia de RLM en contra, clasificando cada pick en:
     - **Pick Ancla / Sólido:** Alta tasa de acierto (`>= 54%`, `DNB`/`AH`/`ML` moderado) + `+EV` confirmado.
     - **Pick Francotirador:** Valor institucional (`EV >= +4%`) en cuotas medias (`1.80 – 2.85`) sobre líneas rezagadas.
     - **Tiro de Cuota Alta:** Cuotas `> 2.90` con stake contraído por varianza (`0.25u – 0.50u`).
6. **Tracker Automático de `CLV` (*Closing Line Value*):**
   - Auditar cada pick emitido contra la cuota de cierre sin vig de Pinnacle para demostrar ventaja estadística real en `100–150` picks y reasignar capital hacia las ligas y mercados de mayor alfa.

---

## 4. Secuencia de Ejecución Recomendada

| Prioridad | Fase | Entregable Clave | Retorno Principal |
| :---: | :---: | :--- | :--- |
| **1** | `v3.1` | Exportación `GBM` a TS + Mercados 2-vías (`AH`, `DNB`, `O/U`, `BTTS`, `Spreads`) | Precisión inmediata en TS (`-0.001` nats) + mitad de comisión en picks |
| **2** | `v3.2` | *Line Shopping* multi-casa (`Caliente/Codere` vs `Pinnacle/Smarkets`), 3 perfiles de Pick, Kelly con $\sigma_p^2$ y tracker `CLV` | Picks de alto `CLV` (`+1.5%` a `+3.0%`) y menor *drawdown* |
| **3** | `v3.5` | Play-by-play histórico `nflverse` (`EPA`, `Success%`, `QB CPOE` semanal) en `Minkowski` | Salto `-0.008` a `-0.012` nats en NFL |
| **4** | `v3.8` | *Game-logs* diarios + Abridores MLB, Porteros NHL, *On/Off* NBA y Kalman NCAAF | Salto `-0.015` a `-0.040` nats en `Multi-Sport` |
| **5** | `v4.0` | XI Titular *Bottom-Up* + Motor de *Player Props* multi-deporte + `xG` en las 23 ligas | Dominio en mercados blandos (*Props*) y ventana `T-60m` |
