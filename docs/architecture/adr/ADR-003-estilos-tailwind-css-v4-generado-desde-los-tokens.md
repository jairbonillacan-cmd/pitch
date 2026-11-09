# ADR-003: Estilos: Tailwind CSS v4 generado desde los tokens de marca, Radix UI y componentes propios

- **Estado:** Aceptada (modificada por ADR-019: shadcn/ui Mira + Base UI con tokens de marca)
- **Fecha:** 2026-11-08

## Contexto

La marca de GPT entrega `brand-tokens.css`. Ningún agente debe introducir colores ni espaciados propios.

## Decisión

`packages/tokens` copia `pitchlab-brand/tokens/brand-tokens.css` y genera el bloque `@theme` de Tailwind v4 y un `tokens.ts`. Las primitivas accesibles de Radix se envuelven en `packages/ui` con estilo 100 % PitchLab (código propio, no una librería de temas). Un lint prohíbe hex, `rgb()` y clases arbitrarias de color fuera de los tokens.

## Alternativas descartadas

shadcn/ui tal cual (estética reconocible, slop); MUI o Chakra (identidad ajena y peso); CSS Modules puro (más lento para los agentes y sin restricción por tokens).

## Consecuencias

Un cambio en un token de marca se propaga solo. React Aria queda como alternativa puntual si un patrón de Radix no cumple con la accesibilidad (combobox complejo, grid).
