---
status: accepted
date: 2026-11-13
updates:
  - ADR-025
---

# ADR-037: Reputación pública por `Saldo` en unidades, picks adjuntos verificables en Comunidad y umbrales mínimos de muestra

- **Estado:** Aceptada (`accepted`). Reemplaza en parte a [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md) en métricas de perfil, consenso y ranking comunitario.
- **Fecha:** 2026-11-13 (implementada en `PROFILE-2` y `SOCIAL-2`: `packages/ui/src/platform/profile-stats.ts`, `community-stats.ts`, `community-examples.ts`, `AnalystProfileClubView.tsx` y `CommunityClubView`).

## Contexto

En la primera versión de Comunidad y Perfiles (`UI-MAESTRO-V4.1`) existían cuatro distorsiones de dominio y datos:

1. Se exhibían `ROI %`, intervalos `IC 95 %`, contadores ficticios de copias (`copiedCounts`) y multiplicadores sintéticos de ventana (`windowFactor` / `clvBoost`) que contradecían la regla de datos verificables ([ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md)) y el tono claro del producto.
2. El botón «Copiar a mi bitácora» en una publicación construía un pick sintético tomando el primer slot del partido en vez de una selección realmente registrada por el autor.
3. Mostrar «Consenso» con 1 o 2 publicaciones o «Ranking» y «Estadísticas» con muestras diminutas premiaba la varianza de corto plazo.
4. Al visitar el perfil `/app/u/[handle]` de un usuario ajeno aún sin endpoint público, la vista hacía *fallback* silencioso hacia el perfil de ejemplo de Sofía.

## Decisión

1. **`Saldo` público en unidades simuladas y récord canónico de 4 cifras (`packages/ui/src/platform/profile-stats.ts`):**
   - Por decisión del fundador (`2026-11-11`), el balance neto en unidades simuladas (`won: +units × (userDecimal - 1)`, `lost: -units`) es público, alimenta el leaderboard y se denomina exclusivamente **`Saldo`** (nunca «ganancia», «unidades ganadas», «ganó» ni `ROI`).
   - Todo perfil resume su historial con una función pura única (`profileRecord`, reutilizada por `journalRecord`) en **4 cifras**: **Saldo**, **Cumplidos** (`X de Y` y `%`), **Ventaja contra el cierre** y **Puesto** mensual en Comunidad (`analystRank`).
2. **Vínculo estricto entre publicación y pick registrado (`SocialPost.pick`):**
   - Adjuntar un pick al publicar en `/app/social` registra simultáneamente esa selección en la `Bitácora` del autor.
   - «Copiar a mi bitácora» copia exactamente `post.pick`; si la publicación es solo comentario sin `pick`, la acción no se renderiza. Se eliminan `copiedCounts` hasta contar con conteo persistido real en servidor.
3. **Umbrales mínimos de muestra contra ruido estadístico:**
   - **Consenso (`computeConsensus` en `community-stats.ts`):** exige **`>= 10` picks abiertos de socios** en un mismo partido próximo (`CONSENSUS_MIN_PICKS = 10`) para contrastar `% Socios` vs `% Modelo`; por debajo muestra estado vacío honesto («Todavía no hay partidos con 10 picks de socios»).
   - **Ranking (`rankAnalysts`):** filtra por fechas reales de registro (`sealedAtIso` en ventana de `30 días` o `Temporada`, sin factores artificiales) y exige **`>= 20` picks cerrados** (`LEADERBOARD_MIN_SETTLED = 20`). Sigue rigiendo la prohibición absoluta de premios monetarios o materiales ([ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md)).
   - **Estadísticas de perfil:** exigen **`>= 10` picks cerrados** para habilitar las gráficas de saldo mensual, acierto por liga y calibración («Cuando dijo X %, ¿se cumplió?», con `CALIBRATION_MIN_PICKS = 5` por banda).
4. **Identidad verificada y estados honestos de perfil:**
   - El sello `VerifiedSeal` / `TipsterVerifiedBadge` es exclusivo de **Tipsters verificados**; los socios regulares llevan la etiqueta `Socio` sin roseta de verificación.
   - Los perfiles de demostración usan bitácoras deterministas que cuadran matemáticamente con su récord (`community-examples.ts`) y llevan `ExampleNotice`; cualquier `@handle` real sin datos públicos muestra «Este perfil aún no es público» hasta habilitar `/api/u/[handle]` en Fase 4.

## Qué reemplaza

- **ADR-025 (§3):** sustituye `Ranking CLV (IC 95 %)` como única vista de tabla por el Ranking de `Comunidad` (`Para ti · Siguiendo · Consenso · Ranking`) ordenable por `Saldo`, `Contra el cierre` o `Cumplidos` sobre ventanas temporales reales y umbral de 20 picks.

## Alternativas descartadas

- **Ocultar el saldo en unidades y dejar solo CLV:** el CLV aislado resulta críptico para la mayoría de los usuarios (`P1`); combinar `Saldo`, `Cumplidos` y `Contra el cierre` equilibra claridad inmediata con rigor analítico.
- **Rebajar el umbral de Consenso a 2–3 picks para que la pestaña no luzca vacía al lanzar:** engaña al usuario presentando ruido como tendencia colectiva.

## Consecuencias

- Con datos reales iniciales, la pestaña `Consenso` y el `Ranking` permanecen vacíos de forma transparente hasta cruzar 10 picks por partido y 20 picks cerrados por analista.
- El backend social pendiente en Fase 4 (`/api/u/[handle]`, persistencia servidor de `social_posts`, `likes`, comentarios, seguidos y moderación) deberá respetar intactas las firmas y umbrales de `profile-stats.ts` y `community-stats.ts`.
