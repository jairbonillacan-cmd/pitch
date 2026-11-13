# ADR-010: Autenticación con Better Auth

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Hacen falta email y contraseña, OAuth (Google; Apple se descartó el 2026-11-12 porque su programa de desarrollador cobra US$99 al año), magic link, verificación, 2FA para el staff, roles y sesiones revocables, sin costo por usuario.

## Decisión

Better Auth self-hosted en `packages/auth`, sobre la misma Postgres (adaptador Drizzle), con cookies HttpOnly first-party en `pitchlab.mx`. Plugins: admin (roles), two-factor (obligatorio para staff y admin) y magic link. Las invitaciones y los referidos son dominio propio (`AUTH_BILLING_GROWTH.md`), no el plugin de organizaciones.

## Alternativas descartadas

Clerk (excelente DX, pero cobra por MAU y los datos quedan fuera); Supabase Auth (ata a Supabase); Auth.js (más trabajo para 2FA y roles).

## Consecuencias

Somos responsables de aplicar los parches de seguridad de la librería (Renovate y avisos).
