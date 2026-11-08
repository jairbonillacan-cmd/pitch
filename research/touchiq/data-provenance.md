# Auditoría de Procedencia de Datos, Fuentes y Proveedores Comerciales

> **Evidencia Asociada:** Arrays de datos en `page_nfl_s1.js`, `page_ncaa_s1.js`, notas editoriales en la interfaz viva  
> **Objetivo:** Determinar el origen exacto de los datos en TouchIQ y evaluar proveedores comerciales viables para PitchLab  

---

## 1. Auditoría Forense de Fuentes Citadas en TouchIQ

`[OBSERVADO]` TouchIQ no oculta el origen de sus datos. Por el contrario, el autor incluyó citas explícitas, fechas y horas de recolección en los comentarios del código y en los textos de ayuda de la interfaz:

| Dominio de Información | Variable en Código | Fuente Citada Verbatim | Marca Temporal Observada | Frecuencia Inferida |
|---|---|---|---|---|
| **Resultados Históricos NFL** | `R` (121 juegos) | Cosecha propia del autor | Juegos hasta el 6 de noviembre de 2026 | Semanal (después de cada fecha) |
| **Baselines de Equipos NFL** | `T` (32 equipos) | *Pro-Football-Reference* | Temporada 2025 congelada (PF y PA por 17 juegos) | Anual / Pretemporada |
| **Reportes de Lesiones NFL** | `N` (154 jugadores) | *NFL.com, Yahoo Sports, CBS Sports* | *"NFL.com, reporte del viernes 6 nov 2026"* | 2 a 3 veces por semana |
| **Defensas y Estadísticas NFL** | `DF` | *"(Pro-Football-Reference, al 19 oct)"* | Corte al 19 de octubre de 2026 | Quincenal / Semanal |
| **Props de Jugadores NFL** | `PJ` | *Pro-Football-Reference + reportes de equipo* | Al 19 de octubre de 2026 | Quincenal |
| **Números de Camiseta NFL** | `JN` | *"(rosters de CBS Sports, 20 oct)"* | Al 20 de octubre de 2026 | Fijo por temporada |
| **Splits de Apuestas (Dinero vs Boletos)** | `MONEY` | *"DraftKings Sportsbook (DK Network, «Betting Splits»)"* | *"sáb 7 nov 2026, 2:08–3:41 PM CDMX"* | 1 a 2 veces por jornada |
| **Calendario Oficial NFL** | `D` (14 partidos) | Calendario oficial transcrito | Sábado 7 y Domingo 8 nov 2026 | Semanal |
| **Auditoría de Picks Previos** | `AUD` | Marcadores oficiales + picks del modelo | Partidos del 4 al 6 nov 2026 | Inmediato post-jornada |
| **Equipos Colegiales NCAA** | `T` (NCAA) | Estadísticas universitarias oficiales | Temporada 2026 (Semana 10) | Semanal |
| **Fuerzas de Conferencia NCAA** | `CONF` | Ponderación propia del autor | {SEC, B1G, B12, ACC, IND}=1; P12=.92; G5=.88 | Fija por temporada |
| **Bajas de Fútbol (Aztecavet)** | `feed` (215 bajas) | *UEFA, Sky Sports, ESPN, TUDN, SI, Sports Mole, Marca* | Fechas detalladas (9 oct - 4 nov 2026) | 2 veces por semana |

---

## 2. El Pipeline Real de Datos de TouchIQ

`[OBSERVADO]` El flujo de datos de TouchIQ difiere completamente de un sistema automatizado en producción:

```
[Trabajo Manual del Analista Humano]
   │
   ├─► Consulta web a Pro-Football-Reference (anota PF/PA)
   ├─► Revisa reportes de lesionados en NFL.com / CBS Sports
   ├─► Abre DraftKings Network y copia % de dinero y boletos
   └─► Revisa marcadores de media semana y actualiza flags de auditoría
   │
   ▼
[Transcripción Manual a Archivos de Código]
   │
   ├─► Escribe arrays: R=[...], N=[...], MONEY={...}, D=[...]
   ├─► Ajusta factores manuales si lo considera necesario
   └─► Compila el HTML (generando los strings base64 de las páginas)
   │
   ▼
[Despliegue a Netlify Edge]
   │
   └─► git push -> Netlify genera el artefacto estático de 2.4 MB
   │
   ▼
[Ejecución en el Navegador del Usuario]
   │
   └─► Toda la estadística y probabilidades se computan client-side
```

**Evaluación Crítica:**
- Este proceso es altamente susceptible a errores tipográficos humanos.
- Es imposible ofrecer cuotas en vivo o cambios de línea de último minuto.
- La aplicación solo está "actualizada" en el instante exacto en que el autor hizo el commit semanal.

---

## 3. Estudio de Proveedores Comerciales para PitchLab

Para superar a TouchIQ y convertir a PitchLab en una superapp de grado institucional, se deben contratar proveedores profesionales de datos con cobertura de cuotas en tiempo real, calendarios, resultados y reportes de lesiones:

### A. The Odds API (Recomendado para Cuotas en Tiempo Real)
- **Cobertura Deportiva:** NFL, NCAA Football, Liga MX, Premier League, La Liga, Serie A, Champions League, NBA, MLB, NHL.
- **Mercados Soportados:** Moneyline (H2H), Spreads (Hándicaps), Totales (Over/Under), Props de Jugadores.
- **Casas Cubiertas:** Más de 40 casas de apuestas internacionales y locales (DraftKings, FanDuel, BetMGM, Pinnacle, Bet365, Caliente MX).
- **Frecuencia de Actualización:** Desde 1 segundo hasta streaming continuo vía WebSockets.
- **Precios Públicos:**
  - Plan Starter: Gratis (500 solicitudes/mes).
  - Plan Pro: ~$50 - $150 USD/mes (hasta 100,000 solicitudes/mes).
  - Plan Enterprise: ~$500 USD/mes (acceso ilimitado + WebSockets).
- **Licencia y Almacenamiento:** Permite almacenamiento histórico de cuotas y uso en modelos matemáticos propios.

---

### B. Sportradar (Nivel Institucional / Tier 1)
- **Cobertura:** Cobertura oficial directa de la NFL (socio de datos oficial), NCAA, FIFA, UEFA, CONCACAF.
- **Datos Provistos:** Feeds oficiales ultra-rápidos (radar en estadio), rastreo por sensores de jugadores (Next Gen Stats), estados médicos oficiales y micro-eventos jugada a jugada.
- **Precios:** Grado corporativo (a partir de $2,000 - $10,000 USD/mes según volumen).
- **Idoneidad para PitchLab:** Recomendado para fases avanzadas tras rondas de financiamiento, una vez alcanzada escala masiva.

---

### C. API-Football / API-Sports (Recomendado para Fútbol y Deportes Secundarios)
- **Cobertura:** Más de 1,000 ligas de fútbol a nivel mundial (incluyendo Liga MX, Expansión MX, torneos Conmebol y UEFA).
- **Datos Provistos:** Alineaciones confirmadas 1 hora antes del partido, reportes de lesiones, estadísticas de expected goals (xG), historial de 15 años.
- **Precios:**
  - Plan Pro: $29 USD/mes.
  - Plan Mega: $49 USD/mes (75,000 peticiones/día).
- **Idoneidad para PitchLab:** Solución altamente económica y completa para alimentar los motores de fútbol desde el día 1.

---

## 4. Matriz Comparativa de Proveedores para PitchLab

| Proveedor | Enfoque Principal | Latencia | Costo Mensual Estimado | Prioridad PitchLab |
|---|---|---|---|---|
| **The Odds API** | Cuotas en vivo y movimientos de mercado | 1s - 5s (WS) | $150 USD | **Alta (Inmediata)** |
| **API-Football** | Calendarios, alineaciones, xG y lesiones | 1 min | $49 USD | **Alta (Inmediata)** |
| **SportsDataIO** | Estadísticas profundas de NFL y NCAA | 5s | $299 USD | **Media (Fase 2)** |
| **Sportradar** | Datos oficiales en vivo y telemetría | < 500 ms | > $3,000 USD | **Baja (Fase 3)** |
