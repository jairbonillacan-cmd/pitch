# A16 — Registro de modelos y validación de release

**Implementación:** orquestador (el subagente A16 se interrumpió sin entregable).
**Artefactos:** `research/prediction-lab/registry/models.json`,
`research/prediction-lab/registry/release_report.json`,
`research/prediction-lab/pipeline/{registry.py,validate_release.py}`,
`research/prediction-lab/pipeline/tests/test_registry.py`.

---

## 1. Qué resuelve

Hasta ahora el "modelo desplegado" era un JSON suelto sin trazabilidad formal: sabíamos su hash
porque estaba en el model card, pero no había un objeto canónico que dijera **qué versión está en
producción, con qué métricas, con qué artefacto y quién la promovió**. El registro cierra ese hueco
y convierte el cierre de cada ciclo en un acto explícito (`promote`), verificable.

## 2. Esquema

`registry/models.json`:

```json
{
  "schema_version": 1,
  "updated_at": "...",
  "models": [
    {
      "model_id": "motor_a_logistic_v1",
      "sport": "football",
      "status": "deployed",
      "deployed_version": "1.0.0",
      "versions": [
        {
          "version": "1.0.0",
          "artifact_path": "../../src/data/prediction/model_motor_a.json",
          "artifact_sha256": "53fbde0f…",
          "n_features": 77,
          "registered_at": "...",
          "metrics": {"val_log_loss": 1.01029, "test_log_loss": 1.01802, "metrics_path": "..."},
          "notes": "..."
        }
      ]
    }
  ]
}
```

## 3. CLI

| Comando | Efecto |
|---|---|
| `register` | valida esquema, calcula sha256 y añade versión (no sobrescribe; misma versión + hash distinto = error) |
| `verify --model-id` | recalcula sha256 y revalida el esquema; exit 1 si algo falla |
| `promote --version --to` | exige `verify` correcto **y** métricas val+test registradas |
| `list [--json]` | inventario legible/determinista |

## 4. Modelos registrados

| Modelo | Deporte | Versión | sha256 | Val log-loss | Test log-loss | Estado |
|---|---|---|---|---|---:|---:|---|
| `motor_a_logistic_v1` | fútbol | 1.0.0 | `53fbde0f…f88ca0` | 1,01029 | 1,01802 | **deployed** |
| `nfl_logistic_v1` | NFL | 1.0.0 | `2df66ee8…ca6f` | 0,64503 | 0,65906 | **deployed** |

## 5. Validación de release (`validate_release.py`)

Ejecutada en esta sesión; todos los bloques en verde:

| Bloque | Resultado |
|---|---|
| `registry` (hash + esquema de los 2 modelos) | ✅ |
| `snapshots` de paridad presentes | ✅ |
| `ts_parity` (`npx vitest run tests/prediction`) | ✅ 32 tests |
| `eval_tests` (83) | ✅ |
| `etl_tests` (11) | ✅ |
| `registry_tests` (7) | ✅ |
| `data_hashes` (`matches.parquet`, `features.parquet`) | ✅ |

`RELEASE: OK` → `registry/release_report.json`. Cualquier fallo devuelve exit code 1.

## 6. Tests del registro (7)

Registro con sha/métricas; duplicado idéntico = no-op; misma versión con hash distinto = error;
`verify` detecta manipulación del artefacto; `promote` sin métricas = error; `promote` correcto
actualiza estado; `list --json` produce JSON válido.

## 7. Limitaciones

1. **Sin firma criptográfica**: el hash protege la integridad, no la procedencia. En producción
   habría que firmar el registro (p. ej., sigstore) o guardarlo en un almacén inmutable.
2. **Sin CI real**: `validate_release.py` es un gate manual; tendría que ejecutarse en cada PR.
3. Las rutas son relativas al laboratorio; si el worktree se mueve, hay que re-registrar.
4. No hay retraining automático: el registro documenta releases, no los dispara.
5. No versiona datasets (solo hashes); el manifest de datos vive en `data/processed/`.
