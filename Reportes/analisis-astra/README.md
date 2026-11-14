# Dossier Forense REA — Astra AI (`https://astraanalisis.com/`)

> **Rama:** `scrap` · **Fecha:** `2026-11-14` · **Motor:** `rea-agents@6.8.0` (`16` registros `ev_...`) · **Validación matemática:** `8/8` suites exactas (`EXIT 0`)

Este directorio contiene la ingeniería inversa arquitectónica, matemática, de fuentes de datos, APIs y modelo de negocio de **Astra AI (`astraanalisis.com`)** realizada para **PitchLab**.

---

## Punto de Entrada Recomendado

- **[00-REPORTE-MAESTRO-ASTRA-ANALISIS.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/00-REPORTE-MAESTRO-ASTRA-ANALISIS.md)** — Síntesis ejecutiva y técnica integral de cómo funciona Astra AI de principio a fin.

---

## Capítulos Especializados

1. **[01-arquitectura-frontend-y-rutas.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/01-arquitectura-frontend-y-rutas.md)** — Stack (`Expo SDK 58`, `React 19.3` + React Compiler), mapa 1:1 de las 22 rutas `.tsx` y grafo de los `1,030` módulos Metro (`98` first-party).
2. **[02-ux-diseno-y-funcionalidades-cliente.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/02-ux-diseno-y-funcionalidades-cliente.md)** — Sistema de diseño *Monochrome Dark Luxury*, terminal Desktop de 3 columnas vs dock móvil *Liquid Glass*, cachés en memoria, seguimiento local (`siguiendo`) e instalador PWA.
3. **[03-backend-supabase-y-esquema-bd.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/03-backend-supabase-y-esquema-bd.md)** — Infraestructura Cloudflare HTTP/3 + EAS Hosting + Supabase (`bbfjdshvlcynngjdkvsk.supabase.co`), diagrama ER de las **14 tablas públicas**, bucket `profile-avatars`, triggers SQL y paywall RLS *Soft-Null*.
4. **[04-edge-functions-rpcs-y-operacion.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/04-edge-functions-rpcs-y-operacion.md)** — Especificación completa de los **4 RPCs** (`my_access`, `search_teams`, `record_ai_view`, `admin_dashboard`) y las **7 Edge Functions** (`league-standings`, `match-odds`, `nba-players`, `team-profile`, `payments`, `iap-confirm`, `delete-account`).
5. **[05-evidencia-runtime-y-payloads-reales.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/05-evidencia-runtime-y-payloads-reales.md)** — Resultados de los recorridos autenticados con REA en Fútbol, NBA, NHL, NFL, MLB, perfiles de equipo e historial.
6. **[06-modelos-estadisticos-picks-e-ia.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/06-modelos-estadisticos-picks-e-ia.md)** — Reconstrucción matemática exacta de los **5 modelos deportivos** (Dixon–Coles `league_v3`, NBA Elo+Ratings, NFL EPA+Elo+QB, NHL xG por tiro + Monte Carlo, MLB Binomial Negativa), momios IEEE-754 sin *de-vig*/EV, `astra_picks` y análisis con **Anthropic Claude** (incluyendo alucinación detectada en producción).
7. **[07-fuentes-de-datos-proveedores-y-momios.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/07-fuentes-de-datos-proveedores-y-momios.md)** — Atribución forense de proveedores aguas arriba (**API-Sports**, **ESPN**, **NHL Web API**, **MLB StatsAPI**, `nflverse`, `pybaseball`, **Marathonbet**, **DraftKings**), cadencia cron `*/2 * * * *` y estructura de costos (`$57–$101 USD/mes`).
8. **[08-autenticacion-pagos-monetizacion-y-legal.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/08-autenticacion-pagos-monetizacion-y-legal.md)** — Registro `+18`, pase prepagado de `$199 MXN / 30d` (`Stripe` + `Mercado Pago` + `RevenueCat IAP` apagado), cumplimiento LFPDPPP y seguridad HTTP pasiva.
9. **[09-comparativa-estrategica-vs-pitchlab.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/09-comparativa-estrategica-vs-pitchlab.md)** — Matriz comparativa Astra AI vs PitchLab (`v3.2`) y recomendaciones de producto/ingeniería.
10. **[10-registro-evidencia-y-limitaciones.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/10-registro-evidencia-y-limitaciones.md)** — Ledger de los `16` `evidence_id` de REA, clasificación `OBSERVADO / INFERIDO / DESCONOCIDO` y fronteras éticas/técnicas.

---

## Reproducción Rápida de la Verificación Matemática

```powershell
python Reportes/analisis-astra/evidence/verify_astra_math.py
```

---

## Estructura de Evidencia y Artefactos

- `evidence/verify_astra_math.py` — Verificador matemático automatizado (8 suites, `EXIT 0`).
- `evidence/module-map.json` — Grafo completo de módulos Metro (`287` entradas auditadas + `98` módulos propios).
- `evidence/database-and-api-contracts.json` — Esquema JSON de las 14 tablas, FKs, 4 RPCs y 7 Edge Functions.
- `evidence/data-provenance-matrix.json` — Matriz de proveedores externos, patrones de ID y pruebas de atribución.
- `evidence/rea-evidence-ledger.json` y `evidence/artifact-sha256-inventory.json` — Registro criptográfico REA y SHA-256.
- `evidence/live-payloads/` — `20` muestras reales sanitizadas de respuestas JSON de todos los deportes y Edge Functions.
- `screenshots/` — `14` capturas PNG obtenidas en sesiones REA autenticadas.
- `app/` y `modules/` — Los `25` chunks JS originales + `index.html` y los `286` módulos desempaquetados.
- `raw/` — Traza base y resúmenes sanitizados de los escenarios REA.
