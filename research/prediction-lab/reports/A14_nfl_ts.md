# A14 — Integración TypeScript del motor NFL

**Implementación:** orquestador. El subagente A14 se interrumpió tras ~50 minutos sin entregable
(no copió artefactos ni escribió tests); el trabajo se completó directamente y aquí se documenta con
evidencia. **No** es una auditoría independiente.

**Artefactos:** `src/data/prediction/model_nfl.json` (`sha256 2df66ee8…ca6f`) y
`src/data/prediction/nfl_snapshot.json` (`d20342c9…fee2`), copias byte a byte de
`research/prediction-lab/artifacts/model_nfl/`.

---

## 1. Contrato

`src/domain/prediction/types.ts` añade:

- `Sport = "football" | "nfl"`; `Prediction.sport` (obligatorio).
- `NFLModelArtifact` (features, `scaler`, `coef` 3×24, `intercept`, `classes`, `class_map`).
- `NFLSnapshotRow` / `NFLSnapshotFile`.
- `PredictionRequest` (unión discriminada fútbol/NFL).

`src/domain/prediction/engine.ts` añade:

| Función | Contrato |
|---|---|
| `assertValidNFLModel(model)` | 24 features, 3 clases {0,1,2}, coef/intercept/escalador coherentes, versión y fecha no vacías |
| `predictNFL(row, model)` | imputa `null` con la media del escalador (≡ 0 estandarizado), estandariza, softmax estable, valida simplex 1±1e-9 |
| `predictForSport(request)` | despacha a fútbol (`predictWithFallback`, con Motor B si hay cuotas) o NFL |

**Mapeo de clases:** `classes=[0,1,2]` → **0 = H (local), 1 = T (empate), 2 = A (visitante)**. La
salida usa `pHome`, `pDraw` (empate) y `pAway`; se documenta explícitamente porque en NFL "draw" es
una clase residual (0,22 % de los partidos). El motor reordena si el artefacto serializara otro orden.

## 2. Paridad numérica

- 200 partidos de 2025, **600 comparaciones** contra `probs_python`.
- **max |Δ| = 4,996×10⁻¹³**; tolerancia contractual 1e-9 (margen ~2.000×). El residuo es el
  redondeo a 12 decimales de `export_model_nfl.py`, igual que en fútbol.
- `tests/prediction/nfl.test.ts`: **11 tests** (artefacto, paridad, determinismo, inmutabilidad,
  imputación de nulls, longitud incorrecta, valor no finito, despacho por deporte y mercado).
- Suite completa: **448 tests** (437 previos + 11 NFL), 11 archivos, todos en verde.

## 3. Decisiones

1. **Features precalculadas en Python.** Igual que en fútbol: TypeScript no reconstruye Elo/forma;
   aplica el artefacto sobre el vector de diseño. Mantiene la paridad exacta y evita duplicar la
   lógica causal en dos lenguajes.
2. **Imputación por media.** El artefacto NFL no incluye `SimpleImputer` porque el diseño no tenía
   NaN; para robustez, `null` se sustituye por la media (0 tras estandarizar). Documentado y testeado.
3. **Sin dummies de división.** A diferencia de fútbol, NFL no tiene divisiones comparables; el
   artefacto define `n_features = features.length = 24`.
4. **`sport` obligatorio en `Prediction`.** Cambio compatible: los tests de fútbol usan *spread* y
   siguen pasando; el campo permite enrutar en el backend.

## 4. Limitaciones

- No es inferencia end-to-end desde fixtures NFL: requiere que el pipeline Python publique el vector
  de features (o que se implemente el feature store en TS).
- El modelo NFL no incorpora EPA en su versión exportada (ver A15: la mejora no fue concluyente).
- Los empates son tan raros que `pDraw` tiene poco uso práctico; se mantiene por contrato.
- La licencia de nflverse exige atribución (CC BY 4.0), incluida en el artefacto (`metadata.source`).

## 5. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python pipeline/export_model_nfl.py     # regenera model_nfl.json + snapshot
cp artifacts/model_nfl/model_nfl.json ../../src/data/prediction/
cp artifacts/model_nfl/nfl_snapshot.json ../../src/data/prediction/
cd ../.. && npx vitest run tests/prediction
```
