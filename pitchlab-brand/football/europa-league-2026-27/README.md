# Europa League · Emblemas editoriales

**2026/27 · Fase liga · Edición 01**

La colección contiene un emblema de competición y 36 de clubes. Para la competición se dibujó una copa abierta en cobre sobre carbón. Las siluetas, los motivos y las paletas de los clubes siguen el criterio de las colecciones europeas de PitchLab.

[Catálogo completo](catalogo.png) · [Prueba de tarjetas y tamaños](prueba-ui.png) · [Manifiesto de activos](manifest.json)

## Uso en producto

| Contexto | Caja | Rótulo |
|---|---:|---|
| Tablas | 24 px | Nombre corto o código |
| Encabezados y listas | 32 px | Nombre del club |
| Tarjetas de partido | 48 px | Nombre del club |
| Espacio mínimo | 16–20 px | Nombre o código visible |

Usa el SVG individual o el sprite con caja de 80 × 80. Respeta el margen y los colores internos. Mantén los tokens de PitchLab para las superficies y los estados de la interfaz. Si el club ya tiene un rótulo al lado, usa una imagen con alt vacío. Si el emblema aparece solo, ofrece su nombre accesible.

La edición reutiliza los dibujos ya aprobados de AFC Bournemouth, Crystal Palace y Sunderland, con los mismos IDs, SVG y PNG.

## Integración para Opus

1. Copia la carpeta a `public/brand/football/europa-league-2026-27/` en proyectos que sirvan recursos desde `public/`.
2. Lee `manifest.json` para resolver la ruta `svg`, el nombre `shortName` y el identificador `symbolId`. Mapea los IDs del proveedor de resultados a `id`. Los códigos de UI pueden diferir de los del proveedor.
3. Usa `svg` en pantalla y `png` cuando el canal requiera mapa de bits. Si un club queda fuera de la cobertura, presenta el nombre o el código en estilo neutral.
4. Para usar el sprite, sirve `pitchlab-europa-league.sprite.svg` desde el mismo origen. Añade `#` y el valor de `symbolId`. El sprite y los SVG contienen las mismas formas y colores.

```tsx
const badgeBase = "/brand/football/europa-league-2026-27/";

export function ClubBadge({
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

- 37 SVG vectoriales editables y 37 PNG de 256 × 256 px con fondo transparente.
- Sprite de 37 símbolos. Se comparó su renderizado en Chromium con los SVG individuales.
- Láminas en SVG y PNG y prueba visual sobre fondo oscuro a 16, 20, 24 y 32 px.
- Las tarjetas de ejemplo ilustran el diseño. La cobertura corresponde a la fase liga de 2026/27.
- Los emblemas son interpretaciones editoriales de PitchLab. La comparación de similitud fue visual y preliminar.

[Participantes de la fase liga según UEFA](https://www.uefa.com/uefaeuropaleague/news/02a6-20d57d095740-e1e0b3de85df-1000--2026-27-europa-league-teams-dates-draws-format-final/) · [Perfiles de clubes de UEFA](https://www.uefa.com/uefaeuropaleague/news/02a8-217364fd42e6-7e49801d8daf-1000--2026-27-europa-league-meet-the-league-phase-teams/)
