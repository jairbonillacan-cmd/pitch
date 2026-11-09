# ADR-019: Primitivas shadcn/ui (estilo Mira, Base UI) con los tokens de PitchLab

- **Estado:** Aceptada (2026-11-09). Modifica ADR-003.
- **Decisión del fundador:** preset Mira con la marca; alcance «base + primitivas».

## Contexto

ADR-003 pedía Tailwind v4 y primitivas accesibles envueltas en `packages/ui`, pero el pre-MVP se construyó con ~2,900 líneas de CSS propio y controles hechos a mano (`<dialog>` nativo, pestañas y chips sin roles completos). El fundador pidió usar shadcn/ui para componentes y diseño, evitando el aspecto genérico de IA.

## Decisión

1. **shadcn/ui como código propio**, no como dependencia de tema. Las primitivas viven en `packages/ui/src/components/ui/` (Button, Badge, Dialog, Tabs, Tooltip, Toggle/ToggleGroup), generadas con el preset **Mira** sobre **Base UI** (el valor por defecto de shadcn desde jul 2026) y adaptadas:
   - colores, radios y tipografía desde los tokens de marca (las variables de shadcn apuntan a `--brand-primary`, `--surface-*`, `--text-*`, etc.; nunca a la paleta neutra por defecto);
   - objetivos táctiles de 44 px (Mira trae botones de 28 px);
   - iconos de la marca (ADR-016) en lugar de HugeIcons;
   - variantes propias de etiqueta (`fav`, `info`, `live`, `success`, `danger`).
2. **Tailwind v4 sin preflight** en `apps/web`, con capas `theme → base → legacy → components → utilities`. El CSS aprobado en D1 vive en `@layer legacy`; las utilidades de shadcn solo ganan en los componentes shadcn. Así no se reinicia el diseño aprobado.
3. **Migrado ahora:** diálogo de análisis y PIN (Base UI Dialog: trampa de foco, Escape, bloqueo de scroll y retorno del foco), pestañas de perfiles (Tabs), filtro de día (ToggleGroup), botones del panel, etiquetas (Badge) y razones de confianza (Tooltip).
4. **Sin cambiar todavía:** landing, login, crear cuenta y barra flotante conservan sus clases `.btn` (D1). Se migran cuando se toquen.

## Cómo agregar un componente

```bash
pnpm dlx shadcn@latest init -t next -b base -p mira -n scaffold   # en una carpeta temporal
pnpm dlx shadcn@latest add <componente>
```

Copiar el archivo a `packages/ui/src/components/ui/`, cambiar imports a rutas relativas `.js`, usar `Icon` de la marca y revisar tamaños (44 px) y colores (solo tokens).

## Alternativas descartadas

- **shadcn con su tema por defecto:** es una de las señales más reconocibles de interfaz hecha por IA.
- **Radix:** sigue soportado por shadcn, pero Base UI es el valor por defecto actual y resuelve lo mismo.
- **Rediseño completo al estilo del preset:** cambiaría el diseño aprobado en D1 sin prototipo previo.

## Consecuencias

- Accesibilidad de los controles complejos resuelta por una librería probada.
- Los selectores de los E2E pasan de `dialog[open]` a `[role=dialog]`.
- Conviven dos sistemas de clase (D1 y utilidades) hasta terminar la migración; la regla es usar shadcn en todo componente nuevo.
