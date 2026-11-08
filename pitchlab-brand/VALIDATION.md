# Validación de entrega

- **Geometría.** 30 SVG de firma, seis composiciones y cinco tintas por composición. XML válido, viewBox explícito, geometría idéntica entre tintas y contornos editables para el nombre. Los monocromos se verificaron como rellenos únicos.
- **Exportación.** 21 PNG legibles. Los PNG transparentes contienen alfa real. Se verificaron los tamaños nominales de favicon, iconos, Apple touch icon y pruebas de escala. El isotipo se revisó a 16, 24, 32, 64, 128 y 512 px.
- **Contraste.** Las 68 parejas autorizadas pasan los umbrales documentados. Los resultados completos están en [contrast-audit.csv](tokens/contrast-audit.csv). La prueba cubre la paleta definida. Cada flujo de producto requiere validar su composición e interacción.
- **Aplicaciones.** La galería cargó sus 17 ejemplos en Chromium. Se inspeccionaron escritorio y móvil a 1440 y 390 px sin desplazamiento horizontal de página. La demo mantiene estática la entrada al activarla con teclado bajo movimiento reducido.
- **Manual.** 14 páginas renderizadas con Poppler y revisadas visualmente. El PDF conserva texto seleccionable, marcadores y enlaces a las fuentes.
- **Tipografía.** Inter Variable es la familia de producto. Los mockups y el PDF usan Segoe UI para que la previsualización y las exportaciones sean reproducibles con los recursos locales.
- **Alcance marcario.** La comparación visual fue preliminar. Existe un uso comercial exacto de PitchLab en análisis deportivo y queda pendiente la evaluación formal de nombre y símbolo ante el IMPI y en los mercados de expansión.
