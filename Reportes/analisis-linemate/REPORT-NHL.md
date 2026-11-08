# INFORME TÉCNICO — NHL (motor de tendencias Linemate)

Fecha snapshot: 2026-11-08 (temporada 2026-27 en curso).

## 1. Fuentes de datos
- **Vendor**: Sportradar (`SRID`/`SRGUID`); IDs auxiliares Sleeper nulos (no aplica).
- **Odds**: el pool más amplio observado (26+ operadores en un solo pick): caesars, draftkings, unibet, 888sport, bwin, leovegas, betmgm, underdog, fanatics, hardrock, bet99, prophetx, thescore, prolineplus, novig, betano, sleeper, fliff, fanduel, williamhill, miseojeu, betway, kalshi, sportsbet, betrivers, betrpicks, prizepicks.
- **Game logs**: stats por partido y por **periodo** (`goals1p`, `assists1p`, `points1p`, `shotsOnGoal1p`, `timeOnIce`…) con campos propios de hockey: `powerplayPoints`, `defensiveBlocks`, `offensiveBlocks`, `hits`, `faceoffWins`, `corsiPercentage` (en team stats), `savePercentage`.

## 2. Mercados observados y mapeo
POINTS→`points`; SHOTS_ON_GOAL→`shotsOnGoal`; GOALS→`goals`; ASSISTS→`assists`; POWERPLAY_POINTS→`powerplayPoints`; BLOCKED_SHOTS→`defensiveBlocks` (defensivo del rival: `averageStats.offensive.offensiveBlocks`); GOALS_ALLOWED→`goalsAllowed`; SAVES→`saves`; SHUTOUT→`shutouts`; ANYTIME_GOAL_SCORER→`goals` (outcome yes/no).
Registro client-side incluye `supportingStats` (GP, PPP, G, A, TOI) y `opposingSupportingStats` con GA/SOG-A/SAT-A/CF% rankeds — espejo del motor.

## 3. Resultados de pruebas
**44/45 señales exactas** (15 jugadores). Única divergencia: Jacob Markstrom (GK) SAVES under 23.5 — ventana 11: motor 11/11 vs API 9/11. Hipótesis: el API excluye juegos sin titularidad completa o usa un campo de saves distinto en algunos juegos (edge case de porteros, no afecta a la fórmula general). Markets de periodo (1P) definidos en el registro (goals1p/assists1p) aunque el snapshot mostró mostly full-game.

## 4. Diferencias / no determinado
- Mismas limitaciones globales (generación de ventanas, winPercentage por equipo, OPPONENT_RANK por métrica, hash de trendId).
- Los mercados de portero (SAVES/GOALS_ALLOWED/SHUTOUT) requieren reglas de participación que no son observables para todos los casos (1 divergencia en 45).
