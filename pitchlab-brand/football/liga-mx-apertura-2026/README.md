# Liga MX · Emblemas editoriales

**México · Apertura 2026 · Edición 01**

La colección incluye la Liga MX y sus 18 clubes del torneo, incluido Atlante. Sigue el criterio aprobado para la Premier League. Cada club conserva colores, motivos y siluetas propios, mientras la interfaz usa los tokens de PitchLab.

[Catálogo completo](catalogo.png) · [Prueba en tarjetas y tamaños de tabla](prueba-ui.png) · [Manifiesto de activos](manifest.json)

## Dirección visual

La liga se identifica con un balón marfil entre dos graderías escalonadas, una verde y otra granate. Las gradas enmarcan el balón sin formar el motivo cruzado de la marca oficial. Para los clubes se eligieron rasgos reconocibles y se redibujaron sus composiciones. América tiene un águila azulcrema, Chivas combina los cuernos con sus rayas, Monterrey encuadra el Cerro de la Silla y Puebla lleva su franja en una medalla.

| Contexto | Tamaño de caja | Tratamiento |
|---|---:|---|
| Tablas | 24 px | Junto al nombre corto o código |
| Listas y encabezados | 32 px | Junto al nombre visible |
| Tarjetas de partido | 48 px | Alineado con el nombre del equipo |
| Vistas compactas | 20 px | Con rótulo corto |
| Espacio mínimo | 16 px | Solo con nombre o código visible |

La caja de 80 × 80 mantiene los emblemas alineados. Respeta la proporción y los colores. Usa alt vacío cuando el nombre del equipo ya aparece a su lado. Si el emblema aparece solo, agrega un nombre accesible. En contextos públicos, presenta los emblemas como ilustraciones editoriales de PitchLab. La comparación de semejanza fue visual y preliminar.

## Integración para Opus

1. Copia la carpeta a `public/brand/football/liga-mx-apertura-2026/` en proyectos con recursos estáticos en `public/`.
2. Usa `manifest.json` para mapear los IDs del proveedor al campo `id`. Los códigos de tres letras son rótulos de UI y pueden diferir de los de un proveedor. Conserva la distinción entre `atlante` y `atlas`.
3. Usa `svg` para pantallas y `png` donde se requiera mapa de bits. Para equipos ausentes, muestra el nombre o código en estilo neutral. La colección representa la participación en Apertura 2026.
4. Para el sprite, sirve `pitchlab-liga-mx.sprite.svg` desde el mismo origen. Concatena la ruta y `#` seguido de `symbolId`. Por ejemplo, `pitchlab-liga-mx.sprite.svg#pitchlab-america`.

```tsx
const assetBase = "/brand/football/liga-mx-apertura-2026/";

export function LigaMxBadge({
  entry,
  size = 24,
  decorative = true,
}: {
  entry: { svg: string; name: string };
  size?: 16 | 20 | 24 | 32 | 48;
  decorative?: boolean;
}) {
  return (
    <img
      src={assetBase + entry.svg}
      alt={decorative ? "" : entry.name}
      width={size}
      height={size}
      decoding="async"
      className="shrink-0"
    />
  );
}
```

## Archivos verificados

- 19 SVG de 80 × 80 editables, sin fuentes ni imágenes incrustadas.
- 19 PNG de 256 × 256 con transparencia exterior.
- Sprite SVG con la misma geometría y los mismos colores que los originales.
- Catálogo y prueba de interfaz en SVG y PNG. Se revisaron los tamaños de 16, 20, 24 y 32 px sobre fondo oscuro.
- Manifiesto con el motivo, la fuente de referencia, los colores y las rutas de cada entrada. El contraste mínimo entre la tinta principal y el campo declarado es **5.78:1**.

La participación se verificó con los nueve partidos de la jornada 9 publicados por la FMF y con la tabla del Apertura 2026. [Jornada de la FMF](https://arbitraje.fmf.mx/detalle-noticia/liga-bbva-mx-apertura-2026--designaciones-arbitrales-jornada-9_2302) · [Clasificación del torneo](https://mexico.as.com/resultados/futbol/mexico_apertura/clasificacion/)
