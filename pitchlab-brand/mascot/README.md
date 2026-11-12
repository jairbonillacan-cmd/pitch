# Radar · Mascota de PitchLab

Radar observa el partido desde la banda. Sus orejas violetas, pelaje pizarra, capa de alas y expresión se mantienen entre uniformes. El traje base lleva una tableta táctica.

[Abrir catálogo interactivo](index.html) · [Máster PNG](radar-master.png) · [Prompts de ImageGen](PROMPTS.md)

## Ediciones

| Deporte | Edición general | Ligas con uniforme |
|---|---|---|
| Fútbol | `soccer.webp` | Liga MX, Premier League, LaLiga, Champions League, Europa League |
| Fútbol americano | `american-football.webp` | NFL, NCAA Football · FBS |
| Béisbol | `mlb.webp` | MLB |
| Hockey sobre hielo | `nhl.webp` | NHL |

El directorio `web/` contiene 12 WebP cuadrados de 768 × 768 px con transparencia. Incluye el traje base, dos ediciones de deporte y nueve uniformes de liga. Béisbol y hockey comparten el uniforme de su única liga registrada. El máster base en PNG conserva la resolución original.

Los uniformes son diseños de PitchLab. Los emblemas editoriales de liga aparecen junto al personaje cuando hay un archivo disponible. El selector usa el icono del deporte en los otros casos.

## Integración

Sirve los recursos desde una raíz que conserve las rutas de `pitchlab-brand/`. Carga `mascot/registry.js` y resuelve la edición con los IDs de deporte, liga y sección.

```js
const radar = globalThis.PitchLabRadar.resolve({
  sport: "soccer",
  league: "soccer.liga-mx",
  context: "analysis",
});
// radar.image === "mascot/web/liga-mx.webp"
// radar.icon === "visuals/icons/model.svg"
// radar.avatar === "visuals/icons/radar.svg"
```

Una liga conocida selecciona el uniforme y el deporte correspondientes. Si la liga falta o es nueva, se usa la edición general del deporte. Sin liga ni deporte reconocidos, se usa Radar con la tableta. Los contextos `home`, `games`, `analysis`, `simulation` y `assistant` determinan el icono y el texto de la vista.

## Iconos

Los SVG están en [visuals/icons](../visuals/icons/). Se añadieron 12, incluidos el retrato de Radar, los cuatro deportes y las funciones de competición, equipos, modelo, simulador, probabilidad, comparación y fuentes. La retícula es de 24 px, con trazo de 1.75 px y `currentColor` para uso inline. Las exportaciones del icono de aplicación y del favicon están en [app-icons](../app-icons/).

Usa el retrato SVG en espacios compactos como el avatar. Cuando el icono va junto a su etiqueta, márcalo como decorativo. Un botón con solo icono necesita un nombre accesible.
