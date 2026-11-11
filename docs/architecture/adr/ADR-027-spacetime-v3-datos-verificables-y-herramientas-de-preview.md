---
status: accepted
date: 2026-11-11
---

# ADR-027: Spacetime Suite v3.0 desde prediction-lab, solo datos verificables y herramientas de preview fuera de producción

- **Estado:** Aceptada (2026-11-11). Reemplaza en parte a ADR-022, ADR-024 y ADR-026 (ver «Qué reemplaza»).
- **Decisión del fundador:** `gemini-reestructura` es la base que irá a `main`; los motores se mejoran en la rama `prediction-lab` y solo se copian a las ramas con front.

## Contexto

La rama `gemini-reestructura` presentaba como reales varios datos fabricados:

- Momios de casa y «ventaja» generados con un hash del id del partido (`buildSimulatedMarketDecimal`).
- Bajas «Duda/Baja», alineaciones «confirmadas», volumen de mercado y movimiento de línea derivados del mismo hash.
- Props de jugadores escritos a mano; una ventaja mínima forzada de +0.8 pts en varias tarjetas.
- Cifras públicas sin fuente: «+358,400 partidos», «+12.4M puntos», «69.6 % le gana al cierre», «0.009 ECE».
- Tipstars, publicaciones y récords ficticios mostrados como verificados.
- El selector de rol y la barra de 11 vistas desbloqueaban todo con el PIN `2026` escrito en el código del navegador.
- Liga MX se rellenaba con partidos de 2024 (el plan gratis de API-Football no cubre temporadas posteriores) y algunos se marcaban como «programados».

Mientras tanto, la rama `prediction-lab` ya tenía **Spacetime Suite v3.0** (Tachyon v3.0, Singularity v3.0, Geodesic v2.0, Minkowski v3.0 y multideporte) con evaluación fuera de muestra documentada en el reporte A26.

## Decisión

1. **Motores:** paquete `@pitchlab/spacetime` con una copia de `src/domain/prediction`, `src/data/prediction` y `tests/prediction` de `prediction-lab`. Se actualiza con `pnpm --filter @pitchlab/spacetime sync`; `SOURCE.json` registra el commit de origen. No se edita la copia.
2. **Inferencia en servidor:** `apps/web/src/server/spacetime.ts` corre `predictLiveMatchup` para cada partido de `data/snapshots/`:
   - partido en la matriz en vivo con momios: probabilidad final con mercado, momios reales de la casa y evaluación de valor de Geodesic v2.0;
   - partido fuera de la matriz: probabilidad deportiva desde las fichas de equipo, sin momios;
   - momio con más de 72 h (`PITCHLAB_MAX_ODDS_AGE_HOURS`): se descarta y se usa la probabilidad deportiva pura. La casa se muestra con el día del corte («Caliente · 9 nov»).
3. **Mercados derivados:** totales, ambos anotan, goles por equipo y marcador exacto (fútbol, Poisson + Dixon-Coles) y hándicaps/totales/puntos por equipo (NFL, normal calibrada a la probabilidad de victoria) salen de los goles/puntos esperados de v3.0.
4. **Regla de datos verificables:** la UI no muestra un número que no venga de un motor, de una fuente o de un reporte con método reproducible.
   - Sin mercado verificado: momio justo y «Sin momio»; nunca un momio de casa estimado.
   - Sin reporte de bajas: no se listan bajas.
   - Sin picks auditados de PitchLab: los cubos de precisión dicen «auditoría en curso».
   - Contenido de demostración (tipstars, comunidad, ranking): etiqueta «Ejemplo» y aviso «Contenido de ejemplo».
   - Cifras públicas solo del reporte A26 (`spacetime-catalog.ts` cita la fuente).
5. **Herramientas de preview:** selector de rol, barra de 11 vistas y simulador de roles solo con sesión válida y `previewToolsEnabled()` (encendido en desarrollo; en producción solo con `PITCHLAB_PREVIEW_TOOLS=1`). El PIN nunca va en el código del cliente.
6. **Liga MX:** calendario y resultados de la temporada actual desde el scoreboard público de ESPN (sin clave). Si ESPN falla se conserva el snapshot anterior.
7. **Automatización:** el workflow diario regenera snapshots y sincroniza Spacetime desde `prediction-lab`; descarta la copia si sus pruebas fallan.

## Qué reemplaza

- **ADR-022:** el nombre público pasa a *Spacetime Suite v3.0*; «4 a 5 picks» pasa a «hasta 5»: el pick de valor solo aparece si Geodesic encuentra valor ejecutable contra un momio real.
- **ADR-024:** las cifras «+358,400», «+12.4M», «0.009 ECE» y los momios deterministas dejan de usarse. El motor es v3.0 real, no un adaptador determinista.
- **ADR-026:** la simulación de roles ya no desbloquea con el PIN desde el cliente; queda detrás de `previewToolsEnabled()`.

## Alternativas descartadas

- **Seguir mostrando momios estimados con una etiqueta:** un momio inventado junto a una «ventaja» induce apuestas; se prefirió no mostrarlo.
- **Correr los scrapers de momios desde la app:** usan modos de evasión anti-bot sobre sitios de apuestas; la matriz se regenera en `prediction-lab` bajo responsabilidad del equipo de datos.
- **Quitar del todo a los tipstars de ejemplo:** el programa de creadores es parte del producto; se mantienen como demostración marcada.

## Consecuencias

- Los momios dependen de que `prediction-lab` regenere `live_matchday_v3_snapshot.json`; sin eso, a las 72 h la app deja de mostrar momios (correcto, pero sin valor de mercado).
- Props de jugadores quedan en «próximamente» hasta que exista un motor por jugador.
- Para publicar tipstars reales basta con quitar `isExample: true` de su entrada en `spacetime-catalog.ts`.
