# PitchLab Prediction Lab — Coordinación maestra

**Orquestador:** Principal AI Engineer / Lead Quantitative Researcher
**Inicio:** 2026-11-09 (America/Mexico_City)
**Worktree aislado:** `/Users/jairbonilla/PitchLab-Prediction-Lab` (rama `prediction-lab`, base `8424876`)
**Repositorio original:** `/Users/jairbonilla/Desktop/Pitch Lab` (rama `main`, intacto)

Este documento es la fuente de verdad operativa. Cada agente lee su contrato en `TASKS.md`,
escribe su informe en `research/prediction-lab/reports/` y su estado en
`research/prediction-lab/coordination/status/<TASK_ID>.json`.
**Ningún subagente modifica `src/`, `tests/`, `docs/` ni el estado de git.**

---

## 1. Hechos verificados del entorno (2026-11-09)

| Hecho | Evidencia |
|---|---|
| Worktree creado y separado del original | `git worktree list` → `/Users/jairbonilla/PitchLab-Prediction-Lab  <sha> [prediction-lab]` |
| Delegación real disponible | herramientas `subagent`, `subagent_fork`, `workflow`; FS compartido; contextos aislados |
| Node/vitest operativo en el worktree | `node_modules` copiado (100 MB); `node_modules/.bin/vitest` presente |
| Python científico | `.venv` (Python 3.9.6 de `/usr/bin/python3`): numpy 2.0.2, pandas 2.2.3, scikit-learn 1.6.1, scipy 1.13.1 |
| LightGBM **no** disponible | falla por `libomp.dylib` ausente; se sustituye por `HistGradientBoostingClassifier` de sklearn (misma familia, sin deps externas) |
| Datos históricos accesibles | football-data.co.uk responde 200; E0 2000/01–2026/27 (2627 parcial: 90 partidos al 2026-11-09) |
| Ligas extra (MEX, ARG, BRA, USA, JPN, SWE) | `https://www.football-data.co.uk/new/<CODE>.csv`, desde 2012, **solo cuotas de cierre** |
| Artículo obligatorio | DOI `10.3390/computation14090195`, *Computation* 14(9):195, 24-ago-2026; PDF obtenido (**25 pp.** verificado) |

## 2. Diagnóstico inicial del repositorio (a confirmar por A01)

- Los motores existentes (`src/domain/aztecavet/{football,hockey,baseball}.ts`,
  `engine-nfl.ts`, `engine-ncaa.ts`) son **reconstrucciones con paridad** de heurísticas de
  terceros (Pitágoras → Log5 → Poisson + Dixon-Coles τ). No son modelos entrenados ni calibrados.
- Los tests actuales verifican **fidelidad al original**, no **calidad predictiva** (log-loss/Brier/RPS).
- No existe dataset histórico de partidos, ni particiones temporales, ni backtesting, ni
  comparación contra el mercado.
- `src/data/*.json` son instantáneas operativas (fixtures, equipos), no series históricas.

**Nota (A02, verificada):** el paper no dice que los modelos con cuotas "empaten" al bookmaker; la Tabla 13
muestra que **todos** son significativamente peores que el de-vig en log-loss, Brier y RPS (IC95% > 0).
El techo lo pone la información, no el algoritmo.

**Consecuencia:** el valor nuevo del lab es un motor estadístico entrenado, validado temporalmente,
calibrado y comparado contra el mercado; y un Motor B que use cuotas. Los motores reconstruidos
pasan a ser *baselines* de referencia (Elo heurístico / Pitágoras), no el objetivo.

## 3. Contratos compartidos

- Esquema canónico de datos y reglas anti-leakage: `CONTRACT_DATASET.md` (este directorio).
- Protocolo de evaluación: `CONTRACT_EVAL.md` (lo produce A08 y lo aprueba el orquestador).
- Convención de artefactos: `research/prediction-lab/artifacts/<exp_id>/...` con
  `config.json`, `metrics.json`, `predictions.csv`, `README.md`.
- `exp_id` = `EXP##_<slug>_<yyyymmdd>` (p. ej. `EXP03_dixoncoles_20261109`).

## 4. Protocolo de evaluación (resumen ejecutivo)

- **Desarrollo:** temporadas ≤ 2022/23 (todo el ajuste, selección e hiperparámetros).
- **Validación:** 2023/24 (única temporada para decidir candidatos finales).
- **Test reservado:** 2024/25 + 2025/26 (se evalúa **una sola vez** al congelar candidatos).
- **2026/27** es parcial: solo *monitorización*, nunca test.
- Métricas obligatorias y convenciones: ver `CONTRACT_EVAL.md`.
- Toda comparación se hace **sobre exactamente los mismos partidos** (intersección de filas con
  predicción válida), con bootstrap pareado por bloques (liga-temporada) para IC95 %.

## 5. Equipo y propiedad de archivos

| ID | Agente | Escribe únicamente en |
|---|---|---|
| A01 | Repository Auditor | `reports/A01_repository_audit.md`, `coordination/status/A01.json` |
| A02 | Scientific Researcher | `reports/A02_scientific_research.md`, `coordination/status/A02.json` |
| A03 | Data Source Researcher | `reports/A03_data_sources.md`, `coordination/status/A03.json` |
| A04 | Data Engineer | `etl/**`, `data/**`, `reports/A04_*.md` |
| A05 | Feature Engineering | `features/**`, `reports/A05_*.md` |
| A06 | Motor A | `models/a/**`, `reports/A06_*.md` |
| A07 | Motor B | `models/b/**`, `reports/A07_*.md` |
| A08 | Backtesting | `eval/**`, `reports/A08_*.md` |
| A09 | Adversarial Auditor | `reports/A09_*.md` |
| A10 | Integration | `src/domain/prediction/**`, `tests/prediction/**`, `reports/A10_*.md` |
| A11 | Documentation | `docs/predicciones/**`, `reports/A11_*.md` |

El orquestador es el único que modifica `pipeline/`, `config/`, `coordination/MASTER.md`
y `coordination/TASKS.md`.

## 6. Reglas de evidencia (obligatorias)

1. Cada afirmación técnica se marca **OBSERVADO** (comando/salida o archivo:línea), **INFERIDO**
   (razonamiento explícito) o **DESCONOCIDO**.
2. No se inventan papers, URLs, métricas ni resultados. Si no se pudo verificar, se dice.
3. Las cifras van con su comando reproducible, configuración y fecha.
4. Los informes no se rellenan: densidad técnica, tablas, rutas y comandos.
5. Ningún agente afirma haber ejecutado algo que no ejecutó.

## 7. Cola de trabajo

Ver `TASKS.md`. Estados: `pendiente → en progreso → en revisión → completada | bloqueada`.
El orquestador revisa cada entregable antes de desbloquear dependientes.

## 8. Registro de decisiones (ADR ligero)

| # | Fecha | Decisión | Motivo |
|---|---|---|---|
| D1 | 2026-11-09 | Trabajar en worktree `prediction-lab` separado | Aislamiento exigido por la misión; `main` intacto |
| D2 | 2026-11-09 | Python para investigación; TS para inferencia/integración | scikit-learn y pandas permiten experimentación reproducible; el artefacto final se exporta a JSON y se consume desde TS sin dependencias nuevas |
| D3 | 2026-11-09 | HistGradientBoosting en lugar de LightGBM | LightGBM requiere `libomp` ausente; HistGB nativo de sklearn, sin deps del sistema |
| D4 | 2026-11-09 | football-data.co.uk como fuente primaria de fútbol | Gratuita, 26 temporadas, 1X2 apertura+cierre, licencia a revisar por A03 |
| D5 | 2026-11-09 | Cuotas de cierre = benchmark de mercado, no feature de un modelo "pre-partido" | football-data no publica timestamps; documentar y no simular disponibilidad inexistente |
| D6 | 2026-11-09 | Presupuesto de esfuerzo: features + calibración > arquitecturas | Sallis et al. (2026): 6 clasificadores difieren ≤0,08 pp sin cuotas; con cuotas todos son peor que el de-vig en log-loss/Brier/RPS (verificado en PDF, Tabla 13) |
| D7 | 2026-11-09 | El empate no se decide por argmax: se reporta P(X) calibrada | Draw es ~25% del test y ningún modelo con cuotas lo predice por argmax (paper, §3); accuracy no es criterio de aceptación |
| D8 | 2026-11-09 | Benchmark de mercado = Betfair Exchange (BFE) y Pinnacle de cierre, de-vig power/Shin | Exchange y Pinnacle son los precios más afilados; B365 tiene ~7% de margen |
