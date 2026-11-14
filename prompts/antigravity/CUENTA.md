# Prompt · Mi cuenta nueva e Invitar amigos (para Gemini 4 Carbon en Antigravity)

Copia todo lo que está debajo de la línea.

---

Vas a rehacer **Mi cuenta** (`/app/account`) tal como está en el lienzo de diseño. Empiezas por **Invitar amigos** (los referidos), que es la parte más importante, y sigues con **Mi plan** y **Preferencias**. Tiene que verse y comportarse igual que el lienzo en escritorio y en móvil, en tema oscuro y claro. **La barra superior y el sidebar del club no se tocan.** No inventes cifras y no crees backend nuevo, salvo lo que pide la sección 3.

Trabaja por fases y **detente al terminar cada una** con su verificación en verde (sección 6). No empieces la siguiente con la anterior en rojo.

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`, `apps/web/PRODUCT.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_LIBRARIES.md`, `docs/design/RESPONSIVE_RULES.md`, `docs/design/INTERACTION_PATTERNS.md` y `GLOSSARY.md`.
2. **El diseño** en `design/canvas/cuenta/`:
   - Invitar amigos: `Main.dc.html` (escritorio), `InvitarMobile.dc.html`, `Compartir.dc.html` (imagen al compartir, 1200 × 630) y `VistaPrevia.dc.html` (cómo llega el enlace a un chat). Las capturas `card-front-crop.png`, `card-back-crop.png` y `card-holo-crop.png` muestran cómo debe verse la tarjeta.
   - Mi plan: `Plan.dc.html` y `PlanMobile.dc.html`. En «Tweaks» puedes cambiar el estado entre prueba, mensual y anual.
   - Preferencias: `Prefs.dc.html` y `PrefsMobile.dc.html`.
   - Las notas de `canvas.json`: `cambios` y `datos` (Invitar), `cambiosPlan` y `datosPlan`, `cambiosPrefs` y `datosPrefs`. **Si una nota del lienzo choca con este prompt, manda este prompt.**
   - Los lienzos usan variables propias (`--bg`, `--t1`, `.ring`…). Tradúcelas con la tabla de `design/canvas/inicio/README.md` § «Colores del lienzo → tokens»: es la misma para todos los lienzos.
3. El código actual:
   - `packages/ui/src/platform/club/AccountReferralsClubView.tsx`: la vista completa, con las pestañas `referrals | plan | prefs | cfdi` en un `.seg-well`, `?tab=` y el evento `ACCOUNT_TAB_EVENT`. Hoy tiene un código fijo `SOCIO-8842`, el enlace largo `/pricing/referral?sku=…&interval=…&code=…#subscribe`, una barra de embajador con %, «Simular pago de un amigo», el selector de unidad en pesos y un RFC/razón social de relleno.
   - `packages/ui/src/platform/public/ReferralCard3D.tsx`: la tarjeta 3D en WebGL. Props: `code`, `tierLabel`, `bottomLeftLabel`, `expired`, `initialFlipped`, `themeOverride` y `ariaLabel`. Ya tiene un respaldo para cuando no hay WebGL.
   - `packages/ui/src/platform/public/ReferralInviteSurface.tsx` y `apps/web/app/pricing/referral/page.tsx`: la página que ve el amigo al abrir el enlace (`code`, `from`).
   - `packages/ui/src/platform/spacetime-catalog.ts`: `MEMBERSHIP_SPEC` (precios 299 / 2,390 / 199, `referralFriendBenefit`, `referralBothRewardDays` 15, `referralAmbassadorThreshold` 5 y `referralAmbassadorBonusDays` 30).
   - `packages/ui/src/platform/platform-provider.tsx`: `referralPaidFriends`, `simulateFriendFirstPayment`, `accountsEnabled`, `allowRoleSimulation`, `month1NoCardMode`, `favoriteLeagues`, `riskPreference` y el formato de momio.
   - `packages/ui/src/platform/components/ShellChrome.tsx`: el menú de cuenta que abre cada pestaña con `ACCOUNT_TAB_EVENT`. Ese contrato no cambia.
   - Con base de datos: `apps/web/app/api/me/referrals/route.ts` → `myReferrals()` en `packages/db/src/admin.ts` (devuelve `referralCode`, `paidFriends` y `pendingFriends`), `packages/db/src/billing.ts` (`accessUntil`, `hasActivePaseTotal`, `grantDays`), las tablas `users.referralCode` y `referral_grants` de `packages/db/src/schema.ts`, y `apps/web/app/api/billing/checkout/route.ts`.
   - Referencia de estilo ya construida desde lienzo: Perfil (`/app/u/[handle]`) y Comunidad (`CommunityClubView`), con sus pestañas subrayadas WAI-ARIA en `?tab=`. Reutiliza ese patrón; no inventes otro.

Antes de editar, escribe un plan corto: qué archivos cambias, qué partes divides de `AccountReferralsClubView.tsx` (que hoy tiene 764 líneas) y de dónde sale cada número de la pantalla.

## 1. Decisiones ya tomadas (no las discutas)

- **Sin texto de relleno.** Nada de frases de ánimo ni explicaciones obvias. Los estados vacíos dicen qué pasa y qué hacer, en una línea.
- **Copy prohibido:** «VIP», «Socios VIP», «Simular pago», «Cancelar en 1 clic», «Mantener Mensual», «Simulador de stake», «Autoexclusión», «sobrepaga», «ROI», «Kelly», «gana/ganó». PitchLab **no sugiere montos de apuesta**.
- **La oferta de invitación es una sola** y sale de `MEMBERSHIP_SPEC`: tu amigo tiene 7 días sin costo y paga $209 su primer mes; cuando paga, los dos reciben +15 días. Con 5 amigos que pagan, recibes +30 días extra. Nunca escribas estas cifras a mano en el componente.
- **Cuatro pestañas subrayadas:** Invitar amigos · Mi plan · Preferencias · Facturación. El `.seg-well` desaparece. Siguen `?tab=referrals|plan|prefs|cfdi` y `ACCOUNT_TAB_EVENT`. Facturación (`cfdi`) **no se rediseña ahora**: solo cambia de pestaña. Quítale el RFC y la razón social de relleno: los campos van vacíos con su placeholder.
- **Vidrio falso refinado** (`.glass-lens`, `.glass-card`, `.glass-ring`). Prohibidos `backdrop-filter` y `filter: blur`.
- **Nada inventado:** sin cuentas (`accountsEnabled` en `false`), todo lo que no sea real va marcado «Ejemplo» con `ExampleNotice`. Con cuentas, los números salen de la base.
- **El simulador de roles no es producto:** «Simular pago de un amigo» solo se muestra cuando `allowRoleSimulation` es `true`, en un bloque aparte rotulado «Simulador». Nunca en producción.

## 2. Fase A · Invitar amigos (`/app/account?tab=referrals`)

### 2.1 Encabezado de Mi cuenta (lo comparten las cuatro pestañas)

- Avatar, «Mi cuenta», `UltraTag` y debajo «@usuario · Pase PitchLab Ultra». El @usuario y las iniciales salen de la sesión, no de `@socio_pl` fijo.
- Debajo, las cuatro pestañas subrayadas con flechas, Inicio y Fin.
- Quita el botón que lleva a la portada pública («Ver portada pública»).

### 2.2 La tarjeta

- La invitación **es** la tarjeta 3D: `ReferralCard3D` con `code` = tu código, `bottomLeftLabel` = `@usuario` y `tierLabel` = `ULTRA` (o `ULTRA · TIPSTER` si eres tipster verificado). Se voltea con clic, toque, Enter o Espacio para ver el reverso, igual que en el lienzo. Con `prefers-reduced-motion` se voltea sin animación.
- A su lado (debajo en móvil), la oferta en tres líneas con datos: qué recibe tu amigo, qué reciben los dos cuando paga y el bono de embajador.
- **Tu código:** con cuentas, `users.referralCode` (vía `/api/me/referrals`). Sin cuentas, un código de ejemplo derivado del @usuario (por ejemplo `JAIR-2611`) y marcado «Ejemplo». Si con cuentas el usuario aún no tiene código, «Generando tu código…» y nada más; no inventes uno.

### 2.3 Compartir

- **Enlace corto:** `pitchlab.mx/i/{CÓDIGO}` en un campo de solo lectura con «Copiar». Al copiar, el botón dice «Copiado» 2 s y se anuncia con `aria-live`.
- Botones en este orden: Copiar enlace · WhatsApp (`https://wa.me/?text=`) · X (`https://x.com/intent/post?text=`) · Copiar mensaje · Más (`navigator.share`, solo si existe). El mensaje es el del lienzo y lleva el enlace corto.
- **Descargar tarjeta:** PNG de 1080 × 1350 para historias, generado desde la misma textura de la tarjeta (frente, con @usuario y código). El nombre del archivo es `pitchlab-invitacion-{codigo}.png`. Si falta WebGL, se descarga la versión del respaldo.

### 2.4 Avance hacia embajador

- **Cinco lugares**, uno por amigo que pagó, como en el lienzo. Nada de barra con porcentaje. Los lugares llenos llevan tu color de marca y los vacíos, contorno.
- Debajo: «{N} de 5 · te faltan {5−N} para +30 días». Con 5 o más: «Eres embajador · +30 días».
- **Días ganados:** `N × 15` más 30 si llegaste a 5. Sale de una función pura, `referralEarnedDays(paidFriends)`, que va en `spacetime-catalog.ts` o en un archivo nuevo de helpers y tiene su prueba.

### 2.5 Tus invitaciones

- Lista con nombre o @usuario del amigo, estado («Pagó · +15 días» con punto verde, «En prueba · {N} días» con círculo vacío) y fecha.
- Arriba, tres cifras: Pagaron · En prueba · Veces que abrieron tu enlace.
- **Con cuentas:** «Pagaron» = `paidFriends` y «En prueba» = `pendingFriends`. La lista por amigo y las aperturas **no existen todavía en la base**: no las muestres con cuentas; deja una línea discreta «Pronto verás aquí a cada amigo». **Sin cuentas:** la lista y las tres cifras del lienzo, marcadas «Ejemplo».
- Vacío con cuentas: «Aún no invitas a nadie. Comparte tu enlace.»

### 2.6 Móvil (por debajo de 640 px)

Sigue `InvitarMobile.dc.html`: la tarjeta a todo el ancho arriba, la oferta debajo, los botones de compartir en una cuadrícula de objetivos de 44 px con «Más» primero si existe `navigator.share`, y luego avance y lista. Sin scroll horizontal de la página. Las pestañas de Mi cuenta se desplazan de lado si no caben.

## 3. Fase B · El enlace corto y su vista previa

- **Ruta nueva `apps/web/app/i/[code]/page.tsx`:** valida el código (`^[A-Z0-9-]{4,24}$`, sin distinguir mayúsculas) y redirige con `redirect()` a `/pricing/referral?code={CÓDIGO}&from={usuario}`. Si el código no es válido, manda a `/pricing` sin parámetros. Con cuentas, busca el `@usuario` por `users.referralCode`; sin cuentas, omite `from`. No escribas en la base.
- **Vista previa al compartir:** `apps/web/app/i/[code]/opengraph-image.tsx` con `ImageResponse` de 1200 × 630, igual que `Compartir.dc.html`: la tarjeta (usa como imagen la captura del frente, copiada a `apps/web/public/`, no WebGL), «@usuario te invita a PitchLab» y la oferta. Agrega `generateMetadata` con título, descripción y `twitter:card` = `summary_large_image`. Comprueba que el resultado se parezca a `VistaPrevia.dc.html`.
- `/i/*` no pide sesión. Revisa `apps/web/middleware.ts` para que no la bloquee y para que no lleve `noindex` de más ni de menos (debe ser `noindex`: son páginas personales).
- `ReferralInviteSurface` no se rediseña. Solo confirma que con `code` y `from` muestra «@usuario te invitó» y que el `?sku=…&interval=…#subscribe` viejo sigue funcionando para los enlaces ya compartidos.

## 4. Fase C · Mi plan (`?tab=plan`)

Sigue `Plan.dc.html` y sus notas.

- Lo primero es **el estado de tu pase**: Activo, Prueba (con los días que quedan) o Sin renovación (con «Tienes acceso hasta {fecha}»). A su lado, tu pase como `ReferralCard3D` con tu @usuario.
- **Cuatro datos:** plan y precio · próximo cobro (o hasta cuándo tienes acceso) · tarjeta · días a favor. Los días a favor dicen la fecha: «tu próximo cobro se recorre al {fecha}».
- **Mensual o anual:** dos opciones claras con el ahorro en pesos ($1,198 al año, calculado de `MEMBERSHIP_SPEC`, no escrito a mano). Cambiar no pierde días: aplica en el siguiente corte.
- **Prueba sin tarjeta:** dice que al terminar no hay cobro automático y ofrece activar mensual o anual con el `POST /api/billing/checkout` que ya existe.
- **Cancelar:** un enlace discreto que abre un diálogo (`TopLayerModalDialog`) con lo que conservas: acceso hasta la fecha, días a favor y bitácora. Después aparece «Reactivar renovación».
- **Historial de pagos** con su factura por cobro, marcado «Ejemplo».
- **De dónde salen los datos:** con cuentas, el estado y la fecha vienen de `accessUntil()` y `hasActivePaseTotal()` a través de un endpoint de solo lectura nuevo, `GET /api/me/plan`, que reúse `requireMember` igual que `/api/me/referrals`. Cambiar tarjeta, cancelar, reactivar y cambiar de ciclo **no se conectan a Stripe en esta tarea**: los botones abren el diálogo y, al confirmar, muestran «Disponible cuando se active el cobro» si no hay `STRIPE_SECRET_KEY`. Sin cuentas, todo el panel va marcado «Ejemplo» con el estado elegido en el lienzo (prueba).
- Fuera: «Cancelar en 1 clic» con su toast falso y «Mantener Mensual».

## 5. Fase D · Preferencias (`?tab=prefs`)

Sigue `Prefs.dc.html` y sus notas.

- **Seis grupos** con índice a la izquierda en escritorio (que se fija al hacer scroll): Tus ligas · Cómo ves los datos · Picks y parlays · Alertas · Privacidad · Juego responsable. En móvil, el índice es una fila de chips con scroll.
- **Se guarda solo.** Arriba aparece «Guardado» con `aria-live` después de cada cambio. Sin botón de guardar.
- **Tus ligas** con su emblema (`LeagueBadge`). Debe quedar al menos una activa; si intentas quitar la última, el aviso va junto al control, no en un toast. Una línea dice qué afecta: Inicio, la tira de fechas y las alertas.
- **Cómo ves los datos:** formato de momio (el mismo control segmentado del menú de cuenta), tema con Oscuro · Claro · Sistema, y zona horaria de los partidos (por defecto `America/Mexico_City`).
- **Picks y parlays:** perfil de riesgo como tres opciones con su rango (72 % o más · 56–72 % · parejo), mapeadas a `riskPreference`. Y un interruptor opcional «Ver mi saldo también en pesos» con el valor de tu unidad. El «Simulador de stake» desaparece.
- **Alertas:** interruptores (HeroUI `Switch`) con lo que hace cada una, en una línea.
- **Privacidad:** tres ajustes separados: perfil público, aparecer en el ranking y pausar Comunidad. Reemplazan al «Modo Pausa Social».
- **Juego responsable:** pausar la cuenta 24 h, 7 días o 30 días, con confirmación y enlace a recursos de ayuda. **No implementes la pausa de verdad**: guarda la elección y muestra «La pausa se aplicará cuando se active tu cuenta». El fundador decide si congela el cobro y si se puede deshacer.
- **Abajo:** «Descargar mis datos» y «Eliminar cuenta», con un diálogo de confirmación. Sin cuentas, quedan desactivados con su explicación en una línea.
- **Dónde se guarda:** lo que ya existe (`favoriteLeagues`, `riskPreference`, formato de momio, `pl-theme`) sigue como está. Lo nuevo va al `localStorage` con lectura y escritura dentro de `try/catch` y una sola clave versionada (`pl-prefs-v1`). Guardar en la base queda para F4.

## 6. Reglas de implementación

- **Solo tokens `--pl-*`.** Cero hex fuera de `packages/tokens`. El borde arcoíris del `UltraTag` ya existe: no lo copies.
- **Divide la vista:** `AccountReferralsClubView.tsx` queda como contenedor con encabezado y pestañas, y cada pestaña va en su archivo (`account/InviteTab.tsx`, `PlanTab.tsx`, `PrefsTab.tsx`, `BillingTab.tsx`) dentro de `packages/ui/src/platform/club/`. La exportación pública de `@pitchlab/ui` no cambia de nombre.
- **Componentes que ya existen primero:** `ReferralCard3D`, `LeagueBadge`, `ExampleNotice`, `MaestroIcon`, `UltraTag`, `TopLayerModalDialog`, `OddsFormatSegment` y HeroUI (`Switch`, `Tabs` si te sirve sin pelear con el estilo). `ClubWorkspaceShell` no cambia.
- **Peso:** `ReferralCard3D` es pesada. Cárgala con `next/dynamic` o `React.lazy` solo en las pestañas que la usan, con un marcador del mismo tamaño mientras llega. Mide el First Load JS de `/app/account` antes y después, y repórtalo.
- **Accesibilidad WCAG 2.2 AA:**
  - pestañas WAI-ARIA con la activa en `?tab=`;
  - la tarjeta es un botón con `aria-label` («Tarjeta de invitación de @usuario, código X. Voltear»);
  - los cinco lugares del avance tienen texto para lectores de pantalla («2 de 5 amigos pagaron»);
  - objetivos de 44 px en móvil y contraste 4.5:1 en textos de 12 px;
  - los estados siempre con texto, no solo con color.
- **Storybook:** stories de cada pestaña en oscuro y claro, con y sin cuentas (y Mi plan en sus tres estados).
- No toques el header, el sidebar, la landing, el login, el registro, el perfil ni la comunidad.

## 7. Verificación (obligatoria al cerrar cada fase)

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`, en verde. Agrega pruebas de:
   - `referralEarnedDays` (0, 1, 4, 5 y 7 amigos);
   - el enlace corto y el mensaje de compartir (código en mayúsculas, sin parámetros sobrantes);
   - la validación y la redirección de `/i/[code]` (válido, inválido y minúsculas);
   - que con `accountsEnabled` en `false` no aparezca ninguna cifra sin «Ejemplo»;
   - que «Simular pago de un amigo» no se renderice sin `allowRoleSimulation`;
   - que no se pueda quitar la última liga.
2. `pnpm --filter @pitchlab/web build` y `pnpm e2e`, en verde. Agrega a la prueba 3, después de entrar con el PIN:
   - visitar `/app/account`, copiar el enlace y ver «Copiado»;
   - voltear la tarjeta con el teclado;
   - cambiar a Mi plan y a Preferencias con flechas;
   - abrir `/i/JAIR-2611` y terminar en `/pricing/referral?code=JAIR-2611`;
   - pasar axe (WCAG 2 A y AA) sin violaciones en las cuatro pestañas, en oscuro y claro.
3. **Capturas** de cada pestaña comparadas con su lienzo: 1440×900 y 1280×720 en escritorio, 375×667 y 390×844 en móvil, en oscuro y claro. Más la imagen de `/i/JAIR-2611/opengraph-image` junto a `Compartir.dc.html`.
4. A mano: compartir en WhatsApp y X (abre la URL correcta), descargar la tarjeta (1080 × 1350), cancelar y reactivar en Mi plan, quitar la última liga, y la página sin WebGL (desactívalo en el navegador).
5. `grep` en lo que tocaste: «VIP», «Simular pago» (fuera del bloque del simulador), «1 clic», «Mantener Mensual», «stake», «Autoexclusión», «SOCIO-8842», «XAXX010101000», «sku=ultra», `backdrop-filter`, `filter: blur` y hex fuera de tokens.
6. Agrega la entrada **CUENTA-2** a `docs/execution/PROJECT_STATE.md` (en «Estado actual» y en «Handoffs») con qué cambió y qué quedó pendiente.

## 8. Terminado significa

- Las fases A a D iguales al lienzo en los cuatro tamaños y los dos temas, sin números inventados, con `/i/[code]` y su vista previa funcionando.
- Pruebas, build y E2E en verde, y el peso de `/app/account` reportado.
- **No hagas commit ni push.** Entrega un resumen con capturas y archivos tocados, y deja señalados estos pendientes para el fundador:
  - Guardar en la base las preferencias nuevas, la lista de invitados por amigo y las aperturas del enlace (eventos nuevos en F4).
  - Conectar cambiar tarjeta, cancelar, reactivar y cambiar de ciclo con el Customer Portal de Stripe.
  - Decidir si pausar la cuenta congela el cobro y si se puede deshacer antes de que termine.
  - Rediseñar Facturación (CFDI) con su propio lienzo.
