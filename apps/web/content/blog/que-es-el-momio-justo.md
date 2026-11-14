---
title: "Qué es el momio justo y cómo calcularlo en 3 pasos"
description: "Convierte cualquier momio en probabilidad, quítale el margen de la casa y compáralo con el momio justo para saber si el precio vale la pena."
date: 2026-11-13
category: momios
tags: [momio justo, probabilidad implícita, margen, momios americanos]
---

Un momio no es solo lo que te pagan: también es una opinión sobre qué tan probable es un resultado. Si aprendes a leer esa opinión, puedes compararla con una estimación propia y decidir con números en vez de corazonadas.

En esta guía vas a aprender tres cosas: convertir un momio en probabilidad, quitarle el margen de la casa y calcular el **momio justo**, que es el precio que tendría un resultado si nadie cobrara comisión.

## Paso 1: convierte el momio en probabilidad

Cada formato de momio se traduce a una probabilidad implícita con una cuenta sencilla:

| Formato | Ejemplo | Cuenta | Probabilidad implícita |
|---|---|---|---|
| Americano negativo | −150 | 150 ÷ (150 + 100) | 60.0 % |
| Americano positivo | +260 | 100 ÷ (260 + 100) | 27.8 % |
| Decimal | 4.50 | 1 ÷ 4.50 | 22.2 % |

La regla para recordarlo: en el americano negativo, el número indica cuánto arriesgas para ganar 100; en el positivo, cuánto ganas si arriesgas 100. En el decimal, el número ya incluye lo que arriesgas.

## Paso 2: quita el margen de la casa

Si sumas las probabilidades de los tres resultados de un partido (local, empate y visitante), casi nunca te da 100 %. En el ejemplo de arriba:

- Local −150 → 60.0 %
- Empate +260 → 27.8 %
- Visitante +350 → 22.2 %

La suma es **110.0 %**. Ese 10 % de más es el margen: la comisión con la que la casa se asegura ganar sin importar el resultado.

Para quitarlo, divide cada probabilidad entre la suma total:

| Resultado | Con margen | Sin margen |
|---|---|---|
| Local | 60.0 % | 54.5 % |
| Empate | 27.8 % | 25.3 % |
| Visitante | 22.2 % | 20.2 % |

Ahora las tres suman 100 % y representan lo que el mercado realmente cree.

## Paso 3: calcula el momio justo

El momio justo es el inverso de la probabilidad, sin comisión de por medio:

- **Decimal:** 1 ÷ probabilidad. Para 54.5 %, el momio justo es 1.83.
- **Americano (favorito, más de 50 %):** −(probabilidad ÷ (1 − probabilidad)) × 100. Para 54.5 %, da −120.
- **Americano (no favorito, menos de 50 %):** ((1 − probabilidad) ÷ probabilidad) × 100. Para 25.3 %, da +295.

Si la casa ofrece un precio **mejor** que el momio justo de tu estimación, el precio está a tu favor. Si ofrece uno peor, estás pagando de más.

## Un ejemplo completo

Supón que, después de analizar el partido, estimas que el local tiene **58.0 %** de probabilidad.

1. Tu momio justo es −138 (decimal 1.72).
2. La casa ofrece −125, que equivale a 55.6 %.
3. Tu estimación supera la del precio por **2.4 puntos**: el momio de la casa paga más de lo que debería según tu número.

Eso no significa que el local vaya a ganar. Con 58.0 %, el resultado contrario sigue pasando 42 de cada 100 veces. Lo que cambia es que, repetido muchas veces, comprar precios por encima de lo justo es la única forma de que los números jueguen a tu favor.

## Lo que conviene recordar

- Una probabilidad no es una promesa. Un 70 % falla 3 de cada 10 veces.
- El margen se come tu ventaja: compara siempre contra el momio justo, no contra el momio de la casa.
- Lleva registro. Sin un historial honesto no hay forma de saber si tus estimaciones son buenas.

En PitchLab cada partido muestra estos tres números en el mismo orden: la probabilidad estimada, el momio justo y un comparador donde escribes el momio de tu casa. Puedes ver cómo se leen en [Cómo funciona](/como-funciona).
