# LaLiga · Emblemas editoriales

**Temporada 2026/27 · Edición 01**

Un emblema editorial de LaLiga y los 20 clubes de Primera División. La competición se identifica con un balón marfil entre dos arcos coral y un campo granate.

Atlético de Madrid, FC Barcelona, Celta, Real Betis, Real Madrid, Real Sociedad y Villarreal conservan el SVG, el PNG y el ID de su colección europea.

[Catálogo de emblemas](catalogo.png) · [Prueba en interfaz](prueba-ui.png) · [Manifiesto de activos](manifest.json)

## Uso en PitchLab

Usa una caja de 24 × 24 px en tablas, 32 × 32 px en listas y 48 × 48 px en tarjetas. En espacios de 16 o 20 px, acompaña el icono con el nombre o código del equipo. Mantén la proporción cuadrada y la paleta del emblema. Usa los tokens de PitchLab para el resto de la interfaz. Con un nombre visible al lado, marca la imagen como decorativa con alt vacío. Si el emblema aparece solo, ofrece un nombre accesible.

## Integración para Opus

1. Copia la carpeta a `public/brand/football/laliga-2026-27/` en proyectos que sirvan activos desde `public/`.
2. Lee `manifest.json` y asocia los IDs del proveedor al `id` de la entrada. Usa la ruta `svg` y el nombre `shortName`. El valor `code` es un rótulo editorial. Identifica cada equipo por colección e ID.
3. Sirve `pitchlab-laliga.sprite.svg` desde el mismo origen si vas a usar `<use>`. Usa la caja `0 0 80 80` y el fragmento que indica `symbolId`. Para un equipo sin activo, muestra su nombre o código en estilo neutral.

```tsx
const badgeBase = "/brand/football/laliga-2026-27/";

export function TeamBadge({
  entry,
  size = 24,
  decorative = true,
}: {
  entry: { name: string; svg: string };
  size?: 16 | 20 | 24 | 32 | 48;
  decorative?: boolean;
}) {
  return (
    <img
      src={badgeBase + entry.svg}
      width={size}
      height={size}
      alt={decorative ? "" : entry.name}
      decoding="async"
      className="shrink-0"
    />
  );
}
```

## Exportaciones y alcance

- 21 SVG editables de 80 × 80 y 21 PNG de 256 × 256 con transparencia.
- Sprite con los mismos dibujos y colores, comparado con los SVG individuales en Chromium.
- Láminas editables SVG y versiones PNG. Las tarjetas son ejemplos de interfaz.
- Pruebas de reducción a 16, 20, 24 y 32 px.

Las piezas son interpretaciones editoriales de PitchLab. La comparación de semejanza fue visual y preliminar. [Participantes de la temporada](https://www.laliga.com/laliga-easports/clubes)
