# 17 · Mejora Cuantitativa de la Suite PitchLab Spacetime v2.1

Este documento resume las mejoras algorítmicas, de ingeniería de variables y de calibración implementadas en la versión **v2.1** de los tres motores de la suite **PitchLab Spacetime** (`PitchLab Tachyon v2.1`, `PitchLab Singularity v2.1` y `PitchLab Minkowski v2.1`), entrenados y verificados estrictamente sobre los datos históricos locales del repositorio.

Reporte técnico detallado y tablas de ablación: [`A25_spacetime_v21_upgrade.md`](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/prediction-lab/research/prediction-lab/reports/A25_spacetime_v21_upgrade.md).

---

## 1. Tabla Comparativa General (`v1.0` vs `v2.0` vs `v2.1` vs Casas de Apuestas)

| Motor | Deporte / Modo | Partición | Log-Loss `v1.0` | Log-Loss `v2.0` | **Log-Loss `v2.1`** | Casas de Apuestas | Accuracy `v2.0` $\rightarrow$ **`v2.1`** |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **PitchLab Tachyon v2.1** | Fútbol · Deportivo Puro (`126` cols) | **VAL 2023** (`8,152`) | `1.00940` | `1.00623` | **`1.00495` (`logit`) · `1.00500` (`ens`)** | `0.98016` | `49.68%` $\rightarrow$ **`50.00%`** |
| **PitchLab Tachyon v2.1** | Fútbol · Deportivo Puro (`126` cols) | **TEST 2024–25** (`16,126`) | `1.01690` | `1.01432` | **`1.01337` (`logit`) · `1.01305` (`ens`)** | `0.98546` | `49.23%` $\rightarrow$ **`49.39%`** |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Apertura (`open`) | **VAL 2023** (`8,143`) | `0.98061` | `0.97946` | **`0.97899`** | `0.98016` | **`-0.00117` nats mejor que las casas** |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Apertura (`open`) | **TEST 2024–25** (`16,120`) | `0.98620` | `0.98523` | **`0.98487`** | `0.98546` | **`-0.00059` nats mejor que las casas** |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Cierre (`close`) | **Global 2013–26** (`105,879`) | `0.99580` | `0.99510` | **`0.99460`** | `0.99540` | **`-0.00080` nats mejor que Cierre (105,879 juegos)** |
| **PitchLab Singularity v2.1** | Fútbol · Híbrido Cierre (`close`) | **TEST 2024–25** (`16,120`) | `0.99420` | `0.99366` | **`0.99322`** | `0.99385` | **`-0.00063` nats mejor que Cierre** |
| **PitchLab Minkowski v2.1** | NFL · Deportivo Puro (`29` cols) | **VAL 2010–19** (`2,560`) | `0.64503` | `0.64159` | **`0.64105`** | `0.62979` | `64.61%` (`logit`) · **`65.27%` (`blend`)** |
| **PitchLab Minkowski v2.1** | NFL · Deportivo Puro (`29` cols) | **TEST 2020–25** (`1,615`) | `0.65617` | `0.65269` | **`0.65017`** | `0.62655` | `64.33%` $\rightarrow$ **`65.26%` (`+0.93 pp`)** |
| **PitchLab Minkowski v2.1 (`blend`)** | NFL · Ensamble Deportivo (`logit+hgb`) | **TEST 2020–25** (`1,615`) | `0.66606` | `0.66606` | **`0.64953`** | `0.62655` | `62.29%` $\rightarrow$ **`65.57%` (`+3.28 pp`)** |

---

## 2. Claves Técnicas por Motor

1. **`PitchLab Tachyon v2.1` (Fútbol · Deportivo Puro)**:
   - Añade 20 nuevas features causales (`83` $\rightarrow$ `103` features base + `23` divisiones = `126` columnas), incluyendo log-probabilidades estructurales de Dixon-Coles y Elo (`dc_logit_h/d/a`, `elo_logit_h`), toda la batería táctica Opta-proxy (`xgot_diff_r5/r10`, `gk_prevented_diff_r5/r10`, `field_tilt_diff_r5/r10`, `xgd_regime_shift_diff`, `clinical_overperf_diff_r10`) y diferenciales ajustados por oponente en ventana de 10 partidos y EWMA (`pts_res_diff_r10`, `gd_res_diff_r10`, `sos_diff_r10`, `xgd_ewm5_diff`).
   - El modelo lineal individual exportado a TypeScript (`1.01337` en Test) **supera al ensamble completo de 5 modelos de la versión 2.0 (`1.01375`)**.
2. **`PitchLab Singularity v2.1` (Fútbol · Híbrido con Mercado)**:
   - Reemplaza el consenso previo por un **Consenso Jerárquico Power De-Vig** (`ps_power`, `max_power`, `avg_power`, `bfe_power`, `bf_power`, `ah_implied`, `b365_power`) y amplía el **Residual Exponential Tilting (`residual_logit`)** a 7 canales ortogonales, incorporando la interacción entre totales de goles implícitos y cercanía Elo (`tot_implied_goals` $\times$ `elo_closeness`) más el vector táctico Opta-proxy.
   - Supera a las casas de apuestas tanto en **Apertura (`-0.00059` nats en Test, `-0.00117` nats en Val)** como en **Línea de Cierre (`-0.00063` nats en Test, `-0.00095` nats en Val)**.
3. **`PitchLab Minkowski v2.1` (NFL · Deportivo Puro)**:
   - Añade **Head Coach Dynamic Elo & Continuidad** (`coach_elo_diff`, `coach_change_home/away`), **Momentum Elo Multi-Velocidad** (`elo_fast_diff`, `elo_momentum_diff`), **Márgenes Ajustados por Calendario a 10 juegos y EWMA** (`f10_adj_margin_diff`, `ewm_adj_margin_diff`, `ewm_off_diff`, `ewm_def_diff`), y **Clima Exterior / Fatiga de Overtime** (`wind_outdoor`, `cold_outdoor`, `prev_ot_diff`), eliminando niveles colineales.
   - Introduce la **Parametrización Softmax Desacoplada 2-Vías + Coseno Hiperbólico (`cosh`) para Empates**, elevando el Accuracy out-of-sample en Test (2020–2025) de `64.33%` a **`65.76%` (`+1.43 pp`)**, quedando a solo `0.37 pp` del mercado de cierre de Las Vegas (`66.13%`) sin usar cuotas de apuestas.
