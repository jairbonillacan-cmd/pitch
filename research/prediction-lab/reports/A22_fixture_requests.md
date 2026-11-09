# A22 — Camino de producto completo: fixtures → features → servicio TS

**Implementación:** orquestador (ciclo 9). Cierra el último tramo funcional: hasta ahora el
servicio TypeScript consumía vectores de features "de algún sitio"; ahora existe un artefacto de
peticiones por fixture, generado por el pipeline Python, que el servicio sirve directamente y con
paridad verificada.

**Artefactos:** `pipeline/export_fixture_requests.py`,
`src/data/prediction/fixture_requests.json` (150 fixtures, 0,19 MB),
`tests/prediction/fixture_requests.test.ts`.

---

## 1. Flujo

1. Snapshot de cuotas (A13) → 160 fixtures.
2. `fixture_features.py` reconstruye el estado de los equipos y calcula las 54 features (paridad
   300/300 con `features.parquet`).
3. `export_fixture_requests.py` emite por fixture: `div`, `season`, `date`, `features`,
   `divOnehot` (23), `marketProbs` (de-vig power B365) y `probsPython` (oráculo).
4. El servicio TS (`predictMatch`) consume la petición y devuelve la `Prediction` con el contrato
   completo (simplex, `modelId`, versión, `sport`).

## 2. Cobertura y paridad

| Métrica | Valor |
|---|---:|
| Fixtures exportados | **150** (10 excluidos de SC2/SC3) |
| Con mercado de-vigado | 150/150 |
| Features por petición | 54 |
| División one-hot | 23 (exactamente un 1) |
| **Paridad TS↔Python** | **max\|Δ\| = 9,416×10⁻¹³** en 150 fixtures (450 comparaciones) |

La paridad es del mismo orden que la del snapshot histórico (4,997×10⁻¹³): el redondeo a 12
decimales domina el error, no la lógica.

## 3. Qué demuestra

- El producto puede pasar de un fixture real a una predicción servida por TypeScript **sin que el
  backend tenga que reimplementar Elo, forma o priors**: Python calcula el vector, TS aplica el
  modelo.
- El contrato de entrada (`features`, `divOnehot`) y el de salida (`Prediction`) están congelados y
  probados.
- La comparación con el mercado del mismo snapshot viaja en la propia petición, así que el frontend
  o el backend pueden mostrar modelo vs mercado sin recalcular el de-vig.

## 4. Limitaciones

- El cálculo de features sigue en Python: no es inferencia TS end-to-end. Para producción haría
  falta o bien servir el vector desde el backend (lo que hace este artefacto) o portar
  `fixture_features` a TS (mayor esfuerzo y riesgo de divergencia).
- Las peticiones son de un snapshot concreto; caducan cuando cambian las cuotas o los resultados.
- No incluye NFL (su pipeline es independiente y no tiene adaptador de fixtures).

## 5. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python pipeline/export_fixture_requests.py
cd ../.. && npx vitest run tests/prediction/fixture_requests.test.ts
```
