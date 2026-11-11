# 19 — Arquitectura y Hoja de Ruta Cuantitativa (`v3.1 → v4.0`): Medición Primero, Política `EV/CLV` y Apertura del Holdout Sellado

> **Reporte cuantitativo primario (`v3.1`):** [`research/prediction-lab/reports/A28_picks_medibles_v3_1.md`](../../research/prediction-lab/reports/A28_picks_medibles_v3_1.md) · **Auditoría Red Team transversal (`Puertas 1–3`):** [`research/prediction-lab/reports/A28_verificacion_swarm.md`](../../research/prediction-lab/reports/A28_verificacion_swarm.md) · ** Artefacto de producción por segmento:** [`src/data/prediction/production_segments_v3_1.json`](../../src/data/prediction/production_segments_v3_1.json).

**Fecha de actualización:** `2026-11-11` · **Rama:** `prediction-lab` · **Estado:** Ciclo `v3.1` ejecutado, verificado en Python + TypeScript y evaluado en **una sola pasada sin re-tuning** sobre el `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`).

---

## 1. Las 5 Correcciones Estructurales Obligatorias Incorporadas en `v3.1`

Esta versión reemplaza íntegramente el borrador anterior de la hoja de ruta `v3.1 → v4.0`, eliminando cinco fallas metodológicas que habrían destruido banca o inflado métricas en producción:

### Corrección #1 — Niveles de Pick Definidos Exclusivamente por `EV` y `CLV` (Jamás por `% de Acierto`)
- **Por qué era erróneo el antiguo `"Pick Ancla >= 54%"`:** En apuestas deportivas, el porcentaje de acierto aislado carece de signo económico sin la cuota. A cuota decimal `1.80`, la probabilidad implícita de punto de equilibrio (*breakeven*) es $p_{\text{eq}} = 1 / 1.80 = 55.56\%$. Aprobar un pick porque tiene $p = 54.0\%$ a cuota `1.80` equivale a comprar sistemáticamente un activo con **$\text{EV} = 0.54 \times 1.80 - 1 = -2.80\%$** por apuesta.
- **Regla vigente (`src/domain/prediction/picks.ts` y `services/models/picks_engine.py`):** Ningún candidato puede aprobarse por tasa de acierto (`raw_hit_rate_used_for_approval = false`). Todo pick exige estrictamente:
  $$p_{\text{final}} > \frac{1}{\text{cuota}} \quad \text{y} \quad \text{EV} = p_{\text{final}} \cdot \text{cuota} - 1 \ge \tau_{\text{EV}}(\text{liga}, \text{mercado}, \text{bucket})$$
  donde $\tau_{\text{EV}}$ se calibra causalmente en *walk-forward* con contracción Bayesiana empírica ($m_0 = 60$) sobre cuatro tramos de cuota (`short [1.01, 1.65)`, `even [1.65, 2.20)`, `plus [2.20, 2.90)`, `long [2.90, 1000.0]`), nunca mediante un umbral mágico fijo como `+4%`.

### Corrección #2 — Eliminación Total de `"Tiro de Cuota Alta"`: Solo Existen `Sólido` y `Valor`, Dimensionados por Kelly ¼ con Incertidumbre
- **Eliminación de niveles ad-hoc:** Se suprime por completo la categoría `"Tiro de Cuota Alta"` y sus stakes fijos arbitrarios (`0.25u–0.50u`). En el dominio (`PICK_TIERS = ["solido", "valor"]`) existen únicamente dos niveles:
  - **`Sólido` (`solido`):** Exige $\text{EV} \ge \tau_{\text{EV,solido}}(\text{liga}, \text{mercado}, \text{bucket})$ **y** que el segmento haya demostrado ventaja real contra el cierre (`segment_clv_mean > 0` con límite inferior del IC 95% bootstrap `> 0`).
  - **`Valor` (`valor`):** Exige un margen superior $\text{EV} \ge \tau_{\text{EV,valor}} > \tau_{\text{EV,solido}} > 0$ para compensar mayor incertidumbre estructural.
- **Kelly ¼ contraído en toda cuota (incluidas cuotas `> 2.90`):** El propio criterio de Kelly penaliza de forma natural la varianza de cuotas altas (`b = cuota - 1` grande reduce $f^*$) y aquí se refuerza restando la dispersión epistémica entre submodelos $\sigma_p = \operatorname{std}_{\text{pop}}([p_{\text{logit}}, p_{\text{gbm}}, p_{\text{dc}}])$:
  $$p_{\text{shrunk}} = \max(0,\; p_{\text{final}} - 0.50 \cdot \sigma_p), \qquad f_{1/4} = \frac{1}{4}\max\!\left(0,\; \frac{p_{\text{shrunk}}\cdot b - (1 - p_{\text{shrunk}})}{b}\right)$$
  junto con rechazo duro por dispersión ($\sigma_p > 0.06$), rechazo por *steam* sharp adverso ($> 3.0$ ticks de $50\text{ bps}$ en `[T-60m, T_dec]`), penalización por correlación intra-evento ($\rho = 0.35$, máx. `1` pick por `(event_id, market)`) y **4 topes duros inquebrantables**: **`2.0u` por pick**, **`2.0u` por partido**, **`3.0u` por `(liga, día UTC)`** y **`5.0u` por `día UTC` global**.

### Corrección #3 — Inferencia Bootstrap Obligatoria (`>= 1,000` Remuestreos) e Hipótesis No Probadas Etiquetadas Explícitamente
- Toda diferencia de `log-loss`, `Brier`, `CLV%`, `CLV_prob` y `ROI%` se reporta con **IC 95% bootstrap determinista (`>= 1,000` remuestreos `mulberry32`)**.
- **Regla de reporte:** Cualquier intervalo de confianza del 95% que cruce `0` se etiqueta obligatoriamente como **`"no significativa"`**.
- Los rangos citados en documentos exploratorios previos —como **`-0.015` a `-0.040` nats** por incorporar *game logs* diarios en `Multi-Sport` o **`-0.008` a `-0.012` nats** por incorporar *play-by-play* `nflverse` en `NFL`— **NO son mejoras adquiridas ni garantizadas**: quedan registrados explícitamente como **hipótesis no probadas** hasta que pasen por el arnés causal `A3` y superen un `holdout_sealed` virgen.

### Corrección #4 — Métrica Rectora Única: `log-loss` del Modelo vs `log-loss` de Cierre Pinnacle Sin Margen por `liga × mercado`
- Superar a un baseline ingenuo (frecuencias históricas) solo prueba capacidad descriptiva, no capacidad para vencer a una casa de apuestas. La referencia rectora en cada segmento `liga × mercado` es el **`log-loss` de la cuota de cierre sharp sin margen de `Pinnacle`** (con fallback exclusivo a `Smarkets` en capturas `scraped_ws`; jamás `Bet365`, `Betfair` sin ajuste de comisión ni consensos anónimos como `nflverse`).
- `A4` (`src/domain/prediction/blend.ts` y `services/models/blend_calibration.py`) selecciona en *walk-forward* el método óptimo de remoción de margen (`proportional`, `power` o `shin`) y calibra el peso del modelo en espacio logit:
  $$u_k = \sigma\!\big(w \cdot \operatorname{logit}(p_{m,k}) + (1 - w)\cdot \operatorname{logit}(p_{\text{mkt},k})\big), \qquad p_{\text{final},k} = \frac{u_k}{\sum_j u_j}, \qquad w_{\text{shrunk}} = w_{\text{raw}} \cdot \frac{n}{n + 300}$$
- **Apagado automático:** Si un segmento no supera causalmente a $w = 0$ (`open_market_novig`), si $w_{\text{effective}} \le 0.05$, o si carece de benchmark sharp de cierre (`NFL` en `nflverse`), **queda apagado para picks de modelo (`model_picks_enabled = false`)**.

### Corrección #5 — Secuencia Invertida: Primero Medición (`A1`–`A3`), Luego Política (`A4`–`A5`) y Mercados/Ejecución (`A6`–`A8`), Cierre en Holdout Sellado (`A10`)
- Ningún modelo nuevo ni mercado adicional se conecta a decisiones de apuesta sin existir antes:
  1. **Resolución estricta de cuotas y cierre sharp (`A1`):** `5,442,989` filas normalizadas pre-kickoff en `odds_snapshots.parquet`.
  2. **Ledger inmutable SHA-256 y motor `CLV` bootstrap (`A2`):** paridad exacta `< 10^{-12}` entre TypeScript y Python.
  3. **Arnés *walk-forward* anti-fuga con retraso de ejecución de `2.0 min` y `holdout_sealed` del `20%` (`A3`):** `56,649` eventos en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`) y `14,163` eventos bloqueados en `holdout_sealed` (`>= 2025-02-02T17:30:00Z`).

---

## 2. Qué Se Construyó y Qué Midió Realmente `v3.1` (`walk_forward_dev` vs `holdout_sealed`)

### 2.1 Resumen de Componentes Ejecutados en Olas 1–4

| Componente | Commit | Resultado Medido en `walk_forward_dev` (`56,649` eventos) | Resultado en `holdout_sealed` (`14,163` eventos, `1` sola pasada) | Estado en Producción (`v3.1`) |
|---|---|---|---|---|
| **Línea Base `v3.0` (`Geodesic v2.0`)** | `a852528` | `ΔLL = +0.01457 [+0.01315, +0.01601]` (pierde vs cierre Pinnacle); `1,730` picks, `CLV% = +1.03% [+0.47%, +1.57%]`, `ROI% = +3.24% [-5.59%, +12.42%]` (**`"no significativa"`**) | `ΔLL = +0.01287 [+0.00910, +0.01667]` (pierde vs cierre Pinnacle); `172` picks, `CLV% = -0.71% [-2.82%, +1.47%]` (**`"no significativa"`**), `ROI% = -17.97% [-42.96%, +9.24%]` (**`"no significativa"`**) | Reemplazado por arquitectura `v3.1` |
| **`A4` Mezcla Logit + De-vig** | `5b3df2c` | De-vig ganador OOS: `power = 38`, `proportional = 16`, `shin = 6`. Apaga **`48 / 60`** segmentos; habilita `12 / 60` con `w_eff ∈ [0.10, 0.35]` | Pesos congelados sin re-ajuste; ninguno de los `12` segmentos logra `CLV% > 0` significativo en el holdout | Activo como capa de calibración (`blend.ts`) |
| **`A5` Motor `Sólido`/`Valor` + Kelly ¼** | `ce348e0` | `185` picks: `CLV% = +4.97% [+2.82%, +7.35%]` (`significativa_positiva`), `ROI% = +3.53% [-12.91%, +20.76%]` (**`"no significativa"`**). Subgrupo `model_driven` (`n=120`): `CLV% = -1.19%` (**`"no significativa"`**); `sharp_arb` (`n=65`): `CLV% = +16.25%` | `35` picks: `CLV% = -0.59% [-3.26%, +2.60%]` (**`"no significativa"`**), `ROI% = -1.42% [-32.95%, +35.21%]` (**`"no significativa"`**). `model_driven` (`n=32`): `CLV% = -2.95% [-4.89%, -0.85%]` (`significativa_negativa`) | Reglas y topes `2u/2u/3u/5u` activos (`picks.ts`); `0` segmentos encendidos |
| **`A6` Mercados 2-Vías Dixon-Coles** | `732a403` | Liquidación asiática exacta de 5 estados (`.25`/`.75`); **`0 / 92` segmentos superan la Regla Rectora #4** (`G1::totals` emite `0` picks ejecutables) | No activado (congelado en `0 / 92` desde `dev`) | Liquidación asiática disponible (`markets_2way.ts`); **`0 / 92` segmentos activos** |
| **`A7` `HistGradientBoosting` en TS** | `6583954`, `dfbf2e4` | Paridad `< 4.09×10^{-8}` y latencia `< 0.065 ms`, pero en OOS `2024–25` `ΔLL = -0.000221 [-0.001031, +0.000527]` (**`"no significativa"`**) y degrada `CLV%` de picks de modelo en **`-1.46 pp [-2.70%, -0.29%]`** | No activado (`production_activated: false`, `engine.ts` intacto) | Código disponible (`gbm.ts`); **apagado en producción** |
| **`A8` Líneas Rezagadas Doble Confirmación** | `700dd24` | `129` picks: `CLV% = +10.93% [+8.37%, +13.86%]` (`+3.05 pp` sobre señal solo-sharp), `%CLV>0 = 83.72%`, `ROI% = +5.30% [-17.98%, +33.14%]` (**`"no significativa"`**). Cadencia óptima en `T-60m`: **`3.69 min`** | `19` picks (`100%` `historical_fd`, `0` `scraped_ws`): `%CLV>0 = 57.89%`, `CLV_prob = +0.09 pp [-2.26, +1.91]` (**`"no significativa"`**), `CLV% = -1.10% [-8.27%, +3.94%]` (**`"no significativa"`**), `ROI% = -19.86% [-60.54%, +23.25%]` (**`"no significativa"`**) | Detector listo (`stale_lines.ts`), bloqueado hasta tener scraping `<= 3.69 min` |
| **Sistema Integrado `v3.1` (`A4+A5+A8`)** | *(cierre `A10`)* | `243` picks: `CLV% = +4.96% [+3.11%, +7.01%]`, `ROI% = -6.09% [-21.13%, +9.46%]` (**`"no significativa"`**), `0` violaciones de topes | **`50` picks (`39` con cierre): `CLV% = -2.27% [-5.80%, +0.68%]` (`"no significativa"`), `ROI% = -4.23% [-32.85%, +24.27%]` (`"no significativa"`), `MaxDD = 9.88u`, `0` violaciones** | **`0 / 60` segmentos con `production_enabled: true`** |

### 2.2 Lección Central de Ingeniería tras Abrir el Holdout Sellado (`25` Corridas Pre-Holdout Auditadas)

1. **Los modelos tabulares pre-partido sin alineaciones confirmadas ni ticks intradía no vencen al cierre de Pinnacle:** Ni Dixon-Coles/Poisson-Ridge (`A3`/`A6`), ni el ensamble `Logit+GBM` (`A7`), ni los `12` segmentos residuales de la mezcla logit (`A4`) generaron `CLV% > 0` en ejecución real (`-2.95%` a `-3.37%` en `a5_model_driven` en el holdout). Apagar los `60` segmentos en [`production_segments_v3_1.json`](../../src/data/prediction/production_segments_v3_1.json) protege al usuario y evita emitir recomendaciones sin ventaja real.
2. **La única fuente legítima de `+CLV` observada (`a5_sharp_arb` y `A8` Doble Confirmación) requiere captura multi-tick en vivo que hoy no existe en `scraped_ws`:** En el holdout `2025–2026`, `scraped_ws` produjo **`0` picks** porque `Pinnacle` solo tenía dos capturas separadas por `78.78 min`, `Caliente` tenía una captura aislada (`3` filas sin par sharp) y `Codere`/`Smarkets` tenían `0` filas válidas. Pretender cazar cuotas rezagadas con CSV estáticos de apertura (`football-data.co.uk`) o sondeos cada `79 min` deja escapar el `61.94%` del edge antes de poder ejecutarlo.

---

## 3. Requisito Operativo Inmediato (`v3.2` — Infraestructura de Datos de Cuotas, Sin Re-Tuning de Parámetros)

Antes de construir modelos más complejos, el cuello de botella demostrado empíricamente por `A8` y `A10` es la **resolución temporal de captura de momios** en `.worktrees/web-scraping`:

1. **Cadencia adaptativa gobernada por `exponential_stale_window_nyquist_v1` (`stale_lines_config.json`), reemplazando la antigua regla arbitraria de `15–20 min`:**
   - **`[T-60 min, T-0]` (ventana de XI confirmado):** sondeo cada **`<= 3.69 min` (`221 s`)** $\rightarrow$ eleva la supervivencia esperada del edge de `38.06%` a **`89.81%`**.
   - **`[T-4.4 h, T-60 min)` (matchday cercano):** sondeo cada **`<= 8.57 min` (`514 s`)** (`92.73%` supervivencia).
   - **`[T-8.5 h, T-4.4 h)` (matchday estándar):** sondeo cada **`<= 11.69 min` (`701 s`)** (`93.33%` supervivencia).
   - **`> T-8.5 h` (apertura semanal):** sondeo cada **`<= 30.40 min` (`1,824 s`)** (`94.36%` supervivencia).
2. **Cruce obligatorio de casas por evento canónico:** Cada ciclo debe persistir simultáneamente al menos un libro sharp (`Pinnacle` y/o `Smarkets`) y las casas objetivo (`Caliente.mx`, `Codere.mx`, `Bet365`), garantizando $\ge 2$ ticks pre-partido separados por $\ge 2.0\text{ min}$ para auditar llenado realista y cierre sharp sin margen.
3. **Puerta de encendido prospectivo (*Paper-Trading Ledger Gate*):** Registrar prospectivamente en `PickLedger` (`A2`) al menos `150` picks ejecutables con `execution_delay = 2.0 min` sin tocar los umbrales de `v3.1`; solo habilitar un segmento `liga × mercado` si su `CLV%` prospectivo supera `0` con IC 95% bootstrap (`>= 1,000` remuestreos) estrictamente positivo.

---

## 4. `TODO — Fase Posterior (Diseño sin código, sujeta a la misma Puerta CLV + Holdout Sellado)`

Los cuatro frentes siguientes quedan **explícitamente fuera de implementación en `v3.1`**. Ninguno tiene permiso para conectarse al motor de picks sin antes: (i) construir un benchmark de cierre sharp verificable para su deporte/mercado (`A1`), (ii) evaluarse en el arnés *walk-forward* causal con retraso de ejecución (`A3`), (iii) reportar IC 95% bootstrap (`>= 1,000` remuestreos, etiquetando `"no significativa"` si cruza `0`), y (iv) superar un **nuevo holdout temporal sellado** posterior al corte `2026-11-08`:

### TODO 4.1 — `NFL Minkowski`: Series Semanales *Play-by-Play* `nflverse`
- **Hipótesis no probada:** Incorporar agregados causales estrictos ($w' < w$) de `Dropback EPA`, `Rush EPA`, `Early-Down Success%`, `Pressure Rate` y el `CPOE + EPA/play` específico del QB titular confirmado (el borrador previo aventuraba `-0.008` a `-0.012` nats; **ese rango es una hipótesis no probada**).
- **Bloqueante previo obligatorio:** `nflverse` solo incluye una línea de consenso sin identificar casa sharp (`closing_missing = 100%` en los `6,986` partidos históricos). Antes de habilitar picks de modelo en NFL se requiere acumular un corpus propio de cierres `Pinnacle`/`Smarkets` vía `A1` para medir `Δlog_loss` contra cierre sharp real.

### TODO 4.2 — `Multi-Sport` (`MLB`, `NHL`, `NBA`, `NCAAF`): De Priors Anuales `S-1 → S` a *Game-Logs* Diarios
- **Hipótesis no probada:** Sustituir las proyecciones estacionales por actualización diaria causal con abridor confirmado + bullpen 3d + clima en `MLB`, portero titular confirmado (`GSAE`) + fatiga *back-to-back* en `NHL`, *On/Off* (`EPM`/`BPM`) de bajas confirmadas + densidad `3-en-4` en `NBA`, y prior de *Returning Production / Transfer Portal* + filtro Kalman semanal en `NCAAF` (el borrador previo citaba `-0.015` a `-0.040` nats; **ese rango es una hipótesis no probada**).
- **Bloqueante previo obligatorio:** Construir primero snapshots `A1` con cierres sharp reales para `MLB`, `NHL`, `NBA` y `NCAAF`, validar derechos de datos comerciales/investigación y pasar `A4` (`w_effective > 0.05` frente a `open_market_novig`).

### TODO 4.3 — `Fútbol Tachyon`: Modelo *Bottom-Up* del XI Titular Confirmado en `T-60m`
- **Hipótesis no probada:** Reemplazar las medias móviles de equipo por diferenciales posicionales calculados exactamente al publicarse la alineación oficial (`T-60 min` a `T-45 min`): `PSxG - GA` del guardameta titular, creación `xA + SCA` del mediocampo titular y amenaza `npxG + xGOT` de los delanteros titulares, acoplados a una cabeza bivariante $(\lambda_H(x), \lambda_A(x), \rho(x))$.
- **Bloqueante previo obligatorio:** Exige timestamps auditables al segundo de publicación oficial del XI (`ts_xi_published <= ts_decision`) y cuotas sharp/recreativas capturadas en `[ts_xi_published, ts_xi_published + 10 min]` (`<= 3.69 min` de cadencia) para comprobar en `A3` que el mercado de Pinnacle no haya absorbido ya el 100% del ajuste dos minutos después del anuncio.

### TODO 4.4 — Motor Jerárquico de *Player Props* Multi-Deporte
- **Hipótesis no probada:** Modelar conteos individuales (tiros a puerta, ponches de abridor, yardas por pase/acarreo, `PRA`) mediante distribuciones Poisson / Binomial Negativa jerárquicas condicionadas a minutos/snaps esperados y ritmo del partido, buscando ineficiencias mayores que en líneas principales.
- **Bloqueante previo obligatorio:** Actualmente carecemos tanto de registros históricos partido-a-partido con timestamps causales limpios como de un archivo de cuotas de apertura/cierre de *props* en casas sharp/exchange (`Pinnacle`/`ProphetX`/`Novig`) para aplicar de-vigging (`A4`) y calcular `CLV%` (`A2`). Sin benchmark de cierre sin margen, **cero *player props* pueden emitirse como picks cuantitativos**.
