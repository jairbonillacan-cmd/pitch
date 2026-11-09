# 17 · Registro de riesgos técnicos y comerciales

> Cada riesgo: impacto, probabilidad, mitigación vigente y disparador de escalamiento.
> **Fecha:** 2026-11-08.

| # | Riesgo | Impacto | Prob. | Mitigación vigente |
|---|---|---|---|---|
| 1 | **Cambio de términos de The Odds API** (los favorables a almacenamiento/entrenamiento son de ago-2026) | Alto: el comparador y el benchmark de mercado dependen de ese permiso | Media | Los términos citados con fecha; los snapshots propios se almacenan con hora; si cambian, se renegocia o se retira el feed con historial propio intacto |
| 2 | **API-Football Free sin licencia comercial confirmada** (FD-14) | Medio: Liga MX no puede salir de la beta privada | Alta mientras no se confirme | Liga MX detrás de flag/«Pronto»; el histórico interno no se publica |
| 3 | **openfootball se discontinúa o degrada calidad** (proyecto comunitario) | Medio: solo fuente $0 de fútbol | Baja-Media | Caché cruda + SHA-256 conservan lo ya descargado (el corpus no se corrompe hacia atrás); nflverse-style de emergencia: evaluar mirrors |
| 4 | **Hueco Liga MX 2021-22 → 2023-24** no llenable en plan Free (2021 `errors=plan`) | Bajo-Medio: 4 de 7 torneos faltantes | Confirmado | Backfill 2022/2023 (2 req); 2021-22 espera plan de pago o licencia |
| 5 | **Licencia FTN (CC-BY-SA) contamina derivados** si se usa por error | Alto legal | Baja | Exclusión explícita en `FREE_DATA_STRATEGY.md`; solo se descarga `games.csv` (CC-BY 4.0) |
| 6 | **Data leakage en features/calibración** | Alto estadístico: modelos que parecen buenos y no lo son | Media | Reglas de `10/13-*.md`; walk-forward por construcción; tests de invariantes pendientes de automatizar |
| 7 | **Mapeo de identidades de equipos** (renombres, reubicaciones, variantes) | Medio: silenciosamente parte historiales | Media (detectada y resuelta 2026-11-08) | Alias por liga + detector de variantes + whitelist de pares distintos; Morelia→Mazatlán como franquicia única |
| 8 | **Métrica imposible aceptada sin cuestionarla** (incidente NFL: LogLoss 4.64 por divergencia del solver ridge con >240 partidos; corregido en `nfl/ratings.ts` con test de regresión, ver HIST-01) | Medio: resultados inválidos publicados por accidente | Media | Anclar `datasetId`+versión de modelo en cada corrida y tratar LogLoss fuera de rango como señal de bug (pendiente de automatizar) |
| 9 | **Mapeo de marca Mazatlán→Atlante** en `LIGA_MX_TEAM_MAP` ( snapshots) | Bajo producto (emblema incorrecto), nulo para el histórico (usa su propio registro) | Confirmado | Corregir el manifiesto de emblemas en F4; el histórico no depende de esa tabla |
| 10 | **football-data.org Free con términos sin clasificar** | Bajo hoy (solo PL en vivo) | — | Clasificar antes de ampliar uso |
| 11 | **Legal MX**: LFPDPPP vigente (21-mar-2025) y nueva Ley de Juegos y Sorteos en preparación (SEGOB) | Medio-Alto comercial | Media | `COMPLIANCE_REGISTER.md`; sin premios, sin afiliados, 18+; monitorear la ley |
| 12 | **Sobreventa del modelo** («vencemos al mercado») sin evidencia | Reputacional | — | `11-model-audit.md`: el mercado gana hoy en NFL; gate de promoción con IC95; etiqueta «retro ≠ track record» |
| 13 | **Dependencia de un solo mantenedor de cada fuente $0** | Medio | Media | Corpus versionado localmente; migración por adaptadores ya diseñada (la arquitectura no cambia al cambiar de proveedor) |
