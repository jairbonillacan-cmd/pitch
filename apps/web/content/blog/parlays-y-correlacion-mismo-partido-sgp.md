---
title: "Parlays mismo partido (SGP) y correlación"
description: "Cuándo multiplican mal los parlays del mismo partido, ejemplos reales de correlación positiva o negativa y cómo armar boletos coherentes."
date: 2026-11-22
category: parlays
tags: [parlays, sgp, correlación, gestión de riesgo]
---

En nuestra guía sobre [cómo calcular la probabilidad de un parlay](/blog/como-calcular-la-probabilidad-de-un-parlay) vimos que, cuando combinas partidos distintos e independientes, multiplicar sus probabilidades funciona bien. Pero en cuanto juntas dos o más selecciones dentro del **mismo encuentro** (*Same-Game Parlay* o SGP), esa regla simple deja de cumplirse.

La razón es directa: dos eventos del mismo partido comparten los mismos 22 jugadores, el mismo ritmo arbitral y el mismo marcador. Si uno ocurre, cambia de inmediato la probabilidad de que ocurra el otro.

## Correlación positiva: eventos que se empujan entre sí

Hay combinaciones que apuntan en la misma dirección de guion:

- **Equipo favorito gana + Más de 2.5 goles totales:** si el favorito anota dos o tres goles para ganar, ya cubrió buena parte de la línea de goles del partido.
- **Partido cerrado con pocas llegadas + Menos de 3.5 goles y Menos de 9.5 córners:** un juego lento en mediocampo reduce al mismo tiempo remates, goles y tiros de esquina.
- **Delantero anota en el partido + Equipo gana:** el gol propio impulsa directamente la victoria de su club.

Si multiplicaras esas dos probabilidades como si fueran independientes, subestimarías cuánto suelen pasar juntas; por eso un buen calculador ajusta la probabilidad conjunta hacia arriba y exige un momio justo menor al producto simple, sin inflarte falsamente el valor.

## Correlación negativa y selecciones contradictorias

El extremo opuesto son selecciones que se estorban o se anulan dentro de los mismos 90 minutos:

- **Gana Local + Empate o Visitante:** contradicción total (0 % conjunta; nunca debe combinarse).
- **Menos de 1.5 goles + Ambos equipos anotan Sí:** en fútbol solo existe un marcador posible que cumpla ambas cosas (1−1 supera 1.5 goles, así que 0−0 y 1−1 no caben juntos). La probabilidad conjunta es exactamente 0 %.
- **Menos de 2.5 goles + Más de 1.5 goles del equipo local:** para que pasen las dos, el local tiene que ganar exactamente 2−0; todo el margen queda comprimido en un solo marcador.

| Tipo de cruce en SGP | Ejemplo dentro del mismo partido | Efecto real sobre el boleto |
|---|---|---|
| Contradicción directa | Más de 2.5 goles + Menos de 1.5 goles | Imposible (0 %) |
| Estorbo fuerte | Ambos anotan Sí + Menos de 1.5 goles | Solo un marcador imposible; nulo lógico |
| Correlación negativa | Favorito −2.5 hándicap + Menos de 2.5 goles | Imposible; requiere ganar por 3 o más |
| Correlación positiva | Favorito gana + Más de 2.5 goles | Suelen ocurrir juntos; se ajusta la cuota justa |

## Por qué limitar tus parlays a entre 2 y 6 selecciones

Cada pata adicional multiplica el margen que cobra una casa de apuestas y vuelve más volátil el resultado real. Un boleto de 10 o 12 selecciones casi nunca ofrece un precio justo proporcional al riesgo que asumes, aunque a simple vista muestre un premio grande.

Mantener tus combinadas entre **2 y 6 selecciones** y revisar siempre las compatibilidades evita armar boletos con contradicciones ocultas o con probabilidad minúscula disfrazada de pago alto.

## Revisa la coherencia antes de sellar

Antes de confirmar un parlay de uno o varios partidos, revisa si el guion del juego respalda todas las patas al mismo tiempo. Puedes explorar cómo modelamos probabilidades por encuentro en [Motores](/motores) y consultar los [precios transparentes en MXN](/precio) si quieres usar el armador con detección automática de conflictos y ajuste de correlación.
