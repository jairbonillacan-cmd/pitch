# Seguridad

> **Propósito:** las reglas de seguridad que todo código de PitchLab debe cumplir y cómo se verifican.
> **Consumidores:** todos los agentes de código y la revisión de PRs.
> **Fecha:** 2026-11-08

## 1. Modelo de amenazas (resumen)

| Activo | Amenaza | Control |
|---|---|---|
| Cuentas | Robo de credenciales, fuerza bruta | Better Auth, verificación de contraseñas filtradas, rate limit y 2FA obligatoria para staff y admin |
| Contenido de pago | Evadir el paywall desde el cliente | `can()` en cada handler y en cada RSC. La UI solo refleja. Tests de autorización por feature. |
| Trials y referidos | Abuso con multicuentas | `trial_claim` con hashes únicos, antifraude de referidos y recompensa diferida (`AUTH_BILLING_GROWTH.md`) |
| Historial de picks | Manipulación (editar después del partido, cuotas falsas) | Trigger de inmutabilidad, cuota sellada por el servidor y rol de DB dedicado al grading (`SOCIAL_ARCHITECTURE.md`) |
| Billing | Webhooks falsos, eventos duplicados | Verificación de firma, `provider_event_id` único y reconciliación diaria |
| Datos personales | Fuga o uso indebido | Mínimo necesario, cifrado en tránsito y en reposo (Neon), aviso LFPDPPP y ARCO |
| Claves de proveedores | Exposición en el cliente o el repo | Solo en variables de entorno del servidor o de Actions. Escaneo de secretos en CI. |
| Admin | Escalada de privilegios | Rol en la DB, 2FA, `audit_log` de toda acción y sesiones de admin cortas (8 h) |
| IA | Prompt injection desde los datos, costo descontrolado | Herramientas de solo lectura, cuotas, sin texto de terceros ejecutable y límites de tokens |

## 2. Reglas obligatorias para el código

1. **Validación:** toda entrada externa (params, query, body, webhooks, respuestas de proveedores) pasa por un esquema Zod. Nada de `any` en los límites.
2. **Autorización en el servidor** en cada route handler, server action y RSC que lea datos con plan: `await requireEntitlement(user, 'feature.key')`.
3. **Errores:** nunca se silencian (`catch {}` está prohibido por lint). Se registran en Sentry con contexto, sin PII.
4. **Consultas:** solo Drizzle o SQL parametrizado. Prohibido concatenar SQL.
5. **Secretos:** nunca en el cliente ni en el repo. `NEXT_PUBLIC_*` solo para valores públicos (por ejemplo, la clave pública de PostHog). Escaneo con gitleaks en CI.
6. **Cabeceras** (en `next.config` / middleware): CSP estricta con nonce (orígenes de PostHog, Sentry y la pasarela listados), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima y `frame-ancestors 'none'`.
7. **Cookies:** HttpOnly, Secure y SameSite=Lax. Protección CSRF en las mutaciones (las server actions de Next más la verificación de origen en los handlers).
8. **Rate limiting** (Upstash) en auth, `POST /picks`, `/referrals/redeem`, `/reports`, `/ai/chat`, `/search` y en todos los endpoints públicos de OG.
9. **Subida de archivos (avatares):** tipo y tamaño validados (≤ 2 MB, png/jpg/webp), re-encode en el servidor y servida desde R2 con un nombre aleatorio.
10. **Dependencias:** Renovate semanal y `pnpm audit` en CI (falla con severidad alta).

## 3. Roles y auditoría

| Rol | Puede |
|---|---|
| `user` | Lo suyo: perfil, picks, cuenta y datos |
| `staff` | Leer en Admin, moderar reportes y reintentar jobs |
| `admin` | Todo lo de staff, más conceder planes, crear invitaciones, publicar o retirar modelos, cambiar flags y sancionar |

`audit_log(actor_id, action, target_type, target_id, before, after, at, ip_hash)` es obligatorio en toda acción de staff o admin y en los cambios de suscripción.

## 4. Feature flags con impacto legal (dueño: el fundador)

| Flag | Default | Motivo |
|---|---|---|
| `assets.emblems.liga-mx`, `assets.emblems.premier-league` | on en la beta privada, **revisión antes del lanzamiento público** | C-10 / FD-08 |
| `social.leaderboards.public` | off | C-03 / FD-07 |
| `league.liga-mx` (público y de pago) | off hasta FD-14 (a) | Licencia de API-Football |
| `ai.enabled` | off hasta W5 | Costo |

## 5. Respaldos y recuperación

- **Neon:** point-in-time restore según el plan, más un export lógico diario (`pg_dump`) a R2 con 30 días de retención (job de Actions).
- **R2:** `curated/` y `odds/` son inmutables y se exportan a mensual.
- **Prueba de restauración** trimestral documentada en `/admin` (fecha y resultado).
- **Objetivos:** RPO ≤ 24 h (≤ minutos con PITR) y RTO ≤ 4 h.

## 6. Datos personales

- Se recopila lo mínimo: email, fecha de nacimiento (edad), handle y preferencias. No se piden documentos oficiales.
- **Retención:** la cuenta se borra a petición (ARCO) en ≤ 20 días. Los picks públicos se anonimizan («usuario eliminado») en lugar de borrarse cuando afectan a agregados históricos.
- La analítica solo se activa con consentimiento. El IP se guarda con hash.
