# 08 — Modelos de datos
Ver src/domain/types.ts (tipado completo) y src/data/*.json (instántanea 7 nov 2026).
- T (NFL): {cod:[nombre, PF_2025, PA_2025]} · T (NCAA): {cod:[nombre, PF/j, PA/j, JJ, conf]}
- R: [visitante, local, ptsV, ptsL] (121 juegos) · AUD: auditados (1)
- N: objetos {id,t,n,r(gf|ga),i,st(0/.25/.5/1),h(detalle+fuente),d(fecha)} — 154 lesiones
- D: días [{h,a,t,ref?,sc?,aud,pk?,k,dl}] — 13 juegos DOM 8 nov + 1 LUN + resultados
- PJ: {t,n,pos,g,py,ptd,ra,ry,rtd,rec,rcy,rctd,st,nt} · DF: {cod:[JJ,pts,ydsP,ydsT]}
- MONEY: {src,ts,g:{juego:{sp|ml|tot:{l,bh,ba,mh,ma|bo,bu,mo,mu}}}} — 14 juegos
- AV: {cfg{start,th}, odds{}, slip[], bets[], ovr, u, tab, db, base, ready, arm}
- Bet: {id,ts,legs[{l,m,sp,t,p,d}],p,d,stake,u,st(p|w|l|v)}
Procedencia citada por el propio código: PFR al 19 oct (T/DF/PJ), rosters CBS 20 oct (JN),
reportes NFL.com/Yahoo/CBS 6–7 nov (N), DK Network sáb 7 nov 2:08–3:41 PM CDMX (MONEY).
