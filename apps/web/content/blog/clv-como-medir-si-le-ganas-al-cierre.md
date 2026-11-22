---
title: "CLV: cómo medir si le ganas al cierre"
description: "Qué es el Valor contra el Cierre (CLV), cómo calcularlo sin sesgos y por qué muestra mejor tu lectura que una racha corta de resultados."
date: 2026-11-22
category: momios
tags: [clv, momio justo, cierre de mercado, valor esperado]
---

En una muestra de 20 o 30 picks, la suerte manda demasiado. Puedes tomar buenas decisiones y pasar por una mala racha, o cobrar varios boletos seguidos con momios caros antes de que la varianza te alcance. Para saber si realmente lees mejor un partido antes de que arranque, necesitas una métrica que no dependa solo de si entró un balón al poste en el minuto 89: el **Valor contra el Cierre** o **CLV** (*Closing Line Value*).

## Qué representa la línea de cierre

Conforme se acerca el silbatazo inicial, las alineaciones se confirman, entra más dinero informado al mercado y los precios se ajustan. Por eso la línea justo antes del inicio suele ser el mejor resumen público de probabilidad que existe para ese partido.

Si entraste temprano a un precio mejor que el momio justo de cierre, compraste más probabilidad por cada peso o unidad arriesgada de la que el mercado exigía al final. Si entraste peor, pagaste sobreprecio frente a la referencia final.

## Cómo calcular tu CLV sin margen de la casa

El error más común al medir el cierre es comparar tu momio contra el precio bruto de cualquier casa sin quitarle la comisión. El cierre limpio se mide en dos pasos sencillos, usando exactamente la lógica de [momio justo](/blog/que-es-el-momio-justo):

1. Toma los momios finales del mercado antes del partido y quítales el margen para obtener la **probabilidad de cierre sin comisión** y su **momio justo de cierre**.
2. Compara tu momio tomado contra ese momio justo de cierre en escala decimal:

| Tu momio tomado | Momio justo de cierre | Ventaja al cierre (CLV) | Lectura |
|---|---|---|---|
| 2.05 (+105) | 1.92 (−109) | +6.8 % | Tomaste valor antes del ajuste del mercado |
| 1.85 (−118) | 1.85 (−118) | 0.0 % | Precio equivalente al cierre sin margen |
| 1.75 (−133) | 1.90 (−111) | −7.9 % | Entraste después de que el precio ya cayó |

Una ventaja positiva de **+2.5 % a +5.0 %** sostenida a lo largo de cientos de picks indica que estás detectando desajustes reales antes de que se corrijan.

## Por qué un pick con CLV positivo también puede perderse

Ganar al cierre no convierte un 55 % en un 100 %. Significa que si tomas 200 decisiones parecidas, el retorno matemático esperado está de tu lado. Jugar a 55 % quiere decir que 45 de cada 100 veces ese resultado no se va a dar.

Por eso conviene evaluar tres señales juntas dentro de tu historial:

- **Ventaja promedio al cierre:** te dice si estás capturando buenos precios antes de que caigan.
- **Muestra mínima (100+ picks liquidados):** antes de 100 selecciones, el ruido pesa más que la tendencia.
- **Unidades planas y disciplina:** subir el monto después de perder deshace cualquier ventaja de precio que hayas conseguido.

## Cómo auditar tus propios números

La única forma de medir CLV sin engañarte es registrar tu momio antes del partido y congelar el historial sin editarlo después. En PitchLab cada pick guardado queda sellado antes del inicio con su huella criptográfica en [Verificación SHA-256](/verificacion) y se contrasta automáticamente contra la referencia previa al arranque.

Si quieres revisar cómo funciona el cálculo completo y ver el historial sin filtros de resultados publicados, explora [Resultados](/resultados) o consulta la guía de [límites y juego responsable](/blog/juego-responsable-limites-y-senales).
