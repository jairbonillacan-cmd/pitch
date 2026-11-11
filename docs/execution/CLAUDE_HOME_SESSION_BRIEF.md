# Brief de arranque · Rama `gemini-reestructura`

> **Fecha de corte:** 2026-11-11 · **Rama:** `gemini-reestructura` (la que irá a `main` cuando esté lista)
> **Para:** cualquier sesión (Claude, Gemini u otra) que retome el trabajo.

## 1. Dónde estamos

- **UI v4.1 (Gemini):** 7 rutas públicas y 11 vistas del club con el sistema visual *Smoked Glass*. Referencia visual: `design/prototipo-maestro/prototipo-maestro-pitchlab.html`.
- **Motores Spacetime Suite v3.0:** paquete `packages/spacetime`, copia de la rama `prediction-lab` (ver su [README](../../packages/spacetime/README.md)). La app los corre en servidor en `apps/web/src/server/spacetime.ts`.
- **Regla de datos verificables ([ADR-027](../architecture/adr/ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md)):** nada inventado en la UI. Sin momio verificado se muestra el momio justo y «Sin momio»; el contenido de demostración lleva la etiqueta «Ejemplo».
- **Datos:** snapshots de 7 ligas en `data/snapshots/` (Liga MX desde ESPN; Europa desde openfootball + football-data.org; NFL desde nflverse). La matriz de momios v3.0 viene de `prediction-lab`.

## 2. Ramas y responsabilidades

| Rama | Para qué |
|---|---|
| `gemini-reestructura` | Front, app y todo lo que irá a `main`. |
| `prediction-lab` | Mejorar motores y regenerar la matriz de momios (`live_matchday_v3_snapshot.json`). |
| `web-scraping` | Scrapers y feature store que alimentan a `prediction-lab`. |
| `REA-stats` | Investigación forense de referencia. |

Para traer motores nuevos: `git fetch origin prediction-lab && pnpm --filter @pitchlab/spacetime sync`.

## 3. Levantar y verificar

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm e2e   # detén `pnpm dev` antes: comparten .next
pnpm snapshot            # regenera data/snapshots (usa FOOTBALL_DATA_API_KEY de .env)
```

- En desarrollo el servidor acepta el código de acceso de `.env` (`PITCHLAB_BETA_CODE`) o, si falta, el valor por defecto de desarrollo de `beta-auth.ts`. En producción el código **debe** venir de una variable de entorno.
- Herramientas de revisión (selector de rol, barra de 11 vistas): encendidas en desarrollo; en producción solo con `PITCHLAB_PREVIEW_TOOLS=1`.
- Vigencia de momios: `PITCHLAB_MAX_ODDS_AGE_HOURS` (72 h por defecto).

## 4. Reglas del repositorio

1. Cero colores hex fuera de `packages/tokens` (`node scripts/lint-codebase.mjs`).
2. FD-16: sin nombres de proveedores ni jerga de modelado en la UI. Los factores del motor se traducen en `spacetime.ts` (`DRIVER_LABELS`).
3. Cero-Fuga: la redacción para visitantes ocurre en servidor (`platform-data.ts`).
4. Modales con `<TopLayerModalDialog>` (`<dialog>` nativo).
5. WCAG 2.1 AA en oscuro y claro; sin scroll horizontal de 375 a 1440 px.
6. Nunca `git add .`: rutas explícitas.
7. ADR-027: ningún número en pantalla sin fuente.

## 5. Pendientes

Ver la sección «Pendiente» de [PROJECT_STATE.md](./PROJECT_STATE.md).
