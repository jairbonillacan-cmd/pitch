# 18 — Integración del Feature Store v2.0 y las 28 Fuentes de `web-scraping` (`PitchLab Spacetime Suite v3.0`)

> **Fuente técnica primaria:** [`research/prediction-lab/reports/A26_web_scraping_feature_store_integration.md`](../../research/prediction-lab/reports/A26_web_scraping_feature_store_integration.md) · **Experimentos reproducibles:** `EXP_A26_tachyon_v30_summary.json`, `EXP_A26_singularity_geodesic_v30_summary.json`, `EXP_A26_minkowski_multisport_v30_summary.json`.

**Fecha:** 2026-11-10 · **Rama:** `prediction-lab` (consumiendo `.worktrees/web-scraping@3a8b3c0` en modo estricto `read-only`) · **Estado de evidencia:** `OBSERVADO` (`7/7` bloques en `validate_release.py`, `RELEASE: OK`).

---

## 1. Resumen Ejecutivo: Evolución `v1.0` $\rightarrow$ `v2.0` $\rightarrow$ `v2.1` $\rightarrow$ **`v3.0`** vs Casas de Apuestas

La evolución a **`PitchLab Spacetime Suite v3.0`** conecta de extremo a extremo la infraestructura criptográficamente sellada de `web-scraping` (`28` fuentes activas, `55` snapshots JSON crudos verificados por SHA-256, `108,167` registros normalizados, `376` equipos canónicos en `11` ligas / `6` deportes, `15,344` partidos con `xG` histórico y `242` enfrentamientos vivos) con el motor cuantitativo de `prediction-lab`, respetando separación estricta entre series históricas *point-in-time* ($t' < t$ y $S-1 \to S$) y snapshots prospectivos (`captured_at_utc <= kickoff_utc`).

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

| Motor (`v3.0.0`) | Universo Canónico | Partición Causal $S-1 \to S$ | `RMSE Win%` (`v3.0` vs Naive / Legacy) | `Game Log-Loss` (`v3.0` vs Naive / Legacy) | Auditoría en Partidos Reales Observados / Física |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`NHL Curvature v3.0`** | `32` franquicias NHL | `64` equipo-temp (`3,194` juegos) | **`0.0970`** vs `0.1149` / `0.1048` | **`0.69304`** vs `0.70132` / `0.69633` (**IC 95% vs Legacy `[-0.00664, -0.00030]`**) | `n = 235` juegos reales: **`0.65113` vs `0.66913` (`hockey.ts`, `-0.01800` nats)** |
| **`MLB Kepler v3.0`** | `30` franquicias MLB | `30` equipo-temp (`4,858` juegos) | **`0.0588`** vs `0.0665` / `0.0610` | **`0.69109`** vs `0.69317` / `0.69171` ($r = 0.5679$) | Física barométrica Coors Field (`1,580 m` / `842 hPa`): multiplicador **`1.1803x`** carreras |
| **`NBA Tensor v3.0`** | `30` franquicias NBA | `60` equipo-temp (`2,768` juegos) | **`0.1590`** vs `0.1660` / `0.1613` | **`0.68106`** vs `0.68690` / `0.68282` ($r = 0.5237$) | Four Factors (`eFG%`, `Opp eFG%`, `NetRtg`, `SRS`, `Pace`) + choque de altitud Denver/Utah |
| **`NCAAF Horizon v3.0`** | `138` programas FBS | `136` equipo-temp (`1,228` juegos) | **`0.1837`** vs `0.2287` / `0.2088` | **`0.66775`** vs `0.74778` / `0.69619` (**IC 95% vs Legacy `[-0.04848, -0.01062]`**) | `n = 121` juegos reales: **`0.59812` vs `0.63712` (`engine-ncaa.ts`, `-0.03900` nats)** |

---

## 2. Arquitectura Anti-Leakage e Integridad Criptográfica

1. **Verificación SHA-256 (`55 / 55` Snapshots):** `research/prediction-lab/etl/ingest_web_scraping.py` recalcula el SHA-256 canónico del `payload` de los 55 snapshots crudos en `.worktrees/web-scraping/data/raw/` contra `manifest_summary.json` (`all_sha256_verified: true`).
2. **Neutralización de Fallbacks Transversales 2026:** Las `997` filas de Liga MX en `historical_matches_xg` imputadas en origen con medias de temporada 2026 (`statiskicks_fallback_cross_section`) se filtran con `is_exact_xg = False` para preservar `0` fuga temporal, dejando **`14,332` partidos con `xG` real exacto** (`12,533` Top-5 Europa + `1,799` Liga MX FBref/Opta).
3. **Bloqueo de `forecast_p_*` Post-Tiro:** Las probabilidades Monte Carlo post-tiro de Understat jamás entran como feature pre-partido (auditado en `test_02_strict_anti_leakage_in_historical_features`).
4. **Separación Estricta `Point-in-Time` vs `Prospective Live` (`captured_at_utc <= kickoff_utc`):**
   - **Backtest histórico (`2000–2025`):** Usa exclusivamente series causales $t' < t$ (`.shift(1)` por equipo), transiciones $S-1 \to S$ e invariantes físicas de estadio (`stadium_elevation_m`, `roof_type`, `structural_pressure_hpa`).
   - **Inferencia prospectiva en vivo:** Conecta valuación `Transfermarkt`, bajas `RotoWire`/`Ourlads`/`NFL Injuries`, cuotas vivas `Pinnacle`/`Caliente.mx`/`Smarkets`, flujo institucional `Action Network` y clima 7d `Open-Meteo` en `service.ts` y `predict_live_matchday.py`.

---

## 3. Inferencia Unificada `< 1 ms` y Paridad Python ↔ TypeScript (`242` Enfrentamientos / `11` Ligas)

| Artefacto / Suite | Cobertura | Latencia Observada | Error Máximo (`max\|Δ\|`) | Estado |
| :--- | :--- | :---: | :---: | :---: |
| `features_snapshot.json` + `fixture_requests.json` | `200` históricos + `150` fixtures (`113` feats) | `< 3 ms` | `<= 9.416 × 10⁻¹³` (`0` diff feats) | **OK** |
| `market_v3_snapshot.json` | `64` casos (`devigAdaptive1X2`, MX debias, RLM gate) | `< 2 ms` | **`1.110 × 10⁻¹⁶`** | **OK** |
| `nfl_snapshot.json` | `200` base + `40` live (`Minkowski v3.0`) | `< 3 ms` | **`1.110 × 10⁻¹⁶`** (live) | **OK** |
| `multisport_snapshot.json` | `140` casos (`NHL 32`, `MLB 30`, `NBA 30`, `NCAAF 138`) | `< 2 ms` | **`1.110 × 10⁻¹⁶`** (prob) | **OK** |
| **`live_matchday_v3_snapshot.json`** | **`242` enfrentamientos activos (`11` ligas)** | **`24.88 ms` V8 (`0.1028 ms/partido`)** | **`4.441 × 10⁻¹⁶`** | **OK** |

---

## 4. Reproducibilidad Rápida

```powershell
cd .worktrees\prediction-lab\research\prediction-lab
.\.venv\Scripts\python.exe etl/ingest_web_scraping.py
.\.venv\Scripts\python.exe pipeline/predict_live_matchday.py --export-snapshot --league liga-mx
.\.venv\Scripts\python.exe pipeline/validate_release.py
```
