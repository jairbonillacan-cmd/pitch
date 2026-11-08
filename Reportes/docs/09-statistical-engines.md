# 09 — Motores estadísticos (verificados por ejecución)
## NFL (src/domain/engine-nfl.ts) — 24/24 tests dorados
1. build: w=n/(n+6); rs=PF2025/17·(1−w)+media2026·w; LG=Σrs/32
2. eff: lesiones d=i·st (gf resta rs, ga suma ra), piso 8
3. model0: Pitágoras E=2.37 → Log5 → localía .55 (Londres .50: JAX-PHI/JAX-HOU) → pH
   tot=rsH·raA/LG+rsA·raH/LG; mu=13.4·Φ⁻¹(pH); spread=half|mu| (≥1.5); total=half(tot)
   p(mercado)=1−Φ((línea−proyección)/σ); σ: 13.4 spread, 13.3 total, 9.5 team totals
4. Pick: ≥72% → hf margen al 62% · 58–72% → ML · <58% → hd underdog al 65%; dom=ofensa+defensa
5. 80/20: PCONS=.5+.85(p−.5); SC=.8p+.2·PCONS·cuota; QMIN=1.40; +0.05 mejor EV; pool p≤.85
   PLW: 3 mejores de p≥.60 · PLR: p≥.52, cuota total ∈[3,7] hacia 5
6. Cuota default: 1/(p·1.05) (×1.10 combinadas cb_ — desactivadas en UI, convolución con push 50/50)
7. Props: shr=(tot+pr·2)/(JJ+2); fct=1+.5(v/lg−1); PRI por posición; TD Poisson 1−e^(−μ);
   recep 1−poisCDF(⌊L⌋,μ); yds 1−Φ((L−μ)/σ); safeAlt→P(over)≈.68
8. Auditoría: SA=build(R) (sin el juego), SIN lesiones; ✓/✗ por mercado con f(pLocal,pVisita)
**Golden:** WAS@LAR ML 67.8% ≈1.40 · LAC@HOU 66.2% ≈1.44 · SEA−3.5 66.2% · IND+5.5 65.5% ·
ATL/CIN chip "56%" (motor 56.2%) · etiquetas idénticas · BAL@JAX audit ✓.
## NCAA (src/domain/engine-ncaa.ts)
build: (avg·G+LGP·K+pts)/(G+K+n) con K=3, LGP=28; ajuste de conferencia rs×cf/ra÷cf
(CONF: SEC/B1G/B12/ACC/IND=1, P12=.92, G5=.88); SDM=15.5; HFA=.56; pick solo ML umbral 55%.
## Bankroll (src/domain/betting.ts)
EV=p·d−1 · profit (w: stake(d−1), l: −stake) · curBank=max(0,start+neto) ·
unitOf: 10% (p≥th y EV>0) / 5% (EV>0) / 0 no apostar · noVig: (1/dᵢ)/Σ(1/dⱼ) · ROI por liga/tipo.
