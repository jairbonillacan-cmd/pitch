---
title: "Momio justo (fair odds) y valor real frente a la casa"
description: "Aprende qué son los fair odds, cómo quitar el margen de la casa (de-vig) y cómo medir el valor matemático real al comparar momios en México y LATAM."
date: 2026-11-20
category: momios
tags: [fair odds, momio justo, de-vig, valor esperado, margen de casa, momios]
---

Ver un momio atractivo no alcanza para saber si el precio conviene. Lo que decide si una cuota vale la pena es la distancia entre el **momio justo** (*fair odds*) de un resultado y lo que realmente paga tu casa después de cobrar su comisión.

En esta guía vas a aprender cómo quitar el margen de la casa (*de-vig*), cómo medir la ventaja matemática en puntos y en valor esperado, y por qué comprar buenos precios nunca equivale a una ganancia garantizada.

## Por qué dos casas pagan distinto por el mismo partido

Cada casa de apuestas construye sus momios con dos piezas: su estimación de probabilidad y su **margen** (también llamado *overround* o comisión). Ese margen varía mucho según la liga, el mercado y el tipo de operador:

- En mercados principales de operadores con margen ajustado, la comisión en un resultado 1X2 suele rondar **2.5 % a 4.0 %**.
- En operadores recreativos habituales en México y LATAM, el margen sobre un partido de Liga MX o futbol europeo suele moverse entre **5.5 % y 8.5 %**, y sube todavía más en mercados secundarios.

Si comparas un partido solo viendo «quién paga más» sin quitar esa comisión, terminas leyendo precios inflados por el margen y no la probabilidad implícita real del mercado.

## Qué es el de-vig y cómo encontrar los fair odds

El **de-vig** es el procedimiento para retirar la comisión de la casa y devolver las probabilidades implícitas a una suma exacta de **100.0 %**. Una vez limpias, su inverso (`1 ÷ probabilidad`) es el **momio justo** (*fair odds*).

### Ejemplo en una línea de dos resultados

Imagina un total de puntos con momios estándar de **−110** de cada lado (decimal 1.91):

- Probabilidad implícita de cada lado: 110 ÷ (110 + 100) = **52.4 %**.
- Suma total del mercado: **104.8 %** (un margen de **4.8 %**).
- Al retirar el margen (52.4 ÷ 104.8), cada lado queda en **50.0 %**, cuyo momio justo es **+100** (decimal **2.00**).

### Ejemplo en un partido 1X2 de Liga MX

Ahora toma un cruce con tres resultados y un margen típico de **6.9 %**:

| Resultado | Momio casa | Decimal | Implícita con margen | Sin margen (de-vig) | Momio justo |
|---|---|---|---|---|---|
| Local | −125 | 1.80 | 55.6 % | 52.0 % | −108 (1.92) |
| Empate | +250 | 3.50 | 28.6 % | 26.7 % | +274 (3.74) |
| Visitante | +340 | 4.40 | 22.7 % | 21.3 % | +370 (4.70) |
| **Suma** | — | — | **106.9 %** | **100.0 %** | — |

Dividir cada probabilidad entre la suma total (de-vig proporcional) es un buen primer paso para mercados parejos. Cuando hay un favorito muy marcado frente a un visitante largo (por ejemplo −400 contra +950), las casas suelen cargar proporcionalmente más margen en el resultado menos probable; por eso los modelos cuantitativos aplican ajustes de de-vig que corrigen ese sesgo en cuotas altas antes de fijar la referencia justa.

## Ventaja matemática: puntos de ventaja y valor esperado

Una vez que tienes tu probabilidad estimada —o la probabilidad calibrada de un modelo— y conoces el precio de tu casa, hay dos formas claras de medir si existe valor:

1. **Ventaja en puntos:** probabilidad estimada menos la probabilidad implícita del momio que te ofrecen.
2. **Valor esperado (EV):** `(probabilidad estimada × momio decimal) − 1`, expresado en porcentaje.

Supón que un modelo estima **54.0 %** de probabilidad para un resultado. Su momio justo es **−117** (decimal **1.85**). Mira cómo cambia la ecuación según el precio disponible:

| Escenario | Momio en tu casa | Implícita del precio | Ventaja en puntos | Valor esperado | Lectura |
|---|---|---|---|---|---|
| Precio caro | −135 (1.74) | 57.4 % | −3.4 pts | −6.0 % | Pagas de más por el margen |
| Precio justo | −117 (1.85) | 54.0 % | 0.0 pts | 0.0 % | Sin ventaja ni desventaja |
| Precio con valor | −105 (1.95) | 51.2 % | +2.8 pts | +5.3 % | El precio supera al justo |

El segundo y el tercer escenario tienen exactamente la misma probabilidad deportiva (**54.0 %**), pero solo el tercero paga por encima de lo que corresponde al riesgo real. Comprar −135 cuando el precio justo es −117 te pone en desventaja matemática desde antes de que ruede el balón.

## Por qué tener valor no significa acertar siempre

Conviene decirlo sin rodeos: **valor matemático positivo no es una promesa de acierto**.

Un resultado con **54.0 %** de probabilidad y **+5.3 %** de valor esperado seguirá sin cumplirse **46 de cada 100 veces**. En una racha corta de diez o veinte partidos puedes ver varios fallos seguidos aun tomando precios por encima del justo.

Por eso el análisis serio se evalúa con dos reglas:

- **Muestra suficiente, no una noche.** Un resultado aislado no confirma ni desmiente si una estimación estuvo bien calibrada.
- **Comparación contra el momio de cierre.** Cuando el precio que tomaste temprano queda mejor que el momio sin margen al iniciar el partido, confirmas que leíste el precio antes que el resto del mercado.

## Cómo aplicar este filtro antes de cada jornada

Antes de elegir cualquier mercado, repite el mismo orden:

1. Revisa la probabilidad estimada antes de mirar el pago atractivo de la casa.
2. Convierte esa probabilidad a su **momio justo** (en americano o decimal).
3. Compara contra el momio real disponible en tu casa; si paga por debajo del justo, déjalo pasar.
4. Registra tu selección en una bitácora antes del inicio del partido y evalúa tus números con disciplina de unidades.

En PitchLab, **Singularity** y **Geodesic** retiran el margen de la casa y te muestran la probabilidad estimada junto al momio justo en cada encuentro. Si quieres repasar la conversión básica paso a paso, consulta [qué es el momio justo](/blog/que-es-el-momio-justo), revisa cómo trabajan los [cinco motores](/motores) o prueba tu propia cuota directo en el [comparador de partidos](/#hoy).
