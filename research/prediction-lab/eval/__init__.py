"""Laboratorio de evaluación y backtesting de PitchLab (tarea A08).

Módulos
-------
* :mod:`eval.metrics` — métricas multiclase con las convenciones exactas del
  contrato (log-loss natural, Brier, RPS, accuracy, calibración/ECE, OvR).
* :mod:`eval.splits` — particiones canónicas ``dev/val/test/live`` y folds
  walk-forward (expanding/rolling) con corte temporal anti-leakage.
* :mod:`eval.compare` — bootstrap pareado por bloques temporada×división, test
  de permutación y alineación estricta por ``match_id``.
* :mod:`eval.report` — generación reproducible de ``metrics.json`` y
  ``metrics.md`` a partir de ``predictions.csv`` + ``matches.parquet``.

Este paquete no depende de ``src/`` ni modifica datos: es el árbitro de las
comparaciones entre modelos del laboratorio.
"""

__version__ = "1.0.0"
__all__ = ["metrics", "splits", "compare", "report"]
