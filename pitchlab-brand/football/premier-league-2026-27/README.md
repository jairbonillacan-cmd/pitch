# Premier League · Emblemas editoriales

**Temporada 2026/27 · Edición 02**

Un emblema de competición y veinte de clubes. Esta edición sustituye la ficha Campo de corte por escudos, óvalos y medallas de composición propia. La Premier League se identifica por un león frontal de melena radial en ciruela y marfil. Los clubes recuperan símbolos reconocibles de su herencia. El cañón de Arsenal apunta hacia la izquierda, Brighton lleva una gaviota en V sobre una ola y Newcastle reúne franjas verticales con un solo hipocampo.

[Catálogo de la colección](catalogo.png) · [Prueba en tarjetas y a escala](prueba-ui.png) · [Manifiesto de activos](manifest.json)

## Criterios de la colección

- **Silueta.** Cada club usa un contorno adecuado a su motivo. La caja SVG de 80 × 80 y el margen óptico permiten alinear los 21 emblemas en un mismo renglón.
- **Dibujo.** Colores planos, masas de distinto peso y detalles subordinados. Los motivos se dibujaron con poses, proporciones y distribuciones propias. La mayoría se reconoce por su contorno y campo de color a 24 px.
- **Paleta.** Los colores del club se aplican dentro de su emblema. Las superficies, el texto y los estados del producto usan los tokens de PitchLab.
- **Tamaño.** 24 px en tablas, 32 px en listas o encabezados y 48 px en tarjetas. Usa 20 px en vistas compactas. Reserva 16 px para cuando el nombre o el código ya está visible.
- **Accesibilidad.** Mantén el nombre o código legible. Con nombre visible, usa alt vacío para evitar duplicarlo. Si el emblema aparece solo, ofrece el nombre del club como texto alternativo.
- **Contexto.** Son ilustraciones editoriales de PitchLab. Mantén visible la identidad del producto cuando los presentes públicamente. La comparación de semejanza fue visual y preliminar.

## Integración para Opus

1. Copia la carpeta a `public/brand/football/premier-league-2026-27/` en proyectos que sirvan activos estáticos desde `public/`.
2. Lee `manifest.json`. Asocia los IDs del proveedor con `id`, el slug estable de PitchLab. `code` es la abreviatura de UI y `shortName` el rótulo compacto. Esta edición conserva los IDs, nombres de archivo y claves del sprite de la primera entrega. El campo `designRevision` identifica la edición.
3. Usa `svg` en pantalla y `png` si el canal requiere mapa de bits. Ambos representan el mismo emblema. Para un equipo sin activo, muestra su nombre o código con tratamiento neutral. Usa rutas del manifiesto.
4. Si ya publicaste la primera edición, renueva la caché o versiona la URL para que se descargue la segunda.

```tsx
const ASSET_BASE = "/brand/football/premier-league-2026-27/";

type TeamBadgeProps = {
  entry: { name: string; svg: string };
  size?: 16 | 20 | 24 | 32 | 48;
  decorative?: boolean;
};

export function TeamBadge({
  entry,
  size = 24,
  decorative = true,
}: TeamBadgeProps) {
  return (
    <img
      src={ASSET_BASE + entry.svg}
      alt={decorative ? "" : entry.name}
      width={size}
      height={size}
      decoding="async"
      className="shrink-0"
    />
  );
}
```

Sirve `pitchlab-premier-league.sprite.svg` desde el mismo origen y usa el `symbolId` completo. Ejemplo de fragmento `pitchlab-premier-league.sprite.svg#pitchlab-arsenal`. Si integras el SVG inline, usa la caja `0 0 80 80`.

## Archivos y verificación

- `svg/` contiene 21 originales vectoriales editables, sin fuentes ni imágenes embebidas.
- `png/` contiene las mismas 21 piezas a 256 × 256 px con transparencia exterior.
- `catalogo.svg` y `prueba-ui.svg` incluyen láminas vectoriales con exportaciones PNG.
- `manifest.json` documenta motivo, temporada, colores, rutas, referencias y contraste. `colors.tile` designa el campo del emblema.
- Se revisó la colección a 16, 20, 24 y 32 px sobre fondo oscuro. El contraste mínimo entre la tinta principal y el campo declarado es **5.44:1**. Los acentos pueden aparecer sobre otras tintas. Su contraste sobre el campo queda documentado por separado.

La participación de los 20 clubes se contrastó con el listado oficial 2026/27. Las referencias sirven para identificar los motivos históricos y comparar las siluetas. [Lista oficial](https://www.premierleague.com/en/news/4365156) · [Herencia de los emblemas de clubes](https://www.premierleague.com/en/news/4726407/all-20-premier-league-clubs-badges-explained) · [Identidad histórica de la competición](https://www.premierleague.com/en/news/60917)
