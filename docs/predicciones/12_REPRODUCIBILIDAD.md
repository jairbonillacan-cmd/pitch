# 12 — Reproducibilidad

**Documento:** consolidación de los comandos, versiones, semillas y hashes reales del laboratorio.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY.
**Alcance:** `research/prediction-lab/` tal como está en el worktree, más los artefactos de `docs/`. Nada de este documento se ejecutó «de memoria»: los hashes y recuentos se recalcularon en esta sesión.

> **Advertencia de estado.** El laboratorio cambió a las 02:49–02:53 (ETL v1.1) **después** de que A04, A05 y A08 escribieran sus informes. Donde el artefacto actual difiere del auditado, se dan **las dos cifras** y se marca cuál es la vigente.

---

## 1. Entorno verificado

| Componente | Versión | Nota |
|---|---|---|
| SO | macOS 26.6.2, `Darwin arm64` | Apple Silicon |
| Python | **3.9.6** (`/usr/bin/python3` → `.venv`) | `research/prediction-lab/.venv` es un symlink a `../../.venv` |
| numpy | 2.0.2 | |
| pandas | 2.2.3 | |
| scipy | 1.13.1 | |
| scikit-learn | 1.6.1 | usado en modelos; **oráculo** en los tests de `eval/` |
| pyarrow | 17.0.0 | lectura/escritura de parquet |
| LightGBM | **no disponible** | falla por `libomp.dylib` ausente → `HistGradientBoostingClassifier` |
| pytest | **no instalado** | las suites usan `unittest` |
| Node | v24.22.2 | `node_modules/.bin/vitest` presente |
| Vitest | 2.1.x | `package.json:15` |

**Comprobación:**

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab
./.venv/bin/python -c "import sys,numpy,pandas,scipy,sklearn,pyarrow; \
print(sys.version.split()[0], numpy.__version__, pandas.__version__, scipy.__version__, sklearn.__version__, pyarrow.__version__)"
# 3.9.6 2.0.2 2.2.3 1.13.1 1.6.1 17.0.0
```

---

## 2. Convención de artefactos

- `exp_id = EXP##_<slug>_<yyyymmdd>` (p. ej. `A06_EXP02_elo_20261109`, `EXP08_motor_b_open_20261109`).
- Cada `artifacts/<exp_id>/` debe contener `config.json`, `metrics.json`, `predictions.csv` (12 columnas del contrato) y `README.md`.
- Regla de trabajo: `test` (2024/25 + 2025/26) **no se usa** hasta congelar candidatos; `live` (2026/27) nunca.

---

## 3. Cadena completa: descarga → ETL → features → modelos → export → eval

Todos los comandos se ejecutan desde `research/prediction-lab/` salvo donde se indique.

### Paso 0 — Descarga (idempotente, ~465 CSV)

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab/research/prediction-lab
python3 etl/download_football_data.py            # añadir --force para re-descargar
```

Salida: `data/raw/main/<season>/<div>.csv` (17 divisiones × 27 temporadas) + `data/raw/extra/<CODE>.csv` (6 ligas) + `data/raw/manifest.json`.
**Verificación real:** manifest con `generated_at 2026-11-09T07:29:50+00:00`, **465 archivos, 465 con sha256, 0 fallos**; `data/raw` = 47 MB.

### Paso 1 — ETL canónico

```bash
./.venv/bin/python etl/build_matches.py
```

Salida: `data/processed/matches.parquet` + `matches.csv` + `coverage.json` + `data_quality_report.md` + `team_names.csv`.
**Esperado (v1.1):** 182.414 filas × 88 columnas, 23 divisiones, 42 etiquetas, 182.410 con resultado.

### Paso 2 — Validación de calidad

```bash
./.venv/bin/python etl/validators.py      # 73 checks; A04 lo ejecutó en ~22 s con exit 0 sobre v1.0
./.venv/bin/python -m unittest discover -s etl/tests -p "test_*.py"
```

**Estado real:** `validation_report.json` regenerado sobre v1.1 (**182.414** filas, 73 checks, 0 críticos) y suite **11/11 OK** (7,5 s) tras actualizar `etl/tests/test_validators.py:52`. El validador y el dataset están alineados.

### Paso 3 — Features

```bash
./.venv/bin/python features/build_features.py             # features.parquet (causal)
./.venv/bin/python features/build_market_features.py      # features_market.parquet (de-vig)
```

Salida esperada: `features.parquet` **182.410 × 198**; `features_market.parquet` **182.410 × 192** (regenerado tras v1.1; hash `360e95a2…`).
`build_features.py` escribe además el catálogo `reports/A05_feature_dictionary.md`.

### Paso 4 — Motor A (sin cuotas)

```bash
./.venv/bin/python models/a/train_motor_a.py --tag EXP01_baselines --no-test
```

Modelos: `base_rate`, `elo_ordered`, `logit`, `poisson_dc`, `hgb` (y `ensemble` opcional con `pipeline/make_ensemble.py`). Escribe `artifacts/EXP01_baselines_<fecha>/{pred_*.csv,predictions.csv,metrics.json,config.json}`.
**Estado:** `artifacts/EXP01_final_20261109/` **completo** (logit, hgb, elo_ordered, poisson_dc, base_rate y `pred_ensemble.csv` con pesos walk-forward). Es el artefacto que alimenta el cierre. `EXP01_baselines_20261109/` queda como histórico **pre-corrección** y no debe citarse: sus cifras (hgb 1,00730) incluían el leakage de priors.

### Paso 5 — Motor B (con cuotas)

```bash
./.venv/bin/python models/b/train_motor_b.py \
  --motor-a artifacts/EXP01_baselines_20261109 --base hgb \
  --phase open --tag EXP08_motor_b_open
```

Y el análisis de mercado:

```bash
./.venv/bin/python models/b/analysis/run_all.py          # ~93 s, 19/19 artefactos
```

`run_all.py` ejecuta `exp08a_devig.py`, `exp07_market_efficiency.py`, `exp08b_odds_classifier.py` y `exp13_movement.py`; escribe en `models/b/analysis/artifacts/`.

### Paso 6 — Export al contrato y evaluación

```bash
./.venv/bin/python pipeline/export_predictions.py --artifact artifacts/EXP01_baselines_20261109

./.venv/bin/python eval/report.py \
  --predictions artifacts/EXP01_baselines_20261109/predictions.csv \
  --matches data/processed/matches.parquet \
  --out-dir artifacts/EXP01_baselines_20261109 \
  --bins 10 --bootstrap-B 2000 --permutations 10000 --seed 20261109
```

Salida: `metrics.json` (`schema_version = a08-metrics/1.0`) y `metrics.md` con el comando de reproducción escrito dentro.

### Paso 7 — Suites de test

```bash
# Marco de evaluación (83 tests)
./.venv/bin/python -m unittest discover -s research/prediction-lab/eval/tests -p "test_*.py"
# Ran 83 tests ... OK   (verificado en esta sesión: 10.485 s)

# Validador ETL (11 tests; hoy 10/11 por la aserción de filas)
./.venv/bin/python -m unittest discover -s research/prediction-lab/etl/tests -p "test_*.py"
```

### Paso 8 — Experimentos de modelado (opcionales, reproducen A06)

```bash
./.venv/bin/python models/a/experiments/exp02_elo.py --workers 7      # 96 configs, ~6,6 min
./.venv/bin/python models/a/experiments/exp06_calibration.py          # ~4 min
./.venv/bin/python models/a/experiments/exp03_goals.py --workers 1    # ~30 min
./.venv/bin/python models/a/experiments/exp10_draws.py                # ~3 min
```

**Nota de infraestructura (A06):** `ProcessPoolExecutor` + `sklearn` abortó dos veces con `BrokenProcessPool` en este macOS para EXP03; la corrida válida se ejecutó con `--workers 1`.

### Paso 9 — Auditoría de features (opcional)

```bash
./.venv/bin/python features/audit_features.py --skip-ablation   # diccionario + leakage + calidad
./.venv/bin/python features/audit_features.py                   # + ablación, ~25 min
```

---

## 4. Semilla y determinismo

- **Semilla global `20261109`** en bootstrap, permutaciones, `train_test_split` de los tests y modelos (`train_motor_a.py:41` `SEED = 20261109`; `exp02`/`exp06`/`exp10`; `eval/report.py --seed 20261109`).
- `data/features/build_features.py` **no usa aleatoriedad**; `elo_block` es determinista.
- **Ruido esperado:** L-BFGS/Nelder-Mead difieren en el último ulp; HGB usa `random_state=SEED` pero el orden de hilos puede cambiar sumas de punto flotante. Las métricas se reportan con 5 decimales; diferencias de 1e-5 no son señal.
- `numpy`/`pandas`/`sklearn` fijados por versión: cambiar de versión puede cambiar una métrica en el último decimal y, con ella, un IC que roza el cero.

---

## 5. Hashes y rutas de artefactos (recalculados el 2026-11-09)

| Artefacto | Filas × cols | Bytes | SHA-256 |
|---|---|---:|---|
| `data/processed/matches.parquet` | 182.414 × 88 | 6.956.264 | `4a43d4ed36ec89e8f95ccbed9b4011168cb4f98ff07b7c8cd96d78e1f5e1e7e0` |
| `data/processed/features.parquet` | 182.410 × 198 | 75.901.221 | `f233cd0c20d75d64ab17a9dde330cc98c95e0a6c6ed30dadeea0356a8f184f0f` |
| `data/processed/features_market.parquet` | 182.410 × 192 | 58.521.357 | `360e95a2a4b3de719a29fa7e5143b441f0cc2a580c0095c31f09f084aef12251` |
| `artifacts/FINAL/predictions_test.csv` | 108.051 | 18.131.245 | `6950b97f4ffb0806…` (registrado en `metrics.md`) |
| `artifacts/model_v1/model_motor_a.json` | 77 cols | 12,7 KB | `53fbde0f4eb7b47141115d3b7659d3a5229f25169d8a6cc9915522cd17f88ca0` |
| `artifacts/model_v1/features_snapshot.json` | 200 filas | 248 KB | `bf1743619877720455b34d61902a30765715a54e0288c0c494beb627447eccc6` |
| `eval/artifacts/smoke/predictions.csv` | 362.536 | 65.026.334 | `b725bddd002fdc5b8b1363eff8cd0efd4065768cf2bcf63d169ae8c560ecdb12` |
| `eval/artifacts/smoke/metrics.json` | — | 706.490 | `d9a5d5aa27c6ebaadecaec626fbfad0d582bd3566bfcd6dd64ae9c52e821aabf` |
| `artifacts/A06_EXP02_elo_20261109/predictions.csv` | 116.830 | 21.177.989 | `bd187923c4afd46cecb130f9cfc234a4f9989fadab4bb0480c3dc17e714404e3` |
| `artifacts/A06_EXP06_calibration_20261109/predictions.csv` | 316.116 | 56.192.561 | `b597ffb5fa98dcf55cb972f11fc8b1c9f1d09a43a56f1cfe36fa14527580f63d` |
| `artifacts/EXP01_baselines_20261109/predictions.csv` | 1.181.718 (10 modelos) | 201.646.587 | `255609ea9ffbaca306d4018c209ac9bf665368f51081a8bae06b790e24ae7a00` |

**Hashes históricos que ya no coinciden (prueba de la regeneración):**

- A08 registró `matches.parquet` con `da31b8306bfee4eddbde8f47bd48c52754b9565c751cb7dbb90272e184056cc6` (181.272 filas).
- El hash actual es `4a43d4ed…` (182.414 filas). **La diferencia es el ETL v1.1**, no corrupción: `result nulls = 4` y 23 divisiones se mantienen.

**Comando para recalcular hashes:**

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab/research/prediction-lab
shasum -a 256 data/processed/*.parquet eval/artifacts/smoke/predictions.csv
```

---

## 6. Cómo verificar que el leakage de priors está corregido

Cuatro comprobaciones independientes; las cuatro deben pasar.

### 6.1 Inspección del código (la fuente)

`features/build_features.py:163-186` debe contener `agg.groupby(["div","team"])[stat_cols].shift(1)` **antes** del `rename` que convierte `season` en `target_season`, y el merge debe ser `left_on=[...,"season"]` / `right_on=[...,"target_season"]`. Si el `shift(1)` desaparece, el join vuelve a emparejar S con S+1.

### 6.2 Verificación empírica (S−1 vs S+1)

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab/research/prediction-lab
./.venv/bin/python - <<'PY'
import pandas as pd, numpy as np
m = pd.read_parquet("data/processed/matches.parquet"); m = m[m.result.notna()]
h = m[["div","season","home_team","home_goals","away_goals"]].rename(columns={"home_team":"team"})
h["pts"] = np.where(h.home_goals>h.away_goals,3,np.where(h.home_goals==h.away_goals,1,0))
a = m[["div","season","away_team","home_goals","away_goals"]].rename(columns={"away_team":"team"})
a["pts"] = np.where(a.away_goals>a.home_goals,3,np.where(a.home_goals==a.away_goals,1,0))
g = pd.concat([h[["div","season","team","pts"]], a[["div","season","team","pts"]]])
agg = g.groupby(["div","season","team"]).agg(n=("pts","size"), ppg=("pts","mean")).reset_index()
agg["sy"] = agg.season.str[:4].astype(int); agg = agg.sort_values(["div","team","sy"])
agg["prev"] = agg.groupby(["div","team"]).ppg.shift(1)
agg["nxt"]  = agg.groupby(["div","team"]).ppg.shift(-1)
f = pd.read_parquet("data/processed/features.parquet")[["match_id","div","season","home_team","home_prev_ppg"]]
f["sy"] = f.season.str[:4].astype(int)
j = f.merge(agg[["div","team","sy","prev","nxt"]].rename(columns={"team":"home_team"}),
            on=["div","home_team","sy"], how="left")
s1 = j[j.home_prev_ppg.notna() & j["prev"].notna()]
s2 = j[j.home_prev_ppg.notna() & j["nxt"].notna()]
print("S-1:", round(float((abs(s1.home_prev_ppg-s1["prev"])<1e-6).mean()),6), "n=", len(s1))
print("S+1:", round(float((abs(s2.home_prev_ppg-s2["nxt"])<1e-6).mean()),6), "n=", len(s2))
PY
```

**Salida esperada (v1.1):** `S-1: 0.996339 n= 163905` y `S+1: 0.024733 n= 151335`.
**Criterio:** S−1 debe ser > 0,99 y S+1 < 0,05. Si S+1 sube de 0,9, el join volvió a invertirse. (El 0,37 % que no coincide son equipos que cambian de división: el join agrupa por `div`.)

### 6.3 Test de viaje en el tiempo

```bash
./.venv/bin/python features/audit_features.py --skip-ablation
# revisar en features/feature_audit.json: leakage.time_travel -> columnas que difieren
```

**Esperado tras la corrección:** `season_progress` ya no depende de `max(match_date)` (`build_features.py:205-217` usa calendario fijo jul–jun / ene–dic), por lo que las columnas que difieren deben reducirse a las de priors por cambio de división. **Pendiente de re-ejecutar y registrar** (el JSON actual es de 02:43, anterior al parquet de 02:53).

### 6.4 Lista blanca de features

`models/a/train_motor_a.py:41-60` define `FEATURES` de forma explícita (sin `select_dtypes`). Comprobar que **no** contiene `elo_*_post`, `shots_*`, `sot_*`, `ht_*`, `y`, `home_goals`, `away_goals`, `result`, `goals_total` ni columnas `odds_*`/`mkt_*`.
**Pendiente:** el test que falla si se cuela una de esas columnas (A05 R2) **no está implementado**.

---

## 7. Qué **no** es reproducible

| Elemento | Por qué | Qué se puede hacer |
|---|---|---|
| **Cuotas con timestamp** | ninguna fuente gratuita lo publica (`notes.txt`: captura «Friday/Tuesday afternoons») | tratar apertura/cierre como escenarios; no afirmar CLV |
| **Snapshot v1.0 (181.272)** | fue reemplazado por v1.1; el hash de A08 ya no existe en disco | citar las cifras de A04/A05/A08 como «v1.0» y no mezclarlas con v1.1 |
| **Artefactos v1.0 con test** (`EXP01_baselines`, `EXP03_poisson_v2`, `eval_devval`) | contienen bloques `test` y métricas pre-corrección | solo `artifacts/FINAL/` es citable |
| **2026/27 (`live`)** | la temporada está en curso; football-data actualiza semanalmente | fechar cada ejecución; nunca usar `live` para seleccionar |
| **Resultados de A06/EXP01 de v1.0** | entrenados con priors S+1 | usar `EXP01_final` / `EXP05_hgb_final` / `EXP03_poisson_final`; v1.0 queda retirado (doc 07 §3) |
| **Scripts de A01/A09 en `/tmp`** | `vite-node --script /tmp/pitchlab_eval.ts` y sondas no se conservaron | el laboratorio nuevo (`eval/`) los sustituye con código versionado |
| **`evidence/statistical-tests/aztecavet-experiments.json`** | la suite legacy lo reescribe en cada ejecución; A09 lo restauró a `HEAD` | no usarlo como evidencia inmutable |
| **Understat / FBref** | caída / 403 en la ventana de verificación | reintentar antes de citar cualquier dato suyo |
| **PDF del paper** | descargado a `/tmp`, no archivado en el repo | re-descargar de `mdpi-res.com` (HTTP 200) y verificar el sha256 `9dc0f201…` |
| **LightGBM** | `libomp.dylib` ausente | `HistGradientBoostingClassifier` (misma familia) |
| **Paralelismo de EXP03** | `BrokenProcessPool` en macOS | `--workers 1` (más lento, mismo resultado) |
| **Tiempos de ejecución** | dependen de la máquina | se citan como orden de magnitud, no como benchmark |

---

## 8. Checklist de reproducción

**Rápida (~15 min, sin reentrenar):**

- [ ] `.venv` con las 6 versiones de §1.
- [ ] `shasum -a 256 data/processed/matches.parquet` = `4a43d4ed…`; `features.parquet` = `f233cd0c…`; `features_market.parquet` = `360e95a2…`.
- [ ] `./.venv/bin/python -m unittest discover -s research/prediction-lab/eval/tests -p "test_*.py"` → **83 OK**.
- [ ] `./.venv/bin/python -m unittest discover -s research/prediction-lab/etl/tests -p "test_*.py"` → **11 OK**.
- [ ] `npx vitest run tests/prediction/engine.test.ts` → **21/21**, `max|Δ| = 4,997e-13`.
- [ ] §6.2 imprime S−1 ≈ 0,996 y S+1 ≈ 0,025.
- [ ] `artifacts/FINAL/eval_test/metrics.md` reproduce logit 1,01802 y ensemble 1,01652.

**Completa (~2 h, de cero, sin reentrenar el cierre):**

- [ ] pasos 0→3 (descarga, ETL, features y features de mercado).
- [ ] paso 4 (Motor A) con `--no-test`; `make_ensemble.py` para los pesos walk-forward.
- [ ] paso 5 (Motor B, fase `open`).
- [ ] `combine_predictions.py` → `predictions_select.csv` (≤2023) para selección y `predictions_test.csv` solo con candidatos congelados.
- [ ] paso 6 (export + `eval/report.py`) y comparar `metrics.json` con `FINAL/eval_test/metrics.json`.
- [ ] paso 8 solo si se quiere reproducir A06 (96 configuraciones de Elo, calibración, goles, empates).
- [ ] anotar hash y fecha de cada parquet generado; si cambia la fuente, cambia el hash y **hay que reescribir las cifras**.

**Cierre de test (una sola vez, documentado):**

```bash
# 1) candidatos congelados en FREEZE.md (pre-registro)
# 2) predicciones de test de los candidatos + benchmarks
./.venv/bin/python pipeline/combine_predictions.py   --artifacts artifacts/EXP01_final_20261109,artifacts/EXP08_motor_b_final_20261109   --out artifacts/FINAL/predictions_test.csv
# 3) evaluación única
./.venv/bin/python eval/report.py --predictions artifacts/FINAL/predictions_test.csv   --matches data/processed/matches.parquet --out-dir artifacts/FINAL/eval_test   --bins 10 --bootstrap-B 2000 --permutations 10000 --seed 20261109
```

**Regla de oro del laboratorio:** ninguna cifra se publica sin `(comando, hash del dataset, semilla, n)`. Si falta uno de los cuatro, la cifra es una observación, no un resultado.

## Ciclo 4 — comandos nuevos

```bash
cd research/prediction-lab
./.venv/bin/python pipeline/registry.py list
./.venv/bin/python pipeline/registry.py verify --model-id motor_a_logistic_v1
./.venv/bin/python pipeline/validate_release.py        # gate de release (7 bloques)
./.venv/bin/python pipeline/experiment_calibration_division.py
cd ../.. && npx vitest run tests/prediction             # 45 tests (fútbol+NFL+de-vig)
```
