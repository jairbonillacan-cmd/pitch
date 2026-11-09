# Cierre de test — artefacto SOLO de test

`metrics.json` / `metrics.md` de este directorio contienen **exclusivamente la partición `test`**
(2024/25 + 2025/26, 16.126 partidos). No deben interpretarse como la foto completa del ciclo:

- Métricas de `val` que justifican la selección: `artifacts/FREEZE.md` §1–2 y
  `artifacts/candidate_selection.json`.
- Métricas walk-forward (dev/val/test) de cada modelo: `artifacts/EXP01_final_20261109/metrics.json`,
  `artifacts/EXP05_hgb_final_20261109/metrics.json`, `artifacts/EXP03_poisson_final_20261109/metrics.json`.
- Comparaciones pareadas completas (dev/val/test): el propio `metrics.json` de esta carpeta.
- Monitorización live 2026/27 (no test): `artifacts/FINAL/monitoring_live.md`.

**Advertencia de integridad (A09c D1/D3):** el freeze se creó a las 03:35:07, antes de esta
evaluación (03:36:17), pero fue editado después para añadir resultados; durante el desarrollo se
inspeccionaron `metrics.json` intermedios con columna `test`. Ninguna decisión de selección usó esas
cifras (selección en `val`), pero el cierre **no es un pre-registro inmutable**. Ver
`docs/predicciones/14_AUDITORIA_ADVERSARIAL.md`.
