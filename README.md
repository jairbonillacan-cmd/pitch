# Pitch — Reconstrucción de TOUCH IQ (touchiq.com.mx)

Reconstrucción local independiente del motor y la aplicación TOUCH IQ, realizada por
ingeniería inversa del cliente público con **REA** (rea-agents@6.8.0) y verificada por
ejecución contra la app viva. Ver `docs/` (17 documentos) y `CLONE-BLUEPRINT.md`.

## Estado
- ✅ **Dominio completo y verificado**: motor NFL (Pitágoras→Log5→curvas normales, pick 80/20),
  motor NCAA (conferencias + SHR), props, bankroll/EV/sizing/noVig — **24/24 tests dorados** y
  **verificación batch vs el motor original: Δ=0.000e+0 en 46 juegos × 15 mercados** (14 NFL + 32 NCAA).
  Informes técnicos por deporte: `Reportes/docs/18-engine-nfl-report.md`, `Reportes/docs/19-engine-ncaa-report.md`.
- ✅ **Datos**: 16 datasets extraídos a `src/data/*.json` (instantánea 7 nov 2026, fuentes citadas).
- 🔲 **UI** (lock/home/tableros/boleto/IA/simulador): pendiente — plan en `docs/12-implementation-plan.md`.

## Comandos
```bash
npm install
npm test        # 24 tests dorados del dominio
npm run dev     # servidor de desarrollo (cuando la UI esté conectada)
npm run build   # tsc --noEmit && vite build
npm run extract # re-extraer datasets desde Reportes/analisis-touchiq/
```

## Trazabilidad
- Evidence REA: `ev_2464afc9…` (análisis JS, 14 fuentes) y `ev_7d2fef6c…` (CDP live: 0 requests).
- Harness del motor original: `Reportes/analisis-touchiq/engine/engine-nfl.js` (verificación 5/5).
- Reglas de evidencia (OBSERVADO/INFERIDO/DESCONOCIDO): `docs/16-limitations.md`.

## Nota
Los assets gráficos del original (robots, mascotas, video) no se reutilizan sin autorización
del propietario; la reconstrucción usará equivalentes propios. Este proyecto no procesa
apuestas con dinero real: es una referencia estadística con bankroll virtual.
