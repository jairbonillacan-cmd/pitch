# PitchLab Prediction Lab

**Informe final del programa:** [`FINAL_REPORT.md`](FINAL_REPORT.md) — resultados, evidencia y próximos pasos.

Laboratorio de investigación del motor de predicciones 1X2 de PitchLab. Vive en un worktree
aislado (`prediction-lab`) para no tocar los motores reconstruidos de `main`.

## Mapa

```
research/prediction-lab/
├── coordination/       MASTER.md, TASKS.md, MASTER_SUMMARY.md, contratos, status/<ID>.json
├── etl/                descarga + construcción del dataset canónico + validadores
├── data/raw/           465 CSV de football-data.co.uk (manifest con sha256)
├── data/processed/     matches.parquet, features.parquet, features_market.parquet
├── features/           generación causal de features (Elo, forma, descanso, priors)
├── models/a/           Motor A (sin cuotas): baselines, Elo, logit, Poisson-DC, HGB, ensemble
├── models/b/           Motor B (con cuotas): de-vig, pools, stacking, corrección residual
├── eval/               métricas, particiones, bootstrap pareado, reportes (A08)
├── pipeline/           exportación al contrato de predicciones y ensembles
├── artifacts/          <exp_id>/{predictions.csv, metrics.json, metrics.md, config.json}
└── reports/            informes de cada subagente
```

## Reproducir desde cero

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab/research/prediction-lab
python3 etl/download_football_data.py          # ~465 CSV, idempotente (cache + sha256)
./.venv/bin/python etl/build_matches.py        # matches.parquet + coverage + quality report
./.venv/bin/python features/build_features.py  # features.parquet (causal)
./.venv/bin/python features/build_market_features.py
./.venv/bin/python models/a/train_motor_a.py --tag EXP01_baselines --no-test
./.venv/bin/python models/b/train_motor_b.py --motor-a artifacts/EXP01_baselines_<fecha> --tag EXP08_motor_b
./.venv/bin/python pipeline/export_predictions.py --artifact artifacts/EXP01_baselines_<fecha>
./.venv/bin/python -m eval.report --predictions artifacts/EXP01_baselines_<fecha>/predictions.csv \
    --matches data/processed/matches.parquet --out-dir artifacts/EXP01_baselines_<fecha>/eval
```

## Entorno

- Python 3.9.6 (`.venv`): numpy 2.0.2, pandas 2.2.3, scipy 1.13.1, scikit-learn 1.6.1, pyarrow 17.
- LightGBM no es instalable en esta máquina (falta `libomp`): se usa `HistGradientBoostingClassifier`.
- Node: vitest 2.1 para los tests del dominio existente.

## Reglas

1. Ninguna predicción usa información posterior a la fecha del partido (ver `CONTRACT_DATASET.md`).
2. `test` (2024/25 + 2025/26) se evalúa **una sola vez**, con candidatos congelados.
3. Toda comparación es sobre la intersección exacta de `match_id`.
4. Ningún resultado se reporta sin su comando reproducible.
