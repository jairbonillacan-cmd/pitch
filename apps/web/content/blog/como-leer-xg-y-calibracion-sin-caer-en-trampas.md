---
title: "Cómo leer el xG y la calibración del modelo"
description: "Diferencia entre goles esperados y varianza de definición, errores por muestra pequeña y cómo comprobar si un modelo está bien calibrado."
date: 2026-11-22
category: guias
tags: [xg, calibración, muestras pequeñas, análisis deportivo]
---

El **xG** (*Expected Goals* o goles esperados) cambió la forma de analizar el fútbol porque mide la calidad de las ocasiones creadas en lugar de mirar únicamente el marcador final. Sin embargo, leer xG sin contexto ni revisar cómo está calibrado un modelo lleva a trampas muy frecuentes.

## Qué mide exactamente el xG (y qué deja fuera)

Cada disparo recibe una probabilidad entre 0 y 1 según su distancia, ángulo, parte del cuerpo y tipo de asistencia. Un remate claro en el área chica puede valer **0.45 xG**; un tiro lejano de media distancia con defensas delante ronda **0.03 xG**.

Pero el xG aislado tiene límites claros:

- **No captura jugadas sin disparo:** un centro raso peligroso que nadie alcanzó a empujar vale 0.00 xG en el registro de tiros.
- **El estado del marcador pesa:** un equipo que va ganando 2−0 en el minuto 60 cede posesión y tiros lejanos de relleno que inflan el xG rival sin amenazar realmente el partido.
- **Un partido aislado engaña:** un penal suma alrededor de **0.76 xG** en un solo instante; descontar penales (npxG) ayuda a separar el juego abierto de un cobro puntual.

## Trampa 1: confundir racha corta con mejora estructural

Cuando un club anota 9 goles con 4.2 xG en cuatro jornadas, muchos asumen que «tiene pegada imparable». En muestras cortas, la definición fluctúa muchísimo. Si el equipo no sostiene llegadas claras jornada tras jornada, lo normal en las siguientes semanas es una regresión hacia el promedio de ocasiones que genera.

Para evitar esa trampa en tu análisis previo al partido —tanto en goles como en [córners, tarjetas y props](/blog/mercados-avanzados-corners-tarjetas-xg-props)— conviene cruzar varias ventanas de tiempo:

- **Últimos 5 partidos (L5):** refleja forma reciente, bajas o cambios de entrenador.
- **Últimos 10 y 20 partidos (L10 / L20):** filtra el ruido de un solo fin de semana atípico.
- **Local vs. Visita:** muchos equipos cambian por completo su volumen ofensivo fuera de casa.

## Trampa 2: no distinguir precisión de calibración

Decir que «un pick tiene 65 %» no es una frase decorativa: significa que en un grupo grande de pronósticos marcados cerca de 65 %, alrededor de 65 de cada 100 deben cumplirse en la cancha. A esa coincidencia entre la probabilidad estimada y la frecuencia real observada se le llama **calibración**.

| Banda proyectada | Muestra observada | Cumplidos reales | Estado de calibración |
|---|---|---|---|
| 50 % – 55 % | 400 picks | 212 (53.0 %) | Bien calibrado dentro de banda |
| 60 % – 65 % | 400 picks | 248 (62.0 %) | Fiel a la probabilidad anunciada |
| 70 % – 75 % | 400 picks | 236 (59.0 %) | Sobreconfiado; el número promete de más |

Si una banda de 70 % solo cumple 59 %, el momio justo calculado queda distorsionado y cualquier comparación de valor contra una casa de apuestas sale mal.

## Cómo lo comprobamos con datos públicos

En PitchLab preferimos mostrar tanto los aciertos como los tropiezos sin maquillar resultados. Puedes inspeccionar cómo responde cada estimación histórica en [Resultados](/resultados), conocer las familias estadísticas detrás del producto en [Motores](/motores) y recordar nuestra regla básica: cada pronóstico es **información para decidir con criterio**, nunca una promesa segura.
