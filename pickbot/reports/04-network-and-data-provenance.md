# 04 — Tráfico de Red, Contratos API (`/api/*`), Procedencia de Datos (`Data Provenance`) y Auditoría Cuantitativa de Rendimiento

> **Objetivo Auditado:** `https://www.pickbot.mx/` (`deployment_id: dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n`)  
> **Incógnita Principal Resuelta y Verificada:** `unk_3c9b39a9352dda731d4f16f01b336135e7ee9528232b9ba0aae51deb232cd6e1` (`status: "resolved"`, `disposition: "verified"`, `valid: true, truthVerified: true` en [rea-unknowns.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/rea-unknowns.json))  
> **Evidencias Primarias REA:** `ev_cbc30032...` (detalle íntegro de partidos UCL y Liga MX + CSV), `ev_d30074fd...` (historial completo de `4,517` picks), `ev_27c88c63...`, `ev_cf03b32a...` (HAR redactado de 46 intercambios), `ev_f0b776ac...` (`api-surface`), `ev_0345b491...` (`environment-manifest`)  
> **Referencias Cruzadas:** [01-executive-summary.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/01-executive-summary.md) · [03-javascript-and-components.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/03-javascript-and-components.md) · [05-evidence-register.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/05-evidence-register.md)

---

## 1. Procedencia de Datos (`Data Provenance`): Pruebas Forenses Irrefutables (`[OBSERVADO]`)

### 1.1 Evidencia Directa #1 — The Odds API v4 (`the-odds-api.com`, Plan de `100,000` Créditos/Mes, Región `us`)

En la captura controlada sin sesión `ev_cbc3003215c32d1934f73b2a1bd3650554bea0953a1ae810f13217f4336a600a`, los documentos devueltos por `GET /api/markets/matches/[eventId]?sportKey=...` ([19-api_match_ucl_galatasaray_aston_villa.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/19-api_match_ucl_galatasaray_aston_villa.json) y [19-api_match_ligamx_queretaro_monterrey.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/19-api_match_ligamx_queretaro_monterrey.json)) exponen **sin filtrar** los metadatos de caché de MongoDB y las cabeceras HTTP originales `x-requests-remaining`, `x-requests-used` y `x-requests-last` de **The Odds API v4**:

```json
{
  "_id": "6af3f59742e1268168950027",
  "cache_key": "soccer_uefa_champs_league:e422af92d1fc06c0a330838c1c2f2e08:us:h2h_3_way,spreads,alternate_spreads,team_totals,double_chance,btts,totals:",
  "cached_at": "2026-11-11T18:58:47.654Z",
  "stale_after": "2026-11-11T19:18:47.654Z",
  "event_id": "e422af92d1fc06c0a330838c1c2f2e08",
  "sport_key": "soccer_uefa_champs_league",
  "regions": "us",
  "odds_format": "american",
  "markets": "h2h_3_way,spreads,alternate_spreads,team_totals,double_chance,btts,totals",
  "odds_snapshot_hash": "f08112423abfc67ca4a6a4c156d9499cc48c52ddee821a7890e257623e51ab54",
  "quota": {
    "requests_remaining": "69471",
    "requests_used": "30529",
    "requests_last": "7"
  }
}
```

De estos dos snapshots consecutivos se deducen matemáticamente cinco hechos operativos (`[OBSERVADO]`):

1. **Plan Comercial Exacto (`100,000` créditos/mes — `\$59 USD/mes`):**
   - En Galatasaray vs Aston Villa (`18:58:47Z`): $69{,}471 + 30{,}529 = 100{,}000$ créditos.
   - En Querétaro vs Monterrey (`20:48:31Z`): $69{,}179 + 30{,}821 = 100{,}000$ créditos (`292` créditos consumidos en `109.7` minutos, ritmo ~`160 créditos/hora`).
2. **Fórmula de Costo por Llamada (`requests_last`):** En The Odds API v4 el costo de `/v4/sports/{sport}/events/{eventId}/odds` es $\text{regiones} \times \text{mercados con datos}$. Con `regions="us"` (`1` región), el partido de Champions devolvió datos en los `7` mercados solicitados (`requests_last: "7"`), mientras que el de Liga MX devolvió datos en `5` de los `7` mercados (`requests_last: "5"`).
3. **Ventana de Caché (`TTL = 20 minutos`):** `stale_after - cached_at = 1,200,000 ms` exactos (`20 min`) en ambos documentos (`18:58:47.654Z -> 19:18:47.654Z` y `20:48:31.613Z -> 21:08:31.613Z`).
4. **Exclusividad de Sportsbooks Estadounidenses (`regions: "us"`):** Los 6 `bookmaker_key`s normalizados en `odds.normalized` son **`betmgm` (`BetMGM`), `betrivers` (`BetRivers`), `bovada` (`Bovada`), `draftkings` (`DraftKings`), `fanatics` (`Fanatics`) y `fanduel` (`FanDuel`)** ([19-match-detail-fanduel-odds.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/19-match-detail-fanduel-odds.png)). PickBot no ingiere momios de casas mexicanas (Caliente, Codere o Playdoit).
5. **Ausencia de Escudos en Origen:** Como The Odds API solo entrega nombres de equipos en texto e IDs MD5 de evento, PickBot suple los escudos en cliente mediante **FlagCDN (`flagcdn.com/w80/{iso}.png`)** y gradientes FNV-1a (`TeamAvatar`, documentado en [03-javascript-and-components.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/03-javascript-and-components.md)).

---

### 1.2 Evidencia Directa #2 — Síntesis Estructurada con OpenAI + Microservicio Cuantitativo `ml-api` (`core_game_v1`)

En el mismo documento [19-api_match_ucl_galatasaray_aston_villa.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/19-api_match_ucl_galatasaray_aston_villa.json), el subdocumento `pick_set` revela la cadena exacta de generación servidor:

```json
{
  "strategy_version": "match-selected-bets",
  "status": "valid",
  "model": "match",
  "prompt_version": "pickbot-structured-selection-v9",
  "quant_engine": "ml",
  "ml_prediction_ids": ["1eec968d-6905-4043-8ac0-661c9afd2d01"],
  "stale_if": ["odds move", "line disappears"],
  "bets": [
    {
      "_id": "generated-e422af92d1fc06c0a330838c1c2f2e08-0",
      "user_id": "system",
      "conversation_id": "match:e422af92d1fc06c0a330838c1c2f2e08",
      "title": "Aston Villa or Draw",
      "pickbot": {
        "est_prob": 0.688184,
        "market_anchor_probability": 0.6667,
        "break_even_probability": 0.6667,
        "edge_pp": 2.15,
        "ev_percent": 3.23,
        "value_grade": "B+",
        "market_grade": "B+",
        "market_anchor_quality": "low",
        "adjustment_reason": "independent thesis=away align=0.92; P_robust=0.688 EV_raw=12.8% EV_robust=3.2% vs_book=2.2pp vs_mkt=2.1pp",
        "data_quality": 0.75,
        "model_confidence": 0.8397,
        "model_name": "match",
        "model_version": "core_game_v1",
        "prediction_id": "1eec968d-6905-4043-8ac0-661c9afd2d01",
        "quant_engine": "ml"
      },
      "audit": {
        "created_from": "openai_match_selection"
      }
    }
  ]
}
```

- **Separación de responsabilidades ML vs. LLM (`[OBSERVADO]`):**
  1. Un servicio cuantitativo interno denominado **`ml-api`** (referenciado literalmente en [01e832ac972c5620.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/01e832ac972c5620.js)) ejecuta el estimador `core_game_v1` sobre las 24+9 variables históricas `as-of` y corre las `20,000` simulaciones (`simulation`), produciendo `P_robust`, `EV_raw`, `EV_robust`, `edge_pp` y un `prediction_id` UUIDv4.
  2. A continuación, el backend invoca la **API de OpenAI** (`audit.created_from = "openai_match_selection"`, plantilla `prompt_version = "pickbot-structured-selection-v9"`) pasándole las métricas de `ml-api` y los últimos marcadores reales de ambos clubes (ej. *"venció 6-0 a Fenerbahce y 3-1 a Viking FK, aunque llega de perder 0-3 contra Barcelona"*) para redactar en español estructurado los campos `summary`, `decision_reason`, `entry_condition`, `risk` y `no_bet_reason`.
  3. Cuando ninguna línea supera el filtro de valor esperado robusto, `pick_set.status` se guarda como **`"no_bet"`** con `bets: []` y `model: "pickbot-ml"` (observado en Querétaro vs Monterrey: *"El candidato más cercano fue Monterrey en h2h, pero su cotización no compensaba la incertidumbre de un partido parejo"*).

---

## 2. Catálogo de Deportes (`33 SPORT_LABELS`) y Auditoría Financiera Real (`4,517` Picks en 30 Ligas)

### 2.1 Las 33 Competiciones Declaradas en el Selector Maestro (`SPORT_LABELS`, módulo `12104`)

El módulo `12104` ([e28be9743872cf14.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/e28be9743872cf14.js) y [6d05e03f6d9857e7.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/6d05e03f6d9857e7.js)) define **33 claves `sport_key` nativas de The Odds API v4**, complementadas con una función `sportLabel()` que formatea dinámicamente sub-torneos adicionales devueltos por el backend (p. ej. `tennis_atp_us_open`, `soccer_uefa_europa_league`, `basketball_euroleague`):

| Familia Deportiva | # Claves | Claves `sport_key` Configuradas (`SPORT_LABELS`) |
|---|---:|---|
| **Fútbol (`soccer_*`)** | `16` | `soccer_mexico_ligamx` (*Liga MX*), `soccer_epl` (*Premier League*), `soccer_spain_la_liga` (*La Liga*), `soccer_italy_serie_a` (*Serie A*), `soccer_germany_bundesliga` (*Bundesliga*), `soccer_germany_dfb_pokal` (*Germany DFB Pokal*), `soccer_france_ligue_one` (*Ligue 1*), `soccer_belgium_first_div` (*Belgium First Div*), `soccer_usa_mls` (*MLS*), `soccer_brazil_campeonato` (*Brazil Série A*), `soccer_conmebol_copa_libertadores` (*Libertadores*), `soccer_conmebol_copa_sudamericana` (*Sudamericana*), `soccer_uefa_champs_league` (*Champions League*), `soccer_fifa_world_cup` (*World Cup*), `soccer_fifa_club_world_cup` (*Club World Cup*), `soccer_fifa_world_cup_qualifiers` (*WC Qualifiers*) |
| **Béisbol (`baseball_*`)** | `4` | `baseball_mlb` (*MLB*), `baseball_kbo` (*KBO*), `baseball_npb` (*NPB*), `baseball_milb` (*MiLB*) |
| **Básquetbol (`basketball_*`)** | `3` | `basketball_nba` (*NBA*), `basketball_wnba` (*WNBA*), `basketball_ncaab` (*NCAAB*) |
| **Fútbol Americano (`americanfootball_*`)** | `2` | `americanfootball_nfl` (*NFL*), `americanfootball_ncaaf` (*NCAAF*) |
| **Hockey sobre Hielo (`icehockey_*`)** | `2` | `icehockey_nhl` (*NHL*), `icehockey_sweden_hockey_league` (*SHL*) |
| **Tenis (`tennis_*`)** | `2` | `tennis_atp` (*ATP Tennis*), `tennis_wta` (*WTA Tennis*) |
| **Combate y Otros Deportes** | `4` | `mma_mixed_martial_arts` (*MMA*), `aussierules_afl` (*AFL · Fútbol australiano*), `rugbyleague_nrl` (*NRL*), `lacrosse_pll` (*PLL*) |

---

### 2.2 Auditoría Financiera Completa por Liga (`All-Time`: `2026-06-21` a `2026-11-11`, `strategyId=none`)

A partir de [15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json) (`ev_d30074fd...`), la siguiente tabla audita las **30 competiciones con picks emitidos** por el sistema (`stake_units = 1u` plana por pick decidido):

| # | Liga (`sport_title`) | `sport_key` | Total Generados | Decididos | Récord (`G - P - Push`) | % Acierto | Momio Decimal Medio | Unidades (`profit_units`) | ROI (%) |
|---:|---|---|---:|---:|---|---:|---:|---:|---:|
| 01 | **MLB** | `baseball_mlb` | `1,458` | `1,410` | `784 - 626 - 18` | `55.6%` | `1.85` | **`+30.03u`** | **`+2.1%`** |
| 02 | **NCAAF** | `americanfootball_ncaaf` | `358` | `324` | `213 - 111 - 0` | `65.7%` | `1.37` | `-32.61u` | `-10.1%` |
| 03 | **NHL** | `icehockey_nhl` | `344` | `330` | `180 - 150 - 4` | `54.5%` | `1.77` | `-19.05u` | `-5.8%` |
| 04 | **MLS** | `soccer_usa_mls` | `311` | `289` | `155 - 134 - 11` | `53.6%` | `1.85` | `-12.10u` | `-4.2%` |
| 05 | **KBO** *(sin liquidar)* | `baseball_kbo` | `210` | `0` | `0 - 0 - 0` | `—` | `—` | `0.00u` | `—` |
| 06 | **WNBA** | `basketball_wnba` | `198` | `189` | `108 - 81 - 0` | `57.1%` | `1.74` | `-10.39u` | `-5.5%` |
| 07 | **NBA** | `basketball_nba` | `198` | `185` | `121 - 64 - 1` | `65.4%` | `1.52` | `-5.19u` | `-2.8%` |
| 08 | **NFL** | `americanfootball_nfl` | `150` | `131` | `89 - 42 - 1` | `67.9%` | `1.44` | `-4.19u` | `-3.2%` |
| 09 | **La Liga** | `soccer_spain_la_liga` | `118` | `108` | `57 - 51 - 1` | `52.8%` | `1.74` | `-13.13u` | `-12.2%` |
| 10 | **Serie A** | `soccer_italy_serie_a` | `110` | `100` | `58 - 42 - 4` | `58.0%` | `1.65` | `-10.41u` | `-10.4%` |
| 11 | **Premier League** | `soccer_epl` | `100` | `93` | `57 - 36 - 2` | `61.3%` | `1.81` | **`+4.98u`** | **`+5.4%`** |
| 12 | **Liga MX** | `soccer_mexico_ligamx` | `95` | `89` | `46 - 43 - 5` | `51.7%` | `1.76` | `-10.10u` | `-11.3%` |
| 13 | **Bundesliga** | `soccer_germany_bundesliga` | `95` | `86` | `47 - 39 - 3` | `54.7%` | `1.85` | `-0.71u` | `-0.8%` |
| 14 | **Ligue 1** | `soccer_france_ligue_one` | `82` | `74` | `43 - 31 - 4` | `58.1%` | `1.73` | `-4.09u` | `-5.5%` |
| 15 | **Champions League** | `soccer_uefa_champs_league` | `78` | `65` | `27 - 38 - 8` | `41.5%` | `1.71` | `-20.31u` | `-31.2%` |
| 16 | **Basketball Euroleague** | `basketball_euroleague` | `74` | `62` | `33 - 29 - 0` | `53.2%` | `1.85` | `-1.95u` | `-3.1%` |
| 17 | **World Cup** | `soccer_fifa_world_cup` | `73` | `61` | `40 - 21 - 6` | `65.6%` | `2.23` | **`+12.40u`** | **`+20.3%`** |
| 18 | **UEFA Europa League** | `soccer_uefa_europa_league` | `72` | `70` | `36 - 34 - 2` | `51.4%` | `1.73` | `-8.91u` | `-12.7%` |
| 19 | **ATP Wimbledon** *(sin liquidar)* | `tennis_atp_wimbledon` | `71` | `0` | `0 - 0 - 0` | `—` | `—` | `0.00u` | `—` |
| 20 | **Dutch Eredivisie** | `soccer_netherlands_eredivisie` | `68` | `56` | `31 - 25 - 4` | `55.4%` | `1.71` | `-2.49u` | `-4.5%` |
| 21 | **MMA** | `mma_mixed_martial_arts` | `66` | `22` | `13 - 9 - 0` | `59.1%` | `2.26` | **`+4.88u`** | **`+22.2%`** |
| 22 | **Primeira Liga - Portugal** | `soccer_portugal_primeira_liga` | `50` | `40` | `19 - 21 - 4` | `47.5%` | `1.96` | `-3.87u` | `-9.7%` |
| 23 | **NCAAB** | `basketball_ncaab` | `37` | `32` | `19 - 13 - 1` | `59.4%` | `1.54` | `-3.28u` | `-10.2%` |
| 24 | **Championship** | `soccer_efl_champ` | `28` | `23` | `10 - 13 - 5` | `43.5%` | `1.96` | `-3.54u` | `-15.4%` |
| 25 | **ATP US Open** | `tennis_atp_us_open` | `24` | `24` | `10 - 14 - 0` | `41.7%` | `2.57` | **`+1.99u`** | **`+8.3%`** |
| 26 | **Sudamericana** | `soccer_conmebol_copa_sudamericana` | `15` | `10` | `3 - 7 - 3` | `30.0%` | `2.15` | `-3.40u` | `-34.0%` |
| 27 | **WTA Wimbledon** *(sin liquidar)* | `tennis_wta_wimbledon` | `13` | `0` | `0 - 0 - 0` | `—` | `—` | `0.00u` | `—` |
| 28 | **A-League** | `soccer_australia_aleague` | `10` | `2` | `2 - 0 - 2` | `100.0%` | `2.01` | **`+2.01u`** | **`+100.6%`** |
| 29 | **WTA US Open** | `tennis_wta_us_open` | `8` | `8` | `3 - 5 - 0` | `37.5%` | `2.44` | `-1.28u` | `-15.9%` |
| 30 | **NBL** | `basketball_nbl` | `3` | `1` | `0 - 1 - 0` | `0.0%` | `1.92` | `-1.00u` | `-100.0%` |
| — | **TOTAL GLOBAL (`all`)** | `all` | **`4,517`** | **`3,884`** | **`2,204 - 1,680 - 89`** | **`56.7%`** | **`1.76`** | **`-115.70u`** | **`-3.0%`** |

> [!TIP]
> **Hallazgo Estadístico de Liquidación Incompleta (`[OBSERVADO]`):** Tres ligas enteras (`baseball_kbo` con `210` picks, `tennis_atp_wimbledon` con `71` y `tennis_wta_wimbledon` con `13`) registran `decided: 0, pending: 0`, explicando `294` de los `544` picks emitidos que jamás recibieron calificación `won/lost/push` porque The Odds API no devuelve `scores` automáticos en todas las competiciones secundarias o de tenis.

---

### 2.3 Curva de Calibración Empírica (`calibration`) y Comparativa de Estrategias (`none` vs `pickbot` vs `shared`)

El arreglo `calibration` de [15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json) explica con exactitud matemática el comportamiento del motor `core_game_v1`:

| Cubeta de Probabilidad (`bucket`) | Probabilidad Predicha Media (`predicted`) | Tasa de Acierto Real (`actual`) | Error de Calibración ($\text{actual} - \text{pred}$) | Muestra (`n`) | Diagnóstico Cuantitativo |
|---|---:|---:|---:|---:|---|
| `50-55%` | `52.5%` | `54.0%` | **`+1.5 pp`** | `987` | Bien calibrado (ligeramente conservador). |
| `55-60%` | `57.5%` | `54.5%` | `-3.0 pp` | `616` | Ligera sobreconfianza dentro del vig estándar. |
| `60-65%` | `62.5%` | `59.4%` | `-3.1 pp` | `318` | Ligera sobreconfianza. |
| `65-70%` | `67.5%` | `71.5%` | **`+4.0 pp`** | `246` | Excelente calibración empírica. |
| `70-75%` | `72.5%` | `62.5%` | **`-10.0 pp`** | `256` | **Sobreconfianza severa** (paga momios ~`-260` acertando como `-167`). |
| `75-80%` | `77.5%` | `70.3%` | **`-7.2 pp`** | `256` | **Sobreconfianza severa**. |
| `80-85%` | `82.5%` | `68.8%` | **`-13.7 pp`** | `330` | **Descalibración crítica en favoritos pesados** (ej. NCAAF `avg_odds: 1.37`). |
| `85-90%` | `87.5%` | `55.6%` | **`-31.9 pp`** | `18` | Muestra pequeña con caída pronunciada. |
| `90-95%` | `92.5%` | `null` | `—` | `0` | Sin emisiones en esta banda. |

**Comparación de Ventanas y Filtros Observados:**
- **30 Días (`2026-10-13` a `2026-11-11`) — `Sin estrategia (none)`:** `865` decididos (`502G - 363P - 20 Push`), `58.0%` acierto, momio medio `1.68`, **`-55.32u` (`-6.4%` ROI)** ([03-rendimiento-api_rendimiento_sportKey_all_strategyId_none_from_2026-10-13_to_2026-11-11.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/03-rendimiento-api_rendimiento_sportKey_all_strategyId_none_from_2026-10-13_to_2026-11-11.json)).
- **30 Días (`2026-10-13` a `2026-11-11`) — Estrategia Oficial `PickBot` (`1.25 <= edge_pp <= 1.75`):** `92` decididos (`50G - 42P - 2 Push`), `54.3%` acierto, momio medio `1.76`, **`-7.39u` (`-8.0%` ROI, mejorando `+16.9 pp` respecto al mes previo `-24.9%`)** ([18-api_rendimiento_30d_pickbot.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/18-api_rendimiento_30d_pickbot.json)).
- **Últimos 8 Días (`2026-11-04` a `2026-11-11`) — Estrategia Oficial `PickBot`:** `21` decididos (`13G - 8P - 1 Push`), `61.9%` acierto, momio medio `1.80`, **`-0.20u` (`-0.9%` ROI)** ([04-estrategias-api_rendimiento_strategyId_pickbot_sportKey_all_from_2026-11-04_to_2026-11-.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/04-estrategias-api_rendimiento_strategyId_pickbot_sportKey_all_from_2026-11-04_to_2026-11-.json)).
- **Estrategias Comunitarias Top (`/api/strategies/public?limit=50`):** Al filtrar nichos donde el modelo no sufre sobreconfianza (p. ej. `NHL Over` o `Favoritos Sólidos — Fútbol, Béisbol` en token `691d418b0b53b755e4`), las estrategias de usuarios registran ROIs positivos en ventanas cortas de 7–30 días ([04-estrategias-api_strategies_public_limit_50.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/04-estrategias-api_strategies_public_limit_50.json)).

---

## 3. Catálogo Completo de Contratos REST (`/api/*` — 30 Endpoints Auditados)

Combinando la proyección REA `api-surface` (`ev_f0b776ac8069b50ed8990e6cf688d8a4be5a2c36d87d1b104f2cdb224c16f1c1` en [21-har-api-surface.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/21-har-api-surface.json)), las capturas anónimas `ev_2448975c...`..`ev_58ce3728...` y el grafo AST JavaScript, se documentan los **30 endpoints `/api/*`** de PickBot:

| # | Método y Ruta (`/api/*`) | Parámetros Query / Body Clave | Validación de Sesión en Servidor | Respuesta / Contrato Verificado |
|---:|---|---|---|---|
| 01 | `POST /api/auth/sync` | Body `{ uid, email, displayName, photoURL }` | Basada en payload Firebase cliente | `{ success: true, isNewUser: boolean }` — crea o actualiza el documento en MongoDB. |
| 02 | `GET /api/auth/me` | `?uid=<firebase_uid>` | Sin `Bearer` token en `fetch` (`[OBSERVADO]`) | Perfil maestro: `mongoId`, `role`, `handle`, `subscriptionPlan`, `limits`, `invitation`. |
| 03 | `PATCH /api/account` · `DELETE /api/account` | Body `{ uid, displayName, handle, bio, avatarKind, avatarEmoji, photoURL }` | Identidad por `uid`/`mongoUserId` | Actualiza perfil propio o elimina permanentemente la cuenta. |
| 04 | `GET /api/notifications/preferences` (+ `PUT/PATCH`) | `?uid=...` | Identidad por `uid` | Preferencias de correos transaccionales y avisos de picks. |
| 05 | `GET /api/pick-energy` | `?mongoUserId=<24hex>` | Sin `Bearer` token en `fetch` (`[OBSERVADO]`) | `{ energy: 4, maxEnergy: 5, unlimited: false, nextRegenAt: ISO8601, regenMs: 14400000 }`. |
| 06 | `GET /api/pick-energy/unlocks` | `?mongoUserId=<24hex>` | Sin `Bearer` token en `fetch` (`[OBSERVADO]`) | `{ unlockedEventIds: string[], count: number }` — lista de partidos ya desbloqueados en UI. |
| 07 | `POST /api/invitations/redeem` | Body `{ uid, code }` | Identidad por `uid` | Aplica código de referido (`XXXX-XXXX`) otorgando `+10` unidades (`INVITE_BONUS_ENERGY`). |
| 08 | `GET /api/markets/matches` | `?sportKey=all&from=ISO&to=ISO` o `?scope=upcoming&limit=24` | **Público (`200 OK`)** | Arreglo de partidos con `event_id`, equipos, `commence_time`, marcadores y metadatos resumidos de `pick_set`. |
| 09 | `GET /api/markets/matches/[eventId]` | `?sportKey=<sport_key>` *(obligatorio; `400 Missing sportKey` si falta)* | **Público (`200 OK`, sin gate Pick Energy)** | Devuelve `{ match, odds (incl. quota!), odds_at_pick, pick_set (íntegro!), comments }`. |
| 10 | `POST /api/markets/matches/[eventId]/unlock` | Body `{ mongoUserId, sportKey }` | Identidad por `mongoUserId` | Descuenta `1` unidad de Pick Energy (`MATCH_UNLOCK_COST = 1`) y registra el `eventId`. |
| 11 | `POST /api/markets/matches/[eventId]/refresh` | Body `{ sportKey }` | Cooldown `120s` | Fuerza refresco de momios desde The Odds API v4 si el snapshot superó su ventana. |
| 12 | `GET /api/markets/matches/[eventId]/pulse` | `?mongoUserId=...` | Público / Opcional `mongoUserId` | Conteo agregado `Pulso de la comunidad` (votos a favor vs. en contra del pick). |
| 13 | `GET /api/markets/matches/[eventId]/comments` | — | **Público (`200 OK`)** | Lista de comentarios del partido con autor, `@handle`, avatar y timestamp. |
| 14 | `POST /api/markets/comments/[id]` *(y creación)* | Body `{ uid, text }` | Requiere usuario identificado | Publica o modera comentarios en la pestaña `Comunidad` del partido. |
| 15 | `GET /api/markets/history` | `?sportKey=...&team=...` | Público / Interno | Historial reciente de marcadores por equipo para la pestaña `Tesis`. |
| 16 | `GET /api/bets` · `DELETE /api/bets/[id]` | `?uid=...&mongoUserId=...&limit=50` | Sin `Bearer` token en `fetch` | Historial de picks guardados o creados por el usuario (`single` / `parlay`). |
| 17 | `POST /api/bets/build` | Body `{ mongoUserId, status, betType, risk, desiredLegs, selectedMatches }` | Cobra `2` picks (`402 insufficient_energy` si falta saldo) | Ejecuta el constructor IA `/picks`; reembolsa los `2` picks si `refunded: true`. |
| 18 | `GET /api/bets/stats` · `GET /api/bets/share/[id]` | `?uid=...` / `id` | Público en `/share/[id]` | Estadísticas personales de apuestas y payload público de tarjeta compartible. |
| 19 | `GET /api/rendimiento` | `?allTime=1` o `?from=YYYY-MM-DD&to=YYYY-MM-DD&sportKey=...&strategyId=...` | **Público (`200 OK`)** | Auditoría completa: `summary`, `previous`, `trend`, `bestLeague`, `byLeague`, `daily`, `calibration`. |
| 20 | `GET /api/rendimiento/export` | `?dataset=daily|picks&sportKey=...&strategyId=...&from=...&to=...` | **Público (`200 OK`, `text/csv`)** | Descarga CSV directa (ej. [19-api_rendimiento_export_daily_30d.csv](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/19-api_rendimiento_export_daily_30d.csv), `2,886 B`). |
| 21 | `POST /api/rendimiento/preview` | Body `{ sportKeys, marketFamilies, rules }` | **Público (`200 OK`)** | Evalúa en vivo una estrategia DSL y devuelve `{ days: 30, roi, picks, won, decided, win_ratio }`. |
| 22 | `GET /api/strategies` (+ `POST/PUT/DELETE /api/strategies/[id]`) | `?uid=...&mongoUserId=...` | Lectura pública de `pickbot`; edición de usuario | Devuelve `{ selectedId, canEditPickbot, pickbot, items: [...] }`. |
| 23 | `GET /api/strategies/pickbot` | — | **Público (`200 OK`)** | Regla oficial del sistema: `edge_pp >= 1.25 AND edge_pp <= 1.75` (`units: 1`). |
| 24 | `GET /api/strategies/public` · `GET /api/strategies/shared/[token]` | `?limit=50` / `token` hex de 18 chars | **Público (`200 OK`)** | Ranking comunitario de estrategias y carga de estrategia compartida (`691d418b0b53b755e4`). |
| 25 | `GET /api/leaderboard` | `?period=7d|30d|all&limit=20|50` | **Público (`200 OK`)** | Clasificación global por ROI con `id` (`mongoId`), `handle`, `won`, `lost`, `push`, `roi`. |
| 26 | `GET /api/feed` · `GET /api/feed/saved` · `POST /api/feed/views` | `?mode=global|friends&mongoUserId=...` | `global` público (`200 OK`) | Feed de actividad (`pick_save` y `post` multimedia), guardados y telemetría de impresiones. |
| 27 | `GET /api/friends` · `GET /api/friends/suggested` | `?period=30d&mongoUserId=...` | Identidad por `mongoUserId` | Tabla comparativa de ROI entre amigos y sugerencias de cuentas a seguir. |
| 28 | `GET /api/users/search` · `GET /api/users/[id]` · `/api/users/[id]/follow` | `?q=america` / `mongoId` | **Público en lectura (`200 OK`)** | Búsqueda de perfiles ([18-api_users_search_q_america.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/18-api_users_search_q_america.json)), perfil público y grafo de seguidores. |
| 29 | `POST /api/uploads/presign` · `GET /api/media/[...path]` | Body `{ filename, contentType, kind }` | Presign autenticado; lectura media pública | Genera URL firmada `PUT` hacia bucket S3-compatible y sirve imágenes/videos del feed y avatares. |
| 30 | `POST /api/stripe/checkout` · `/api/stripe/portal` · `/api/stripe/cancel` (+ `/api/admin/*`) | Body `{ uid, planId }` | Requiere cuenta (`checkout`/`portal`) o `role: "admin"` (`/api/admin/pro-picks/`, `/api/admin/match-pick-context`, `/api/admin/match-pick-settlement`) | Pasarela de suscripción `PickBot Pro` (`\$299 MXN/mes`, `prod_U2enelHVVdr9L6`) y herramientas internas de administración cuantitativa. |
