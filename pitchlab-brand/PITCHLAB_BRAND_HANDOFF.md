# PitchLab · Brand-to-UI Handoff para Claude Opus 5.5

Versión 1.0 · 8 de noviembre de 2026. Las rutas parten de la raíz de este paquete.

## Instrucción para agentes

~~~text
Estás trabajando en PitchLab. Debes utilizar la identidad oficial de marca definida en este documento. No modifiques el logotipo, no inventes paletas alternativas y no diseñes componentes que contradigan el sistema visual. Todos los módulos deben compartir los mismos tokens, tipografías y principios de navegación.
~~~

## Marca y voz

PitchLab es una superapp de inteligencia deportiva por suscripción. Nace en México con alcance internacional y cubre NFL, NCAA Football, fútbol, NHL y MLB. Reúne datos históricos, análisis de partidos, estadísticas avanzadas, probabilidades, simulaciones, backtesting, comparación de cuotas y un asistente de investigación. Su posición es la de un laboratorio con fuentes, contexto y método visibles. Su personalidad es precisa, competitiva, tecnológica, confiable y cercana. Escribe siempre **PitchLab**, con P y L mayúsculas, sin espacio. El eslogan principal es **Lee el juego con datos.**

Escribe primero el dato, luego el contexto y después la acción. Usa verbos como comparar, explorar, estimar e investigar. Distingue observación, estimación y simulación. Identifica fuente, periodo, muestra y fecha de actualización cuando sean relevantes. Presenta cuotas como datos comparativos con formato y hora. Evita promesas de ganancias, certeza infalible y lenguaje de depósitos o apuestas.

## Identidad gráfica

**The Sports Lab / Campo de corte.** Sobre una retícula de 64 × 64, dos piezas sólidas comparten una envolvente de 48 × 48, de 8 a 56 en ambos ejes. El cuerpo superior pasa de horizontal a un frente facetado. El apoyo inferior abre un corredor de 45° de unos 7,1 módulos medidos perpendicularmente al corte. El vacío sugiere una P y una trayectoria de análisis. Conserva ambas piezas y el vacío. La P abstracta cumple la función de monograma.

**Logotipo.** PitchLab está dibujado con ocho contornos propios. Altura de mayúsculas 42 unidades, altura nominal de minúsculas 31, línea base en y=44 y sobrepaso óptico de 1 unidad en curvas. El peso y el color son constantes en «Pitch» y «Lab». La mayúscula L y el espacio de 7 unidades h–L marcan el cambio de palabra. Usa los contornos oficiales.

**Proporciones.** Isotipo 64:64. Firma horizontal 331:64, símbolo a escala 1 y logotipo a (74, 8). Firma compacta 272:64, logotipo al 80 % en (65, 13,6). Firma apilada 265:132, símbolo al 130 % y nombre centrado. Logotipo 249:43. El isologo 344:80 usa un marco facetado conectado al símbolo por la izquierda y la base, con el nombre dentro.

**Protección.** Para las firmas horizontal y compacta reserva por fuera del viewBox al menos 8/64 de su altura. El isotipo integra 8 módulos de espacio por cada 64 desde su contorno visible. En la apilada reserva 10/132 de su altura, en el logotipo 8/43 y en el isologo 10/80, siempre por fuera de la caja. En avatares y app icons usa el arte con margen preparado para recorte circular.

| Activo | Ancho mínimo digital | Ancho mínimo de impresión | Uso |
|---|---:|---:|---|
| Isotipo | 16 px | 4,5 mm | Favicon e indicador de producto |
| Horizontal | 132 px | 32 mm | Header, landing, email |
| Compacta | 120 px | 30 mm | Menú móvil o navegación densa |
| Apilada | 110 px | 28 mm | Portadas e impresos |
| Logotipo | 100 px | 26 mm | Editorial |
| Isologo | 184 px | 44 mm | Sello editorial o contraportada |

En oscuro usa Pulso y Hielo sobre Tinta, Órbita o Pizarra. En claro usa Iris y Tinta sobre blanco o Hielo. Usa blanco o negro sólidos en monocromo. Para producción a una tinta, el SVG Iris ofrece una única separación de referencia. En fotografía reserva un campo Tinta uniforme. Mantén proporciones, orden, espacio libre y colores. Evita estirar, rotar, reconstruir en texto, trazar contornos, invertir piezas, aplicar efectos y colocar sobre alto detalle.

[Prueba de escala](exploration/scale/) · [Firma horizontal](logos/pitchlab-horizontal-dark.svg) · [Isologo](logos/pitchlab-isologo-dark.svg)

## Paleta oficial

| Token | Nombre | HEX | RGB | Función | Permitido | Restricción |
|---|---|---|---|---|---|---|
| brand-primary | Pulso | #B49AFF | 180, 154, 255 | Acción primaria y firma | Un CTA dominante por región, foco y marca sobre oscuro | Texto Tinta sobre relleno; reservar fuera de series y estados |
| brand-secondary | Iris | #5940B2 | 89, 64, 178 | Firma sobre claro | Isotipo sobre Hielo o blanco | Evitar como texto o control sobre oscuro |
| brand-accent | Eco | #71C9F1 | 113, 201, 241 | Segunda serie comparativa | Comparadores y series con etiqueta y trazo discontinuo | Reservar Info para mensajes de estado |
| background-primary | Tinta | #0B1020 | 11, 16, 32 | Lienzo y texto inverso | App, fondos de firma y texto sobre Pulso | Para texto inverso usar solo sobre fondos claros comprobados |
| background-secondary | Órbita | #10172A | 16, 23, 42 | Navegación | Sidebar, topbar y menú móvil | Separar del lienzo con borde o espacio |
| background-elevated | Umbral | #1A2440 | 26, 36, 64 | Elevación | Diálogos, menús y popovers | Evitar apilar más de dos niveles de superficie |
| surface-default | Pizarra | #151E34 | 21, 30, 52 | Paneles | Cards, tablas y formularios | Agrupar por estructura, sin alternar colores arbitrariamente |
| surface-hover | Bruma | #222D49 | 34, 45, 73 | Interacción hover | Filas, botones secundarios y filtros | Acompañar la interacción con foco visible |
| surface-active | Iris nocturno | #302650 | 48, 38, 80 | Selección persistente | Filtros, pestañas y navegación activa | Añadir etiqueta o indicador y aria-current/aria-selected |
| text-primary | Hielo | #F3F5FD | 243, 245, 253 | Lectura principal | Encabezados, métricas y copy | Sobre superficies oscuras |
| text-secondary | Niebla | #B8C1D7 | 184, 193, 215 | Lectura secundaria | Descripción, ejes, leyenda y ayuda | Conservar jerarquía con peso y tamaño |
| text-muted | Peltre | #98A4BF | 152, 164, 191 | Metadatos legibles | Fuentes, fechas y notas | Evitar opacidad extra en texto informativo |
| border-default | Arista | #33405D | 51, 64, 93 | División ornamental | Separadores internos o cards estáticas | Usar Arista firme si el contorno identifica un control |
| border-strong | Arista firme | #73819F | 115, 129, 159 | Contorno funcional | Controles secundarios, inputs y límites activos | Usar sobre fondos oscuros del sistema |
| success | Menta | #66D9AE | 102, 217, 174 | Operación completada | Estado con icono y texto | Evitar para comunicar rendimiento por defecto |
| warning | Ámbar | #FFC473 | 255, 196, 115 | Atención | Datos parciales o fuera de ventana | Acompañar con motivo visible |
| danger | Coral | #FF9BAA | 255, 155, 170 | Error | Error de proceso o campo | Añadir explicación y recuperación |
| info | Azul guía | #A9BFFF | 169, 191, 255 | Aviso informativo | Disponibilidad, metodología, cambios de fuente | Evitar como segunda serie |
| canvas-light | Blanco | #FFFFFF | 255, 255, 255 | Fondo claro de firma | Documentación o fondos corporativos | Usar firma con Iris y Tinta |
| chart-model | Índigo claro | #D9DFFF | 217, 223, 255 | Serie principal | Modelo o serie enfocada con trazo sólido | Agregar etiqueta directa o leyenda |

En las seis superficies oscuras, los mínimos son Hielo 12,53:1, Niebla 7,57:1 y Peltre 5,45:1. Pulso conserva 5,85:1 como foco. Tinta sobre Pulso alcanza 8,12:1. Iris sobre blanco alcanza 7,50:1. Arista firme conserva 3,49:1 en contornos funcionales. Arista es decorativo. El CSV incluye las 68 combinaciones verificadas.

## Tipografía

Usa Inter Variable (ejes wght y opsz) en display, UI y datos. Peso 400–750 en el sistema, con fallback a Inter y system-ui. Descarga el WOFF2 oficial, sirve el recurso local con font-display: swap y declara font-weight: 100 900. Conserva ñ, acentos, ¿, ¡, %, símbolos de moneda y signos matemáticos habituales. Usa font-variant-numeric: tabular-nums lining-nums en datos comparables. Usa Intl.NumberFormat para es-MX y la configuración regional del usuario. Las maquetas y el manual exportado usan Segoe UI como fuente de sistema disponible. El logotipo conserva sus contornos originales.

[Inter oficial](https://rsms.me/inter/) · [Licencia SIL OFL 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt)

| Rol | Tamaño / interlínea px | Móvil px | Peso | Tracking |
|---|---:|---:|---:|---:|
| display | 56 / 60 | 40 / 44 | 750 | -0.045 em |
| h1 | 40 / 44 | 32 / 36 | 730 | -0.035 em |
| h2 | 28 / 34 | 24 / 30 | 700 | -0.025 em |
| h3 | 20 / 26 | Igual | 650 | -0.015 em |
| body | 16 / 24 | Igual | 400 | 0 em |
| small | 14 / 20 | Igual | 450 | 0 em |
| caption | 12 / 16 | Igual | 500 | 0.01 em |
| button | 14 / 20 | Igual | 650 | 0 em |
| table | 14 / 20 | Igual | 450 | 0 em |
| numeric-highlight | 36 / 40 | 32 / 36 | 700 | -0.03 em |

## Tokens de dimensión y movimiento

- **space** · --space-1 4px · --space-2 8px · --space-3 12px · --space-4 16px · --space-5 20px · --space-6 24px · --space-8 32px · --space-10 40px · --space-12 48px · --space-16 64px · --space-20 80px
- **radius** · --radius-control 8px · --radius-panel 12px · --radius-overlay 16px · --radius-pill 999px
- **border** · --border-width 1px · --border-focus 2px
- **shadow** · --shadow-overlay 0 12px 32px #00000066
- **time** · --time-fast 120ms · --time-base 180ms · --time-enter 240ms · --time-loading 900ms
- **ease** · --ease-out cubic-bezier(0.2, 0.8, 0.2, 1)
- **layout** · --layout-sidebar 232px · --layout-header 64px · --layout-mobilebar 64px · --layout-touch 44px · --layout-content 1440px · --layout-tableRow 44px

## Integración web

Copia tokens/brand-tokens.css a la carpeta de estilos e impórtalo desde la entrada global de React o el layout raíz de Next.js. Declara la fuente local como InterVariable. Usa las variables como fuente única de verdad. El JSON documenta roles y sirve para integrar herramientas de diseño. En Tailwind usa valores arbitrarios con variables o mapea los tokens al tema.

~~~tsx
export function PitchLabHomeLink() {
  return (
    <a href="/" aria-label="PitchLab · Inicio"
       className="inline-flex min-h-[44px] items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]">
      <img src="/brand/logos/pitchlab-horizontal-dark.svg" alt="" width={148} height={29} />
    </a>
  );
}
~~~

Coloca los activos en public/brand/ para la ruta de ejemplo. Usa el SVG compacto en móvil. Si el logotipo aparece fuera de un enlace, usa alt="PitchLab". Si el icono acompaña texto equivalente, usa aria-hidden o alt="".

~~~css
.pitchlab-panel {
  background: var(--surface-default);
  color: var(--text-primary);
  border: var(--border-width) solid var(--border-default);
  border-radius: var(--radius-panel);
  padding: var(--space-6);
}
.pitchlab-data {
  font-family: var(--font-family);
  font-size: var(--type-table);
  line-height: var(--line-table);
  font-variant-numeric: tabular-nums lining-nums;
}
:focus-visible {
  outline: var(--border-focus) solid var(--brand-primary);
  outline-offset: 2px;
}
~~~

## Sistema gráfico

- **Iconos.** Retícula 24 × 24, área activa 18 × 18, trazo 1,75 px, terminales y uniones redondos y radio visual cercano a 2 px. Usa 20 px en filas, 24 px en controles y 32 px en estados. Hereda currentColor. Reserva Pulso para foco y selección. Acompaña cada acción con etiqueta visible o nombre accesible.
- **Retícula Campo de corte.** Módulos de 32 px, líneas Arista con opacidad de 42 % y trayectoria de 2 px con la misma opacidad. Usa un motivo por composición, recortado a un lateral o bajo un área sin texto. Las retículas analíticas se mantienen independientes del patrón decorativo.
- **Ilustración.** Usa diagramas de coordenadas, trayectorias y cortes de campo cuando expliquen un dato. En piezas editoriales emplea la retícula o el isotipo a gran escala.
- **Fotografía.** Usa material propio o licenciado. Prioriza acciones donde se lea la postura, el apoyo o la trayectoria. Recorta el sujeto en un tercio, desatura el fondo y preserva los tonos de piel. Si superpones texto, aplica placa Tinta o cobertura Tinta del 65–80 % y mide contraste sobre el punto más luminoso. Conserva los créditos y las condiciones de uso.
- **Motion.** Entrada de firma con opacidad y 6 px de desplazamiento en 240 ms. El splash cede al contenido al estar listo. Barra indeterminada a 900 ms o valor real si se conoce. Hover en 120 ms, selección y paneles en 180 ms. Curva cubic-bezier(0.2, 0.8, 0.2, 1). Con prefers-reduced-motion elimina desplazamiento y bucles y conserva texto y señal visibles. [Demo local](applications/motion.html).

## Aplicación en producto

| Elemento | Regla |
|---|---|
| Header | 64 px, fondo Órbita, borde Arista y firma horizontal a 148 px. En móvil usa compacta a 124 px. Nombre accesible «PitchLab · Inicio» si enlaza. |
| Sidebar | 232 px desde 1200 px, fondo Órbita. Filas de 44 px con iconos de 20 px. Selección con Iris nocturno, texto Hielo, indicador Pulso y aria-current="page". |
| Navegación | Menos de 768 px, menú móvil o barra inferior de 64 px con cuatro destinos y «Más». De 768 a 1199 px, rail de 64 px o panel. El drawer captura y devuelve foco y cierra con Escape. |
| Botón primario | Pulso con texto Tinta, radio 8 px, altura mínima 44 px y padding horizontal 16 px. Un CTA primario por región. En hover y pressed usa subrayado o anillo. |
| Botón secundario e inputs | Pizarra, texto Hielo y borde Arista firme. Hover Bruma. Error con Coral, icono y texto asociado al campo. Etiqueta persistente. |
| Cards y superficies | Tinta de fondo, Pizarra en tarjetas, radio 12 px, borde Arista de 1 px y padding 16 o 24 px. Umbral y radio 16 px para overlays. Sombra 0 12px 32px #00000066 solo en overlays. |
| Estadísticas | Cifras tabulares alineadas, unidad visible, ventana y denominador. Jerarquía de cifra 36/40, 32/36 en móvil. Todo cambio incluye dirección, base y periodo. |
| Tablas | Encabezados con scope, filas de 44 px, números a la derecha y texto a la izquierda. Usa aria-sort y unidad en encabezado. En móvil prioriza columnas y permite scroll interno etiquetado. |
| Gráficas | Modelo en Índigo claro con línea continua de 2 px. Serie observada en Eco con patrón 6/4. Rotula ejes y unidad. Leyenda con muestras de trazo, resumen textual y tabla accesible. Interrumpe la línea donde falten datos. |
| Avatares | Usa social/social-profile.png para la cuenta oficial y el isotipo para el asistente. Las personas usan foto o iniciales en neutro. Respeta el área circular central. |
| Estados | Menta, Ámbar, Coral o Azul guía con icono y texto. Carga con aria-busy y mensaje en role="status". Ofrece siguiente acción en vacíos y errores. |
| Asistente | Expón fuentes, periodo, hora de corte e incertidumbre. Permite consultar los datos de soporte. |

**Responsive.** 4 columnas en móvil con margen 16 y gap 12. 8 columnas desde 768 px con margen 24 y gap 16. 12 desde 1200 px con margen 32 y gap 24. Contenido hasta 1440 px. Usa las escalas móviles bajo 768 px.

**Accesibilidad.** Objetivo WCAG 2.2 AA. Texto normal ≥4,5:1, texto grande y elementos funcionales ≥3:1. Anillo Pulso de 2 px con offset de 2 px sobre oscuro. En controles Pulso el offset deja una banda oscura visible entre relleno y foco. Dianas de 44 × 44 px como estándar interno. Prueba teclado, contraste, estados, lectura de datos y movimiento reducido en los flujos reales.

## Estado de lanzamiento

Las cifras y los planes en los mockups son ejemplos. Existe una coincidencia exacta de nombre con una app de análisis de béisbol. Queda pendiente la validación formal ante el IMPI y organismos de otros mercados. [Revisión preliminar](exploration/RESEARCH_AND_SELECTION.md).

## Inventario de archivos

- [PITCHLAB_BRAND_HANDOFF.md](PITCHLAB_BRAND_HANDOFF.md)
- [README.md](README.md)
- [VALIDATION.md](VALIDATION.md)
- [app-icons/app-icon-192.png](app-icons/app-icon-192.png)
- [app-icons/app-icon-512.png](app-icons/app-icon-512.png)
- [app-icons/apple-touch-icon.png](app-icons/apple-touch-icon.png)
- [app-icons/favicon-16.png](app-icons/favicon-16.png)
- [app-icons/favicon-32.png](app-icons/favicon-32.png)
- [app-icons/favicon.svg](app-icons/favicon.svg)
- [applications/dashboard.svg](applications/dashboard.svg)
- [applications/display-ad.svg](applications/display-ad.svg)
- [applications/email.svg](applications/email.svg)
- [applications/hero.svg](applications/hero.svg)
- [applications/index.html](applications/index.html)
- [applications/loading.svg](applications/loading.svg)
- [applications/login.svg](applications/login.svg)
- [applications/mobile.svg](applications/mobile.svg)
- [applications/motion.html](applications/motion.html)
- [applications/pricing.svg](applications/pricing.svg)
- [applications/slide-cover.svg](applications/slide-cover.svg)
- [applications/splash.svg](applications/splash.svg)
- [exploration/01-propuestas.png](exploration/01-propuestas.png)
- [exploration/01-propuestas.svg](exploration/01-propuestas.svg)
- [exploration/RESEARCH_AND_SELECTION.md](exploration/RESEARCH_AND_SELECTION.md)
- [exploration/concepto-a.svg](exploration/concepto-a.svg)
- [exploration/concepto-b.svg](exploration/concepto-b.svg)
- [exploration/concepto-c.svg](exploration/concepto-c.svg)
- [exploration/scale/isotype-128.png](exploration/scale/isotype-128.png)
- [exploration/scale/isotype-16.png](exploration/scale/isotype-16.png)
- [exploration/scale/isotype-24.png](exploration/scale/isotype-24.png)
- [exploration/scale/isotype-32.png](exploration/scale/isotype-32.png)
- [exploration/scale/isotype-512.png](exploration/scale/isotype-512.png)
- [exploration/scale/isotype-64.png](exploration/scale/isotype-64.png)
- [guidelines/BRAND_GUIDELINES.md](guidelines/BRAND_GUIDELINES.md)
- [guidelines/BRAND_GUIDELINES.pdf](guidelines/BRAND_GUIDELINES.pdf)
- [guidelines/COLORS.md](guidelines/COLORS.md)
- [guidelines/LOGO_USAGE.md](guidelines/LOGO_USAGE.md)
- [guidelines/TYPOGRAPHY.md](guidelines/TYPOGRAPHY.md)
- [guidelines/VISUAL_DIRECTION.md](guidelines/VISUAL_DIRECTION.md)
- [guidelines/VOICE.md](guidelines/VOICE.md)
- [logos/pitchlab-compact-black.svg](logos/pitchlab-compact-black.svg)
- [logos/pitchlab-compact-dark.svg](logos/pitchlab-compact-dark.svg)
- [logos/pitchlab-compact-light.svg](logos/pitchlab-compact-light.svg)
- [logos/pitchlab-compact-one-ink.svg](logos/pitchlab-compact-one-ink.svg)
- [logos/pitchlab-compact-white.svg](logos/pitchlab-compact-white.svg)
- [logos/pitchlab-horizontal-black.svg](logos/pitchlab-horizontal-black.svg)
- [logos/pitchlab-horizontal-dark.svg](logos/pitchlab-horizontal-dark.svg)
- [logos/pitchlab-horizontal-light.svg](logos/pitchlab-horizontal-light.svg)
- [logos/pitchlab-horizontal-one-ink.svg](logos/pitchlab-horizontal-one-ink.svg)
- [logos/pitchlab-horizontal-white.svg](logos/pitchlab-horizontal-white.svg)
- [logos/pitchlab-isologo-black.svg](logos/pitchlab-isologo-black.svg)
- [logos/pitchlab-isologo-dark.svg](logos/pitchlab-isologo-dark.svg)
- [logos/pitchlab-isologo-light.svg](logos/pitchlab-isologo-light.svg)
- [logos/pitchlab-isologo-one-ink.svg](logos/pitchlab-isologo-one-ink.svg)
- [logos/pitchlab-isologo-white.svg](logos/pitchlab-isologo-white.svg)
- [logos/pitchlab-isotype-black.svg](logos/pitchlab-isotype-black.svg)
- [logos/pitchlab-isotype-dark.svg](logos/pitchlab-isotype-dark.svg)
- [logos/pitchlab-isotype-light.svg](logos/pitchlab-isotype-light.svg)
- [logos/pitchlab-isotype-one-ink.svg](logos/pitchlab-isotype-one-ink.svg)
- [logos/pitchlab-isotype-white.svg](logos/pitchlab-isotype-white.svg)
- [logos/pitchlab-stacked-black.svg](logos/pitchlab-stacked-black.svg)
- [logos/pitchlab-stacked-dark.svg](logos/pitchlab-stacked-dark.svg)
- [logos/pitchlab-stacked-light.svg](logos/pitchlab-stacked-light.svg)
- [logos/pitchlab-stacked-one-ink.svg](logos/pitchlab-stacked-one-ink.svg)
- [logos/pitchlab-stacked-white.svg](logos/pitchlab-stacked-white.svg)
- [logos/pitchlab-wordmark-black.svg](logos/pitchlab-wordmark-black.svg)
- [logos/pitchlab-wordmark-dark.svg](logos/pitchlab-wordmark-dark.svg)
- [logos/pitchlab-wordmark-light.svg](logos/pitchlab-wordmark-light.svg)
- [logos/pitchlab-wordmark-one-ink.svg](logos/pitchlab-wordmark-one-ink.svg)
- [logos/pitchlab-wordmark-white.svg](logos/pitchlab-wordmark-white.svg)
- [raster/isotype-transparent.png](raster/isotype-transparent.png)
- [raster/logo-transparent.png](raster/logo-transparent.png)
- [raster/social-avatar.png](raster/social-avatar.png)
- [social/open-graph.png](social/open-graph.png)
- [social/open-graph.svg](social/open-graph.svg)
- [social/post-game.png](social/post-game.png)
- [social/post-game.svg](social/post-game.svg)
- [social/post-model.png](social/post-model.png)
- [social/post-model.svg](social/post-model.svg)
- [social/post-stat.png](social/post-stat.png)
- [social/post-stat.svg](social/post-stat.svg)
- [social/social-banner.png](social/social-banner.png)
- [social/social-banner.svg](social/social-banner.svg)
- [social/social-profile.png](social/social-profile.png)
- [tokens/brand-tokens.css](tokens/brand-tokens.css)
- [tokens/contrast-audit.csv](tokens/contrast-audit.csv)
- [tokens/design-tokens.json](tokens/design-tokens.json)
- [visuals/field-grid.svg](visuals/field-grid.svg)
- [visuals/icons/assistant.svg](visuals/icons/assistant.svg)
- [visuals/icons/close.svg](visuals/icons/close.svg)
- [visuals/icons/filters.svg](visuals/icons/filters.svg)
- [visuals/icons/games.svg](visuals/icons/games.svg)
- [visuals/icons/historical.svg](visuals/icons/historical.svg)
- [visuals/icons/info.svg](visuals/icons/info.svg)
- [visuals/icons/panel.svg](visuals/icons/panel.svg)
- [visuals/icons/trend.svg](visuals/icons/trend.svg)
