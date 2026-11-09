# Benchmark GBM (LightGBM) sobre features as-of

Generado: 2026-11-09T03:41:23.204915+00:00

> Entrenamiento walk-forward por temporada: para cada temporada solo se usan las anteriores.
> Evaluación retro: no cuenta como track record (`PREDICTION_ARCHITECTURE.md` §2).

| Liga | n | GBM | DC | Elo | Mezcla | Mercado | Δ GBM−mezcla | Δ GBM−mercado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| bundesliga | 4305 | 0.9917 | 0.9939 | 0.9930 | 0.9915 | 0.9757 | 0.0001 [-0.0038, 0.0044] | 0.0160 [0.0108, 0.0214] |
| la-liga | 5359 | 0.9734 | 0.9728 | 0.9721 | 0.9703 | 0.9525 | 0.0031 [-0.0002, 0.0065] | 0.0210 [0.0160, 0.0260] |
| liga-mx | 982 | 1.0050 | 1.0050 | 1.0030 | 1.0020 | — | 0.0030 [-0.0032, 0.0091] | — |
| ligue-1 | 4254 | 1.0020 | 1.0021 | 1.0009 | 0.9993 | 0.9820 | 0.0028 [-0.0003, 0.0059] | 0.0201 [0.0148, 0.0249] |
| premier-league | 5338 | 0.9709 | 0.9722 | 0.9719 | 0.9695 | 0.9539 | 0.0015 [-0.0018, 0.0048] | 0.0170 [0.0122, 0.0218] |
| serie-a | 4944 | 0.9708 | 0.9735 | 0.9730 | 0.9707 | 0.9489 | 0.0000 [-0.0031, 0.0033] | 0.0219 [0.0172, 0.0270] |

## Importancia media de features (gain)

| Feature | Ganancia media |
|---|---:|
| dc_away | 52468.7 |
| elo_home | 45695.0 |
| elo_away | 39954.2 |
| dc_home | 33412.3 |
| elo_draw | 16949.1 |
| dc_draw | 8677.6 |
| xg_away | 7950.6 |
| xg_home | 7238.7 |
| shots_home | 5446.0 |
| shots_away | 4386.5 |
| form_home | 2123.3 |
| form_away | 1930.9 |
| rest_away | 1287.2 |
| rest_home | 826.8 |
| league_bundesliga | 282.4 |
| league_la-liga | 247.2 |
| league_serie-a | 241.5 |
| league_premier-league | 178.5 |
| league_ligue-1 | 45.6 |
| league_liga-mx | 30.8 |
