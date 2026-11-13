# Prototipo Maestro PitchLab · Referencia Canónica (`gemini-reestructura`)

> **Actualización 2026-11-11 (ADR-027):** este documento es de la entrega de Gemini del 10 nov. Desde entonces los motores son **Spacetime Suite v3.0** (`packages/spacetime`), la UI ya no muestra momios, bajas ni cifras sin fuente (`+358,400`, `+12.4M`, `69.6 %`, `0.009 ECE` quedaron retiradas), el contenido de demostración lleva la etiqueta «Ejemplo» y las herramientas de preview no usan el PIN en el cliente. El estado vigente está en [`docs/execution/PROJECT_STATE.md`](../../docs/execution/PROJECT_STATE.md) y [ADR-027](../../docs/architecture/adr/ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md).

Este directorio archiva dentro del repositorio los artefactos HTML interactivos que definen el norte visual, físico y funcional de la reestructura de **PitchLab** en la rama `gemini-reestructura`.

Al estar versionados aquí en Git, tanto el fundador como **Claude** (o cualquier agente/auditor Playwright) pueden abrirlos directamente en cualquier navegador y en cualquier computadora tras ejecutar `git pull`, sin depender de carpetas locales fuera del repositorio.

---

## 1. Fuente de Verdad Maestra (Canónica)

### **`prototipo-maestro-pitchlab.html`** — **REFERENCIA MAESTRA CANÓNICA (6,960 líneas)**

- **Rol:** Estrella polar visual, de interacción y de arquitectura de producto para toda la aplicación en `gemini-reestructura` (superficies públicas + club privado `/app`).
- **Cómo abrirlo:** Haz doble clic en `design/prototipo-maestro/prototipo-maestro-pitchlab.html` o ábrelo en cualquier navegador mediante URL `file:///.../design/prototipo-maestro/prototipo-maestro-pitchlab.html` (es 100 % autocontenido; no requiere servidor para ejecutarse).
- **Qué define de forma canónica:**
  - **Física Smoked-Glass (`shows.link` / Apple nativo):** Lienzo obsidiana `#000000` en modo oscuro por defecto (y alabastro limpio en modo claro), lentes translúcidos (`--pl-glass-lens`, `--pl-glass-card` con `backdrop-filter: blur(18px)`), bisel especular limpio de una sola capa (`.glass-ring` sin bordes dobles de alambre), orbes internos dinámicos por colores de club (`.pl-lens-orb` / `LensGlowOrbs`), pedestales de escudos (`.crest-pedestal`), calendarios bitono (`.sq-box`), avatares apilados (`.avatar-stack`) y CTAs primarios blanco puro `#FFFFFF` en modo oscuro (`#09090B` en modo claro).
  - **11 vistas interactivas completas** accesibles desde la barra flotante inferior de salto rápido (*Quick-Jump Bar*):
    1. **Landing Pública (`/`)** — Barra superior Mes 1 sin tarjeta + conmutador de rol (`Visitante | Suscriptor | Tipster | Admin`), Hero `6+6` con boleto interactivo de 5 ligas, 4 slots de picks con frontera **Cero-Fuga**, calculadora viva **Geodesic v1.0**, sección **Spacetime Suite v2.1** (`+358,400` partidos, 5 motores propietarios + comparativa y 4 cubetas de calibración auditadas), pick abierto semanal de `@sofia_nfl` (`SOFIA5`), resultados liquidados FT y sección completa de **Pase Total** (`$299/mes` · `$2,390/año`) + Referidos Doble Vía (`+15 días ambos`) + Portal Tipster (`25 %` comisión recurrente).
    2. **Acceso VIP $0 / Código / PIN (`/signup`, `/login`)** — Reconocedor vivo de códigos (`SOFIA5`, `CARLOS5`, `DIEGO5`, `JAIR`, `SOCIO-8842`), escudo anti-abuso Turnstile `$0`, teclado PIN de 4 dígitos (`2026`) y probador rápido de roles.
    3. **Centro de Mando · Jornada (`/app`)** — Spotlight asimétrico `7/5`, calendario `.sq-box`, síntesis ejecutiva **Cortex IA**, generador rápido de Auto-Parlay, Top 3 Picks y parrilla de partidos.
    4. **Explorador Multi-Picks (`/app/picks`)** — 4 a 5 picks estructurados por partido con probador vivo de momio **Geodesic v1.0** y filtros por liga/riesgo/probabilidad.
    5. **Estudio del Partido · 5 Picks (`/app/[league]/games/[gameId]`)** — Cabecera con orbes de club, fila previa de 3 tarjetas (`Cortex IA`, `Alineaciones y Bajas 60m`, `¿Dónde está el dinero?`), los 5 picks del juego junto al **Debate de Suscriptores** anti-spam y explorador de mercados con probador vivo de momio.
    6. **Armador de Parlays + SGP (`/app/parlays`)** — Flujo de 4 pasos, bloqueo explícito de selecciones contradictorias, amortiguación de correlación *Same-Game Parlay* (`SGP`) y boleto combinado perforado.
    7. **Player Props Lab (`/app/props`)** — Distribuciones continuas por jugador con stepper de línea (`− / +` y `Base`), gráfica L10, calculadora de momio **Geodesic** y sellado a bitácora.
    8. **Comunidad VIP (`/app/social`)** — Boletos verificados y debate cero-spam (`Boletos & Debate`), barras duales `Consenso vs. Suite` y `Ranking CLV (IC 95 %)` sin premios monetarios/materiales.
    9. **Portal Tipster (`/app/tipster` + `/p/sofia-sem`)** — 1 pick público abierto por semana, simulador de vista visitante con los 4 picks restantes bajo candado y exportador de boleto social `4:5` / `9:16` con código promocional.
    10. **Cuenta, Referidos y CFDI 4.0 (`/app/account`)** — Referidos Doble Vía (`+15 días` + barra Embajador de 5 amigos `+30 días`), Pase Total, unidad base en MXN, Modo Pausa Social y perfil fiscal CFDI 4.0 (regímenes SAT `601`, `612`, `626`, `605`).
    11. **Admin Founder (`/app/admin`)** — Switch Mes 1 sin tarjeta vs. Mes 2 verificación `$0.00 MXN`, emisor de códigos Tipster y telemetría de reentrenamiento de los 5 motores de **Spacetime Suite v2.1**.

---

## 2. Archivo Histórico (No Canónico)

### `propuesta-landing-liquid-glass.html` — *Referencia histórica previa (2,802 líneas)*

- **Rol:** Primera exploración aislada de Landing con estética *Liquid Glass* creada antes de consolidar el sistema completo de 11 vistas, la física *Smoked-Glass* refinada y la arquitectura completa del club.
- **Importante:** Se conserva únicamente como contexto evolutivo. **Para cualquier comparación de diseño, auditoría visual en Playwright o implementación de interfaz, usa siempre `prototipo-maestro-pitchlab.html` como única fuente de verdad canónica.**

---

## 3. Comparación lado a lado con la app Next.js en vivo

1. Levanta el servidor de desarrollo de `@pitchlab/web` (por ejemplo con `PREVIEW_ACCESS_CODE=2026 pnpm dev`).
2. Abre en una pestaña `design/prototipo-maestro/prototipo-maestro-pitchlab.html` y en otra la app local (desbloqueando la vista previa con el PIN `2026` o usando el conmutador de rol `Visitante | Suscriptor | Tipster | Admin`).
3. Para el contexto completo de handoff, estado de implementación y siguientes pasos para la sesión con Claude, consulta:
   - `docs/execution/CLAUDE_HOME_SESSION_BRIEF.md`
   - `docs/execution/PROJECT_STATE.md`
   - `docs/execution/HANDOFF_MAESTRO_UI_TOKENS_PUBLIC.md`
   - `docs/execution/HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL.md`
