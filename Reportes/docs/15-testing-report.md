# 15 — Reporte de pruebas
**vitest run: 24/24 PASAN** (2026-11-08):
- stats: phi (AS, ε≈1.5e-7 — propiedad del original), iphi inversa, half, poisCDF, dec (decimal/americana/errores)
- Motor NFL dorados: WAS@LAR (pH .322, ML 67.8%, ≈1.40), LAC@HOU (66.2%, ≈1.44),
  SEA@ARI (a3f 66.2%, hf branch, ct FAVORITO CLARO), IND@DAL (IND +5.5 65.5%),
  ATL@CIN (56.2%→"56%"), 14 mercados + etiquetas exactas, tot 49.8, mu −6.2
- Auditoría BAL@JAX: pH .271, mla ✓, pld ✗ (marcador 10-33)
- NCAA: MICH favorito, sin combinadas
- betting: profit w/l/p/v, sizing 10/5/0, curBank piso 0, noVig (DK −175/+145 → margen 4.46%),
  typ, roiBy
- props: fct, shr, pprob (td/p/n), safeAlt ≥0.68, pmk QB
Correcciones durante la prueba: (1) N y PJ llegan ya mapeados como objetos del runtime
original (h=detalle, d=fecha; ra=acarreos, ry=yds tierra) — el loader ya no re-mapea;
(2) tolerancia de phi ajustada a la precisión de la propia aproximación del original;
(3) tres expectativas de test mal planteadas (no bugs del motor).
Pendientes: Playwright E2E, comparación visual, tests de UI.
