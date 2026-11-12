# Prompts para GPT: una pantalla por prompt

Cada bloque se copia completo en GPT/Codex con acceso a este repo (rama `feat/pre-mvp`). Todos parten de la misma guía: `docs/design/GUIA_RECREACION_GPT.md`. Usa un prompt por sesión y en este orden: primero `/app`, luego Planes, Crear cuenta y Login; la landing solo si hay que cambiarla.

---

## 1. Inicio de la app (`/app`)

```text
Eres el agente de UI de PitchLab. Construye el Inicio de la app (/app) en este repo.

Antes de escribir código, lee en este orden: AGENTS.md, apps/web/PRODUCT.md,
docs/design/DESIGN_SYSTEM.md, docs/design/UI_LIBRARIES.md y
docs/design/GUIA_RECREACION_GPT.md (§2, §4, §6, §7, §8 y §9).

Referencia visual exacta: design/canvas/app/Main.dc.html (escritorio),
Mobile.dc.html (móvil) y MobileMore.dc.html (menú «Más»). Reprodúcelos con los
componentes del §6 de la guía y los tokens del §7; nunca copies los hex del lienzo.

Qué construir:
1. En packages/ui/src/app/: el shell (Astryx AppShell dentro de <AstryxScope>),
   la barra lateral, el encabezado, la barra inferior móvil, el menú «Más»
   (Astryx BottomSheet) y los bloques del §4.2 en su orden. El bloque principal
   es «Lo más probable en tus ligas»: el resultado con mayor probabilidad de cada
   partido próximo, ordenado de mayor a menor, con su cuota justa.
2. Stories en Storybook con datos reales de data/snapshots/*/latest.json, en
   tema oscuro y claro.
3. apps/web/app/app/page.tsx cargando los datos en el servidor como lo hace
   apps/web/src/server/landing.ts. Respeta el middleware que protege /app.

Reglas: solo tokens (pnpm test corre el linter de hex), FD-16 (sin proveedores
ni algoritmos en la UI), sin enlaces a /metodologia, nada de montos ni «pick
seguro». «Mis picks» y «Movimientos de cuota» van con datos de ejemplo marcados
como tales hasta que existan cuentas e histórico de cuotas.

Terminado cuando: revisaste 375 y 1440 px en los dos temas sin scroll horizontal,
y pnpm typecheck, pnpm test y las E2E pasan. Entrega un resumen con lo que quedó
de ejemplo y lo que no pudiste verificar.
```

---

## 2. Planes (`/pricing`)

```text
Eres el agente de UI de PitchLab. Construye la página de Planes (/pricing).

Lee primero: AGENTS.md, apps/web/PRODUCT.md, docs/design/UI_LIBRARIES.md y
docs/design/GUIA_RECREACION_GPT.md (§2, §5.3, §6, §7, §8 y §9).

Referencia visual exacta: design/canvas/app/Pricing.dc.html (escritorio) y
PricingMobile.dc.html (móvil).

Qué construir:
1. packages/ui/src/pricing/: tarjetas de planes, comparativa (HeroUI Table en
   escritorio; un plan a la vez con Astryx SegmentedControl en móvil), preguntas
   (HeroUI Accordion) y cierre con Radar (Mascot).
2. Precios y funciones SOLO desde LANDING_PLANS en
   packages/ui/src/landing/content.ts (Pro $199, Elite $399 MXN al mes, IVA
   incluido). Si necesitas más datos para la comparativa, agrégalos a ese mismo
   archivo, no a la página.
3. Stories en los dos temas y la ruta apps/web/app/pricing/page.tsx. El enlace
   «Planes» de la landing debe llevar a /pricing.

No inventes: el precio anual, si la prueba pide tarjeta y la fecha del CFDI están
por confirmar; la pregunta del CFDI dice «[POR CONFIRMAR]». Nada posterior al MVP
(IA, backtest, alertas).

Terminado cuando: 375 y 1440 px en los dos temas sin scroll horizontal, axe sin
violaciones, y pnpm typecheck, pnpm test y las E2E pasan. Agrega una E2E básica
de /pricing (tres planes visibles y Pro destacado).
```

---

## 3. Crear cuenta (`/signup`)

```text
Eres el agente de UI de PitchLab. Construye la pantalla Crear cuenta (/signup).

Lee primero: AGENTS.md, apps/web/PRODUCT.md, docs/design/UI_LIBRARIES.md,
docs/architecture/AUTH_BILLING_GROWTH.md §1–4 y
docs/design/GUIA_RECREACION_GPT.md (§2, §5 completo, §6, §7, §8 y §9).

Referencia visual exacta: design/canvas/app/Signup.dc.html (escritorio) y
SignupMobile.dc.html (móvil).

Qué construir en packages/ui/src/auth/:
- SignupForm con: aviso de invitación opcional (prop con el nombre de quien
  invita), Google y Apple, correo, contraseña con requisito en vivo (mínimo 10
  caracteres), fecha de nacimiento obligatoria con el aviso de 18+,
  consentimientos (términos y privacidad obligatorios; analítica y novedades
  opcionales) y el botón deshabilitado hasta que la contraseña sea válida y los
  términos estén aceptados. Campos con HeroUI TextField/DateField/Checkbox/Button.
- El panel derecho con un partido real (lo más probable, cuota justa, barra 1X2
  y la fila «Tu cuota»).
- Stories en los dos temas, incluidos los estados: vacío, contraseña corta,
  lista para enviar, con invitación y error del servidor.

IMPORTANTE: todavía no hay cuentas reales. No conectes /signup ni cambies
apps/web/app/signup/page.tsx: hoy forma parte del acceso de socios con PIN y las
E2E 2 y 3 dependen de él. El formulario recibe un onSubmit por props; la
integración con Better Auth es otra tarea.

Terminado cuando: las stories se ven bien a 375 y 1440 px en los dos temas, axe
sin violaciones, y pnpm typecheck y pnpm test pasan.
```

---

## 4. Login (`/login`)

```text
Eres el agente de UI de PitchLab. Construye la pantalla Login (/login).

Lee primero: AGENTS.md, apps/web/PRODUCT.md, docs/design/UI_LIBRARIES.md,
docs/architecture/AUTH_BILLING_GROWTH.md §1 y
docs/design/GUIA_RECREACION_GPT.md (§2, §5 y §5.1, §6, §7, §8 y §9).

Referencia visual exacta: design/canvas/app/Login.dc.html (escritorio) y
LoginMobile.dc.html (móvil).

Qué construir en packages/ui/src/auth/:
- LoginForm con Google, Apple, correo y contraseña (mostrar/ocultar con
  aria-label que cambia, «¿La olvidaste?») y el modo de enlace mágico que
  reemplaza la contraseña por «Enviarme el enlace». Reutiliza las piezas de
  SignupForm si ya existen (mismo panel de dos mitades y mismo panel de producto).
- El panel derecho con los 3 resultados más probables reales y Radar.
- Stories en los dos temas: contraseña, enlace mágico, enlace enviado y
  credenciales incorrectas.

IMPORTANTE: no reemplaces el acceso actual con PIN de apps/web/app/login ni toques
las E2E 2 y 3. LoginForm recibe sus acciones por props; la integración con
Better Auth es otra tarea.

Terminado cuando: las stories se ven bien a 375 y 1440 px en los dos temas, axe
sin violaciones, y pnpm typecheck y pnpm test pasan.
```

---

## 5. Landing (`/`): solo para cambios

```text
Eres el agente de UI de PitchLab. La landing «Pregunta un partido» ya está
construida y probada; vas a cambiarla, no a reescribirla.

Lee primero: AGENTS.md, apps/web/PRODUCT.md, docs/design/UI_LIBRARIES.md y
docs/design/GUIA_RECREACION_GPT.md (§2, §3 y §9).

Archivos: packages/ui/src/landing/landing-v2.tsx (componente),
packages/ui/src/landing/data.ts (snapshot → datos),
packages/ui/src/landing/content.ts (planes, precios y ligas: fuente única),
apps/web/app/landing-v2.css (estilos bajo .lv) y
apps/web/src/server/landing.ts (carga en el servidor).

Cambio a hacer: <DESCRIBE AQUÍ EL CAMBIO>

Mantén: el selector de liga deslizable, la hoja de análisis con «Tu cuota», el
orden de secciones, los dos temas y el ThemeToggle. Revisa la story
«PitchLab/Landing definitiva» a 375 y 1440 px en los dos temas, y que pasen
pnpm typecheck, pnpm test y las E2E 1, 4 y 5 de apps/web/e2e/pre-mvp.spec.ts.
```
