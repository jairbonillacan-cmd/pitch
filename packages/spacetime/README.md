# @pitchlab/spacetime

Motores de **PitchLab Spacetime Suite v3.2** (Tachyon, Singularity, Minkowski, Geodesic, multideporte y el panorama público por mercado `MatchOutlook`) que usa la app.

> **v3.2 (2026-11-13, `prediction-lab` `2960d77`):** el sync reescribe las rutas de investigación (`../../data/prediction/` → `../data/`, raíz del repo → raíz del paquete) y omite con `it.skip` las pruebas que solo se pueden verificar en `prediction-lab` (Python en `research/.venv`, artefactos de `services/models`, `data/ledger` y el SHA de la copia CRLF). Cada omisión queda con su motivo en `SOURCE.json → patches`. La ficha del partido lee `outlooks` del snapshot con `apps/web/src/server/outlook.ts`.

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

`scripts/sync-from-prediction-lab.mjs` puede aplicar correcciones mínimas (lista `PATCHES`) mientras no estén en `prediction-lab`. Hoy no hay ninguna: el error de tipos de `service.ts` se corrigió allá (`263857a`). Si un parche deja de aplicar, el sync falla a propósito: significa que ya se corrigió allá y hay que borrarlo de la lista `PATCHES`.

## Cómo lo usa la app

`apps/web/src/server/spacetime.ts` corre el motor en el servidor para cada partido de `data/snapshots/`:

- Partido en la matriz en vivo de v3.0: probabilidad final con mercado, momios reales de la casa y valor de Geodesic v2.0.
- Partido fuera de la matriz: probabilidad deportiva desde las fichas de equipo, **sin momios ni valor**.
- Equipo sin ficha: el partido usa el modelo del snapshot.

La UI nunca inventa momios: si no hay mercado verificado, muestra el momio justo y «Sin momio».

La matriz en vivo (`data/live_matchday_v3_snapshot.json`) se genera en `prediction-lab` con `run_matchday_refresh.py`; para tener momios del día hay que regenerarla allá y volver a sincronizar.
