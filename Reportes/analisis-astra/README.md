# Dossier Forense REA — Astra AI (`https://astraanalisis.com/`)

> **Rama:** `scrap` · **Fecha:** `2026-11-14` (Olas 1 + 2 Completas) · **Motor:** `rea-agents@6.8.0` (`83` registros únicos `ev_...`) · **Validación matemática:** `8/8` suites exactas sobre los 5 deportes (`EXIT 0`)

Este directorio contiene la ingeniería inversa integral —arquitectónica, matemática, semántica AST, empírica de base de datos, OSINT/infraestructura, de fuentes de datos, APIs y modelo de negocio— de **Astra AI (`astraanalisis.com`)** realizada con **REA** y **6 subagentes especialistas Gemini 4 Carbon High** para **PitchLab**.

---

## Punto de Entrada Recomendado

- **[00-REPORTE-MAESTRO-ASTRA-ANALISIS.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/00-REPORTE-MAESTRO-ASTRA-ANALISIS.md)** — Síntesis ejecutiva y técnica integral de cómo funciona Astra AI de principio a fin, consolidando tanto la Ola 1 como todos los secretos, bugs y auditorías empíricas descubiertos en la Ola 2.

---

## Capítulos Especializados (Ola 1: Arquitectura Base + Ola 2: Secretos, Móvil, BD y OSINT)

### Ola 1 — Arquitectura, Backend, Modelos, Proveedores y Negocio (`01`–`10`)
1. **[01-arquitectura-frontend-y-rutas.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/01-arquitectura-frontend-y-rutas.md)** — Stack (`Expo SDK 58`, `React 19.3` + React Compiler), mapa 1:1 de las 22 rutas `.tsx` y grafo de los `1,030` módulos Metro (`98` propios + `2` de configuración generada).
2. **[02-ux-diseno-y-funcionalidades-cliente.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/02-ux-diseno-y-funcionalidades-cliente.md)** — Sistema de diseño *Monochrome Dark Luxury*, terminal Desktop de 3 columnas vs dock móvil *Liquid Glass*, cachés en memoria, seguimiento local (`siguiendo`) e instalador PWA.
3. **[03-backend-supabase-y-esquema-bd.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/03-backend-supabase-y-esquema-bd.md)** — Infraestructura Cloudflare HTTP/3 + EAS Hosting + Supabase (`bbfjdshvlcynngjdkvsk.supabase.co`), diagrama ER de las **14 tablas públicas**, bucket `profile-avatars`, triggers SQL y paywall RLS *Soft-Null*.
4. **[04-edge-functions-rpcs-y-operacion.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/04-edge-functions-rpcs-y-operacion.md)** — Especificación completa de los **4 RPCs** (`my_access`, `search_teams`, `record_ai_view`, `admin_dashboard`) y las **7 Edge Functions** (`league-standings`, `match-odds`, `nba-players`, `team-profile`, `payments`, `iap-confirm`, `delete-account`).
5. **[05-evidencia-runtime-y-payloads-reales.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/05-evidencia-runtime-y-payloads-reales.md)** — Resultados de los recorridos autenticados iniciales con REA en Fútbol, NBA, NHL, NFL, MLB, perfiles de equipo e historial.
6. **[06-modelos-estadisticos-picks-e-ia.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/06-modelos-estadisticos-picks-e-ia.md)** — Reconstrucción matemática exacta de los **5 modelos deportivos** (Dixon–Coles `league_v3`, NBA Elo+Ratings, NFL EPA+Elo+QB, NHL xG por tiro + Monte Carlo, MLB `FIP+wOBA+PF` Binomial Negativa), momios IEEE-754 sin *de-vig*/EV, `astra_picks` y análisis con **Anthropic Claude**.
7. **[07-fuentes-de-datos-proveedores-y-momios.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/07-fuentes-de-datos-proveedores-y-momios.md)** — Atribución forense de proveedores aguas arriba (**API-Sports**, **ESPN**, **NHL Web API**, **MLB StatsAPI**, `nflverse`, `pybaseball`, **Marathonbet**, **DraftKings**), cadencia cron `*/2 * * * *` y estructura de costos (\$57–\$101 USD/mes).
8. **[08-autenticacion-pagos-monetizacion-y-legal.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/08-autenticacion-pagos-monetizacion-y-legal.md)** — Registro `+18`, pase prepagado de \$199 MXN / 30d (`Stripe` + `Mercado Pago` + `RevenueCat IAP` apagado), cumplimiento LFPDPPP y seguridad HTTP pasiva.
9. **[09-comparativa-estrategica-vs-pitchlab.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/09-comparativa-estrategica-vs-pitchlab.md)** — Matriz comparativa inicial Astra AI vs PitchLab (`v3.2`) y recomendaciones de producto/ingeniería.
10. **[10-registro-evidencia-y-limitaciones.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/10-registro-evidencia-y-limitaciones.md)** — Ledger maestro de los **`83` `evidence_id` únicos de REA**, clasificación `OBSERVADO / DERIVADO / INFERIDO / DESCONOCIDO` y fronteras éticas/técnicas.

### Ola 2 — Auditoría Profunda de Secretos, Rutas Ocultas, Móvil, BD Empírica y OSINT (`11`–`16`)
11. **[11-rutas-ocultas-movil-y-flujos-no-explorados.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/11-rutas-ocultas-movil-y-flujos-no-explorados.md)** — Cobertura 100% en vivo de las `22` rutas + exposición pública de **`/_sitemap`** y `<Unmatched />`, UI móvil *Liquid Glass* (`390x844 @ 2x`), `beforeinstallprompt` PWA real, `/eliminar-cuenta`, `/pago/[id]`, `/administracion`, `/confirmado` y `/restablecer` (`26` nuevas capturas `15`–`40`).
12. **[12-secretos-codigo-fuente-y-auditoria-100-modulos.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/12-secretos-codigo-fuente-y-auditoria-100-modulos.md)** — Inspección línea por línea y AST sin truncamiento de los **100 módulos propios** (`astra-first-party/`): origen del `Set([1636276, 1636288])`, sesgo visual de `WinBox`/`resultOutcome` (nunca evalúa fallos), modo `DEMO` completo, `102` árbitros únicos, `17` exports muertos y `7` bugs de cliente.
13. **[13-superficie-oculta-supabase-openapi-auth-y-rls.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/13-superficie-oculta-supabase-openapi-auth-y-rls.md)** — Radiografía byte a byte de `@supabase/supabase-js@2.118.0` (`124 KB` muertos en `__common`), desajuste `implicit` vs `PKCE`, telemetría Envoy/Cloudflare RUM (`firstContentfulPaint: 0 ms`, JS heap `42.5 MB`), matriz de *overfetching* (hasta `93.7%`) y ausencia de `AbortController` en `11/12` repositorios.
14. **[14-auditoria-empirica-bd-calibracion-picks-y-alucinaciones.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/14-auditoria-empirica-bd-calibracion-picks-y-alucinaciones.md)** — Auditoría empírica sobre las `31,376` filas de BD: nacimiento exacto (`2026-10-18`, **MLB fue el Deporte #1**), columnas ocultas `model`/`input_tokens`/`output_tokens` (**migración de `claude-sonnet-5-5` a `claude-haiku-5-5`** el `23-oct`), ecuación exacta MLB (`residuo <= 0.000787` + sesgo de truncamiento a 9 entradas), calibración real (`91.43%` en $\ge 75\%$, pero solo `6.01%` del catálogo), **inserción post-partido en `astra_picks`/`match_marks`** y **`20.7%` de inversión total Local/Visitante de Haiku en NFL**.
15. **[15-infraestructura-expo-eas-dns-y-superficie-externa.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/15-infraestructura-expo-eas-dns-y-superficie-externa.md)** — Topología Cloudflare O2O (`astra-ai.expo.app` vs `astraanalisis.com` registrado hace 6 días, pérdida de HSTS), protocolo EAS Update (`0` apps nativas / `0` canales OTA), DKIM 1024-bit en Resend y descubrimiento de la **plataforma hermana `tipsterzone.org` (`astraanalysisorg-astra.expo.app`)** + canal de Telegram (`3,463` suscriptores).
16. **[16-grafo-semantico-rea-agentenv-y-ventaja-pitchlab.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/16-grafo-semantico-rea-agentenv-y-ventaja-pitchlab.md)** — Prueba formal en el grafo semántico `JSRG` (`114,883` nodos AST), proyección `AgentEnv` (`9` herramientas Supabase modeladas en *dry-run*), **Fe de Erratas de 15 puntos (`ERR-01`..`ERR-15`)** y comparativa línea a línea contra el motor real `PREDLAB-V3.2` de PitchLab.

---

## Reproducción Rápida de la Verificación Matemática (5 Deportes + Momios + RLS)

```powershell
python Reportes/analisis-astra/evidence/verify_astra_math.py
```

---

## Estructura de Evidencia y Artefactos

- `evidence/verify_astra_math.py` — Verificador matemático automatizado (8 suites, incluye ecuación cerrada MLB `FIP+wOBA+PF`, `EXIT 0`).
- `evidence/production-db-forensic-audit.json` — Métricas reproducibles de calibración real (`1,754` partidos), Brier/Log-Loss, tokens LLM, `astra_picks` y alucinaciones.
- `evidence/code-secrets-and-anomalies.json`, `evidence/supabase-deep-surface.json`, `evidence/infra-eas-osint-audit.json`, `evidence/wave2-routes-and-mobile-audit.json` y `evidence/rea-semantic-and-agentenv-audit.json` — Datasets forenses completos de la Ola 2.
- `evidence/module-map.json`, `evidence/database-and-api-contracts.json` y `evidence/data-provenance-matrix.json` — Mapas base de módulos, BD y proveedores.
- `evidence/rea-evidence-ledger.json` y `evidence/artifact-sha256-inventory.json` — Registro maestro de los `83` `evidence_id` de REA e inventario SHA-256.
- `evidence/live-payloads/` — `21` muestras reales sanitizadas de respuestas JSON (incluyendo `mlb-prediction-sample.json` con los 6 juegos de Serie Mundial/ALCS).
- `astra-first-party/` — Los **100 módulos propios y de configuración** de Astra AI aislados con nombres semánticos (`345.9 KB`).
- `screenshots/` — **`40` capturas PNG** de escritorio y móvil Retina (`01`–`14` Ola 1 + `15`–`40` Ola 2, incluyendo `39-expo-router-sitemap-expuesto.png`).
- `app/` y `modules/` — Los `25` chunks JS originales + `index.html` y los `286` módulos desempaquetados de `__common` y rutas.
- `raw/` — Escenarios de entrada y resúmenes sanitizados de las `9` capturas interactivas en vivo de REA (`01`–`09`).
