# Arquitectura social: Pick Journal, perfiles y leaderboards

> **Propósito:** un historial de picks verificable que no se pueda maquillar, perfiles públicos opcionales, leaderboards que premien el criterio y no la suerte, y moderación.
> **Consumidores:** `packages/social` y las secciones 25, 36, 37 y 32.
> **Fecha:** 2026-11-08 · Reglas legales: `COMPLIANCE_REGISTER.md` (C-01, C-03, C-12 y C-13).

## 1. Reglas de integridad (no negociables)

1. **Lock en el inicio.** `locks_at = game.start_time`. Después de esa hora, el pick no se edita ni se borra (trigger en la DB más la verificación en la API).
2. **Cuota sellada por el servidor.** En los picks con `odds_source='observed'`, la cuota sale del último `odds_snapshot` de ese mercado y selección (casa elegida o mejor disponible), con `snapshot_id`. El cliente no puede enviar el precio.
3. **Cuota manual permitida, pero marcada.** `odds_source='user_entered'` (necesaria en la fase $0 para los props). **No cuenta para los leaderboards ni para el CLV público.**
4. **Ocultar ≠ borrar.** `hidden=true` lo quita del perfil público, pero sigue contando en todas las métricas (y el perfil muestra «N picks ocultos»).
5. **Calificación automática.** Solo con `game_result` y `player_game_stat`. Sin calificación manual del usuario.
6. **Unidades simuladas** (0.5–5 u). No hay montos en dinero.
7. **Sin premios** monetarios ni materiales asociados a rankings o aciertos.

## 2. Tablas

| Tabla | Columnas clave |
|---|---|
| `pick` | `id` (ULID), `user_id`, `game_id`, `market_key`, `selection`, `line?`, `player_id?`, `odds_decimal`, `odds_source` (`observed` o `user_entered`), `snapshot_id?`, `bookmaker_id?`, `units`, `note?` (≤ 280 caracteres, moderable), `created_at`, `locks_at`, `status` (`open`, `locked`, `won`, `lost`, `push`, `void`), `graded_at?`, `close_odds_decimal?`, `close_fair_p?`, `clv?`, `hidden` |
| `follow` | `follower_id`, `followee_id`, `created_at` (PK compuesta) |
| `report` | `id`, `reporter_id`, `target_type` (`profile` o `pick`), `target_id`, `reason`, `status`, `resolved_by?`, `resolution?` |
| `sanction` | `id`, `user_id`, `type` (`warn`, `hide_profile`, `suspend_social`, `ban`), `until?`, `reason`, `by` |
| `leaderboard_entry` (materializada) | `period` (`30d`, `season:<id>`, `all`), `league_id` (o `all`), `user_id`, `n`, `wins`, `losses`, `pushes`, `roi_units`, `roi_lower95`, `clv_mean`, `clv_n`, `rank_clv`, `rank_roi_lb`, `refreshed_at` |

**Trigger `pick_immutable`:** si `now() >= locks_at`, solo se permiten cambios en `status`, `graded_at`, `close_*`, `clv` (a cargo del job de calificación, con un rol de DB dedicado) y `hidden`.

## 3. Métricas (definiciones únicas en `packages/social/src/metrics.ts`)

| Métrica | Definición |
|---|---|
| Resultado por pick (u) | Ganado: `units × (odds − 1)`. Perdido: `−units`. Push o void: `0`. |
| ROI | `Σ resultado / Σ units` de los picks calificados (sin push ni void en el denominador) |
| IC del ROI (95 %) | Bootstrap (2,000 remuestreos) sobre los resultados por unidad apostada. `roi_lower95` es el percentil 2.5. |
| CLV por pick | `odds_tomada × p_cierre_justa − 1`, con `p_cierre_justa` = probabilidad sin vig del cierre aproximado (consenso). Solo para `odds_source='observed'`. |
| CLV medio | Media de los CLV con su `clv_n`. Se muestra con el aviso «cierre aproximado: último snapshot a N min del inicio». |
| Registro | W-L-P y tasa de acierto con su IC de Wilson, **siempre** junto al ROI y al CLV (nunca sola) |

## 4. Leaderboards

- **Elegibilidad:** perfil público, sin `social_paused_until` ni sanción vigente, y **≥ 30 picks calificados con `odds_source='observed'`** en el periodo.
- **Orden por defecto:** `clv_mean`, con desempate por `clv_n`. Vista alternativa: `roi_lower95` (ROI ajustado por muestra). **No hay vista por ROI bruto.**
- **Periodos:** 30 días, temporada y total. Por liga o todas.
- **Refresco:** horario (`refresh-aggregates`).
- **Visibilidad:** la ruta pública `/leaderboards` está detrás del flag `social.leaderboards.public` (FD-07). Dentro de `/app` se puede habilitar en beta.
- **Aviso fijo:** «Unidades simuladas. Rendimiento pasado no garantiza resultados. PitchLab no acepta apuestas.»

## 5. Perfiles públicos y compartir

- `/u/:handle` solo si `is_public`. Muestra el resumen (n, W-L-P, ROI con IC, CLV), los picks recientes (los abiertos se ven con la cuota y la hora del registro), las ligas favoritas con emblemas y los seguidores y seguidos.
- `/p/:pickId` es público solo si el autor es público. La OG card la genera `/api/og/pick/:id` (marca más emblemas más la selección, la cuota con casa y hora y el estado). **Nunca** muestra montos en dinero ni logos de casas como promoción.
- Botones de compartir según el plan maestro §8 (intents, Web Share y descarga 1080×1350 / 1080×1920) con `utm_source` por red y `utm_medium=social`. Si el usuario tiene `referral_code`, el link compartido lo incluye (`?ref=`), así que compartir también genera referidos.

## 6. Moderación y seguridad

- La nota del pick y la bio pasan por un filtro de URLs: **se bloquean** los enlaces a casas, afiliados, Telegram o WhatsApp de grupos de pago y acortadores. Solo se permiten URLs propias.
- Reportes desde el perfil y el pick. Cola en `/admin/moderation`. Las sanciones quedan auditadas (`audit_log`).
- Rate limit: 50 picks al día por usuario y 10 reportes al día.
- **Autoexclusión del módulo social:** `social_paused_until` oculta los leaderboards, el feed y las sugerencias, y vuelve el perfil privado durante la pausa.
- Ayuda de juego responsable enlazada desde el journal, el perfil y el leaderboard.

## 7. Feed de seguidos (post-MVP)

Lista cronológica de picks nuevos de los seguidos (públicos), sin algoritmo de recomendación en la primera versión. Sin comentarios hasta tener capacidad de moderación.
