---
status: accepted
date: 2026-11-13
updates:
  - ADR-021
  - ADR-025
  - ADR-026
---

# ADR-036: Flujo de diseño *Canvas-First* (`design/canvas/`), membresía `Pase PitchLab Ultra`, arquitectura de navegación simplificada y revisión de `FD-16`

- **Estado:** Aceptada (`accepted`; implementada en portada y 6 rutas públicas, `/login`, `/signup`, `/app/u/[handle]`, `/app/social`, barra lateral y menú de cuenta; **en implementación activa** para `Inicio` `/app` y `Mi cuenta` `/app/account`). Reemplaza en parte a [ADR-021](ADR-021-arquitectura-cero-fuga-pase-total-unico-y-crecimiento-tipster.md), [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md) y [ADR-026](ADR-026-contrato-ejecutable-prototipo-maestro-y-simulacion-roles.md).
- **Fecha:** 2026-11-13.

## Contexto

Tras completar la paridad 1:1 con el archivo monolítico `design/prototipo-maestro/prototipo-maestro-pitchlab.html` ([ADR-026](ADR-026-contrato-ejecutable-prototipo-maestro-y-simulacion-roles.md)), la auditoría de UX solicitada por el fundador (`UI-SIMPLE`, `UI-PULIDO-2` y `LANDING-2`) identificó cuatro problemas estructurales:

1. Un único HTML estático de 6,960 líneas no servía para rediseñar ni iterar pantallas individuales (escritorio + móvil + estados interactivos) sin arrastrar deuda visual entre vistas.
2. El exceso de jerga cuantitativa/anglicismos en tarjetas cotidianas (`SGP`, `CLV`, `ROI`, `Kelly`, `Escudo Conservador`, `Sellar`, `Title Case` y 43 encabezados en `UPPERCASE`) alejaba al fan analítico (`P1`), mientras que al mismo tiempo ocultar los nombres de los 5 motores propios debilitaba la diferenciación comercial de la marca en la web pública.
3. Convivían cinco mecanismos distintos de navegación para 14 secciones, encareciendo la carga cognitiva en móvil y escritorio.
4. La denominación comercial del plan único evolucionó por decisión del fundador hacia una identidad aspiracional unificada con la tarjeta holográfica de membresía.

## Decisión

1. **Contrato visual *Canvas-First* por superficie (`design/canvas/<superficie>/`):**
   - Cada pantalla o componente mayor se diseña y aprueba primero en lienzos autocontenidos de escritorio y móvil (`Main.dc.html`, `Mobile.dc.html` y notas en `canvas.json` dentro de `design/canvas/{landing,login,profile,social,account-menu,barra,inicio,cuenta}/`), sustituyendo a `prototipo-maestro-pitchlab.html` en toda superficie migrada.
   - Los colores cortos del lienzo (`--bg`, `--t1`, `--brand`, `.ring`) se traducen obligatoriamente a tokens `--pl-*` en código (`0` hex fuera de `packages/tokens`), verificando paridad en `1440 px` y `375 px`, temas oscuro y claro, y WCAG 2.2 AA con `AxeBuilder`.
2. **Renombrado comercial a `Pase PitchLab Ultra`:**
   - La membresía única pasa a llamarse oficialmente **`Pase PitchLab Ultra`** (`$299 MXN/mes` o `$2,390 MXN/año`, IVA incluido y CFDI 4.0, representada visualmente con `UltraTag`), manteniendo exactamente las mismas reglas de acceso total sin niveles intermedios ni venta de picks sueltos de [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md) (en código interno y funciones de base como `hasActivePaseTotal` se conserva el identificador técnico para no romper migraciones).
3. **Arquitectura de rutas públicas y navegación del Club:**
   - **Sitio público:** `/` más 6 páginas dedicadas en menú (`/como-funciona`, `/motores`, `/resultados`, `/parlays`, `/comunidad`, `/precio`), con redirecciones permanentes **`308`** desde `/metodologia` → `/motores`, `/tecnologia` → `/motores` y `/pricing` → `/precio`.
   - **Club (`/app`):** barra lateral fija a la izquierda (plegable con memoria) reducida a **4 destinos principales** (`Hoy` —en transición a `Inicio` con tira de fechas según `design/canvas/inicio/`—, `Armar parlay`, `Mi bitácora`, `Cuenta` / `Comunidad`), grupo desplegable `Ligas` y grupo secundario `Más`, replicados en el dock inferior móvil; los controles de `Momio`, `Tema`, récord rápido, `Mi cuenta` y `Salir` se concentran en el menú de cuenta (popover en escritorio, hoja inferior en móvil).
   - **Reescritura modular de `Mi cuenta` (`/app/account`, en curso bajo `prompts/antigravity/CUENTA.md`):** división de `AccountReferralsClubView` en 4 pestañas subrayadas WAI-ARIA (`Invitar amigos · Mi plan · Preferencias · Facturación` en `?tab=referrals|plan|prefs|cfdi`), auto-guardado de preferencias y controles granulares de privacidad y juego responsable.
4. **Actualización de `FD-16` y lenguaje claro en español de México:**
   - **Permitido y promovido:** nombrar los **5 motores propios** (`Tachyon`, `Singularity`, `Minkowski`, `Geodesic` y `Cortex IA`) y las `+100,000` muestras históricas verificadas (`104,320` reales entrenadas entre fútbol y NFL) como diferenciador de PitchLab.
   - **Prohibido en UI:** proveedores de datos (`nflverse`, `openfootball`, `api-football`, `Polymarket`, `Kalshi`, `Understat`, `ESPN`), fórmulas estadísticas crudas (`Poisson`, `Dixon-Coles`, `LightGBM`, `Platt`, `Pitágoras`, `Log5`) y vocabulario de promesa o jerga de apostador (`pick seguro`, `más seguro` → `Muy probable`, `gana/ganó`, `cobra`, `ROI`, `Kelly`, `sellar` → `registrar`, `Socios VIP`).

## Qué reemplaza

- **ADR-021 y ADR-025:** actualiza el nombre comercial `Pase Total` → `Pase PitchLab Ultra` y las rutas públicas hacia `/motores` y `/precio` (`308`).
- **ADR-026:** `design/prototipo-maestro/prototipo-maestro-pitchlab.html` queda como archivo histórico para vistas aún no rediseñadas; los lienzos de `design/canvas/*` son la nueva fuente visual canónica.

## Alternativas descartadas

- **Seguir editando `prototipo-maestro-pitchlab.html` como referencia única:** inmanejable por tamaño y acoplamiento entre las 11 vistas.
- **Ocultar también los nombres de `Tachyon`…`Cortex IA` en la web pública:** restaba identidad propia frente a hojas de datos genéricas; solo deben ocultarse proveedores terceros y fórmulas crudas.

## Consecuencias

- Cada pantalla nueva o rediseñada sigue un ciclo reproducible: lienzo en `design/canvas/<superficie>/` → prompt acotado en `prompts/antigravity/` → implementación con tokens `--pl-*`, stories en ambos temas y verificación E2E + Axe AA.
