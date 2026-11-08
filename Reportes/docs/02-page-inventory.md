# 02 — Inventario de páginas/vistas
Todas OBSERVADAS en vivo (clave 7779). La app no cambia URL: estados internos.

| ID | Vista | Acceso | Componentes | Datos |
|---|---|---|---|---|
| lock-1 | Intro synthwave | carga inicial | canvas (pirámide, rejilla, partículas, ticker), Piedra del Sol, botón "Entra a la cancha" | — |
| lock-2 | Pad PIN | click en lock-1 (o tecla) | pad 1-9/0/⌫, 4 dots, mensajes OK/FALLIDO | CODE="7779" |
| home-1 (LV1) | Hero | tras desbloquear | hero "Cada jugada, calculada", robots tilt, reloj, ✦ IA, BOLETO(n) | SP, ROB |
| home-2 (LV2) | Grid deportes | data-go="fb" | escudos NFL/NCAA | SP |
| nfl | Tablero NFL | tarjeta NFL | 7 tabs (g/s/w/n/e/j/m), chips de día, topPanel, pick del día, ranking, tarjetas de juego con 15 mercados | D,T,R,N,AUD,MONEY,PJ,DF |
| nfl-sim | SIMULADOR | tab s | selects LOCAL/VISITA, tile del juego, ANALIZAR (animación canvas) | SIM |
| nfl-dinero | 💰 DINERO | tab m | splits DK, barras boletos/dinero, tags (fuerte/público/IA), bajas | MONEY |
| nfl-lesiones | LESIONES | tab w | feed con importancia + EDITOR (estado/impacto) | N |
| nfl-noticias | NOTICIAS | tab n | feed manual | NEWS |
| nfl-equipos | EQUIPOS | tab e | tabla PF2025/PA2025/JJ2026 | T,R |
| nfl-jugadores | JUGADORES | tab j | props con líneas editables, top TDs/líneas | PJ,DF |
| ncaa | Tablero NCAA | tarjeta NCAA | 4 tabs (g/s/w/e), pick ML 55%, parlays | datos NCAA |
| boleto | Panel BOLETO | botón flotante | tabs Boleto/Historial/Bankroll, legs, EV, sizing 5/10%, registrar/resolver/borrar | AV |
| ai | Asistente IA | botón ✦ | chips, chat, fuente "Claude/local" | ctx()+N |
| audit | Resultados semana | chip "Resultados" | ✓/✗ por mercado, picks pre-partido | D[aud] |

Estados vacíos: boleto sin selecciones, sin historial, "sin bajas importantes", "Ningún partido con diferencia de 12+".
Estados de error: PIN incorrecto (shake), persistencia rechazada (toast + fallback localStorage).
