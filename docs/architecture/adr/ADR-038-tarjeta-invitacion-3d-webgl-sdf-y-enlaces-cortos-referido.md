---
status: accepted
date: 2026-11-13
extends:
  - ADR-025
  - ADR-035
  - ADR-036
---

# ADR-038: Tarjeta de invitación 3D en WebGL 1.0 por raymarching SDF (`ReferralCard3D`) y embudo de enlaces cortos `/i/[code]` con OpenGraph estático

- **Estado:** Aceptada (`accepted` e implementada para `ReferralCard3D` y `/pricing/referral` + `/plans/referral`; **en implementación** para la integración en `/app/account`, exportación PNG `1080×1350` y ruta corta `/i/[code]` + `opengraph-image.tsx` según `prompts/antigravity/CUENTA.md`).
- **Fecha:** 2026-11-13.

## Contexto

El programa de referidos de `Pase PitchLab Ultra` necesitaba un objeto visual memorable y compartible (inspirado en las invitaciones metálicas de suscripciones de primer nivel) tanto en la página pública de invitación como dentro de `Mi cuenta → Invitar amigos`. Abordarlo con herramientas 3D convencionales presentaba tres obstáculos directos:

1. **Peso de bundle inaceptable:** incorporar `three` + `@react-three/fiber` añade cientos de kilobytes de JavaScript inicial a rutas públicas de conversión y a `/app/account`, rompiendo el presupuesto de rendimiento ([ADR-035](ADR-035-vidrio-falso-cero-blur-shell-persistente-y-recorte-rsc.md)).
2. **Drenaje de batería y bordes dentados con CSS 3D:** las transformaciones CSS `preserve-3d` carecen de espesor geométrico real, biseles CNC y normales continuas para reflejos holográficos, mientras que un bucle `requestAnimationFrame` perpetuo consume GPU en reposo.
3. **Previsualización en WhatsApp, X e iMessage:** los rastreadores de redes sociales no ejecutan WebGL y los enlaces largos (`/pricing/referral?sku=ultra&interval=MONTHLY&code=...#subscribe`) generan fricción visual al compartirse en chats.

## Decisión

1. **Motor 3D autocontenido en WebGL 1.0 sin librerías externas (`packages/ui/src/platform/public/ReferralCard3D.tsx`):**
   - La tarjeta se renderiza mediante un único *fragment shader* GLSL de **raymarching sobre caja orientada (OBB)** en titanio grafito anodizado monocromático, con el isotipo «Campo de corte» evaluado por **SDF vectorial CSG analítico** (`sdPitchLabIsotype`), normales continuas `C1`, **8-Rooks supersampling** en silueta/biseles y **4× RGSS** subpíxel sobre texturas `4096×2048` con filtrado anisotrópico `16×`.
   - El espectro holográfico curado de 6 paradas se refleja **únicamente en biseles, letras e isotipo** en función del movimiento (`uPrismMotion`), y el bucle físico armónico **se detiene a `0 fps` en reposo absoluto** (y desactiva giro animado bajo `prefers-reduced-motion`).
   - Incluye respaldo estático accesible cuando el dispositivo o navegador no dispone de WebGL, y se carga de forma diferida (`next/dynamic` / `React.lazy`) dentro de las pestañas de `/app/account` que la muestran.
2. **Superficie pública ligera de recepción (`/pricing/referral` y alias `/plans/referral`):**
   - `ReferralInviteSurface` se sirve con `159 kB` de First Load JS sobre escenario de destellos `closest-side` (`0 backdrop-filter`), atribuyendo el código hacia `/signup?code={CÓDIGO}` y conservando compatibilidad con enlaces heredados `?sku=ultra&interval=MONTHLY`.
3. **Enlaces cortos `/i/[code]` y tarjeta OpenGraph estática (en implementación con `CUENTA-2`):**
   - La URL canónica para compartir es `pitchlab.mx/i/{CÓDIGO}` (`apps/web/app/i/[code]/page.tsx`, pública con `X-Robots-Tag: noindex`), que valida `^[A-Z0-9-]{4,24}$` (insensible a mayúsculas), resuelve opcionalmente el `@handle` anfitrión desde `users.referralCode` sin escribir en base de datos y redirige a `/pricing/referral?code={CÓDIGO}&from={handle}` (o a `/precio` si el código es inválido).
   - `apps/web/app/i/[code]/opengraph-image.tsx` genera en servidor una imagen `1200×630` (`ImageResponse` + captura raster frontal de la tarjeta en `public/`, nunca WebGL en servidor) para WhatsApp/X, complementada en cliente con descarga directa de historia PNG `1080×1350` (`pitchlab-invitacion-{codigo}.png`).

## Alternativas descartadas

- **Three.js / React Three Fiber o Spline Runtime:** descartados por sobrecarga de bundle (`+150–500 kB` gzip) y dependencias externas difíciles de auditar frente a un único componente autónomo.
- **Renderizar WebGL en un navegador headless para OpenGraph:** lento, costoso y frágil en funciones serverless frente a `ImageResponse` determinista sobre activo raster base.

## Consecuencias

- La invitación 3D mantiene calidad óptica de nivel nativo con `0 B` de librerías 3D externas, `0 fps` en reposo y degradación limpia sin WebGL.
- Cualquier ajuste futuro al logotipo o tipografía impresa en la tarjeta debe actualizar las constantes vectoriales/canvas de `ReferralCard3D.tsx` y la imagen base de OpenGraph en paralelo.
