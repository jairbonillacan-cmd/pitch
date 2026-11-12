window.AVX=(function(){
  const A={
    bank:1000,th:.6,odds:{
    }
  }
    ,inSlip:new Set(),cbs:[],pk:{
    }
  }
  }
}
  ;
  A.fmt=v=>"$"+Math.round(v).toLocaleString("es-MX");
  /* regla de bank: 10% si el modelo da >= umbral, 5% si da menos;
  0 si la cuota no tiene valor */
 A.EVMIN=.04;
  A.unit=(p,d)=>{
    if(d&&p*d-1<A.EVMIN)return 0;
  return p>=A.th?10:5}
}
  ;
  A.setOdd=(k,v)=>{
    if(v)A.odds[k]=v;
    else delete A.odds[k];
    try{
      parent.postMessage({
      av:"odd",k,v:v||""}
    }
    ,"*")}
  }
    catch(e){
    }
  }
  }
}
  ;
  A.add=k=>{
    const p=A.pk[k];
    if(!p)return;
    if(A.inSlip.has(k))A.inSlip.delete(k);
    else A.inSlip.add(k);
    try{
      parent.postMessage({
      av:"add",pk:p}
    }
    ,"*")}
  }
    catch(e){
    }
  }
  }
}
  ;
  A.on=f=>A.cbs.push(f);
  /* quita el margen de la casa: grupos de mercados complementarios */
 A.noVig=(groups,odd)=>{
    const r={
    }
  }
    ,mg=[];
    groups.forEach(([name,ids])=>{
      const ds=ids.map(odd);
      if(ds.every(d=>d)){
        const s=ds.reduce((a,d)=>a+1/d,0);
        ids.forEach((id,i)=>r[id]=(1/ds[i])/s);
      mg.push([name,s-1])}
    }
    }
  }
    );
    return{
    p:r,mg}
  }
  }
}
  ;
  A.addBtn=(k,pk)=>{
    A.pk[k]=pk;
  return `<button class="ad ${A.inSlip.has(k)?"on":""}" data-add="${k}" title="Agregar al boleto">${A.inSlip.has(k)?"✓":"+"}</button>`}
}
  ;
  /* bloque de monto sugerido bajo el pick */
 A.stakeBox=(o,d,k,pk)=>{
    A.pk[k]=pk;
    const on=A.inSlip.has(k),btn=`<button class="addb ${on?"on":""}" data-add="${k}">${on?"✓ EN BOLETO":"+ BOLETO"}</button>`,u=A.unit(o.p,d),pp=(o.p*100).toFixed(1)+"%";
    if(!d)return `<div class="stake"><div>APUESTA SUGERIDA · SOLO CON VALOR<small>Modelo ${pp} · juégala solo si tu casa paga ${((1+A.EVMIN)/o.p).toFixed(2)} o más</small></div><b>${u}% del bank</b>${btn}</div>`;
    const ev=o.p*d-1;
    if(!u)return `<div class="stake mut"><div>NO APOSTAR · sin valor a ${d.toFixed(2)}<small>EV ${ev>0?"+":""}${(ev*100).toFixed(1)}% · necesitas cuota ≥ ${((1+A.EVMIN)/o.p).toFixed(2)} (ventaja mínima 4%)</small></div>${btn}</div>`;
  return `<div class="stake"><div>APUESTA SUGERIDA<small>Modelo ${pp} · EV +${(ev*100).toFixed(0)}%</small></div><b>${u}% del bank</b>${btn}</div>`}
}
  ;
  A.anim=root=>{
    root.classList.add("anim");
    root.querySelectorAll(".row").forEach((r,i)=>{
      r.style.animationDelay=(i*.05)+"s";
      const b=r.querySelector(".bar i");
    if(b)b.style.animationDelay=(.15+i*.05)+"s"}
  }
    );
    const pb=root.querySelector(".pick b");
    if(pb){
      const m=pb.textContent.match(/^([\d.]+)%$/);
      if(m){
        const t=+m[1],t0=performance.now()+550;
        const st=n=>{
          const k=Math.min(1,Math.max(0,(n-t0)/700));
          pb.textContent=(t*(1-Math.pow(1-k,3))).toFixed(1)+"%";
        if(k<1)requestAnimationFrame(st)}
      }
        ;
      requestAnimationFrame(st)}
    }
    }
  }
  }
}
  ;
  addEventListener("message",e=>{
    const m=e.data;
    if(!m||m.av!=="cfg")return;
    A.bank=m.bank;
    if(m.th)A.th=m.th;
    if(m.odds){
      Object.keys(A.odds).forEach(k=>delete A.odds[k]);
    Object.assign(A.odds,m.odds)}
  }
    if(m.inSlip)A.inSlip=new Set(m.inSlip);
    A.cbs.forEach(f=>{
      try{
      f()}
    }
      catch(err){
      }
    }
    }
  }
  )}
}
  );
  document.addEventListener("click",e=>{
    const b=e.target.closest&&e.target.closest("[data-add]");
    if(!b)return;
    e.stopPropagation();
    A.add(b.dataset.add);
    const on=A.inSlip.has(b.dataset.add);
    document.querySelectorAll(`[data-add="${CSS.escape(b.dataset.add)}"]`).forEach(x=>{
      x.classList.toggle("on",on);
    x.textContent=x.classList.contains("ad")?(on?"✓":"+"):(on?"✓ EN BOLETO":"+ BOLETO")}
  }
  )}
}
  ,true);
  try{
    parent.postMessage({
    av:"ready"}
  }
  ,"*")}
}
  catch(e){
  }
}
return A}
}
)();
/* ===== script block boundary ===== */


const LG0={
PL:1.45,LL:1.35,MX:1.51,SA:1.21,BL:1.62,L1:1.41,OT:1.40}
}
,STR={
PL:1,LL:.98,BL:.96,SA:.96,L1:.92,MX:.8,OT:.85}
}
,LGU=1.45;
const E=1.7,HFA=.54,SHR=.85,DRAW=.28,DCO=.42,K=6,NG=14,ed={
}
}
,SO=AVX.odds;
// [codigo, nombre, liga, GF, GC, PJ, [GF,GC,PJ 2026-27] o 0, bandera (e estimado, n sin dato, p ascendido), competiciones]
const est=(gd)=>[55+gd/2,55-gd/2];
const TD=[
["ARS","Arsenal","PL",71,27,38,[14,5,9],"","PL,UCL"],["MCI","Manchester City","PL",77,35,38,[20,10,9],"","PL,UCL"],["LFC","Liverpool","PL",63,53,38,[11,9,9],"","PL,UCL"],["BRI","Brighton","PL",52,46,38,[24,7,9],"","PL"],["CFC","Chelsea","PL",58,52,38,[19,15,9],"","PL"],["NEW","Newcastle","PL",53,55,38,[12,15,9],"","PL"],
["MUN","Manchester United","PL",...est(19),38,0,"e","PL,UCL"],["AVL","Aston Villa","PL",...est(7),38,0,"e","PL,UCL"],["BOU","Bournemouth","PL",...est(4),38,0,"e","PL,UEL"],["SUN","Sunderland","PL",...est(-6),38,0,"e","PL,UEL"],["BRE","Brentford","PL",...est(3),38,0,"e","PL"],["FUL","Fulham","PL",...est(4),38,0,"e","PL"],["EVE","Everton","PL",...est(-3),38,0,"e","PL"],["LEE","Leeds United","PL",...est(-7),38,0,"e","PL"],
["CRY","Crystal Palace","PL",0,0,0,0,"n","PL,UEL"],["NFO","Nottingham Forest","PL",0,0,0,0,"n","PL"],["TOT","Tottenham","PL",0,0,0,0,"n","PL"],["COV","Coventry City","PL",0,0,0,[9,16,9],"p","PL"],["IPS","Ipswich Town","PL",0,0,0,0,"p","PL"],["HUL","Hull City","PL",0,0,0,0,"p","PL"],
["BAR","Barcelona","LL",95,36,38,[46,12,11],"","LL,UCL"],["RMA","Real Madrid","LL",77,35,38,[28,10,11],"","LL,UCL"],["VIL","Villarreal","LL",72,46,38,[15,15,11],"","LL,UCL"],["ATM","Atlético de Madrid","LL",62,44,38,0,"","LL,UCL"],["RBB","Real Betis","LL",59,48,38,[18,15,11],"","LL,UCL"],["RCC","Celta de Vigo","LL",53,48,38,[10,10,11],"","LL,UEL"],["GET","Getafe","LL",32,38,38,[8,16,11],"","LL"],["RVC","Rayo Vallecano","LL",41,44,38,0,"","LL"],["VCF","Valencia","LL",46,55,38,0,"","LL"],["RSO","Real Sociedad","LL",59,61,38,0,"","LL,UEL"],["ESP","Espanyol","LL",43,55,38,0,"","LL"],["SEV","Sevilla","LL",46,60,38,[17,19,11],"","LL"],
["ATH","Athletic Club","LL",0,0,0,0,"n","LL"],["OSA","Osasuna","LL",0,0,0,0,"n","LL"],["ALA","Alavés","LL",0,0,0,0,"n","LL"],["ELC","Elche","LL",0,0,0,0,"n","LL"],["LEV","Levante","LL",0,0,0,[16,21,11],"n","LL"],["RAC","Racing Santander","LL",0,0,0,0,"p","LL"],["DEP","Deportivo","LL",0,0,0,[15,14,11],"p","LL"],["MCF","Málaga","LL",0,0,0,0,"p","LL"],
["TOL","Toluca","MX",31,21,15,0,"","MX"],["AME","América","MX",36,21,15,0,"","MX"],["CHI","Chivas","MX",25,14,15,0,"","MX"],["QRO","Querétaro","MX",18,21,14,0,"","MX"],["LEO","León","MX",22,20,15,0,"","MX"],["ATS","Atlas","MX",26,26,15,0,"","MX"],["CAZ","Cruz Azul","MX",34,24,15,0,"","MX"],["TIJ","Tijuana","MX",25,21,15,0,"","MX"],["PUE","Puebla","MX",17,23,15,0,"","MX"],["MTY","Monterrey","MX",26,21,14,0,"","MX"],["PAC","Pachuca","MX",25,19,15,0,"","MX"],["PUM","Pumas","MX",22,24,15,0,"","MX"],["SLP","Atlético San Luis","MX",19,23,15,0,"","MX"],["ATL","Atlante","MX",16,24,15,0,"","MX"],["TIG","Tigres","MX",15,22,15,0,"","MX"],["SAN","Santos Laguna","MX",21,20,15,0,"","MX"],["NEC","Necaxa","MX",16,28,15,0,"","MX"],["JUA","FC Juárez","MX",12,34,15,0,"","MX"],
["INT","Inter","SA",89,35,38,0,"","UCL"],["NAP","Napoli","SA",58,36,38,0,"","UCL"],["ROM","Roma","SA",59,31,38,0,"","UCL"],["COM","Como","SA",65,29,38,0,"","UCL"],
["BMU","Bayern Múnich","BL",122,36,34,0,"","UCL"],["BVB","Dortmund","BL",70,34,34,0,"","UCL"],["RBL","RB Leipzig","BL",66,47,34,0,"","UCL"],["VFB","Stuttgart","BL",71,49,34,0,"","UCL"],
["PSG","Paris Saint-Germain","L1",74,29,34,0,"","UCL"],["RCL","Lens","L1",66,35,34,0,"","UCL"],["LIL","Lille","L1",52,37,34,0,"","UCL"],
// Europa League 26/27: Serie A, Bundesliga y Ligue 1 con su liga 2025-26 (Wikipedia);
el resto sin dato de liga. En todos, el campo actual son sus 3 partidos de la fase de liga (GF, GC, PJ)
["MIL", "Milan", "SA", 53, 35, 38, [4, 5, 3], "", "UEL"],
["JUV", "Juventus", "SA", 61, 34, 38, [9, 3, 3], "", "UEL"],
["B04", "Bayer Leverkusen", "BL", 68, 47, 34, [8, 0, 3], "", "UEL"],
["TSG", "Hoffenheim", "BL", 65, 52, 34, [5, 5, 3], "", "UEL"],
["LYO", "Lyon", "L1", 53, 40, 34, [5, 6, 3], "", "UEL"],
["MAR", "Marseille", "L1", 63, 45, 34, [1, 6, 3], "", "UEL"],
["REN", "Rennes", "L1", 59, 50, 34, [4, 3, 3], "", "UEL"],
["SLB", "Benfica", "OT", 0, 0, 0, [10, 2, 3], "n", "UEL"],
["TOR", "Torreense", "OT", 0, 0, 0, [4, 7, 3], "n", "UEL"],
["AZA", "AZ Alkmaar", "OT", 0, 0, 0, [6, 2, 3], "n", "UEL"],
["NIJ", "NEC Nijmegen", "OT", 0, 0, 0, [5, 8, 3], "n", "UEL"],
["AND", "Anderlecht", "OT", 0, 0, 0, [4, 3, 3], "n", "UEL"],
["USG", "Union Saint-Gilloise", "OT", 0, 0, 0, [8, 1, 3], "n", "UEL"],
["RBS", "Red Bull Salzburg", "OT", 0, 0, 0, [3, 6, 3], "n", "UEL"],
["STU", "Sturm Graz", "OT", 0, 0, 0, [1, 3, 3], "n", "UEL"],
["SPA", "Sparta Praga", "OT", 0, 0, 0, [5, 3, 3], "n", "UEL"],
["VPL", "Viktoria Plzeň", "OT", 0, 0, 0, [2, 7, 3], "n", "UEL"],
["LPO", "Lech Poznań", "OT", 0, 0, 0, [1, 9, 3], "n", "UEL"],
["JAG", "Jagiellonia", "OT", 0, 0, 0, [4, 6, 3], "n", "UEL"],
["OLY", "Olympiacos", "OT", 0, 0, 0, [4, 1, 3], "n", "UEL"],
["OFI", "OFI Creta", "OT", 0, 0, 0, [3, 4, 3], "n", "UEL"],
["CEL", "Celtic", "OT", 0, 0, 0, [3, 9, 3], "n", "UEL"],
["BJK", "Beşiktaş", "OT", 0, 0, 0, [9, 5, 3], "n", "UEL"],
["DZG", "Dinamo Zagreb", "OT", 0, 0, 0, [3, 4, 3], "n", "UEL"],
["FTC", "Ferencváros", "OT", 0, 0, 0, [9, 3, 3], "n", "UEL"],
["OMO", "Omonia", "OT", 0, 0, 0, [5, 4, 3], "n", "UEL"],
["HBS", "Hapoel Be'er Sheva", "OT", 0, 0, 0, [1, 6, 3], "n", "UEL"],
["LSO", "Levski Sofia", "OT", 0, 0, 0, [3, 3, 3], "n", "UEL"],
["LSK", "Lillestrøm", "OT", 0, 0, 0, [2, 9, 3], "n", "UEL"],
["CLJ", "Celje", "OT", 0, 0, 0, [2, 7, 3], "n", "UEL"],
["ARA", "Ararat-Armenia", "OT", 0, 0, 0, [2, 11, 3], "n", "UEL"],
...[["SPO","Sporting CP"],["GAL","Galatasaray"],["FEN","Fenerbahçe"],["PSV","PSV"],["BRU","Club Brugge"],["SLA","Slavia Praga"],["SHA","Shakhtar"],["FEY","Feyenoord"],["FCP","Porto"],["AEK","AEK Atenas"],["ASK","LASK"],["VIK","Viking"],["SBH","Sabah"],["SLO","Slovan Bratislava"],["BOG","Bodø/Glimt"]].map(x=>[x[0],x[1],"OT",0,0,0,0,"n","UCL"])];
const TM={
}
}
;
TD.forEach(t=>TM[t[0]]={
c:t[0],n:t[1],lg:t[2],gf:t[3],ga:t[4],gp:t[5],cur:t[6],fl:t[7],comps:t[8].split(",")}
}
);
const COMPS={
  MX:{
  n:"Liga MX",sub:"APERTURA 2026 · JORNADA 16",lg:"MX",em:"MX",g:"linear-gradient(160deg,#00d68f,#04503a 70%,#021a14)",gl:"rgba(0,214,143,.55)",ac:"#00d68f",ac2:"#04503a",sim:["AME","MTY"]}
}
  ,
 LL:{
  n:"La Liga",sub:"ESPAÑA · 2026-27",lg:"LL",em:"ES",g:"linear-gradient(160deg,#ff8a1f,#8a2a00 70%,#2a0c00)",gl:"rgba(255,138,31,.55)",ac:"#ff8a1f",ac2:"#6e2300",sim:["BAR","RMA"]}
}
  ,
 PL:{
  n:"Premier League",sub:"INGLATERRA · 2026-27",lg:"PL",em:"EN",g:"linear-gradient(160deg,#c15bff,#3a0b7a 70%,#12032e)",gl:"rgba(193,91,255,.55)",ac:"#c15bff",ac2:"#34096f",sim:["ARS","MCI"]}
}
  ,
 UCL:{
  n:"Champions League",sub:"UEFA · FASE DE LIGA 26/27",lg:"OT",em:"UCL",g:"linear-gradient(160deg,#3d8bff,#0b2a7a 70%,#030c2e)",gl:"rgba(61,139,255,.6)",ac:"#3d8bff",ac2:"#0b2a7a",sim:["BMU","PSG"]}
}
  ,
 UEL:{
  n:"Europa League",sub:"UEFA · FASE DE LIGA 26/27",lg:"OT",em:"UEL",g:"linear-gradient(160deg,#ffb020,#7a3d00 70%,#241200)",gl:"rgba(255,176,32,.55)",ac:"#ffb020",ac2:"#7a3d00",sim:["SLB","B04"]}
}
}
}
;
const CK=["MX","LL","PL","UCL","UEL"];
// partidos: [local, visita, hora CST (CDMX), ref 1/X/2 %, nota]
const mk=(arr)=>arr.map(g=>({
h:g[0],a:g[1],t:g[2],ref:g[3],s:g[4]}
}
));
const aud=(arr)=>arr.map(g=>({
h:g[0],a:g[1],t:"Final",sc:[g[2],g[3]]}
}
));
const DD={
MX:[["Hoy · Vie 6 nov",mk([["NEC", "TIJ", "7:00 PM", 0, "Jornada 16 · Estadio Victoria"], ["SLP", "JUA", "7:00 PM", 0, "Jornada 16 · Estadio Libertad Financiera"], ["ATL", "SAN", "9:00 PM", 0, "Jornada 16 · Estadio Banorte"]])],["Sáb 7 nov",mk([["TIG", "CAZ", "7:00 PM", 0, "Jornada 16 · Estadio Universitario"], ["ATS", "PAC", "5:00 PM", 0, "Jornada 16 · Estadio Jalisco"], ["TOL", "MTY", "7:00 PM", 0, "Jornada 16 · Nemesio Diez"], ["PUM", "AME", "9:10 PM", 0, "Jornada 16 · Olímpico Universitario · Clásico capitalino"]])],["Dom 8 nov",mk([["QRO", "PUE", "6:00 PM", 0, "Jornada 16 · La Corregidora"], ["LEO", "CHI", "8:10 PM", 0, "Jornada 16 · Estadio León · cierra la jornada"]])],["Auditoría 30 oct-1 nov (jornada 15)",aud([["SAN", "NEC", 1, 0], ["CAZ", "LEO", 2, 1], ["SLP", "ATS", 0, 1], ["JUA", "QRO", 3, 1], ["PUE", "PUM", 1, 2], ["PAC", "TIG", 3, 0], ["MTY", "TIJ", 3, 3], ["CHI", "ATL", 4, 2], ["AME", "TOL", 2, 2]])],["Auditoría 23-25 oct (jornada 14)",aud([["NEC", "JUA", 1, 1], ["ATL", "SLP", 0, 1], ["LEO", "TOL", 1, 1], ["MTY", "CHI", 0, 1], ["PUM", "TIG", 1, 1], ["ATS", "PUE", 4, 3], ["QRO", "CAZ", 1, 3], ["AME", "PAC", 1, 2], ["TIJ", "SAN", 4, 1]])],["Auditoría 20-21 oct (jornada 13)",aud([["CHI","NEC",1,0],["JUA","ATL",0,1],["SLP","QRO",2,1],["TIG","LEO",0,2],["PUE","MTY",1,4],["ATS","AME",2,5],["TOL","TIJ",2,2],["PAC","CAZ",1,2],["SAN","PUM",2,0]])]],
LL:[["Hoy · Vie 6 nov",mk([["SEV", "ALA", "2:00 PM", 0, "Jornada 12 · abre la jornada"]])],["Sáb 7 nov",mk([["MCF", "RAC", "7:00 AM", 0, "Jornada 12"], ["ESP", "DEP", "9:15 AM", 0, "Jornada 12"], ["OSA", "ATH", "11:30 AM", 0, "Jornada 12"], ["VCF", "RMA", "2:00 PM", 0, "Jornada 12 · Mestalla"]])],["Dom 8 nov",mk([["ELC", "RBB", "7:00 AM", 0, "Jornada 12"], ["RSO", "RVC", "9:15 AM", 0, "Jornada 12"], ["RCC", "LEV", "11:30 AM", 0, "Jornada 12"], ["VIL", "GET", "11:30 AM", 0, "Jornada 12"], ["ATM", "BAR", "2:00 PM", 0, "Jornada 12 · Metropolitano"]])],["Auditoría 30 oct-2 nov (jornada 11)",aud([["DEP", "OSA", 2, 1], ["GET", "SEV", 3, 1], ["RAC", "RMA", 0, 3], ["ELC", "VCF", 0, 1], ["ATH", "RSO", 2, 1], ["VIL", "ESP", 0, 1], ["LEV", "ATM", 0, 2], ["RVC", "RCC", 3, 0], ["RBB", "MCF", 2, 1], ["BAR", "ALA", 6, 1]])],["Auditoría 23-26 oct (jornada 10)",aud([["ALA", "MCF", 1, 1], ["RVC", "ELC", 0, 3], ["RAC", "ESP", 2, 1], ["VCF", "VIL", 1, 2], ["ATM", "DEP", 1, 0], ["ATH", "GET", 4, 0], ["RCC", "RBB", 0, 0], ["RSO", "LEV", 2, 1], ["BAR", "RMA", 1, 2], ["SEV", "OSA", 2, 0]])],["Auditoría 16-19 oct (jornada 9)",aud([["DEP","LEV",1,1],["ESP","ATM",0,1],["VIL","ELC",0,0],["RBB","BAR",2,5],["VCF","ATH",0,0],["OSA","RAC",2,0],["RCC","ALA",2,1],["MCF","RSO",2,5],["RMA","SEV",4,1],["GET","RVC",1,1]])]],
PL:[["Hoy · Vie 6 nov",mk([["EVE", "COV", "2:00 PM", 0, "Jornada 10 · abre la jornada"]])],["Sáb 7 nov",mk([["LEE", "TOT", "6:30 AM", 0, "Jornada 10"], ["ARS", "HUL", "9:00 AM", 0, "Jornada 10"], ["FUL", "NEW", "9:00 AM", 0, "Jornada 10"], ["NFO", "MCI", "11:30 AM", 0, "Jornada 10"]])],["Dom 8 nov",mk([["BRI", "BRE", "8:00 AM", 0, "Jornada 10"], ["CRY", "LFC", "8:00 AM", 0, "Jornada 10"], ["IPS", "BOU", "8:00 AM", 0, "Jornada 10"], ["SUN", "CFC", "8:00 AM", 0, "Jornada 10"], ["MUN", "AVL", "10:30 AM", 0, "Jornada 10"]])],["Auditoría 31 oct-2 nov (jornada 9)",aud([["NEW", "EVE", 0, 1], ["LFC", "ARS", 0, 1], ["CFC", "MUN", 2, 0], ["BOU", "LEE", 2, 0], ["BRE", "NFO", 2, 0], ["COV", "SUN", 3, 1], ["HUL", "IPS", 2, 2], ["MCI", "BRI", 0, 1], ["TOT", "CRY", 2, 0], ["AVL", "FUL", 1, 1]])],["Auditoría 23-25 oct (jornada 8)",aud([["IPS", "NFO", 1, 1], ["AVL", "MCI", 2, 1], ["ARS", "EVE", 2, 0], ["COV", "FUL", 0, 1], ["CFC", "TOT", 0, 2], ["CRY", "NEW", 0, 2], ["HUL", "BRE", 1, 1], ["LFC", "BRI", 2, 0], ["MUN", "BOU", 0, 3], ["SUN", "LEE", 0, 0]])],["Auditoría 17-19 oct (jornada 7)",aud([["EVE","CFC",0,2],["BRE","LFC",1,2],["FUL","HUL",1,0],["MCI","IPS",3,2],["NEW","AVL",0,1],["BOU","SUN",2,0],["BRI","CRY",5,0],["LEE","MUN",1,1],["NFO","ARS",0,1],["TOT","COV",3,1]])]],
UCL:[
["Hoy · Vie 6 nov",[]],
["Auditoría 3-4 nov (jornada 4)",aud([["AEK","RMA",2,3],["FEN","LFC",3,2],["BVB","RBB",2,1],["FCP","NAP",4,1],["PSV","BRU",1,2],["RBL","MCI",2,3],["RCL","COM",1,9],["SLA","ARS",1,2],["VIK","SBH",4,1],["SHA","SPO",0,1],["GAL","VFB",2,0],["ATM","BMU",0,2],["BAR","AVL",3,0],["FEY","INT",0,3],["BOG","LIL",0,0],["ASK","SLO",4,0],["MUN","ROM",3,2],["VIL","PSG",0,6]])],
["Auditoría 20-21 oct (jornada 3)",aud([["FEN","SLA",2,2],["SBH","BVB",1,2],["ROM","SLO",4,0],["FCP","PSV",0,1],["LFC","VIL",4,3],["MCI","AEK",5,1],["PSG","BAR",4,2],["NAP","BOG",4,3],["VFB","ATM",1,1],["LIL","GAL",2,4],["COM","MUN",4,1],["BMU","ARS",2,2],["BRU","RCL",3,0],["AVL","VIK",3,1],["RMA","RBL",4,1],["RBB","FEY",1,0],["SPO","ASK",2,3],["INT","SHA",1,0]])],
["Auditoría 13-14 oct (jornada 2)",aud([["RCL","SPO",0,2],["SBH","SLA",2,0],["ARS","LIL",3,0],["ATM","MUN",2,0],["INT","BRU",3,4],["GAL","BAR",1,4],["RBL","PSV",1,0],["VIK","BMU",3,3],["VIL","NAP",3,1],["FEY","COM",3,2],["ASK","LFC",3,6],["ROM","RMA",3,4],["AVL","FEN",6,0],["SHA","AEK",3,1],["BOG","BVB",1,0],["MCI","PSG",2,4],["RBB","FCP",3,2],["SLO","VFB",0,3]])]],
UEL:[["Hoy · Vie 6 nov",[]],
["Auditoría 4-5 nov (jornada 4)",aud([["REN", "OLY", 0, 0], ["MIL", "FTC", 0, 2], ["SPA", "BOU", 1, 3], ["CRY", "TSG", 1, 1], ["LSK", "VPL", 0, 1], ["NIJ", "OMO", 3, 1], ["LSO", "JAG", 1, 0], ["RSO", "LYO", 1, 1], ["AND", "RBS", 2, 0], ["AZA", "JUV", 1, 2], ["B04", "MAR", 0, 1], ["CEL", "BJK", 3, 2], ["HBS", "OFI", 0, 2], ["RCC", "USG", 1, 2], ["TOR", "ARA", 3, 2], ["STU", "CLJ", 2, 3], ["SLB", "LPO", 3, 1], ["SUN", "DZG", 0, 2]])],
["Auditoría 22 oct (jornada 3)",aud([["ARA", "AZA", 0, 4], ["FTC", "TOR", 4, 1], ["DZG", "NIJ", 2, 4], ["JUV", "REN", 2, 2], ["LPO", "SUN", 1, 1], ["OFI", "B04", 0, 2], ["USG", "HBS", 4, 0], ["STU", "MAR", 1, 0], ["BOU", "MIL", 3, 0], ["BJK", "CRY", 2, 2], ["CEL", "RCC", 1, 2], ["VPL", "LSO", 1, 2], ["JAG", "AND", 0, 3], ["LSK", "RSO", 0, 6], ["CLJ", "RBS", 2, 2], ["OLY", "SPA", 1, 0], ["OMO", "SLB", 1, 4], ["TSG", "LYO", 3, 0]])],
["Auditoría 15 oct (jornada 2)",aud([["SPA", "LSK", 1, 1], ["AZA", "HBS", 2, 1], ["RBS", "MIL", 0, 4], ["LPO", "B04", 0, 4], ["CLJ", "OMO", 0, 3], ["LYO", "CRY", 3, 2], ["USG", "RSO", 1, 1], ["TOR", "SUN", 1, 2], ["BOU", "STU", 3, 0], ["FTC", "VPL", 2, 1], ["DZG", "AND", 1, 0], ["JAG", "ARA", 3, 1], ["NIJ", "LSO", 1, 1], ["MAR", "OLY", 0, 1], ["RCC", "JUV", 1, 2], ["SLB", "CEL", 4, 1], ["REN", "OFI", 2, 1], ["TSG", "BJK", 2, 3]])],
["Auditoría 16-17 sep (jornada 1)",aud([["ARA", "SPA", 1, 4], ["OMO", "RCC", 1, 0], ["MIL", "SLB", 0, 2], ["B04", "CLJ", 2, 0], ["HBS", "DZG", 0, 0], ["OLY", "JAG", 2, 1], ["AND", "LYO", 1, 2], ["STU", "REN", 0, 0], ["SUN", "AZA", 1, 0], ["OFI", "TSG", 2, 0], ["LSO", "RBS", 0, 1], ["BJK", "MAR", 4, 1], ["CEL", "FTC", 1, 3], ["CRY", "LPO", 4, 0], ["VPL", "USG", 0, 3], ["JUV", "NIJ", 5, 0], ["LSK", "TOR", 1, 2], ["RSO", "BOU", 1, 2]])]]}
}
;
const GM={
}
}
;
CK.forEach(c=>DD[c].forEach((d,i)=>d[1].forEach((g,j)=>{
  g.k=c+i+"-"+j;
  g.dl=d[0].replace(/^Hoy · /,"");
  g.cp=c;
  if(g.sc)g.aud=true;
GM[g.k]=g}
}
)));
let CP=null,day=0,OPEN=null,TMR=[];
const SIMS={
}
}
;
CK.forEach(c=>SIMS[c]={
k:"sim"+c,h:COMPS[c].sim[0],a:COMPS[c].sim[1],cp:c,t:"Simulación"}
}
);
CK.forEach(c=>GM["sim"+c]=SIMS[c]);
const $=id=>document.getElementById(id);
const pois=l=>{
  const a=[];
  let p=Math.exp(-l);
  a.push(p);
  for(let k=1;
  k<NG;
  k++){
    p*=l/k;
  a.push(p)}
}
return a}
}
;
const over=(l,line)=>{
  const a=pois(l);
  let c=0;
  for(let k=0;
  k<=Math.floor(line);
  k++)c+=a[k];
return 1-c}
}
;
const half=x=>{
  let l=Math.round(x*2)/2;
  if(Number.isInteger(l))l+=.5;
return l}
}
;
function shr(lh,la){
  const p=pois(lh),q=pois(la);
  let w=0,l=0;
  for(let i=0;
  i<NG;
  i++)for(let j=0;
  j<NG;
  j++){
    if(i>j)w+=p[i]*q[j];
  else if(i<j)l+=p[i]*q[j]}
}
return w/(w+l)}
}
function tilt(lh,la,t){
  let lo=-1.5,hi=1.5;
  for(let k=0;
  k<16;
  k++){
    const m=(lo+hi)/2;
    if(shr(lh*Math.exp(m),la*Math.exp(-m))<t)lo=m;
  else hi=m}
}
  const d=(lo+hi)/2;
return[lh*Math.exp(d),la*Math.exp(-d)]}
}
const dec=s=>{
  const v=parseFloat(String(s).replace(",","."));
  if(isNaN(v))return null;
  if(Math.abs(v)>=100)return v>0?1+v/100:1+100/-v;
return v>1?v:null}
}
;
function base(c,useCur){
  const t=TM[c],lg=LG0[t.lg],e=ed[c];
  if(e)return{
  rs:e.rs,ra:e.ra,lg}
}
  ;
  if(!t.gp&&!(useCur&&t.cur))return{
  rs:lg,ra:lg,lg}
}
  ;
  let F=t.gf,A=t.ga,G=t.gp;
  if(useCur&&t.cur){
    F+=3*t.cur[0];
    A+=3*t.cur[1];
  G+=3*t.cur[2]}
}
  return{
  rs:(F+K*lg)/(G+K),ra:(A+K*lg)/(G+K),lg}
}
}
}
function rate(c,comp,useCur){
  const b=base(c,useCur);
  if(comp!=="UCL"&&comp!=="UEL")return{
  rs:b.rs,ra:b.ra}
}
  ;
  const s=STR[TM[c].lg];
  return{
  rs:b.rs/b.lg*s*LGU,ra:b.ra/b.lg/s*LGU}
}
}
}
// Bajas: id, equipo, jugador, rol (gf=ataque, ga=defensa), impacto goles/juego (estimado), estado (0 disp, .5 duda, 1 fuera), nota, fecha
const NW=[
["grv", "LFC", "Ryan Gravenberch (MC)", "gf", 0.05, 0.5, "Talón/pie; duda ante Crystal Palace el dom 8 (Sports Mole, 6 nov)", "6 nov"],
["msr", "RSO", "Mamadou Sarr (DFC)", "ga", 0.03, 0.5, "Sóleo; cambiado al descanso ante Lyon por precaución (5 nov), duda ante el Rayo (FútbolFantasy, 6 nov)", "6 nov"],
["sol", "RSO", "Carlos Soler (MC)", "gf", 0.04, 0.5, "Enfermedad; baja de última hora ante Lyon (5 nov), duda ante el Rayo (FútbolFantasy, 6 nov)", "6 nov"],
["isi", "SUN", "Wilson Isidor (DC)", "gf", 0.05, 0.5, "Golpe ante Dinamo Zagreb (5 nov), salió al 64'; sin parte antes de Chelsea (Yahoo/Evening Standard, 5 nov)", "6 nov"],
["jln", "BOU", "Juanlu Sánchez (LD)", "ga", 0.03, 1, "Tobillo (daño de ligamentos con la sub-21), en evaluación; fuera ante Ipswich (Hayters, 4 nov)", "6 nov"],
["hgz", "RCC", "Hugo González (EI)", "gf", 0.03, 0.5, "Aductor (sin rotura); duda ante el Levante (FútbolFantasy, 6 nov)", "6 nov"],
["brz", "AME", "Brian Rodríguez (ED)", "gf", 0.05, 1, "Lesión muscular; fuera ~3 semanas, se pierde el Clásico ante Pumas (ClaroSports/TV Azteca, 5 nov)", "6 nov"],
["dwm", "ARS", "Max Dowman (ED)", "gf", 0.03, 1, "Suspendido en la Premier por la roja en Fleetwood; fuera ante Hull (ESPN)", "6 nov"],
["hat", "CFC", "Jorrel Hato (LI)", "ga", 0.03, 0.5, "Duda ante Sunderland (Sports Mole, 6 nov)", "6 nov"],
["kns", "ARS", "Ezri Konsa (DFC)", "ga", 0.04, 0.5, "Rodilla; molestia ante Slavia (4 nov), duda ante Hull, no parece grave (ES/Yahoo, 5 nov)", "6 nov"],
["rmr", "NAP", "Rafa Marín (DFC)", "ga", 0.03, 1, "Expulsado ante Porto (4 nov, 1-4); suspendido para la próxima jornada de Champions (Football Italia, 4 nov)", "5 nov"],
["koi", "AEK", "Koita (DC)", "gf", 0.04, 1, "Expulsado al final ante Real Madrid (4 nov, 2-3) tras marcar; suspendido para la próxima jornada de Champions", "5 nov"],
["rod", "BAR", "Rodri (MC)", "gf", 0.06, 1, "Bíceps femoral derecho (lesión leve, ante Aston Villa el 3 nov); fuera ante el Atleti el dom 8, el club no da plazos (SPORT estima ~1 mes)", "6 nov"],
["cro", "ATM", "Cuti Romero (DFC)", "ga", 0.05, 1, "Recaída en el aductor; fuera ante el Barça y más de un mes, lo dieron de baja de Argentina (ElDesmarque/SportAragón, 5 nov)", "6 nov"],
["bal", "MUN", "Carlos Baleba (MC)", "gf", 0.04, 1, "Isquiotibial (ante Roma, 3 nov); Carrick: \"de entrada no pinta bien\". Fuera ante Aston Villa el dom 8 (thefalse9, 6 nov)", "6 nov"],
["lob", "NAP", "Stanislav Lobotka (MC)", "gf", 0.04, 1, "Fuera en Oporto; también Di Lorenzo, Olivera, Spinazzola y Badiashile (UEFA, previa J4, 4 nov)", "4 nov"],
["dlz", "NAP", "Giovanni Di Lorenzo (LD)", "ga", 0.04, 1, "Fuera en Oporto (UEFA, previa J4, 4 nov)", "4 nov"],
["ake", "FEN", "Nathan Aké (DFC)", "ga", 0.04, 1, "Isquiotibial; fuera ante Liverpool (UEFA, previa J4, 4 nov)", "4 nov"],
["frp2", "RBB", "Junior Firpo (LI)", "ga", 0.03, 1, "Lesión muscular; fuera en Dortmund (UEFA, previa J4, 4 nov)", "4 nov"],
["edo", "RCL", "Odsonne Édouard (DC)", "gf", 0.05, 1, "Fuera ante Como, junto con Ganiou y Sima (UEFA, previa J4, 4 nov)", "4 nov"],
["ram", "NEW", "Jacob Ramsey (MC)", "gf", 0.03, 1, "Expulsado (doble amarilla) ante Everton el 2 nov; sanción de 1 partido: se pierde solo Fulham el sáb 7 y vuelve el 21 ante Arsenal (The False 9, 3 nov)", "4 nov"],
["aub", "DEP", "Pierre-Emerick Aubameyang (DC)", "gf", 0.1, 0, "Ya volvió: entró al 69' ante Osasuna (2 nov). Disponible en Espanyol con minutos dosificados; titularidad sin confirmar (El Español/DXT Campeón, 4 nov)", "4 nov"],
["mrl", "SHA", "Marlon Santos (DFC)", "ga", 0.03, 1, "Lesión muscular; fuera ante Sporting (UEFA, previa J4, 3 nov)", "3 nov"],
["nsa", "SPO", "Nuno Santos (EI)", "gf", 0.04, 1, "Lesión muscular; fuera ante Shakhtar (UEFA, previa J4, 3 nov)", "3 nov"],
["dbs", "SPO", "Zeno Debast (DFC)", "ga", 0.03, 0.5, "Duda ante Shakhtar (UEFA, previa J4, 3 nov)", "3 nov"],
["sau", "VFB", "Sauer (ED)", "gf", 0.03, 1, "Lesión muscular; fuera en Estambul (UEFA, previa J4, 3 nov)", "3 nov"],
["sti", "VFB", "Angelo Stiller (MC)", "gf", 0.06, 1, "Aductor; fuera ante Galatasaray (UEFA, previa J4, 3 nov)", "3 nov"],
["vag", "VFB", "Josha Vagnoman (LD)", "ga", 0.03, 1, "Isquiotibiales; fuera ante Galatasaray (UEFA, previa J4, 3 nov)", "3 nov"],
["kok", "ATM", "Koke (MC)", "gf", 0.03, 0.5, "Isquiotibiales; duda ante Bayern (UEFA, previa J4, 3 nov)", "3 nov"],
["hjl", "ATM", "Morten Hjulmand (MC)", "gf", 0.04, 0.5, "Su sanción era solo de UEFA; debería estar disponible ante el Barça, sin confirmar (Esto es Atleti, 4 nov)", "4 nov"],
["ldi", "BMU", "Luis Díaz (ED)", "gf", 0.08, 1, "Isquiotibiales; fuera en el Metropolitano (UEFA, previa J4, 3 nov)", "3 nov"],
["gna", "BMU", "Serge Gnabry (ED)", "gf", 0.05, 1, "Isquiotibiales; fuera ante Atlético (UEFA, previa J4, 3 nov)", "3 nov"],
["mus", "BMU", "Jamal Musiala (MCO)", "gf", 0.1, 1, "Muslo; sigue fuera (UEFA, previa J4, 3 nov)", "3 nov"],
["sai", "BMU", "Saibari (MC)", "gf", 0.03, 1, "Tobillo; fuera ante Atlético (UEFA, previa J4, 3 nov)", "3 nov"],
["neu", "BMU", "Manuel Neuer (POR)", "ga", 0.1, 0.5, "Pie; duda ante Atlético (UEFA, previa J4, 3 nov)", "3 nov"],
["xes", "BAR", "Xavi Espart (LD)", "ga", 0.02, 1, "Tobillo; fuera ante Aston Villa (UEFA, previa J4, 3 nov)", "3 nov"],
["chr", "BAR", "Andreas Christensen (DFC)", "ga", 0.03, 1, "Isquiotibiales; fuera ante Aston Villa (UEFA, previa J4, 3 nov)", "3 nov"],
["ega", "BAR", "Eric García (DFC)", "ga", 0.04, 1, "Isquiotibiales; fuera ante Aston Villa (UEFA, previa J4, 3 nov)", "3 nov"],
["kou", "BAR", "Jules Koundé (LD)", "ga", 0.04, 0.5, "Esguince de tobillo; podría ir convocado ante el Atleti pero difícil que sea titular (Comuniate, 5 nov)", "6 nov"],
["olm", "BAR", "Dani Olmo (MCO)", "gf", 0.07, 1, "Rotura en el aductor; fuera ante el Atleti (Comuniate, 5 nov)", "6 nov"],
["bos", "FEY", "Bos (LI)", "ga", 0.03, 1, "Rodilla; fuera ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["mod", "FEY", "Jakub Moder (MC)", "gf", 0.03, 1, "Espalda; fuera ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["nel", "FEY", "Nelson (ED)", "gf", 0.03, 1, "Lesión muscular; fuera ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["nwk", "FEY", "Bart Nieuwkoop (LD)", "ga", 0.03, 1, "Rodilla; fuera ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["sml", "FEY", "Smal (LI)", "ga", 0.03, 1, "Tobillo; fuera ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["vpe", "FEY", "Van Persie (MCO)", "gf", 0.03, 1, "Golpe; fuera ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["sju", "FEY", "Jeremiah St. Juste (DFC)", "ga", 0.04, 0.5, "Tobillo; duda ante Inter (UEFA, previa J4, 3 nov)", "3 nov"],
["bas", "INT", "Alessandro Bastoni (DFC)", "ga", 0.05, 1, "Suspendido en Róterdam (UEFA, previa J4, 3 nov)", "3 nov"],
["jns", "INT", "Jones (MC)", "gf", 0.03, 1, "Muslo; fuera ante Feyenoord (UEFA, previa J4, 3 nov)", "3 nov"],
["lma", "INT", "Lautaro Martínez (DC)", "gf", 0.12, 1, "Lesión muscular; fuera ante Feyenoord (UEFA, previa J4, 3 nov)", "3 nov"],
["sto", "INT", "John Stones (DFC)", "ga", 0.04, 1, "Muslo; fuera ante Feyenoord (UEFA, previa J4, 3 nov)", "3 nov"],
["lhe", "INT", "Luis Henrique (ED)", "gf", 0.03, 0.5, "Muslo; duda ante Feyenoord (UEFA, previa J4, 3 nov)", "3 nov"],
["eje", "BOG", "Ejven (DFC)", "ga", 0.03, 1, "Rodilla; fuera ante Lille (UEFA, previa J4, 3 nov)", "3 nov"],
["fly", "BOG", "Faye Lund (DFC)", "ga", 0.03, 1, "Golpe; fuera ante Lille (UEFA, previa J4, 3 nov)", "3 nov"],
["rii", "BOG", "Riisnæs (MC)", "gf", 0.03, 1, "Rodilla; fuera ante Lille (UEFA, previa J4, 3 nov)", "3 nov"],
["mik", "BOG", "Mikkelsen (ED)", "gf", 0.03, 1, "Ingle; fuera ante Lille (UEFA, previa J4, 3 nov)", "3 nov"],
["mbp", "LIL", "Mbappé (MC)", "gf", 0.04, 1, "Suspendido en Bodø (UEFA, previa J4, 3 nov)", "3 nov"],
["tsa", "LIL", "Tiago Santos (LD)", "ga", 0.03, 1, "Rodilla; fuera en Bodø (UEFA, previa J4, 3 nov)", "3 nov"],
["ued", "LIL", "Ayase Ueda (DC)", "gf", 0.04, 1, "Pie; fuera en Bodø (UEFA, previa J4, 3 nov)", "3 nov"],
["bel", "ASK", "Bello (DFC)", "ga", 0.03, 0.5, "Lesión muscular; duda ante Slovan (UEFA, previa J4, 3 nov)", "3 nov"],
["cer", "SLO", "Čerepkai (MC)", "gf", 0.03, 0.5, "Espalda; duda en Linz (UEFA, previa J4, 3 nov)", "3 nov"],
["ras", "MUN", "Marcus Rashford (ED)", "gf", 0.06, 0.5, "Cadera; duda ante Aston Villa (thefalse9, 6 nov)", "6 nov"],
["dia", "MUN", "Amad Diallo (ED)", "gf", 0.05, 0.5, "Lesión muscular; duda ante Roma (UEFA, previa J4, 3 nov)", "3 nov"],
["ses", "MUN", "Benjamin Šeško (DC)", "gf", 0.1, 1, "Espinilla; fuera ante Roma (UEFA, previa J4, 3 nov)", "3 nov"],
["dor", "MUN", "Patrick Dorgu (LI)", "ga", 0.04, 1, "Isquiotibiales; fuera ante Roma (UEFA, previa J4, 3 nov)", "3 nov"],
["sha", "MUN", "Luke Shaw (LI)", "ga", 0.04, 1, "Isquiotibiales; fuera ante Roma (UEFA, previa J4, 3 nov)", "3 nov"],
["svi", "ROM", "Mile Svilar (POR)", "ga", 0.12, 1, "Mano; sigue fuera en Old Trafford (UEFA, previa J4, 3 nov)", "3 nov"],
["kne", "ROM", "Manu Koné (MC)", "gf", 0.05, 1, "Isquiotibiales; fuera ante United (UEFA, previa J4, 3 nov)", "3 nov"],
["pel", "ROM", "Lorenzo Pellegrini (MCO)", "gf", 0.04, 1, "Isquiotibiales; fuera ante United (UEFA, previa J4, 3 nov)", "3 nov"],
["dyb", "ROM", "Paulo Dybala (DC)", "gf", 0.06, 0.5, "Gemelo; duda ante United (UEFA, previa J4, 3 nov)", "3 nov"],
["gmo", "VIL", "Gerard Moreno (DC)", "gf", 0.06, 1, "Lesión muscular; fuera ante PSG (UEFA, previa J4, 3 nov)", "3 nov"],
["akh", "VIL", "Ilias Akhomach (ED)", "gf", 0.03, 1, "Lesión muscular; fuera ante PSG (UEFA, previa J4, 3 nov)", "3 nov"],
["foy", "VIL", "Juan Foyth (DFC)", "ga", 0.04, 1, "Lesión muscular; fuera ante PSG (UEFA, previa J4, 3 nov)", "3 nov"],
["ala", "VIL", "Alassane (MC)", "gf", 0.03, 0.5, "Lesión muscular; duda ante PSG (UEFA, previa J4, 3 nov)", "3 nov"],
["dem", "PSG", "Ousmane Dembélé (DC)", "gf", 0.1, 1, "Muslo; fuera en Villarreal (UEFA, previa J4, 3 nov)", "3 nov"],
["kva", "PSG", "Khvicha Kvaratskhelia (EI)", "gf", 0.08, 1, "Rodilla; fuera en Villarreal (UEFA, previa J4, 3 nov)", "3 nov"],
["mqs", "PSG", "Marquinhos (DFC)", "ga", 0.05, 1, "Muslo; fuera en Villarreal (UEFA, previa J4, 3 nov)", "3 nov"],
["nme", "PSG", "Nuno Mendes (LI)", "ga", 0.05, 1, "Muslo; fuera en Villarreal (UEFA, previa J4, 3 nov)", "3 nov"],
["liv", "NEW", "Tino Livramento (LD)", "ga", 0.04, 1, "Rodilla; fuera, sin fecha de regreso (lista oficial FPL, 30 oct)", "2 nov"],
["mil", "NEW", "Lewis Miley (MC)", "gf", 0.04, 0.25, "Lesión muscular; 75% de jugar hoy ante Everton (FPL, 30 oct). Osula (tobillo) y Fernández-Pardo (enfermedad) también al 75%", "2 nov"],
["oro", "OSA", "Aimar Oroz (MC)", "gf", 0.06, 1, "Lesionado; sigue de baja para hoy en Riazor (Comuniate, previa J11)", "2 nov"],
["hrr", "OSA", "Jorge Herrando (DFC)", "ga", 0.04, 1, "Lesionado; sigue de baja para hoy en Riazor (Comuniate, previa J11)", "2 nov"],
["dcs", "OSA", "Del Castillo (ED)", "gf", 0.03, 1, "Lesionado; sigue de baja para hoy en Riazor (Comuniate, previa J11)", "2 nov"],
["mtt", "CRY", "Jean-Philippe Mateta (DC)", "gf", 0.08, 1, "Roja directa ante Tottenham (31 oct); rechazaron la apelación: suspendido ante Liverpool el dom 8 (thisisanfield/dave.sport)", "6 nov"],
["vdv", "TOT", "Micky van de Ven (DFC)", "ga", 0.04, 0.5, "Duda: quedó dolido tras la entrada de Mateta, sin parte médico (Sky Sports, 31 oct)", "1 nov"],
["jao", "NEW", "Ewen Jaouen (POR)", "ga", 0.05, 1, "Portero; isquiotibiales, fuera hasta diciembre aprox. (SportsMole, 30 oct). Impacto estimado: no confirmado si es el titular", "1 nov"],
["mdy", "RMA", "Ferland Mendy (LI)", "ga", 0.03, 0.5, "No aparece en la lista de bajas de UEFA para Atenas; probablemente ya disponible, sin confirmar (UEFA, 4 nov)", "4 nov"],
["agu", "ELC", "Marc Aguado (MC)", "gf", 0.04, 1, "Tobillo; fuera hasta el parón (FútbolFantasy)", "1 nov"],
["bue", "AME", "Santiago Bueno (DFC)", "ga", 0.04, 1, "Roja directa ante Toluca (31 oct); se pierde el clásico ante Pumas, pendiente la resolución de la Comisión Disciplinaria (Excélsior, 1 nov)", "1 nov"],
["afr", "TIG", "Alan Franco (DFC)", "ga", 0.04, 1, "Roja directa al 80' ante Pachuca (31 oct); suspendido ante Cruz Azul, pendiente la resolución de la Comisión (Fox Sports MX/RotoWire)", "1 nov"],
["prt", "TOL", "Pereira (nombre por confirmar)", "ga", 0.03, 1, "Expulsado por doble amarilla al 90' ante América; suspendido ante Monterrey. Proceso lo llama Federico y Excélsior Andrés Pereira. Impacto estimado", "1 nov"],
["dit", "CAZ", "Willer Ditta (DFC)", "ga", 0.04, 1, "Fisura en un dedo del pie; casi descartado ante León (SI/Bolavip, 29-31 oct)", "1 nov"],
["adr", "MTY", "Esteban Andrada (POR)", "ga", 0.08, 0.25, "Portero titular; recibió atención en la pierna derecha en el 3-3 ante Tijuana pero siguió jugando. Duda leve para la J16 en Toluca (TUDN, 31 oct)", "1 nov"],
["dav", "AME", "Víctor Dávila (DC)", "gf", 0.05, 1, "Rodilla; fuera (FutMercado, 31 oct)", "1 nov"],
["duk", "ATS", "Duk (DC)", "gf", 0.05, 1, "Tendón rotuliano; fuera (FutMercado, 31 oct)", "1 nov"],
["mds", "JUA", "Madson (DC)", "gf", 0.04, 1, "Lesión muscular; fuera (FutMercado, 31 oct)", "1 nov"],
["val2", "RMA", "Federico Valverde (MC)", "gf", 0.06, 0.5, "No aparece en la lista de bajas de UEFA para Atenas; probablemente ya disponible para Valencia, sin confirmar (UEFA, 4 nov)", "4 nov"],
["kik", "ESP", "Kike García (DC)", "gf", 0.05, 1, "Lesionado (sin plazo); no jugó en Villarreal (pericos.es, 30 oct)", "1 nov"],
["lac", "CFC", "Maxence Lacroix (DFC)", "ga", 0.04, 1, "Isquiotibiales; fuera \"unas semanas\" (SportsMole, 30 oct)", "1 nov"],
["emi", "CFC", "Emiliano Martínez (POR)", "ga", 0.08, 0.5, "Portero titular; mandíbula fracturada (17 oct), volvió a entrenar con máscara el 4 nov pero sin alta. Se proyecta a Penders ante Sunderland (ES/RotoWire, 5 nov, sin confirmar)", "6 nov"],
["jpe", "CFC", "João Pedro (DC)", "gf", 0.08, 1, "Muslo; descartado \"unas semanas\", no vuelve antes del parón internacional (Khel Now, 29 oct)", "30 oct"],
["sem", "MCI", "Antoine Semenyo (ED)", "gf", 0.08, 1, "Rodilla; fuera hasta mediados de diciembre (Fantasy Football Scout, 27 oct)", "28 oct"],
["sav", "TOT", "Savinho (ED)", "gf", 0.04, 1, "Lesión muscular; fuera, se espera de vuelta hacia el 7 nov (The False 9, 27 oct)", "28 oct"],
["dgo", "SAN", "Diego González (MC)", "gf", 0.04, 1, "Torcedura de tobillo ante Xolos; se pierde el resto del Apertura 2026 según la valoración médica, sin parte oficial del club (El Siglo de Torreón, 27 oct)", "28 oct"],
["hom", "QRO", "Homenchenko (MC)", "gf", 0.03, 1, "Fractura en la mano; se perdió la J14 ante Cruz Azul y sigue fuera para la J15 (SI.com)", "26 oct"],
["edu", "QRO", "Erik Dueñas (MC)", "gf", 0.03, 1, "Rodilla; se perdió la J14, sin fecha de regreso confirmada para la J15 (SI.com)", "26 oct"],
["sak", "ARS", "Bukayo Saka (ED)", "gf", 0.12, 1, "Cuádriceps (se lesionó ante Bayern); 2ª resonancia el 23, Arteta: señales \"no buenas\". Fuera ante Everton; los médicos estiman al menos 6 semanas (The False 9/Sporting Tribune, 24 oct)", "24 oct"],
["rug", "AVL", "Matteo Ruggeri (LI)", "ga", 0.03, 1, "Unos 2 meses fuera (Emery, vía Sports Mole)", "22 oct"],
["luk", "IPS", "Saša Lukić (MC)", "gf", 0.03, 0.5, "Ingle; se perdió la J8 ante Forest, apunta a volver en Hull el 31 oct (O'Neil, vía Fantasy Football Scout)", "26 oct"],
["ecc", "COV", "Josh Eccles (MC)", "gf", 0.03, 1, "Tobillo; aún no entrena en césped", "23 oct"],
["gar", "ALA", "Facundo Garcés (DFC)", "ga", 0.04, 1, "Ligamento cruzado roto; baja hasta abril (FútbolFantasy)", "23 oct"],
["mrd", "ALA", "Mikel Rodríguez (MC)", "gf", 0.03, 1, "Ligamento cruzado roto; baja hasta abril (FútbolFantasy)", "23 oct"],
["brg", "TOT", "Lucas Bergvall (MC)", "gf", 0.04, 1, "Rodilla; fuera", "23 oct"],
["udo", "TOT", "Destiny Udogie (LI)", "ga", 0.03, 1, "Rodilla; fuera", "23 oct"],
["mud", "TOT", "Mykhailo Mudryk (EI)", "gf", 0.03, 1, "Tobillo; fuera", "23 oct"],
["wie", "BRI", "Mats Wieffer (MC)", "gf", 0.04, 1, "Rodilla; probablemente fuera, regreso más probable en la J9 (Hürzeler)", "23 oct"],
["mjo", "LEE", "Mateo Joseph (DC)", "gf", 0.03, 1, "Rodilla; fuera", "23 oct"],
["tot", "BOU", "Alex Tóth (MC)", "gf", 0.04, 1, "Isquiotibiales; fuera \"algunas semanas\" (Rose)", "23 oct"],
["ara", "BOU", "Julián Araujo (LD)", "ga", 0.03, 1, "Muslo; fuera", "23 oct"],
["nor", "EVE", "Christian Nørgaard (MC)", "gf", 0.03, 1, "Aún lejos de ser titular (Moyes)", "23 oct"],
["ses2", "FUL", "Ryan Sessegnon (LI)", "ga", 0.03, 1, "Suspendido 3 partidos", "23 oct"],
["nme2", "HUL", "Nobel Mendy (DFC)", "ga", 0.03, 1, "Ingle; vuelve en la J9", "23 oct"],
["tgt", "HUL", "Matt Targett (LI)", "ga", 0.03, 1, "Tobillo; fuera", "23 oct"],
["tom", "CRY", "Takehiro Tomiyasu (DFC)", "ga", 0.03, 1, "Gemelo; fuera (Sports Mole)", "23 oct"],
["ria", "CRY", "Chadi Riad (DFC)", "ga", 0.03, 1, "Rodilla; fuera", "23 oct"],
["mun2", "SUN", "Romaine Mundle (ED)", "gf", 0.03, 1, "Rodilla; fuera", "23 oct"],
["jof", "ESP", "Jofre Carreras (ED)", "gf", 0.03, 1, "Lesionado (Comunio)", "23 oct"],
["eri", "RAC", "Eriksson (POR)", "ga", 0.06, 0.5, "Portero; duda para la J11 ante Real Madrid (JornadaPerfecta). Impacto estimado: no confirmado si es el titular", "28 oct"],
["sie", "SEV", "Miguel Sierra (ED)", "gf", 0.03, 1, "Baja de larga duración (hombro); sigue fuera para el 1 nov en Getafe (JornadaPerfecta, 26 oct)", "27 oct"],
["mca", "SEV", "Marcão (DFC)", "ga", 0.04, 1, "Baja de larga duración (lesión muscular); sigue fuera para el 1 nov en Getafe (JornadaPerfecta, 26 oct)", "27 oct"],
["cor", "PUM", "Sebastián Córdova (MC)", "gf", 0.08, 1, "Rotura de ligamento cruzado; fuera del torneo", "12 oct"],
["mac", "PUM", "José Juan Macías (DC)", "gf", 0.07, 1, "Rodilla (ligamentos); fuera del torneo", "12 oct"],
["cal", "PUM", "Cristian Calderón (LI)", "ga", 0.03, 1, "Lesión muscular; sigue fuera", "12 oct"],
["amo", "CAZ", "Amaury Morales (MC)", "gf", 0.04, 1, "Rotura de ligamento cruzado; se pierde el torneo", "10 oct"],
["rom", "CHI", "Luis Romo (MC)", "ga", 0.05, 1, "Lesión en el bíceps femoral; fuera ante Tigres, sin fecha de regreso (Excélsior)", "17 oct"],
["sal", "ARS", "William Saliba (DFC)", "ga", 0.12, 0.5, "Espalda; ya entrena completo, se perfila para la banca ante Hull (ES/Yahoo, 5 nov)", "6 nov"],
["eki", "LFC", "Hugo Ekitike (DC)", "gf", 0.1, 1, "Lesión de Aquiles; baja larga", "12 oct"],
["brd", "LFC", "Conor Bradley (LD)", "ga", 0.03, 1, "Lesionado", "12 oct"],
["uga", "MUN", "Manuel Ugarte (MC)", "gf", 0.03, 1, "Ligamento cruzado de la rodilla", "12 oct"],
["hen", "CRY", "Dean Henderson (POR)", "ga", 0.1, 0.5, "Portero titular; pie. \"Touch-and-go\": volvió a entrenar y se evaluará cerca del inicio ante Newcastle; si no, ataja Walter Benítez (Sports Mole, 24 oct)", "24 oct"],
["sco", "BOU", "Alex Scott (MC)", "gf", 0.04, 1, "Cuádriceps, con Inglaterra; 6-8 semanas", "12 oct"],
["git", "CFC", "Jamie Gittens (EI)", "gf", 0.04, 1, "Tobillo; no antes de finales de octubre", "12 oct"],
["wri", "COV", "Haji Wright (DC)", "gf", 0.1, 1, "Cuádriceps; sin fecha de regreso (estado no confirmado)", "12 oct"],
["bal", "SUN", "Dan Ballard (DFC)", "ga", 0.05, 1, "Fuera ante Chelsea el dom 8 (dave.sport, 6 nov)", "6 nov"],
["rod", "LEE", "Joe Rodon (DFC)", "ga", 0.05, 1, "Isquiotibiales; 8-10 semanas desde finales de agosto", "12 oct"],
["ona", "AVL", "Amadou Onana (MC)", "gf", 0.05, 1, "Rotura de ligamento cruzado; se pierde la temporada", "12 oct"],
["dam", "BRE", "Mikkel Damsgaard (MC)", "gf", 0.05, 1, "Tobillo; baja larga", "12 oct"],
["bdg", "BAR", "Roony Bardghji (ED)", "gf", 0.03, 1, "Ligamento cruzado; vuelve en 2027", "12 oct"],
["rdg", "RMA", "Rodrygo (ED)", "gf", 0.06, 1, "Rodilla; apunta a inicios de 2027", "12 oct"],
["ase", "RMA", "Raúl Asencio (DFC)", "ga", 0.04, 1, "Fractura por estrés en la tibia; unos 3 meses", "12 oct"],
["mrc", "SEV", "Marcão (DFC)", "ga", 0.04, 1, "Cuádriceps; varias semanas", "12 oct"],
["uch", "GET", "Christantus Uche (MC)", "gf", 0.05, 1, "Rodilla operada; fuera toda la temporada", "12 oct"],
["str", "AEK", "Thomas Strakosha (POR)", "ga", 0.1, 0.5, "Portero titular; muñeca, duda ante Real Madrid. Se proyecta a Brignoli en la portería (UEFA, previa J4)", "4 nov"],
["igm", "LIL", "Hamza Igamane (DC)", "gf", 0.05, 1, "Ligamento cruzado; baja larga", "13 oct"],
["kea", "COM", "Moise Kean (DC)", "gf", 0.1, 1, "Espinilla; fuera ante Manchester United. Fàbregas verá si llega para el sábado", "21 oct"],
["vin", "RMA", "Vinícius Jr. (EI)", "gf", 0.15, 1, "Sanción de 4 partidos de LaLiga: cumplió el 3º el dom 1 en Racing y también se pierde la J12 ante Valencia (okdiario, 31 oct). Sí puede jugar la Champions", "2 nov"],
["leo", "LFC", "Giovanni Leoni (DFC)", "ga", 0.03, 1, "Lesión larga", "14 oct"],
["dur", "MTY", "Uroš Đurđević (DC)", "gf", 0.06, 1, "Tobillo; entrena por separado, única baja de Monterrey ante Chivas (SI.com, 24 oct)", "24 oct"],
["bor", "RCC", "Borja Iglesias (DC)", "gf", 0.07, 1, "Sóleo; fuera ante Betis (Comunio)", "23 oct"],
["dlo", "VCF", "Diego López (EI)", "gf", 0.06, 1, "Ligamento cruzado; baja larga", "16 oct"],
["bat", "RVC", "Augusto Batalla (POR)", "ga", 0.1, 1, "Portero titular; fractura de tibia, fuera hasta enero", "16 oct"],
["rui", "RBB", "Aitor Ruibal (LD)", "ga", 0.03, 1, "Rodilla; fuera ante Barcelona", "16 oct"],
["rja", "CFC", "Reece James (LD)", "ga", 0.05, 1, "Operado de la rodilla; unos 3 meses", "16 oct"],
["but", "HUL", "Jack Butland (POR)", "ga", 0.1, 1, "Portero titular; hombro, fuera ante Brentford. Ataja Tzolakis (Fantasy Football Scout, 23 oct)", "23 oct"],
["ela", "NEW", "Anthony Elanga (ED)", "gf", 0.05, 0.5, "Volvió a entrenar; podría ir convocado pero no para 90' (Jaissle)", "23 oct"],
["vei", "AME", "Raphael Veiga (MCO)", "gf", 0.08, 1, "Hombro izquierdo; América confirmó cirugía en São Paulo, sin fecha de regreso. Fuera ante Pachuca (ClaroSports, 23 oct)", "24 oct"],
["mru", "TOL", "Marcel Ruiz (MC)", "gf", 0.05, 1, "Rodilla; fuera ante San Luis", "16 oct"],
["rbb", "SLP", "Robson Bambú (DFC)", "ga", 0.04, 1, "Fuera (FutMercado, 31 oct)", "1 nov"],
["jpe", "SLP", "João Pedro (DC)", "gf", 0.05, 1, "Fuera (FutMercado, 31 oct)", "1 nov"],
["rzw", "TIG", "Rômulo Zwarg (MC)", "gf", 0.04, 1, "Sigue fuera (FutMercado, 31 oct)", "1 nov"],
["xsi", "TOT", "Xavi Simons (MCO)", "gf", 0.08, 1, "Fuera ante Coventry", "16 oct"],
["odo", "TOT", "Wilson Odobert (EI)", "gf", 0.03, 1, "Fuera ante Coventry", "16 oct"],
["ben", "TOT", "Rodrigo Bentancur (MC)", "ga", 0.03, 1, "Suspendido por roja hasta el 7 nov; se pierde Coventry y Chelsea", "19 oct"],
["mit", "BRI", "Kaoru Mitoma (EI)", "gf", 0.06, 1, "Muslo; fuera hasta el 8 nov aprox.", "19 oct"],
["fer", "BRI", "Evan Ferguson (DC)", "gf", 0.04, 1, "Tobillo; fuera ante Crystal Palace", "16 oct"],
["par", "CAZ", "José Paradela (MC)", "gf", 0.04, 0.5, "Duda ante León: SI lo da en duda y Bolavip dice que ya se recuperó (29-31 oct)", "1 nov"],
["frp", "LFC", "Jeremie Frimpong (LD)", "ga", 0.04, 1, "Isquiotibiales; sigue fuera para el partido ante Arsenal del 1 nov (Khel Now, 30 oct)", "30 oct"],
["ore", "MCI", "Nico O'Reilly (LI)", "ga", 0.03, 0.5, "Espalda; no entrenó a media semana, duda ante Aston Villa (Fantasy Football Scout)", "23 oct"],
["dhs", "VCF", "Justin de Haas (DFC)", "ga", 0.03, 0.5, "Salió lesionado ante Athletic", "18 oct"],
["gur", "ATH", "Gorka Guruzeta (DC)", "gf", 0.05, 1, "Lesionado; fuera ante Getafe (Comunio)", "23 oct"],
["fbe", "RBB", "Facundo Bernal (MC)", "ga", 0.03, 1, "Suspendido: cumple el 1º de 4 partidos ante Celta (Comunio)", "23 oct"],
["yar", "BRE", "Yehor Yarmoliuk (MC)", "gf", 0.04, 1, "Roja directa ante Liverpool; suspendido hasta el 8 nov", "19 oct"],
["jan", "BRE", "Vitaly Janelt (MC)", "gf", 0.03, 1, "Doble amarilla ante Liverpool; suspendido hasta el 28 oct (Hull)", "19 oct"],
["als", "NAP", "Alisson Santos (EI)", "gf", 0.03, 1, "Isquiotibiales; fuera ante Bodø/Glimt (UEFA)", "20 oct"],
["dan", "SUN", "Kevin Danso (DFC)", "ga", 0.05, 1, "Roja directa al 17' ante Bournemouth; suspendido al menos ante Leeds (25 oct)", "19 oct"],
["meu", "SUN", "Thomas Meunier (LD)", "ga", 0.03, 1, "Muslo; fuera hasta el 8 nov aprox.", "19 oct"],
["min", "BRI", "Yankuba Minteh (ED)", "gf", 0.04, 1, "Fuera", "19 oct"],
["tzi", "BRI", "Stefanos Tzimas (DC)", "gf", 0.03, 1, "Fuera", "19 oct"],
["cho", "HUL", "Mohamed-Ali Cho (DC)", "gf", 0.04, 0.5, "Muslo; entrenó toda la semana, posible regreso (Sage)", "23 oct"],
["igj", "NFO", "Igor Jesus (DC)", "gf", 0.05, 1, "Fuera hasta el 31 oct aprox.", "19 oct"],
["awb", "AVL", "Aaron Wan-Bissaka (LD)", "ga", 0.04, 1, "Fuera hasta el 8 nov aprox.", "19 oct"],
["lfe", "RVC", "Luiz Felipe (DFC)", "ga", 0.04, 1, "Rotura del cruzado de la rodilla derecha; fuera toda la temporada (Comunio)", "23 oct"],
["rat", "RVC", "Andrei Ratiu (LD)", "ga", 0.03, 0.5, "Duda ante Getafe", "19 oct"],
["jmi", "GET", "Juanmi (DC)", "gf", 0.04, 1, "Fuera ante Rayo", "19 oct"],
["edd", "DEP", "Eddahchouri (DC)", "gf", 0.04, 1, "Fuera para la J10 ante Atlético", "19 oct"],
["yhe", "RSO", "Yangel Herrera (MC)", "gf", 0.04, 0.5, "Molestias musculares; duda ante Levante (Comunio)", "23 oct"],
["arm", "RSO", "Jon Aramburu (LD)", "ga", 0.03, 1, "Fuera", "19 oct"],
["stf", "RCC", "Carl Starfelt (DFC)", "ga", 0.03, 1, "Fuera", "19 oct"],
["cns", "VCF", "Sergi Canós (ED)", "gf", 0.03, 1, "Fuera", "19 oct"],
["jpr", "TIG", "Joaquim Pereira (DFC)", "ga", 0.03, 1, "Desgarro grado 1; fuera ante Pumas (ABC Noticias)", "22 oct"],
["med", "MTY", "Stefan Medina (LD)", "ga", 0.04, 1, "Fuera", "17 oct"],
["ore2", "MTY", "Lucas Orellano (EI)", "gf", 0.04, 1, "Fuera", "17 oct"],
["ado", "PAC", "Alexei Domínguez (DC)", "gf", 0.05, 1, "Fuera hasta mediados de noviembre", "17 oct"],
["zun", "AME", "Zúñiga (DC)", "gf", 0.04, 1, "Fuera según el reporte de la Liga MX", "17 oct"],
["stj", "BRI", "Pascal Struijk (DFC)", "ga", 0.03, 0.5, "Duda", "19 oct"],
["djn", "GET", "Djené (DFC)", "ga", 0.05, 1, "Roja directa ante Rayo (19 oct); suspendido ante Athletic (25 oct)", "20 oct"],
["ner", "NAP", "David Neres (ED)", "gf", 0.05, 1, "Muslo; fuera ante Bodø/Glimt (UEFA)", "20 oct"],
["lma2", "MUN", "Lisandro Martínez (DFC)", "ga", 0.04, 1, "Expulsado por doble amarilla al 63' ante Chelsea (31 oct); suspendido ante Aston Villa el 8 nov (Sky Sports)", "1 nov"],
["cuc", "RBB", "Cucho Hernández (DC)", "gf", 0.06, 1, "Lesión muscular; fuera ante Celta (Comunio)", "23 oct"],
["asn", "FEN", "Marco Asensio (MCO)", "gf", 0.06, 1, "Rodilla; fuera ante Slavia (UEFA)", "20 oct"],
["rju", "AME", "Ramón Juárez (DFC)", "ga", 0.04, 1, "Fuera ante Atlas (OneFootball)", "21 oct"],
["snb", "PUE", "Sanabria", "gf", 0.04, 1, "Desgarro; fuera ante Monterrey", "21 oct"],
["kve", "PUE", "Kevin Velasco", "gf", 0.03, 1, "Fuera ante Monterrey", "21 oct"],
["chl", "COM", "Trevoh Chalobah (DFC)", "ga", 0.04, 0.5, "Duda ante Lens (UEFA, previa J4, 4 nov)", "4 nov"],
["jro", "COM", "Jesús Rodríguez (ED)", "gf", 0.03, 1, "Fuera unos dos meses", "21 oct"]]
 .map(x=>({
id:x[0],t:x[1],n:x[2],r:x[3],i:x[4],st:x[5],h:x[6],d:x[7]}
}
));
function inj(t,r,au){
  if(au)return r;
  let rs=r.rs,ra=r.ra;
  NW.forEach(x=>{
    if(x.t===t&&x.st>0){
      const d=x.i*x.st;
      if(x.r==="gf")rs-=d;
    else ra+=d}
  }
  }
}
  );
  return{
  rs:Math.max(rs,.3),ra:Math.max(ra,.3)}
}
}
}
const INJ=g=>g.aud?"":NW.filter(x=>(x.t===g.h||x.t===g.a)&&x.st>0).map(x=>`<span class="bd">${x.t} · ${x.n}${x.st<1?" (duda)":" fuera"}</span>`).join("");
function model0(h,a,comp,au){
  const H=inj(h,rate(h,comp,!au),au),A=inj(a,rate(a,comp,!au),au),LG=(comp==="UCL"||comp==="UEL")?LGU:LG0[COMPS[comp].lg],py=t=>Math.pow(t.rs,E)/(Math.pow(t.rs,E)+Math.pow(t.ra,E));
  const x=py(H),y=py(A),pn=(x-x*y)/(x+y-2*x*y),o=pn/(1-pn)*(HFA/(1-HFA)),share=.5+SHR*(o/(1+o)-.5);
  let [lh,la]=tilt(H.rs*A.ra/LG,A.rs*H.ra/LG,share);
  const tot=lh+la,P=pois(lh),Q=pois(la),rho=comp==="MX"?-.14:-.08,tau=(i,j)=>i==0&&j==0?1-lh*la*rho:i==0&&j==1?1+lh*rho:i==1&&j==0?1+la*rho:i==1&&j==1?1-rho:1;
  let w=0,d=0,l=0,m2h=0,m2a=0;
  for(let i=0;
  i<NG;
  i++)for(let j=0;
  j<NG;
  j++){
    const p=P[i]*Q[j]*tau(i,j);
    if(i>j)w+=p;
    else if(i==j)d+=p;
    else l+=p;
    if(i-j>=2)m2h+=p;
  if(j-i>=2)m2a+=p}
}
  const line=half(tot),lH=half(lh),lA=half(la),favH=w>=l,plf=favH?m2h:m2a,fn=favH?h:a,dn=favH?a:h,pO=over(tot,line),bt=(1-Math.exp(-lh))*(1-Math.exp(-la));
  const O=[
 {
  id:"h",l:h+" gana",p:w,f:(p,q)=>p>q}
}
  ,{
  id:"d",l:"Empate",p:d,f:(p,q)=>p==q}
}
  ,{
  id:"a",l:a+" gana",p:l,f:(p,q)=>q>p}
}
  ,
 {
  id:"ov",l:"Over "+line,p:pO,f:(p,q)=>p+q>line}
}
  ,{
  id:"un",l:"Under "+line,p:1-pO,f:(p,q)=>p+q<line}
}
  ,
 {
  id:"plf",l:fn+" −1.5",p:plf,f:(p,q)=>favH?p-q>=2:q-p>=2}
}
  ,{
  id:"pld",l:dn+" +1.5",p:1-plf,f:(p,q)=>favH?!(p-q>=2):!(q-p>=2)}
}
  ,
 {
  id:"dc1x",l:h+" o empate",p:w+d,g:1,f:(p,q)=>p>=q}
}
  ,{
  id:"dcx2",l:"Empate o "+a,p:d+l,g:1,f:(p,q)=>q>=p}
}
  ,{
  id:"dc12",l:h+" o "+a+" (sin empate)",p:w+l,g:1,f:(p,q)=>p!=q}
}
  ,
 {
  id:"o15",l:"Over 1.5",p:over(tot,1.5),g:1,f:(p,q)=>p+q>1.5}
}
  ,{
  id:"u35",l:"Under 3.5",p:1-over(tot,3.5),g:1,f:(p,q)=>p+q<3.5}
}
  ,{
  id:"o35",l:"Over 3.5",p:over(tot,3.5),g:1,f:(p,q)=>p+q>3.5}
}
  ,
 {
  id:"tho",l:h+" Over "+lH,p:over(lh,lH),g:1,f:p=>p>lH}
}
  ,{
  id:"thu",l:h+" Under "+lH,p:1-over(lh,lH),g:1,f:p=>p<lH}
}
  ,{
  id:"tao",l:a+" Over "+lA,p:over(la,lA),g:1,f:(p,q)=>q>lA}
}
  ,{
  id:"tau",l:a+" Under "+lA,p:1-over(la,lA),g:1,f:(p,q)=>q<lA}
}
  ,
 {
  id:"by",l:"Ambos anotan: Sí",p:bt,g:1,f:(p,q)=>p>0&&q>0}
}
  ,{
  id:"bn",l:"Ambos anotan: No",p:1-bt,g:1,f:(p,q)=>!(p>0&&q>0)}
}
  ];
  const by=id=>O.find(z=>z.id==id),dom=H.rs>A.rs&&H.ra<A.ra?"h":A.rs>H.rs&&A.ra<H.ra?"a":null;
  let cp,ct;
  if(dom&&by(dom).p>=.42){
    cp=by(dom);
  ct="GANA · DOMINA EN ATAQUE Y DEFENSA"}
}
  else if(dom){
    cp=by(dom=="h"?"dc1x":"dcx2");
  ct="DOMINA, PERO PARTIDO CERRADO · DOBLE OPORTUNIDAD"}
}
  else{
    const fv=by(favH?"h":"a");
    if(fv.p>=.5){
      cp=fv;
    ct="FAVORITO (sin dominio total)"}
  }
    else{
      const dc=by(favH?"dc1x":"dcx2");
      if(dc.p>=.65){
        cp=dc;
      ct="SIN VENTAJA CLARA · OPCIÓN MÁS SEGURA"}
    }
      else{
        cp=by("u35");
      ct="SIN VENTAJA CLARA · TOTAL MÁS SEGURO"}
    }
    }
  }
  }
}
  /* empate probable: en lugar de ganador directo, doble oportunidad */
 if(d>=DRAW&&(cp.id==="h"||cp.id==="a")){
    cp=by(cp.id==="h"?"dc1x":"dcx2");
  ct="EMPATE PROBABLE ("+(d*100).toFixed(0)+"%) · DOBLE OPORTUNIDAD"}
}
  /* doble oportunidad sola paga poco: se combina con Over 1.5 si sigue siendo muy probable */
 let wy="";
  if(cp.id==="dc1x"||cp.id==="dcx2"){
    const hs=cp.id==="dc1x",dc=cp;
    let pj=0;
    for(let i=0;
    i<NG;
    i++)for(let j=0;
    j<NG;
    j++)if((hs?i>=j:j>=i)&&i+j>=2)pj+=P[i]*Q[j]*tau(i,j);
    if(pj>=DCO){
      const c={
      id:"dco15",l:dc.l+" + Over 1.5",p:pj,g:1,f:(p,q)=>(hs?p>=q:q>=p)&&p+q>1.5}
    }
      ;
      O.push(c);
      cp=c;
      ct="DOBLE OPORTUNIDAD + GOLES · EMPATE "+(d*100).toFixed(0)+"%";
    wy=dc.l+" tiene "+(dc.p*100).toFixed(0)+"% pero paga muy poco (justa "+(1/dc.p).toFixed(2)+"). Le sumo Over 1.5 porque el partido proyecta "+tot.toFixed(2)+" goles: la combinada sigue en "+(pj*100).toFixed(0)+"% y sube la cuota."}
  }
  }
}
  return{
  why:wy||undefined,O,cp,ct,dom,lh,la,tot,H,A,x,y,share,w,d,l,line,fav:by(favH?"h":"a")}
}
}
}
const pc=v=>(v*100).toFixed(1)+"%";
const KEY=g=>"FB:"+(g.cp||"")+":"+(g.dl||"sim")+":"+g.h+"-"+g.a,SPN=g=>"Fútbol · "+COMPS[g.cp].n;
const GR=[["1X2",["h","d","a"]],["total",["ov","un"]],["±1.5",["plf","pld"]],["O/U 3.5",["o35","u35"]],["ambos anotan",["by","bn"]],["total local",["tho","thu"]],["total visita",["tao","tau"]]];
const flags=g=>[g.h,g.a].filter(c=>TM[c].fl&&!ed[c]);
const FL={
e:"ESTIMADO",n:"SIN DATO",p:"ASCENDIDO"}
}
;
function row(g,o,pk,nv){
  const gk=KEY(g),k=gk+"|"+o.id,od=SO[k]||"",d=dec(od),ev=d?o.p*d-1:null;
  let res="";
  if(g.aud){
    const ok=o.f(g.sc[0],g.sc[1]);
  res=` <span style="color:var(--${ok?"ok":"bad"})">${ok?"✓":"✗"}</span>`}
}
  const s=d&&ev>0?AVX.unit(o.p,d):0,cv=nv&&nv[o.id]!=null?` · <span class="nv">casa ${pc(nv[o.id])}</span>`:"";
  return `<div class="row ${pk?"p":""}">${g.aud?"<span></span>":AVX.addBtn(k,PK(g,o,d))}<span>${o.l}<small>justa ${(1/o.p).toFixed(2)}${cv}</small></span><div class="bar"><i style="width:${o.p*100}%"></i></div><b>${pc(o.p)}${res}</b>${g.aud?"<span></span>":`<div class="od"><input type="text" inputmode="decimal" data-o="${k}" value="${od}" placeholder="cuota">${
  ev!=null?`<em class="${ev>0?"pos":"neg"}">EV ${ev>0?"+":""}${(ev*100).toFixed(0)}%</em>`:""}
}
  ${
  s>0?`<i class="stk">${s}% bank</i>`:""}
}
</div>`}</div>`}
}
/* sin valor: el usuario ya escribio cuotas y ninguna le saca 4% a la casa */
function NOB(g){
  if(g.aud)return false;
  const gk=KEY(g)+"|";
return Object.keys(SO).some(k=>k.startsWith(gk)&&dec(SO[k]))}
}
const CMIN=.35;
function bestOf(g,m){
  let b=null;
  const gk=KEY(g);
  m.O.forEach(o=>{
    const d=dec(SO[gk+"|"+o.id]);
    if(d){
      const ev=o.p*d-1;
      if(ev>=AVX.EVMIN&&(!b||ev>b.ev))b={
      o,ev,d}
    }
    }
  }
  }
}
  );
return b}
}
function PK(g,o,d){
  const gk=KEY(g);
  return{
  k:gk+"|"+o.id,gk,sp:SPN(g),m:g.h+" vs "+g.a,l:o.l,p:+o.p.toFixed(4),d:d||null,t:(g.dl||"Simulación")+(g.t?" · "+g.t:"")}
}
}
}
function NV(g){
  const gk=KEY(g);
return AVX.noVig(GR,id=>dec(SO[gk+"|"+id]))}
}
function STK(g,pk,b){
  if(g.aud)return"";
  const k=KEY(g)+"|"+pk.id,d=b&&b.o===pk?b.d:dec(SO[k]);
return AVX.stakeBox(pk,d,k,PK(g,pk,d))}
}
/* COMBINADAS DEL MISMO PARTIDO: P(fav gana y B) = P_modelo(fav gana) x P_matriz(B | fav gana) */
function cmbBuild(M,fs,pF,fav,cands){
  let pw=0;
  const n=M.length;
  for(let i=0;
  i<n;
  i++)for(let j=0;
  j<n;
  j++)if(fs(i,j))pw+=M[i][j];
  if(!pw)return[];
  return cands.map(c=>{
    let pj=0;
    for(let i=0;
    i<n;
    i++)for(let j=0;
    j<n;
    j++)if(fs(i,j)&&c.f(i,j))pj+=M[i][j];
    return{
    id:c.id,l:c.full||fav+" gana + "+c.l,p:pF*pj/pw,f:(x,y)=>fs(x,y)&&c.f(x,y)}
  }
  }
}
).filter(c=>c.p>.05)}
}
function cmbOT(P,Q){
  const n=P.length+1,M=Array.from({
  length:n}
}
  ,()=>new Array(n).fill(0));
  for(let i=0;
  i<P.length;
  i++)for(let j=0;
  j<Q.length;
  j++){
    const v=P[i]*Q[j];
    if(i!==j)M[i][j]+=v;
    else{
      M[i+1][j]+=v/2;
    M[i][j+1]+=v/2}
  }
  }
}
return M}
}
/* cuando hay favorito claro, la combinada ES el pick del modelo (una sola apuesta) */
function model(...A){
  const m=model0(...A);
  try{
    const C=COMBOS({
    h:A[0],a:A[1]}
  }
    ,m);
    if(C&&C.c&&C.c.p>=CMIN){
      m.O.push(C.c);
      m.cp=C.c;
      m.pick=C.c;
      m.ct="FAVORITO CLARO · GANA + GOLES";
    m.why=C.why}
  }
  }
}
  catch(e){
  }
}
return m}
}
function CMB(g,m){
  const C=COMBOS(g,m);
  if(!C||!C.c)return"";
return `<div class="combo"><div class="ch">COMBINADA SUGERIDA · FAVORITO CLARO</div>${row(g,C.c,true)}<div class="cs2">${C.why} Búscala como "Crea tu apuesta" o "Bet Builder" y escribe su cuota para ver si tiene valor.</div></div>`}
}
function COMBOS(g,m){
  const fh=m.fav.id==="h",pF=m.fav.p;
  if(pF<0.62||m.d>=DRAW)return null;
  const fc=fh?g.h:g.a,t=TM[fc],gf=t.cur&&t.cur[2]>=3?t.cur[0]/t.cur[2]:t.gp?t.gf/t.gp:null;
  /* regla: Over 2.5 si el partido proyecta 2.6+ goles o el favorito promedia 3.0+ goles a favor;
  si no, Over 1.5 */
 const big=m.tot>=2.6||(gf!=null&&gf>=3),L=big?2.5:1.5,P=pois(m.lh),Q=pois(m.la),M=P.map(p=>Q.map(q=>p*q)),fs=fh?(i,j)=>i>j:(i,j)=>j>i;
  const c=cmbBuild(M,fs,pF,fc,[{
  id:"cb_o"+L,l:"Over "+L,f:(i,j)=>i+j>L}
}
  ])[0];
  return{
    c,why:`${fc} gana ${pc(pF)} pero paga poco (justa ${(1/pF).toFixed(2)}). Over ${L} porque el partido proyecta ${m.tot.toFixed(2)} goles${gf!=null?` y ${
    fc}
  }
    promedia ${
    gf.toFixed(1)}
  }
  goles a favor por partido`:""}${big?"":" (para Over 2.5 pide 2.6+ proyectados o que el favorito promedie 3.0+ a favor)"}.`}
}
}
}
function MG(nv){
return nv.mg.map(([n,v])=>`<span class="bd">Margen casa ${n}: ${(v*100).toFixed(1)}%</span>`).join("")}
}
function card(g){
  const m=model(g.h,g.a,g.cp,g.aud),b=g.aud?null:bestOf(g,m),nv=g.aud?{
    p:{
    }
  }
  ,mg:[]}
}
  :NV(g),pk=b?b.o:m.cp,main=m.O.filter(o=>!o.g),ext=m.O.filter(o=>o.g);
  let ban;
  if(g.aud){
    const ok=m.cp.f(g.sc[0],g.sc[1]);
  ban=`<div class="pick"><div><span>PICK PRE-JUEGO · FINAL ${g.sc[0]}–${g.sc[1]}</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.cp.l}</div></div><b style="color:var(--${ok?"ok":"bad"});font-size:20px">${ok?"✓":"✗"}</b></div>`}
}
  else if(b)ban=`<div class="pick v"><div><span>MEJOR VALOR · EV +${(b.ev*100).toFixed(0)}%</span><div style="margin-top:3px;font-size:16px;font-weight:600">${b.o.l} @ ${b.d.toFixed(2)}</div></div><b>${pc(b.o.p)}</b></div>`;
  else if(NOB(g))ban=`<div class="pick nb"><div><span>SIN VALOR · NO APOSTAR</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.cp.l}</div><small style="display:block;margin-top:3px;font-size:11px;opacity:.8;letter-spacing:0">Ninguna cuota que escribiste le saca 4% de ventaja a la casa. Este pick solo vale si te pagan ${(1.04/m.cp.p).toFixed(2)} o más.</small></div><b>✕</b></div>`;
  else ban=`<div class="pick"><div><span>${m.ct}</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.cp.l}</div></div><b>${pc(m.cp.p)}</b></div>`;
  const fl=flags(g);
  return `<div class="card"><div class="mt"><div class="tm">${g.h}<small>${TM[g.h].n.toUpperCase()}</small></div><div class="vs">VS</div><div class="tm" style="text-align:right">${g.a}<small>${TM[g.a].n.toUpperCase()}</small></div></div>
 ${g.s?`<div class="ser">${
  g.s}
}
  </div>`:""}<div class="meta"><span>${g.t}</span><span>Proy ${m.lh.toFixed(2)} – ${m.la.toFixed(2)} · Total ${m.tot.toFixed(2)}</span></div>
 ${Array.isArray(g.ref)?`<div class="meta" style="margin-top:0"><span>Ref. proveedor 1 / X / 2</span><span>${
  g.ref.map(v=>v+"%").join(" · ")}
}
  </span></div>`:""}
 ${main.map(o=>row(g,o,o===pk,nv.p)).join("")}
 <details><summary>MÁS MERCADOS (DOBLE OPORTUNIDAD · TOTALES · AMBOS ANOTAN)</summary>${ext.map(o=>row(g,o,o===pk,nv.p)).join("")}</details>${ban}${m.why&&!g.aud?`<div class="cs2" style="margin-top:8px;font-size:11px;line-height:1.45;color:var(--mut)">${
  m.why}
}
  En tu casa búscala como "Crea tu apuesta" o "Bet Builder" y escribe su cuota en la casilla.</div>`:""}${!b&&NOB(g)&&!dec(SO[KEY(g)+"|"+pk.id])?"":STK(g,pk,b)}
 <div class="kp">${INJ(g)}${MG(nv)}${m.dom?`<span class="bd g">${
  m.dom=="h"?g.h:g.a}
}
  domina ataque + defensa</span>`:`<span class="bd">Ningún equipo domina en ataque y defensa</span>`}${fl.map(c=>`<span class="bd">${
  c}
}
  : ${
  FL[TM[c].fl]}
}
</span>`).join("")}</div></div>`}
}
function tile(g){
  const m=model(g.h,g.a,g.cp,g.aud),b=g.aud?null:bestOf(g,m),fl=flags(g);
  let tag;
  if(g.aud){
    const ok=m.cp.f(g.sc[0],g.sc[1]);
  tag=`<b style="color:var(--${ok?"ok":"bad"})">${ok?"✓":"✗"} ${g.sc[0]}–${g.sc[1]}</b>`}
}
  else tag=`<b>${pc(b?b.o.p:m.cp.p)}</b>`;
  return `<div class="tile" data-open="${g.k}"><div class="mt"><div class="tm">${g.h}<small>${TM[g.h].n.toUpperCase()}</small></div><span class="ball"></span><div class="tm" style="text-align:right">${g.a}<small>${TM[g.a].n.toUpperCase()}</small></div></div>
 ${g.s?`<div class="ser">${
  g.s}
}
  </div>`:""}<div class="meta"><span>${g.t}</span><span>Proy ${m.lh.toFixed(1)}–${m.la.toFixed(1)}</span></div>
 <div class="tp"><span>${b?"MEJOR VALOR":g.aud?"PICK PRE-JUEGO":NOB(g)?"NO APOSTAR · SIN VALOR":"PICK DEL MODELO"}</span><div>${b?b.o.l:m.cp.l}</div>${tag}</div>${fl.length?`<div style="margin-top:6px">${
  fl.map(c=>`<span class="bd">${c}: ${FL[TM[c].fl]}</span>`).join("")}
}
</div>`:""}<div class="go">ANALIZAR ▸</div></div>`}
}
function lines(g){
  const m=model(g.h,g.a,g.cp,g.aud),f=v=>v.toFixed(2),q=v=>(v*100).toFixed(1)+"%",fl=flags(g);
return [g.cp==="MX"?"Sincronizando tabla Apertura 2026 (goles a favor y en contra)":"Sincronizando temporada 2025-26 + tabla 2026-27",
 `Ataque/defensa · ${g.h} ${f(m.H.rs)}/${f(m.H.ra)} · ${g.a} ${f(m.A.rs)}/${f(m.A.ra)}`,
 fl.length?`Datos limitados: ${fl.map(c=>c+" ("+FL[TM[c].fl].toLowerCase()+")").join(", ")}`:"Datos completos para ambos equipos",
 (g.aud?"Modo auditoría · sin bajas del día":`Revisando bajas y lesiones · ${NW.filter(x=>(x.t===g.h||x.t===g.a)&&x.st>0).length} ajustes activos`),`Pitágoras 1.7 · ${q(m.x)} vs ${q(m.y)}`,`Log5 + ventaja local 55% → ${g.h} ${q(m.share)} sin empate`,
 `Goles proyectados ${f(m.lh)}–${f(m.la)} · total ${f(m.tot)} · Poisson`,`Empate ${q(m.d)} · escaneando ${m.O.length} mercados`,
 m.dom?`Dominio detectado: ${m.dom=="h"?g.h:g.a}`:"Sin dominio total en ataque y defensa",`Pick del modelo: ${m.cp.l} (${q(m.cp.p)})`,"ANÁLISIS COMPLETO"]}
}
const RIMG="<IMG_B64>";
function stageHTML(g){
  const hand=(l,t,w,h)=>`left:${l/7.2}%;top:${t/7}%;width:${w/7.2}%;height:${h/7}%;background-size:${72000/w}% ${70000/h}%;background-position:${l/(720-w)*100}% ${t/(700-h)*100}%`;
return `<div class="scan"><div class="shdr"><span>ANALIZANDO EN TIEMPO REAL</span><span class="lv">● LIVE</span></div>
 <div class="stdy" id="stdy"><style>
 .stdy{position:relative;width:100%;aspect-ratio:720/700;border-radius:18px;overflow:hidden;background:#fff}
 .stdy .kb{position:absolute;inset:0;animation:skb 9s ease-in-out infinite alternate;transform-origin:50% 45%}
 @keyframes skb{from{transform:scale(1)}to{transform:scale(1.045) translateY(-1%)}}
 .stdy .ph{position:absolute;inset:0;background-size:100% 100%;background-image:url(${RIMG})}
 .stdy .hd{position:absolute;background-image:url(${RIMG});-webkit-mask-image:radial-gradient(ellipse 50% 50% at 50% 50%,#000 62%,transparent 100%);mask-image:radial-gradient(ellipse 50% 50% at 50% 50%,#000 62%,transparent 100%);transform-origin:85% 85%;animation:swr 1.15s ease-in-out infinite}
 @keyframes swr{0%{transform:translate(0,0) rotate(0)}18%{transform:translate(2.5px,.6px) rotate(1.6deg)}36%{transform:translate(-1px,1.6px) rotate(-.8deg)}54%{transform:translate(3px,1.2px) rotate(1.9deg)}72%{transform:translate(.5px,-.6px) rotate(.3deg)}100%{transform:translate(0,0) rotate(0)}}
 .stdy svg{position:absolute;inset:0;width:100%;height:100%}
 .stdy .lid{transform-box:fill-box;transform-origin:50% 50%;transform:scaleY(0);animation:sbl 4.2s infinite}
 @keyframes sbl{0%,90%,100%{transform:scaleY(0)}93%,95%{transform:scaleY(1)}}
 .stdy .eg{animation:seg 2.2s ease-in-out infinite}@keyframes seg{50%{opacity:.15}}
 .stdy .rg{transform-box:fill-box;transform-origin:50% 50%;animation:srg 2.4s ease-in-out infinite}@keyframes srg{0%,100%{opacity:.25;transform:scale(.97)}50%{opacity:.85;transform:scale(1.02)}}
 .stdy .sh{animation:ssh 4.5s ease-in-out infinite}@keyframes ssh{0%,55%{transform:translateX(-220px)}85%,100%{transform:translateX(260px)}}
 .stdy .pt{animation:spt linear infinite}@keyframes spt{from{transform:translateY(0);opacity:0}15%{opacity:.9}to{transform:translateY(-160px);opacity:0}}
 .stdy canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;transition:opacity .5s}
 .stdy .tg{position:absolute;left:3%;top:3.5%;padding:5px 10px;border-radius:20px;background:rgba(255,255,255,.82);border:1px solid rgba(14,122,70,.25);font-size:10px;letter-spacing:.14em;color:#0e7a46;font-weight:700;backdrop-filter:blur(6px)}
 .stdy .tg i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#d23a5c;margin-right:6px;animation:pl 1s infinite}
 </style>
 <div class="kb"><div class="ph"></div>
  <svg viewBox="0 0 720 700" preserveAspectRatio="none"><defs><filter id="sbr"><feGaussianBlur stdDeviation="6"/></filter><clipPath id="hcl"><ellipse cx="360" cy="165" rx="152" ry="138"/></clipPath><linearGradient id="shg" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
   <ellipse class="rg" cx="360" cy="630" rx="290" ry="36" fill="none" stroke="#5ee7ff" stroke-width="5" filter="url(#sbr)"/>
   <g clip-path="url(#hcl)"><rect class="sh" x="250" y="20" width="70" height="300" fill="url(#shg)" transform="skewX(-18)"/></g>
   <g class="eg" fill="#5ee7ff" filter="url(#sbr)" opacity=".45"><ellipse cx="325" cy="226" rx="34" ry="14"/><ellipse cx="443" cy="226" rx="34" ry="14"/></g>
   <g fill="#050608"><rect class="lid" x="286" y="196" width="78" height="58" rx="20"/><rect class="lid" x="404" y="196" width="78" height="58" rx="20"/></g>
   <g id="ink" stroke="#1d2228" stroke-width="2.3" fill="none" stroke-linecap="round" opacity=".9" transform="rotate(-6 330 440)"></g>
   <g fill="#5ee7ff">${[[60,520,7,5],[150,600,5,7],[610,540,6,6],[680,420,5,8],[250,560,4,6.5],[520,600,5,5.5],[420,520,3,7.5]].map(([x,y,r,d],i)=>`<circle class="pt" cx="${x}" cy="${y}" r="${r/2}" style="animation-duration:${d}s;animation-delay:-${i*.9}s"/>`).join("")}</g>
  </svg>
  <div class="hd" style="${hand(236,300,116,148)}"></div>
 </div>
 <canvas id="spx" width="120" height="117"></canvas>
 <div class="tg"><i></i>${g.h} vs ${g.a}</div></div>
 <div class="prog"><i id="pg"></i></div><div id="log"></div><button id="skip">SALTAR ▸</button></div>`}
}
let SIMR=null,SIMT=[];
function simStop(){
  if(SIMR)cancelAnimationFrame(SIMR);
  SIMR=null;
  SIMT.forEach(clearTimeout);
SIMT=[]}
}
function simStart(g){
  simStop();
  const cv=document.getElementById("spx"),ink=document.getElementById("ink");
  if(!cv||!ink)return;
  const cx=cv.getContext("2d"),img=new Image();
  img.src=RIMG;
  const NS="http://www.w3.org/2000/svg",t0=performance.now(),REV=1500;
  let li=0,lt=t0,cur=null;
  /* trazos de tinta que aparecen junto a la punta del lapiz */
 function line(){
    if(li>=4){
      li=0;
    ink.innerHTML=""}
  }
    const y=432+li*9,x=286,len=34+Math.random()*26;
    let d=`M${x} ${y}`;
    for(let k=0;
    k<len/5;
    k++)d+=` q2.5 ${k%2?2.2:-2.2} 5 0`;
    const p=document.createElementNS(NS,"path");
    p.setAttribute("d",d);
    const L=len*1.2;
    p.setAttribute("stroke-dasharray",L);
    p.setAttribute("stroke-dashoffset",L);
    ink.appendChild(p);
    cur={
    p,L}
  }
    ;
    lt=performance.now();
  li++}
}
  line();
  function frame(now){
    const t=now-t0;
    if(t<REV+600){
      const pr=Math.min(1,t/REV),b=Math.max(1,Math.round(30*(1-(1-Math.pow(1-pr,2.4))))),W=Math.ceil(720/b),H=Math.ceil(700/b);
      if(img.complete&&img.naturalWidth){
        cv.width=W;
        cv.height=H;
        cx.imageSmoothingEnabled=true;
        cx.drawImage(img,0,0,W,H);
        if(pr<1){
          cx.fillStyle="rgba(31,191,106,.45)";
          for(let k=0;
          k<10;
        k++)cx.fillRect(Math.floor(Math.random()*W),Math.floor(Math.random()*H),1,1)}
      }
      }
    }
    cv.style.opacity=pr<1?1:0}
  }
    const k=Math.min(1,(now-lt)/1000);
    cur.p.setAttribute("stroke-dashoffset",cur.L*(1-k));
    if(k>=1&&now-lt>1250)line();
  SIMR=requestAnimationFrame(frame)}
}
SIMR=requestAnimationFrame(frame)}
}
function openGame(k){
  OPEN=k;
  const g=GM[k];
  TMR.forEach(clearTimeout);
  TMR=[];
  $("ov").classList.remove("hide");
  $("ov").scrollTop=0;
  document.body.style.overflow="hidden";
  $("stage").classList.remove("hide");
  $("res").classList.add("hide");
  $("stage").innerHTML=stageHTML(g);
  simStart(g);
  const L=lines(g);
  L.forEach((t,i)=>TMR.push(setTimeout(()=>{
    const d=document.createElement("div");
    d.className="ll"+(i==L.length-1?" ok":"");
    d.textContent=(i==L.length-1?"✔ ":"▸ ")+t;
    $("log").appendChild(d);
  $("pg").style.width=((i+1)/L.length*100)+"%"}
}
  ,i*420+250)));
TMR.push(setTimeout(()=>showRes(1),L.length*420+800))}
}
function showRes(fr){
  simStop();
  TMR.forEach(clearTimeout);
  TMR=[];
  if(!OPEN)return;
  $("stage").classList.add("hide");
  const r=$("res");
  r.classList.remove("hide","anim");
  r.innerHTML=card(GM[OPEN]);
if(fr===1)AVX.anim(r)}
}
function closeGame(){
  simStop();
  TMR.forEach(clearTimeout);
  TMR=[];
  OPEN=null;
  $("ov").classList.add("hide");
document.body.style.overflow=""}
}
function theme(c){
  const C=c?COMPS[c]:null,r=document.documentElement.style;
  r.setProperty("--ac",C?C.ac:"#2f7bff");
  r.setProperty("--ac2",C?C.ac2:"#0a1e5e");
r.setProperty("--gl",C?C.gl:"rgba(47,123,255,.5)")}
}
function drawHome(){
  $("tiles").innerHTML=CK.map((c,i)=>{
    const C=COMPS[c],n=DD[c].filter(d=>!d[1].some(g=>g.aud)).reduce((s,d)=>s+d[1].length,0);
  return `<button class="lt ${i==0?"sel":""}" data-c="${c}" style="--g:${C.g};--gl:${C.gl}"><span class="em">${C.em}</span><h2>${C.n}</h2><small>${C.sub}</small><div class="ct">${n} PARTIDOS PRÓXIMOS</div></button>`}
}
).join("")}
}
function enter(c){
  CP=c;
  day=0;
  theme(c);
  $("home").classList.add("hide");
  $("lgv").classList.remove("hide");
  const C=COMPS[c];
  $("lgt").innerHTML=`${C.n.toUpperCase()}<small>${C.sub}</small>`;
  $("minis").innerHTML=CK.map(k=>`<button class="mini ${k==c?"a":""}" data-c="${k}" style="--g:${COMPS[k].g};--gl:${COMPS[k].gl}" title="${COMPS[k].n}">${COMPS[k].em}</button>`).join("");
  const ts=Object.values(TM).filter(t=>t.comps.includes(c)).sort((a,b)=>a.n.localeCompare(b.n));
  $("sh").innerHTML=$("sa").innerHTML=ts.map(t=>`<option value="${t.c}">${t.c} · ${t.n}</option>`).join("");
  $("sh").value=SIMS[c].h;
  $("sa").value=SIMS[c].a;
  [...$("nav").children].forEach((b,i)=>b.classList.toggle("a",i==0));
  ["g","s","n","e"].forEach(x=>$("t"+x).classList.toggle("hide",x!=="g"));
  window.scrollTo(0,0);
draw()}
}
function draw(){
  if(!CP)return;
  const D=DD[CP],gs=D[day][1],au=gs.length&&gs[0].aud;
  $("days").innerHTML=D.map((d,i)=>`<button class="chip ${i==day?"a":""}" data-d="${i}">${d[0]} · ${d[1].length}</button>`).join("");
  $("topp").classList.toggle("hide",!au);
  if(au){
    let hit=0,fv=0,nd=0;
    gs.forEach(g=>{
      const m=model(g.h,g.a,CP,true);
      if(m.cp.f(g.sc[0],g.sc[1]))hit++;
      if(g.sc[0]!=g.sc[1]){
        nd++;
      if(m.fav.f(g.sc[0],g.sc[1]))fv++}
    }
    }
  }
    );
  $("topp").innerHTML=`<h3>AUDITORÍA · QUÉ HABRÍA DICHO EL MODELO ANTES DE LOS JUEGOS</h3><div style="font-size:13px">Pick del modelo: <b>${hit}/${gs.length}</b> ✓ · Favorito acertó en los partidos sin empate: <b>${fv}/${nd}</b></div><div style="font-size:12px;color:var(--mut);margin-top:6px">Solo con datos de la temporada pasada (sin la tabla 2026-27). Muestra pequeña. Toca un partido para ver ✓/✗ por mercado.</div>`}
}
  $("games").innerHTML=gs.length?gs.map(tile).join(""):`<div class="panel" style="grid-column:1/-1"><h3>SIN PARTIDOS ESTE DÍA</h3><div style="font-size:13px;line-height:1.6">Hoy no hay partidos de ${COMPS[CP].n}. Elige otro día arriba.</div></div>`;
  $("sim").innerHTML=tile(SIMS[CP]);
  const fl=NW.filter(x=>TM[x.t]&&TM[x.t].comps.includes(CP));
  $("feed").innerHTML=fl.length?fl.map(x=>`<div class="feed"><div>▼ <b>${x.t}</b> · ${x.n}<small>${x.h} · ${x.d} · afecta ${x.r=="gf"?"ataque":"defensa"}</small></div><select data-n="${x.id}"><option value="0" ${x.st==0?"selected":""}>Disponible</option><option value=".5" ${x.st==.5?"selected":""}>Duda</option><option value="1" ${x.st==1?"selected":""}>Fuera</option></select><input type="number" step="0.01" data-ni="${x.id}" value="${x.i}" title="goles/juego"></div>`).join(""):'<div style="font-size:13px;color:var(--mut)">Sin bajas registradas para este torneo.</div>';
  const ts=Object.values(TM).filter(t=>t.comps.includes(CP)).sort((a,b)=>a.n.localeCompare(b.n));
  $("tbl").innerHTML=`<tr><th>EQUIPO</th><th>GF/J</th><th>GC/J</th><th>PYTH</th></tr>`+ts.map(t=>{
    const b=base(t.c,true),p=Math.pow(b.rs,E)/(Math.pow(b.rs,E)+Math.pow(b.ra,E));
    return `<tr><td>${t.c} <span style="color:var(--mut);font-size:11px">${t.n}</span>${t.fl&&!ed[t.c]?`<span class="tag">${
    FL[t.fl]}
  }
  </span>`:""}</td><td><input type="number" step="0.01" data-e="${t.c}" data-f="rs" value="${b.rs.toFixed(2)}"></td><td><input type="number" step="0.01" data-e="${t.c}" data-f="ra" value="${b.ra.toFixed(2)}"></td><td>${(p*100).toFixed(1)}%</td></tr>`}
}
).join("")}
}
$("sh").onchange=()=>{
  SIMS[CP].h=$("sh").value;
draw()}
}
;
$("sa").onchange=()=>{
  SIMS[CP].a=$("sa").value;
draw()}
}
;
document.addEventListener("click",e=>{
  const tl=e.target.closest("[data-open]");
  if(tl){
    openGame(tl.dataset.open);
  return}
}
  if(e.target.id==="skip"){
    showRes(1);
  return}
}
  if(e.target.id==="ovx"||e.target.id==="ov"){
    closeGame();
  return}
}
  const lt=e.target.closest("[data-c]");
  if(lt){
    enter(lt.dataset.c);
  return}
}
  if(e.target.id==="back"){
    CP=null;
    theme(null);
    $("lgv").classList.add("hide");
    $("home").classList.remove("hide");
  return}
}
  const d=e.target.dataset.d;
  if(d!=null){
    day=+d;
  draw()}
}
  const t=e.target.dataset.t;
  if(t&&e.target.closest("#nav")){
    [...$("nav").children].forEach(b=>b.classList.toggle("a",b===e.target));
  ["g","s","n","e"].forEach(x=>$("t"+x).classList.toggle("hide",x!==t))}
}
}
}
);
document.addEventListener("change",e=>{
  const i=e.target,ds=i.dataset;
  if(ds.o){
    SO[ds.o]=i.value.trim();
  AVX.setOdd(ds.o,SO[ds.o])}
}
  else if(ds.n)NW.find(x=>x.id===ds.n).st=parseFloat(i.value);
  else if(ds.ni){
    const v=parseFloat(i.value);
  if(!isNaN(v))NW.find(x=>x.id===ds.ni).i=v}
}
  else if(ds.e){
    const v=parseFloat(i.value);
    if(!isNaN(v)){
      (ed[ds.e]=ed[ds.e]||{
      rs:base(ds.e,true).rs,ra:base(ds.e,true).ra}
    }
    )[ds.f]=v}
  }
  }
}
  else return;
  const y=window.scrollY,os=$("ov").scrollTop;
  draw();
  window.scrollTo(0,y);
  if(OPEN&&!$("res").classList.contains("hide")){
    showRes();
  $("ov").scrollTop=os}
}
}
}
);
let hi=0;
function hl(){
  [...$("tiles").children].forEach((b,i)=>b.classList.toggle("sel",i==hi));
  $("tiles").children[hi].scrollIntoView({
  inline:"center",block:"nearest",behavior:"smooth"}
}
)}
}
let buf="";
const CODE="[REDACTED_PIN]",dots=[...document.querySelectorAll("#dots i")],msg=$("msg"),pad=$("pad");
["1","2","3","4","5","6","7","8","9","","0","⌫"].forEach(k=>{
  const b=document.createElement("button");
  b.textContent=k;
  if(!k)b.style.visibility="hidden";
  b.onclick=()=>key(k);
pad.appendChild(b)}
}
);
function key(k){
  if(k==="⌫")buf=buf.slice(0,-1);
  else if(/\d/.test(k)&&buf.length<4)buf+=k;
  dots.forEach((d,i)=>d.classList.toggle("on",i<buf.length));
  if(buf.length===4){
    if(buf===CODE){
      msg.textContent="ACCESO CONCEDIDO";
      setTimeout(()=>{
        $("lock").classList.add("hide");
        $("app").classList.remove("hide");
      drawHome()}
    }
    ,500)}
  }
    else{
      msg.textContent="CÓDIGO INCORRECTO";
      const l=$("lock");
      l.classList.add("shake");
      setTimeout(()=>{
        l.classList.remove("shake");
        buf="";
        dots.forEach(d=>d.classList.remove("on"));
      msg.textContent="INGRESA CÓDIGO DE ACCESO"}
    }
    ,500)}
  }
  }
}
}
}
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&OPEN){
    closeGame();
  return}
}
  if(!$("lock").classList.contains("hide")){
    if(e.key==="Backspace")key("⌫");
    else if(/^\d$/.test(e.key))key(e.key);
  return}
}
  if(!CP&&!$("home").classList.contains("hide")){
    if(e.key==="ArrowRight"){
      hi=Math.min(3,hi+1);
    hl()}
  }
    else if(e.key==="ArrowLeft"){
      hi=Math.max(0,hi-1);
    hl()}
  }
  else if(e.key==="Enter")enter(CK[hi])}
}
}
}
);
AVX.on(()=>{
  const y=window.scrollY,os=$("ov").scrollTop;
  try{
  draw()}
}
  catch(e){
  }
}
  window.scrollTo(0,y);
  if(OPEN&&!$("res").classList.contains("hide")){
    showRes();
  $("ov").scrollTop=os}
}
}
}
);
const PXIDS=new Set(["h","a","dc1x","dcx2","ov","un","o15","u35","plf","pld","by","bn","dco15"]);
function PXG(){
  if(!CP||!DD[CP][day])return null;
  const lab=DD[CP][day][0].replace(/^Hoy · /,"");
  if(/Auditor|Resultado/i.test(lab))return null;
  const gs=CK.flatMap(c=>DD[c].filter(d=>d[0].replace(/^Hoy · /,"")===lab).flatMap(d=>d[1].filter(g=>!g.aud)));
  if(!gs.length)return null;
  return{
  gs,dn:/^Dom/.test(lab)?"DEL DOMINGO":/^Sáb/.test(lab)?"DEL SÁBADO":"DEL DÍA",scope:"TODAS LAS LIGAS"}
}
}
}
const PXM=g=>model(g.h,g.a,g.cp,false),PXN=g=>(TM[g.h]?TM[g.h].n:g.h)+" vs "+(TM[g.a]?TM[g.a].n:g.a),PXT=g=>COMPS[g.cp].n+(g.t?" · "+g.t:"");
/* ===== PICK DEL DIA + PARLAY DEL DIA (AZTECA VET) ===== */
const amer=d=>d>=2?"+"+Math.round((d-1)*100):"-"+Math.round(100/(d-1));
function PXL(){
  const r=PXG();
  if(!r)return null;
  return r.gs.map(g=>{
    const m=PXM(g),b=bestOf(g,m),pk=b?b.o:(m.cp||m.pick);
    return{
    g,m,b,pk,nob:!b&&NOB(g)}
  }
  }
}
)}
}
function PXlegs(L){
  return L.filter(z=>!z.nob).map(z=>{
    let o=z.b?z.b.o:null;
    if(!o){
      const c=z.m.O.filter(x=>(PXIDS.has(x.id)||/^cb_/.test(x.id))&&x.p>=.60&&x.p<=.80).sort((x,y)=>y.p-x.p);
    o=c[0]}
  }
    if(!o||o.p<.60||o.p>.80)return null;
    const k=KEY(z.g)+"|"+o.id,d=dec(SO[k]);
    return{
    g:z.g,o,k,real:!!d,d:d||1/(o.p*(/^cb_|^dco/.test(o.id)?1.10:1.05))}
  }
  }
}
).filter(Boolean).sort((a,b)=>b.o.p-a.o.p).slice(0,5)}
}
const plOdds=L=>({
p:L.reduce((a,z)=>a*z.o.p,1),d:L.reduce((a,z)=>a*z.d,1)}
}
);
let PLL=[];
function PDX(){
  const box=$("pdx");
  if(!box)return;
  const r=PXG(),L=r&&PXL();
  if(!r||!L||!L.length){
    box.innerHTML="";
  return}
}
  L.forEach(z=>z.s=z.nob?-1:z.b?2+z.pk.p:z.pk.p<.55?-.5:z.pk.p>.72?.72-2*(z.pk.p-.72):z.pk.p);
  const P=[...L].sort((a,b)=>b.s-a.s)[0],legs=PXlegs(L);
  const plb=legs.length>=3?`<button class="plb" id="plopen"><span>🎯 PARLAY ${r.dn}</span><small>3 selecciones · ver ▸</small></button>`:"";
  const pdd=P.s>=0?`<div class="pdd" data-open="${P.g.k}"><div class="pdh">★ PICK DEL DÍA${r.scope?" · "+r.scope:""}</div><div class="pdm">${PXN(P.g)}<small>${PXT(P.g)}</small></div><div class="pdp"><b>${P.pk.l}</b><span>${pc(P.pk.p)}</span></div>
  <div class="pdw">${P.b?`El más seguro de los picks con valor: EV +${
  (P.b.ev*100).toFixed(0)}
}
  % a ${
  P.b.d.toFixed(2)}
}
  .`:`El más probable de ${
  L.length>1?"los "+L.length+" partidos":"la jornada"}
}
  entre los que pagan decente (los favoritos de más de 72% casi no pagan). Tiene valor si tu casa paga ${
  (1.04/P.pk.p).toFixed(2)}
}
  o más;
  escribe las cuotas y el modelo elige el más seguro entre los que sí tienen valor.`}</div><div class="pdg">ANALIZAR ▸</div></div>`
  :`<div class="pdd off"><div class="pdh">★ PICK DEL DÍA</div><div class="pdw" style="font-size:13px">${L.some(z=>z.s===-1)&&!L.some(z=>z.s===-.5)?"Ningún pick de este día tiene valor con las cuotas que escribiste.":"Ningún partido de este día llega a 55% de probabilidad. Mejor no forzar una apuesta: revisa otro día."}</div></div>`;
box.innerHTML=plb+pdd}
}
function openParlay(){
  const r=PXG(),L=r&&PXL();
  if(!L)return;
  const all=PXlegs(L);
  PLL=all.slice(0,3);
  const a=plOdds(PLL),b5=plOdds(all),on=PLL.length&&PLL.every(z=>AVX.inSlip.has(z.k));
  const leg=(z,i)=>`<div class="plg" data-open="${z.g.k}"><span class="n">${i+1}</span><div class="c"><b>${z.o.l}</b><small>${PXN(z.g)} · ${PXT(z.g)}</small></div><div class="r"><b>${pc(z.o.p)}</b><small>${z.real?"":"≈ "}${z.d.toFixed(2)}</small></div></div>`;
  $("plv").innerHTML=`<div class="plin"><div class="plhd"><b>🎯 PARLAY ${r.dn}</b><button id="plx" aria-label="Cerrar">✕</button></div>
 ${PLL.length<3?`<div class="pdw" style="color:var(--mut)">Hoy no hay 3 apuestas entre 60% y 80% de probabilidad. Mejor no armar parlay este día.</div>`:`
 <div class="plsub">Las 3 apuestas más seguras de ${
  L.length}
}
  partidos${
  r.scope?" ("+r.scope.toLowerCase()+")":""}
}
  , entre 60% y 80%: los favoritos de más de 80% casi no suben la cuota</div>${
  PLL.map(leg).join("")}
}
  <div class="pltot"><div><small>CUOTA APROXIMADA</small><b>${
  a.d.toFixed(2)}
}
  <span>(${
  amer(a.d)}
}
  )</span></b></div><div style="text-align:right"><small>PROBABILIDAD</small><b>${
  pc(a.p)}
}
  </b></div></div>
 <div class="plw">Apuesta sugerida: <b>5% del bank</b>. Si pega, ganas <b>+${
  (5*(a.d-1)).toFixed(1)}
}
  %</b> del bank.</div>
 <button class="plbtn ${on?"on":""}" id="pladd">${
  on?"✓ EN EL BOLETO":"+ AGREGAR LOS 3 AL BOLETO"}
}
  </button>
 ${
  all.length>=5?`<div class="plalt"><h4>TOP 5 DEL DÍA · OTRAS DOS OPCIONES</h4>${all.slice(3).map((z,i)=>leg(z,i+3)).join("")}<div class="plw">Parlay de las 5: cuota ≈ <b>${b5.d.toFixed(2)}</b> (${amer(b5.d)}) · probabilidad ${pc(b5.p)}. Paga más, pero falla mucho más seguido.</div></div>`:""}
}
  <div class="plnote">${
  PLL.every(z=>z.real)?"Cuota calculada con los momios que escribiste.":"Cuota aproximada (≈): momio justo del modelo menos el margen típico de la casa (5% por selección, 10% en combinadas). Escribe los momios reales en cada partido y se calcula exacta."}
}
  Toca una selección para ver su análisis.</div>`}</div>`;
$("plv").classList.remove("hide")}
}
document.addEventListener("click",e=>{
  const t=e.target;
  if(t.closest("#plopen")){
    openParlay();
  return}
}
  if(t.closest("#plx")||t.id==="plv"){
    $("plv").classList.add("hide");
  return}
}
  if(t.closest("#pladd")){
    PLL.forEach(z=>{
      AVX.pk[z.k]=PK(z.g,z.o,z.real?z.d:null);
    if(!AVX.inSlip.has(z.k))AVX.add(z.k)}
  }
    );
    const b=$("pladd");
    b.classList.add("on");
    b.textContent="✓ EN EL BOLETO";
  return}
}
if(t.closest("#plv .plg"))$("plv").classList.add("hide")}
}
);
const _drawPX=draw;
draw=function(){
  _drawPX.apply(this,arguments);
  try{
  PDX()}
}
  catch(err){
  }
}
}
}
;
/* ===== script block boundary ===== */

(function(){
  var s=window.__START||'MX';
  document.getElementById('app').classList.remove('hide');
  window.theme=function(){
  }
}
  ;
  drawHome();
  enter(s);
  document.addEventListener('click',function(e){
    if(e.target.id==='back'){
      e.stopImmediatePropagation();
    parent.postMessage('home','*')}
  }
  }
}
  ,true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      var o=document.getElementById('ov');
    if(o&&o.classList.contains('hide'))parent.postMessage('home','*')}
  }
  }
}
  ,true);
}
}
)()