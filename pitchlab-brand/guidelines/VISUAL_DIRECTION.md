# Dirección visual

## Sistema gráfico

- **Iconos.** Retícula 24 × 24, área activa 18 × 18, trazo 1,75 px, terminales y uniones redondos y radio visual cercano a 2 px. Usa 20 px en filas, 24 px en controles y 32 px en estados. Hereda currentColor. Reserva Pulso para foco y selección. Acompaña cada acción con etiqueta visible o nombre accesible.
- **Retícula Campo de corte.** Módulos de 32 px, líneas Arista con opacidad de 42 % y trayectoria de 2 px con la misma opacidad. Usa un motivo por composición, recortado a un lateral o bajo un área sin texto. Las retículas analíticas se mantienen independientes del patrón decorativo.
- **Ilustración.** Usa diagramas de coordenadas, trayectorias y cortes de campo cuando expliquen un dato. En piezas editoriales emplea la retícula o el isotipo a gran escala.
- **Fotografía.** Usa material propio o licenciado. Prioriza acciones donde se lea la postura, el apoyo o la trayectoria. Recorta el sujeto en un tercio, desatura el fondo y preserva los tonos de piel. Si superpones texto, aplica placa Tinta o cobertura Tinta del 65–80 % y mide contraste sobre el punto más luminoso. Conserva los créditos y las condiciones de uso.
- **Motion.** Entrada de firma con opacidad y 6 px de desplazamiento en 240 ms. El splash cede al contenido al estar listo. Barra indeterminada a 900 ms o valor real si se conoce. Hover en 120 ms, selección y paneles en 180 ms. Curva cubic-bezier(0.2, 0.8, 0.2, 1). Con prefers-reduced-motion elimina desplazamiento y bucles y conserva texto y señal visibles. [Demo local](../applications/motion.html).

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
