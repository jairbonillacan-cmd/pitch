# D1 · Revisión de diseño base (landing + panel)

> **Propósito:** prototipos del diseño base para aprobación del fundador antes de implementar (pre-MVP y prompt 00).
> **Estado:** iteración 2 · ⏳ pendiente de aprobación final · **Fecha:** 2026-11-08
> **Prototipos:** `design/d1/landing.html` y `design/d1/panel.html`. Abrir con un servidor desde la raíz del repo: `python -m http.server 4173` → `http://localhost:4173/design/d1/landing.html`.

## 1. Decisiones del fundador (iteración 2)

| Pedido | Resolución |
|---|---|
| Panel con tarjetas (propuesta B) | ✅ Adoptado. Se eliminó la propuesta A. |
| Al hacer clic, animación de recopilar datos y calcular | ✅ Traza de cálculo **con los valores reales de cada paso** (fuente y hora, tasas de ataque y defensa, regresión, goles o puntos esperados, distribución y mercados), con barra de progreso y esqueleto de la tabla. Dura ~1.5 s la primera vez y ~0.5 s si ya se calculó en la sesión. Se puede saltar («Saltar») y se omite con `prefers-reduced-motion` o en partidos finalizados. |
| Modal de ventana en lugar del panel lateral | ✅ `<dialog>` nativo centrado (máximo 960 px). Entra con fade y escala. Cierra con ×, clic fuera o Escape, y el foco vuelve a la tarjeta. En móvil ocupa la pantalla completa. |
| Versión oscura y clara | ✅ Botón de tema en el header. Respeta la preferencia del sistema y la recuerda. El oscuro usa los tokens oficiales. El claro es una **propuesta derivada de la marca** (Iris + Tinta sobre Blanco y Hielo). Contraste verificado: texto 18.9 / 9.5 / 5.9:1, Iris 7.5:1, contornos 3.6:1. |
| Mejores animaciones en toda la página | ✅ Entrada escalonada del hero, trayectoria «Campo de corte» que se dibuja, Radar flotando, tarjetas que aparecen al hacer scroll, barras que crecen y porcentajes que cuentan, hover con elevación y flechas que avanzan, pulso en los indicadores de frescura. Todo se apaga con movimiento reducido. |
| Mejor landing y menos texto | ✅ Rehecha: hero con una línea de propuesta, «Escoge tu liga» con la mascota de cada liga, demo interactiva «Así se lee un partido», 4 «Reglas de la casa» de una línea cada una y un cierre corto. Se quitaron los párrafos explicativos. |
| Mascota donde haga falta | ✅ Radar (`pitchlab-brand/mascot/web/`): con tableta en el hero, en la traza de cálculo y en los estados vacíos; con el uniforme de cada liga en las tarjetas de liga y en el encabezado del panel; con la edición de fútbol en el cierre. |

Además se integraron los **emblemas de NFL** que entregó GPT (`pitchlab-brand/american-football/nfl-2026/`). Ya no hace falta el fallback para NFL.

## 2. Verificación hecha

- **Landing:** 1440 px y 390 px, en tema oscuro y claro. Sin scroll horizontal ni errores de consola.
- **Panel:** cambio de liga, filtro por día, clic → traza → análisis, filas de mercado y comparación con cuota (`+120` → implícita y diferencia), cierre con Escape y devolución del foco. Probado en 1440 px oscuro y claro y en 390 px.
- **Ajustes hechos tras revisar:** espaciado de los pasos, foco al abrir el modal (va a la ventana, no al botón ×), la tabla ya no se estira en el modal, la barra 1X2 se ajusta en móvil y el CTA del header móvil tiene nombre accesible.
- **No verificado:** axe y Lighthouse automatizados, lector de pantalla real y Safari iOS. Quedan para la implementación (`QUALITY_GATES.md`).

## 3. Contrato de diseño propuesto (a promover a `DESIGN_SYSTEM.md` al aprobar)

- **Temas:** oscuro por defecto según la marca; claro opcional. Todos los colores salen de tokens (se agregan `--on-primary` y `--glow` como tokens derivados).
- **Movimiento:** entradas de 520 ms con desplazamiento de 12 px y escalonado de 60–90 ms, modal de 240 ms, hover de 120 ms, todo con `--ease-out`. Barras de 700 ms y conteos de 650 ms. Traza de cálculo de 230 ms por paso (70 ms al repetir).
- **Mascota:** Radar con tableta para estados de sistema (calculando, vacío); edición de la liga en contextos de liga; tamaño de 160–520 px; siempre decorativa (`alt=""`) y nunca tapando datos.
- **Anti-defaults:** sin «LIVE» ni «tiempo real» sobre datos estáticos, sin «pick del día», montos ni porcentaje del bank, sin gradientes decorativos (el único brillo es el halo detrás de Radar, por legibilidad sobre fondo oscuro).

## 4. Pendiente tras la aprobación

1. Promover el contrato a `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`.
2. Validar con la marca la paleta del tema claro y los tokens nuevos (`--on-primary`, `--glow`).
3. Implementar en el pre-MVP (`PRE_MVP.md` §9, paso 6) con datos reales.
