# @pitchlab/spacetime

Motores de **PitchLab Spacetime Suite v5.1** (superficie congelada de producción `v3.0/v3.1/v3.2` + suite candidata `v5.1`: Tachyon v5.1, Meridian v2/v3/v5, Horizon-Goals 3/4-Param, Micro-Mercados fútbol, Props jerárquicos, Minkowski NFL v5, Multideporte v4, SGP Cópula Student-t, Early Payout / In-Play, Bandas Epistémicas Conformales Venn-Abers y Guardrail Anti-Alucinación).

> **v5.1 (2026-11-19, `prediction-lab` `d6dfed5`):** 35 módulos TypeScript, 94 artefactos JSON (incl. `candidate_registry_v5_1.json` y `live_matchday_v5_candidate_snapshot.json`) y 26 suites Vitest (incl. axiomas Red-Team `v5_1_remediation.test.ts`), preservando con `0` bytes modificados los 11 artefactos congelados `v3.0/v3.1/v3.2`. La suite v5.1 está expuesta tanto en el namespace `spacetimeV5` de `@pitchlab/spacetime` como por subruta `@pitchlab/spacetime/v5`. El sync reescribe rutas de investigación y omite con `it.skip` únicamente las pruebas que invocan Python local, artefactos en `research/prediction-lab` o SHA CRLF de Windows (motivos registrados en `SOURCE.json → patches`).

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

### Parches y resguardo de snapshot vivo

`scripts/sync-from-prediction-lab.mjs` aplica los parches documentados en `PATCHES` (registrados en `SOURCE.json`):

- Extensiones retrocompatibles consumidas por `@pitchlab/web` y `@pitchlab/ingest` (`OddsLineMovement` y campos opcionales de movimiento/mejor cuota en `src/odds.ts`; `oddsBySelection` en `MarketQuoteContext` dentro de `src/outlook.ts`) sin alterar ningún cálculo congelado `v3.0/v3.1/v3.2`.
- Omisiones (`it.skip`) de pruebas que dependen de Python local, artefactos de `research/` o hashes CRLF de Windows en `prediction-lab`.
- Resguardo de frescura en `data/live_matchday_v3_snapshot.json`: si el corte local/CI (`regenerate-live-snapshot.ts`) tiene un `generated_at` más reciente que el de `prediction-lab`, el sync lo conserva para no degradar cuotas reales ni `oddsBySelection`.

Si un parche deja de aplicar, el sync falla a propósito: significa que ya se integró en `prediction-lab` y hay que retirarlo de `PATCHES`.

## Cómo lo usa la app

`apps/web/src/server/spacetime.ts` corre el motor en el servidor para cada partido de `data/snapshots/`:

- Partido en la matriz en vivo de v3.0: probabilidad final con mercado, momios reales de la casa y valor de Geodesic v2.0.
- Partido fuera de la matriz: probabilidad deportiva desde las fichas de equipo, **sin momios ni valor**.
- Equipo sin ficha: el partido usa el modelo del snapshot.

La UI nunca inventa momios: si no hay mercado verificado, muestra el momio justo y «Sin momio».

La matriz en vivo (`data/live_matchday_v3_snapshot.json`) se genera en `prediction-lab` con `run_matchday_refresh.py`; para tener momios del día hay que regenerarla allá y volver a sincronizar.
