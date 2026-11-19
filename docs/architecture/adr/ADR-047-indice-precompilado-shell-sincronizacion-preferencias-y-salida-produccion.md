# ADR-047 · Índice precompilado `shell-index.json`, sincronización completa de preferencias y auditoría de salida a producción

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** Con 57 competencias en `data/snapshots/`, leer ~171 archivos JSON y validar 57 esquemas Zod en cada arranque en frío serverless encarece la latencia inicial. Además, varias preferencias nuevas vivían solo en `localStorage`.

## Decisión
1. **Índice precompilado `data/snapshots/shell-index.json`:**
   - `services/ingest/src/build-shell-index-cli.ts` (`pnpm --filter @pitchlab/ingest snapshot:shell-index`) genera un único índice validado con las 57 competencias y se ejecuta al cierre de `.github/workflows/pre-mvp-snapshot.yml`.
   - `loadAllActiveLeagueSnapshots()` en `apps/web/src/server/snapshots.ts` lee ese único archivo cuando su `mtime` cubre los snapshots vigentes, y cae automáticamente por liga al lector tradicional si cualquier `latest.json`, `injuries.json` o `market-pulse.json` es más reciente.
2. **Sincronización móvil ↔ escritorio en PostgreSQL (`user_preferences`):**
   - `packages/db/src/preferences.ts` y `GET/PUT /api/me/preferences` elevan el límite de `favoriteLeagues` a 60 y persisten `preferredBooks`, `showInactiveLeagues`, `lineMoveAlerts`, `followedPlayers`, `followedTopics.teams` y `language` dentro de `followed_topics` JSONB sin migraciones disruptivas.
   - `PrefsTab.tsx` hidrata y persiste estos controles automáticamente al existir sesión autenticada.
3. **Pre-vuelo de producción (`scripts/check-prod-readiness.mjs`):**
   - Script de solo lectura que verifica migraciones SQL, crons en `apps/web/vercel.json`, validez de `shell-index.json`, existencia de `scripts/migrate-prod.ps1` y presencia de variables críticas sin exponer valores.

## Consecuencias
- Arranque en frío serverless reducido a una lectura JSON con invalidación segura por `mtime`.
- Preferencias consistentes entre móvil y escritorio sin requerir cambios destructivos en Neon producción.
