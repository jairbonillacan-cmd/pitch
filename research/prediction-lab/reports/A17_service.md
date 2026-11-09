# A17 — De-vig en TypeScript y servicio de predicción

**Implementación:** orquestador (el subagente A17 se interrumpió sin entregable tras ~30 min).
**Alcance:** `src/domain/prediction/devig.ts`, `src/domain/prediction/service.ts`,
`tests/prediction/devig.test.ts` y el campo opcional `marketMethod` en `Prediction`.

---

## 1. Qué se resolvió

El motor (`predictWithFallback`) esperaba **probabilidades ya de-vigadas**, pero nadie las calculaba
en TypeScript: el backend habría tenido que replicar el de-vig de Python o pasar probabilidades
inventadas. Ahora el servicio acepta **cuotas decimales crudas** y hace el de-vig internamente.

## 2. Métodos de de-vig

| Método | Fórmula | Nota |
|---|---|---|
| `proportional` | `p_i = (1/o_i) / Σ(1/o_j)` | normalización simple |
| `power` | `p_i = (1/o_i)^α`, α tal que `Σp = 1` | **por defecto** (mejor en A07) |
| `shin` | `p_i = (√(z² + 4(1−z)q_i²/Q) − z) / (2(1−z))`, z tal que `Σp = 1` | Shin (1993) |

- Validación: exactamente 3 cuotas, finitas y `> 1`; `Σ(1/o) ∈ [0.9, 1.2]` (regla del snapshot
  A13, que descarta los outliers BFE de 2,13).
- Bisección monótona (200 iteraciones máx., tolerancia 1e-12) en `power` y `shin`. Si Shin no
  converge, error controlado `InvalidOddsError` (no se devuelven probabilidades inventadas).
- **Paridad con Python** en 3 tripletes reales de football-data
  (`mkt_open_b365_power_*`): diferencia ≤ **1e-10** en las 9 componentes.

## 3. Servicio `predictMatch`

```ts
predictMatch({ sport: "football", row, model, odds? , oddsMethod? , baseRates? })
predictMatch({ sport: "nfl", row, model })
predictMatchBatch(requests)
```

Reglas:
1. Fútbol con cuotas válidas → de-vig (método pedido, por defecto `power`) → Motor B
   (`market_devig`) y `marketMethod` en la salida.
2. Fútbol sin cuotas → Motor A.
3. Fútbol con cuotas inválidas/implausibles → Motor A con `dataQualityFlag="fallback_motor_a"`
   (se conserva el aviso de que el mercado falló).
4. NFL → motor NFL; las cuotas se ignoran (documentado: el mercado NFL se evaluó por separado y no
   forma parte del contrato de producción actual).

## 4. Pruebas

`tests/prediction/devig.test.ts`: **14 tests**.
- overround y normalización; valores exactos del caso `[2.0, 3.5, 4.0]`;
- `power`/`shin` suman 1 a 1e-12; determinismo; cuotas ≤1, longitudes y NaN → error;
- overround absurdo (2,13) → error;
- paridad con Python (3 casos reales, ≤1e-10);
- servicio: mercado, método pedido, sin cuotas, odds inválidas → fallback, NFL, lote determinista.

**Suite completa del worktree: 462 tests en 12 archivos, todos en verde** (448 previos + 14).

## 5. Limitaciones

- No implementa CLV ni series temporales de cuotas: solo el de-vig puntual.
- El método por defecto (`power`) es el mejor en la evaluación histórica, pero la diferencia con
  `proportional` es ~0,0002 de log-loss; no es una decisión crítica.
- Las cuotas de cierre siguen sin ser operables; el servicio no distingue apertura/cierre (el
  llamador decide qué precio pasa).
- El servicio no valida que la fila de features corresponda al mismo partido que las cuotas.

## 6. Reproducibilidad

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab
npx vitest run tests/prediction/devig.test.ts
npx vitest run        # 462 tests
```
