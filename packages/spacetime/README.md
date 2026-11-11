# @pitchlab/spacetime

Motores de **PitchLab Spacetime Suite v3.0** (Tachyon, Singularity, Minkowski, Geodesic y multideporte) que usa la app.

## De dónde salen

Los motores **se mejoran en la rama `prediction-lab`**. Este paquete solo guarda una copia:

| Carpeta | Viene de (`prediction-lab`) |
| --- | --- |
| `src/` | `src/domain/prediction/*.ts` |
| `data/` | `src/data/prediction/*.json` (modelos y matriz en vivo, ~4 MB) |
| `tests/` | `tests/prediction/*.test.ts` |

`SOURCE.json` dice de qué commit es la copia. **No edites `src/`, `data/` ni `tests/` aquí**: el siguiente sync los reemplaza.

## Traer una versión nueva

```bash
git fetch origin prediction-lab
pnpm --filter @pitchlab/spacetime sync
pnpm --filter @pitchlab/spacetime test
pnpm typecheck
```

El script admite otra referencia: `node packages/spacetime/scripts/sync-from-prediction-lab.mjs <rama-o-commit>`.

### Parches

`scripts/sync-from-prediction-lab.mjs` aplica correcciones mínimas mientras no estén en `prediction-lab` (hoy: un error de tipos en `service.ts`). Si un parche deja de aplicar, el sync falla a propósito: significa que ya se corrigió allá y hay que borrarlo de la lista `PATCHES`.

## Cómo lo usa la app

`apps/web/src/server/spacetime.ts` corre el motor en el servidor para cada partido de `data/snapshots/`:

- Partido en la matriz en vivo de v3.0: probabilidad final con mercado, momios reales de la casa y valor de Geodesic v2.0.
- Partido fuera de la matriz: probabilidad deportiva desde las fichas de equipo, **sin momios ni valor**.
- Equipo sin ficha: el partido usa el modelo del snapshot.

La UI nunca inventa momios: si no hay mercado verificado, muestra el momio justo y «Sin momio».

La matriz en vivo (`data/live_matchday_v3_snapshot.json`) se genera en `prediction-lab` con `run_matchday_refresh.py`; para tener momios del día hay que regenerarla allá y volver a sincronizar.
