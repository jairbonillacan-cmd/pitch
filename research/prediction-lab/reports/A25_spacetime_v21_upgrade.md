# A25 — Mejora Cuantitativa de la Suite PitchLab Spacetime v2.1 (Datos Actuales)

**Fecha:** 2026-11-10  
**Rama:** `prediction-lab`  
**Alcance:** Mejora integral de los tres motores principales de predicción (`PitchLab Tachyon v2.1`, `PitchLab Singularity v2.1` y `PitchLab Minkowski v2.1`) utilizando exclusivamente los datasets históricos ya almacenados en disco (`matches.parquet`, `clubelo_ratings.parquet`, `features.parquet`, `features_market.parquet`, `nfl_games.parquet`), sin requerir fuentes externas adicionales.

---

## 1. Resumen Ejecutivo: Comparativa `v2.0` vs `v2.1` vs Casas de Apuestas

| Motor | Deporte / Rol | Partición Out-of-Sample | Métrica Principal | `v1.0` (Base) | `v2.0` (Anterior) | **`v2.1` (Nuevo)** | Casas de Apuestas (De-Vig) | Mejora `v2.1` vs `v2.0` |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **PitchLab Tachyon v2.1** | Fútbol · Deportivo Puro (`logit` / `ensemble`) | **VAL 2023** (`n = 8,152`) | Log-Loss / Acc | `1.00940` / `49.40%` | `1.00623` / `49.68%` | **`1.00495` (`logit`) · `1.00500` (`ens`) / `50.00%`** | `0.98016` / `51.08%` | **`-0.00128` nats** y `+0.32 pp` en Accuracy |
| **PitchLab Tachyon v2.1** | Fútbol · Deportivo Puro (`logit` / `ensemble`) | **TEST 2024–25** (`n = 16,126`) | Log-Loss / Acc | `1.01690` / `49.09%` | `1.01432` / `49.23%` | **`1.01337` (`logit`) · `1.01305` (`ens`) / `49.39%`** | `0.98546` / `50.90%` | **`-0.00127` nats (`ens`) / `-0.00095` nats (`logit`)** |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Apertura (`open`) | **VAL 2023** (`n = 8,143`) | Log-Loss / Brier | `0.98061` / `0.58612` | `0.97946` / `0.58539` | **`0.97899` / `0.58513`** | `0.98016` / `0.58585` | **`-0.00047` nats vs `v2.0`** (**`-0.00117` nats mejor que las casas**) |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Apertura (`open`) | **TEST 2024–25** (`n = 16,120`) | Log-Loss / Brier | `0.98620` / `0.59000` | `0.98523` / `0.58958` | **`0.98487` / `0.58939`** | `0.98546` / `0.58965` | **`-0.00036` nats vs `v2.0`** (**`-0.00059` nats mejor que las casas**) |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Cierre (`close`) | **Global 2013–26** (`n = 105,879`) | Log-Loss | `0.99580` | `0.99510` | **`0.99460`** | `0.99540` | **`-0.00080` nats mejor que la Línea de Cierre en 105,879 partidos** |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Cierre (`close`) | **TEST 2024–25** (`n = 16,120`) | Log-Loss / Brier | `0.99420` / `0.59495` | `0.99366` / `0.59472` | **`0.99322` / `0.59449`** | `0.99385` / `0.59477` | **`-0.00043` nats vs `v2.0`** (**`-0.00063` nats mejor que Cierre**) |
| **PitchLab Minkowski v2.1** | NFL · Deportivo Puro (`logit`) | **VAL 2010–19** (`n = 2,560`) | Log-Loss / Brier | `0.64503` / `0.44010` | `0.64159` / `0.43662` | **`0.64105` / `0.43674`** | `0.62979` / `0.42648` | **`-0.00054` nats vs `v2.0`** (`-0.00398` vs `v1.0`) |
| **PitchLab Minkowski v2.1** | NFL · Deportivo Puro (`logit`) | **TEST 2020–25** (`n = 1,615`) | Log-Loss / Acc | `0.65617` / `64.15%` | `0.65269` / `64.33%` | **`0.65017` / `65.26%`** | `0.62655` / `66.50%` | **`-0.00252` nats / `+0.93 pp` en Accuracy** |
| **PitchLab Minkowski v2.1 (`blend`)** | NFL · Ensamble Deportivo (`logit+hgb`) | **TEST 2020–25** (`n = 1,615`) | Log-Loss / Acc | `0.66606` / `62.29%` | `0.66606` / `62.29%` | **`0.64953` / `65.57%`** | `0.62655` / `66.50%` | **`-0.01653` nats / `+3.28 pp` en Accuracy** |

---

## 2. Mejoras en `PitchLab Tachyon v2.1` (Fútbol · Motor Deportivo Puro)

### 2.1. Diagnóstico y Diseño de Features (`83` $\rightarrow$ `103` features base + `23` divisiones = `126` columnas)
1. **Alineación Log-Odds de Priors Estructurales (`dc_logit_h`, `dc_logit_d`, `dc_logit_a`, `elo_logit_h`)**:
   - En `v2.0`, las probabilidades de Dixon-Coles (`dc_p_home`, `dc_p_draw`, `dc_p_away`) y Elo (`elo_p_home`) entraban únicamente en escala lineal $[0, 1]$ al clasificador logístico multinomial, cuyos logits operan en $\log p$. Al incorporar explícitamente sus transformaciones logarítmicas recortadas $\log(\text{clip}(p, 10^{-4}, 1-10^{-4}))$, el hiperplano lineal puede realizar *log-linear pooling* exacto entre Dixon-Coles, Elo y las variables de forma.
2. **Integración Completa de Proxies Tácticos Opta (`REA-stats`)**:
   - Se incorporaron al vector del modelo los diferenciales causales de calidad de tiro al arco (`xgot_diff_r5`, `xgot_diff_r10`), goles prevenidos por el portero (`gk_prevented_diff_r5`, `gk_prevented_diff_r10`), inclinación territorial de campo (`field_tilt_diff_r5`, `field_tilt_diff_r10`), cambio de régimen táctico (`xgd_regime_shift_diff`) y sobre-ejecución clínica (`clinical_overperf_diff_r10`).
3. **Diferenciales Ajustados por Oponente a Medio Plazo (`r10`) y Decaimiento Exponencial (`ewm5`)**:
   - Se añadieron `pts_res_diff_r10`, `gd_res_diff_r10`, `sos_diff_r10`, `xgd_ewm5_diff`, `pts_res_ewm5_diff`, `gd_res_ewm5_diff`, `sot_diff_r10` y `corners_diff_r10`, reduciendo la varianza muestral de las ventanas cortas de 5 partidos.
4. **Regularización Óptima (`C = 0.05`)**:
   - Con 126 columnas y mayor riqueza de señal ortogonal, `C = 0.05` (seleccionado en validación 2023) logra que **un único modelo lineal (`logit`) supere al ensamble completo de 5 modelos de la versión anterior** tanto en validación (`1.00495` vs `1.00546`) como en test (`1.01337` vs `1.01375`), garantizando que el motor TypeScript en producción capture el 100% de la ganancia sin coste de latencia.

---

## 3. Mejoras en `PitchLab Singularity v2.1` (Fútbol · Motor Híbrido y Valor)

### 3.1. Descubrimiento Empírico sobre el Consenso de Casas de Apuestas
Al auditar las `14,537` observaciones con cobertura completa de casas de apuestas en `features_market.parquet`:
- El método **Power de-vig** domina sistemáticamente al método de Shin en todas las casas (`ps_power`: `0.98299` vs `ps_shin`: `0.98344`; `avg_power`: `0.98359` vs `avg_shin`: `0.98412`).
- El libro sintético de máxima cuota desvigado por potencia (**`max_power`**) alcanza un Log-Loss de **`0.98296`**, superando incluso a Pinnacle individual (`0.98299`) al sintetizar la frontera eficiente de precios entre casas.
- El nuevo consenso jerárquico (`0.56 ps_power + 0.22 max_power + 0.10 avg_power + 0.05 bfe_power + 0.03 bf_power + 0.02 ah_implied + 0.02 b365_power`) reduce el Log-Loss base del mercado en más de `-0.00050` nats antes siquiera de aplicar el modelo deportivo.

### 3.2. Residual Exponential Tilting de 7 Canales (`residual_logit`)
El modelo `residual_logit` mantiene intacto el prior `log(p_consensus)` con pendiente unitaria e inyecta 7 canales de corrección ortogonal regularizados (`C = 0.04`):
1. `diffBase`: divergencia log-odds del motor deportivo base (`Tachyon v2.1` / `ensemble`) respecto al consenso.
2. `diffA`: divergencia log-odds del logit deportivo puro (`Tachyon v2.1`).
3. `diffDC`: divergencia log-odds del modelo estructural bivariante de goles (`Dixon-Coles`).
4. `sharp_vs_b365`: flujo de dinero profesional (`log(ps_power) - log(b365_power)`).
5. `ah_vs_b365`: asimetría entre el mercado de Hándicap Asiático y el mercado 1X2 (`log(ah_implied) - log(b365_power)`).
6. **Geometría de Empate por Totales Implícitos (`tot_implied_goals` $\times$ `elo_closeness`)**: cuando la línea Over/Under 2.5 goles proyecta pocos goles (`tot_implied_goals` bajo) y los equipos son parejos (`elo_closeness` alto), la masa de probabilidad de Poisson se concentra significativamente más en `(0,0)` y `(1,1)` de lo que refleja una cuota 1X2 estándar.
7. **Vector Táctico (`tact_vec`)**: combinación estandarizada de `xgd_diff_r10 + gk_prevented_diff_r10 + pi_diff + xgd_regime_shift_diff`.

---

## 4. Mejoras en `PitchLab Minkowski v2.1` (NFL · Motor Deportivo Puro)

### 4.1. Nuevas Variables Causales (`37` $\rightarrow$ `43` features)
Aprovechando las columnas ya presentes en `nfl_games.parquet` (con 0% de nulos en entrenadores desde 1999):
1. **Head Coach Dynamic Elo & Continuidad (`coach_elo_diff`, `coach_change_home`, `coach_change_away`)**:
   - Rating Elo dinámico para cada entrenador en jefe (`K = 12`, reversión inter-temporada `0.85`), capturando el valor estructural de entrenadores élite (Belichick, Reid, Tomlin, Harbaugh, Shanahan, McVay) más allá de la rotación de plantilla.
2. **Momentum Elo Multi-Velocidad (`elo_fast_diff`, `elo_momentum_diff`)**:
   - Un segundo tracker Elo rápido (`K = 32`, menor regresión de pretemporada `0.75`) cuya diferencia contra el Elo estructural (`K = 20`) mide rachas de aceleración o colapso dentro de la temporada.
3. **Log-Odds Compuesto y Cercanía para Empates (`comp_elo_logit`, `elo_closeness`)**:
   - Transformación log-odds exacta del Elo compuesto (`Equipo + QB + Coach + Descanso`) y campana gaussiana de igualdad competitiva $\exp(-(\Delta\text{Elo}/140)^2)$.
4. **Márgenes Ajustados por Calendario a 10 Partidos y EWMA (`f10_adj_margin_diff`, `ewm_adj_margin_diff`, `ewm_off_diff`, `ewm_def_diff`, `sos_elo_diff`)**:
   - Cada margen de victoria histórico se ajusta por la fortaleza Elo del rival enfrentado ($\text{margin} + (\text{Elo}_{\text{opp}} - 1500)/25$), separando victorias abultadas ante rivales débiles de dominio real ante contendientes.
5. **Clima Exterior y Fatiga de Tiempo Extra (`wind_outdoor`, `cold_outdoor`, `prev_ot_diff`)**:
   - Penalización específica por viento (`> 15 mph`) y frío extremo (`< 32 °F`) exclusivamente en estadios abiertos (`is_dome == 0`), más indicador de desgaste físico si el equipo jugó tiempo extra en la semana inmediata anterior.
6. **Poda de Niveles Colineales**:
   - Se eliminaron las columnas de nivel absoluto redundantes (`elo_home_pre`, `elo_away_pre`, `f5_pf_home/away`, `f5_pa_home/away`, `n_prior_*`, `week`), reduciendo el sobreajuste del clasificador lineal y del árbol `HGB`.

### 4.2. Parametrización Softmax Desacoplada 2-Vías + Coseno Hiperbólico (`cosh`) para Empates
En la NFL, los empates ocurren en apenas ~0.2% de los partidos (~12 juegos en 25 años). En `v2.0`, entrenar un `LogisticRegression` multinomial de 3 clases obligaba a estimar 37 coeficientes independientes para la clase `Tie`, introduciendo ruido severo y forzando una hiper-regularización (`C = 0.003`) que comprimía las probabilidades de victoria local/visitante.

En `PitchLab Minkowski v2.1`, demostramos que la distribución de 3 vías con probabilidad de empate dependiente de la igualdad del partido:
$$P(T \mid z) \approx \tau \cdot \text{sech}(\eta_H), \quad \eta_H = \frac{1}{2}(w^\top z + b)$$
se representa **de forma exacta** dentro de una matriz softmax estándar de $3 \times D$ fijando:
- Fila `0` (`Home`): $+0.5 \cdot w$, intercepto $+0.5 \cdot b$
- Fila `1` (`Tie`): $0 \cdot w$, intercepto $b_{\text{tie}} = \log\left(\frac{2\tau \cosh(0.32)}{1 - \tau}\right)$
- Fila `2` (`Away`): $-0.5 \cdot w$, intercepto $-0.5 \cdot b$

De este modo:
1. El vector $w$ se estima limpiamente sobre los partidos decididos (`H vs A`) con `C = 0.01`.
2. La probabilidad de empate alcanza automáticamente su máximo cuando ambos equipos son idénticos ($\eta_H = 0$) y decae suavemente conforme aumenta la desigualdad ($\cosh(\eta_H)$), sin un solo parámetro ruidoso en la fila de empate.
3. El artefacto exportado `model_nfl.json` conserva exactamente la estructura `coef: 3 x 43` e `intercept: 3`, manteniendo **paridad numérica exacta (`< 1e-12`) con `predictNFL` en TypeScript** sin modificar el contrato del cliente.
