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


const T={
ANA:["Anaheim Ducks",273,288],BOS:["Boston Bruins",272,250],BUF:["Buffalo Sabres",288,241],CGY:["Calgary Flames",208,255],CAR:["Carolina Hurricanes",296,240],CHI:["Chicago Blackhawks",213,275],COL:["Colorado Avalanche",298,197],CBJ:["Columbus Blue Jackets",253,253],DAL:["Dallas Stars",279,226],DET:["Detroit Red Wings",241,258],EDM:["Edmonton Oilers",282,269],FLA:["Florida Panthers",246,274],LA:["Los Angeles Kings",225,247],MIN:["Minnesota Wild",262,227],MTL:["Montréal Canadiens",283,256],NSH:["Nashville Predators",241,261],NJ:["New Jersey Devils",230,254],NYI:["New York Islanders",233,241],NYR:["New York Rangers",238,250],OTT:["Ottawa Senators",278,246],PHI:["Philadelphia Flyers",250,243],PIT:["Pittsburgh Penguins",288,261],SJ:["San Jose Sharks",251,292],SEA:["Seattle Kraken",226,263],STL:["St. Louis Blues",0,0],TB:["Tampa Bay Lightning",286,229],TOR:["Toronto Maple Leafs",253,295],UTA:["Utah Mammoth",268,240],VAN:["Vancouver Canucks",216,316],VGK:["Vegas Golden Knights",265,250],WSH:["Washington Capitals",263,244],WPG:["Winnipeg Jets",231,260]}
}
;
const R=[["SJ","LA",5,4],["VAN","CGY",4,1],["DET","WPG",2,3],["NYR","UTA",4,2],["SEA","CGY",6,1],["ANA","FLA",3,2],["VAN","VGK",2,3],["TB","PHI",4,1],["PIT","WPG",2,3],["BOS","OTT",1,4],["DAL","SJ",5,0],["TOR","NSH",5,4],["NJ","UTA",3,5],["MTL","CAR",4,6],["DET","OTT",5,3],["BUF","MIN",3,2],["NYR","NYI",5,2],["CHI","STL",4,2],["SEA","VGK",2,6],["LA","FLA",1,2],["DAL","STL",0,4],["COL","STL",6,1],["FLA","SJ",3,4],["WSH","PIT",5,3],["WPG","COL",3,2],["ANA","EDM",2,5],["MTL","NSH",2,5],["BUF","DAL",0,4],["OTT","PHI",2,1],["BOS","UTA",6,1],["CAR","VAN",7,2],["TB","MIN",3,2],["NYI","CHI",4,1],["STL","SJ",2,3],["CGY","COL",3,7],["VGK","TOR",4,3],["WSH","NYR",3,1],["CBJ","PIT",3,2],["DET","SEA",3,6],["WPG","ANA",1,5],["BOS","PHI",5,1],["NJ","VAN",4,1],["SJ","EDM",1,3],["FLA","MIN",1,4],["BUF","UTA",1,4],["MTL","DET",1,0],["OTT","NSH",3,2],["PIT","DAL",2,1],["CHI","CAR",2,5],["STL","CBJ",5,3],["COL","TOR",3,6],["NYI","TB",3,5],["CGY","ANA",2,4],["VGK","LA",2,1],["WSH","SEA",3,5],["NYR","VAN",6,2],["PHI","CAR",1,4],["DET","NJ",4,5],["CBJ","FLA",3,7],["MTL","BUF",4,3],["CAR","WSH",4,2],["PHI","SEA",2,3],["NYR","TB",4,1],["OTT","STL",2,7],["NYI","VAN",3,2],["CHI","PIT",5,3],["WPG","MIN",5,2],["DAL","COL",2,3],["NSH","VGK",2,5],["UTA","TOR",5,4],["ANA","CGY",2,4],["LA","EDM",1,4],["SJ","BOS",3,6],["WSH","MTL",5,4],["COL","DAL",2,3],["TOR","BUF",4,5],["OTT","NYI",2,1],["TB","SEA",4,3],["FLA","VAN",3,2],["NJ","NYR",7,1],["DET","PHI",2,1],["CHI","WPG",4,3],["NSH","SJ",2,3],["MIN","STL",5,4],["EDM","UTA",2,4],["VGK","CGY",6,2],["COL","PIT",5,2],["ANA","BOS",2,4],["WSH","NJ",4,2],["WPG","CAR",2,3],["TB","VAN",4,2],["FLA","SEA",8,3],["TOR","NYI",1,4],["MTL","BUF",4,3],["DET","SJ",4,3],["PHI","OTT",3,1],["CBJ","NYR",1,0],["CHI","DAL",0,4],["NSH","STL",5,2],["LA","BOS",1,4],["UTA","EDM",2,6],["VGK","PIT",6,2],["MIN","CBJ",2,1],["CGY","CAR",3,2],["NYR","ANA",5,2],["PHI","COL",3,2],["TOR","SJ",3,1],["UTA","PIT",5,4],["MTL","SJ",3,4],["NJ","COL",4,3],["NYI","ANA",3,2],["WSH","LA",2,5],["CBJ","TOR",2,6],["STL","WPG",2,1],["DAL","BOS",3,2],["EDM","MIN",4,3],["SEA","DET",4,3],["VAN","CAR",3,6],["VGK","TB",2,6],["OTT","FLA",5,1],["BUF","PHI",1,3],["BOS","NSH",6,0],["TOR","NYR",5,4],["OTT","SJ",2,6],["NJ","ANA",4,1],["PIT","FLA",4,0],["NYI","LA",2,3],["STL","VGK",6,2],["DAL","WPG",3,2],["CGY","MIN",2,1],["EDM","CAR",6,5],["SEA","UTA",5,3],["VAN","DET",2,5],["CHI","MTL",1,4],["COL","TB",6,3],["PHI","ANA",4,5],["NJ","LA",3,1],["BOS","SJ",6,4],["OTT","NYR",7,4],["PIT","NSH",3,2],["WSH","BUF",4,3],["CBJ","VGK",2,1],["STL","CAR",0,4],["EDM","TOR",2,7],["UTA","TB",5,4],["CGY","DET",4,1],["SEA","MIN",1,5],["CHI","FLA",2,3],["DAL","NYI",6,3],["WPG","MTL",1,2],["NSH","COL",6,2],["VAN","MIN",2,4],["NYR","LA",3,6],["CGY","TOR",5,2],["EDM","DET",3,4],["PHI","CBJ",3,4],["CAR","BOS",2,1],["CHI","LA",2,1],["STL","MTL",0,2],["NSH","NYI",3,4],["DAL","NJ",1,5],["WPG","FLA",1,5],["UTA","MIN",1,3],["VGK","OTT",4,1],["ANA","VAN",5,6],["SJ","BUF",0,2],["WSH","PHI",5,2],["EDM","CGY",4,0],["COL","NJ",5,2],["SEA","TOR",5,4],["PIT","UTA",3,4],["TB","WPG",6,4],["CAR","CBJ",3,2],["DET","CHI",4,1],["STL","BOS",4,1],["NSH","WSH",3,4],["DAL","MTL",2,5],["MIN","NYI",3,4],["ANA","BUF",6,7],["LA","OTT",6,5],["SJ","VAN",3,2],["VGK","NJ",2,5],["FLA","WPG",5,2],["CGY","SEA",6,2],["BOS","CHI",5,4],["DET","STL",4,5],["NYI","EDM",0,4],["NSH","TB",5,4],["SJ","OTT",1,5],["LA","BUF",2,3],["MTL","PIT",5,4],["VAN","TOR",2,4],["DAL","CBJ",3,1],["COL","CGY",5,2],["BOS","VGK",3,2],["FLA","DET",3,5],["CHI","COL",2,5],["SJ","CGY",1,2],["PIT","VGK",2,3],["TB","DET",4,2],["NYR","STL",3,1],["TOR","UTA",2,3],["PHI","MIN",2,4],["WSH","DAL",5,6],["MTL","WPG",4,5],["CBJ","COL",7,2],["NJ","EDM",4,3],["NSH","CAR",4,1],["VAN","ANA",4,5],["BUF","OTT",1,2],["FLA","CHI",5,3],["LA","SJ",7,2],["SEA","CGY",2,1],["PIT","BOS",2,6],["CBJ","DAL",2,1],["DET","VGK",1,2],["TB","CHI",4,1],["NJ","STL",5,4],["MTL","UTA",5,4],["NYI","CAR",3,5],["NYR","PHI",3,2],["WPG","VAN",6,2],["EDM","ANA",4,5],["COL","NSH",2,3]];
const AUD=[["PIT","BOS",2,6],["CBJ","DAL",2,1],["DET","VGK",1,2],["TB","CHI",4,1],["NJ","STL",5,4],["MTL","UTA",5,4],["NYI","CAR",3,5],["NYR","PHI",3,2],["WPG","VAN",6,2],["EDM","ANA",4,5],["COL","NSH",2,3]];
// Noticias: id, equipo, jugador, rol (gf=ataque, ga=defensa/portero), impacto goles/juego, estado (0 disp, .5 dudoso, 1 fuera), titular, fecha
const N=[["hag", "BOS", "James Hagens (C)", "gf", 0.06, 0.5, "Salió a inicios del 3er periodo el jue 5 en PIT tras un cross-check en la espalda baja y no volvió; sin parte (Boston.com, 5 nov)", "6 nov"], ["fle", "WPG", "Haydn Fleury (D)", "ga", 0.03, 0.5, "Bloqueó un tiro con la mano en el 3er periodo el jue 5 vs VAN y no regresó; \"a esperar\" (NHL.com, 5 nov)", "6 nov"], ["gib", "DET", "John Gibson (G)", "ga", 0.3, 1, "Abre el suplente Daniil Tarasov en lugar de John Gibson (tren inferior desde el 3 nov, day-to-day; Tarasov jugó el 5 vs VGK). DET recibe a COL el sáb 7 (NHL.com Status Report, 5 nov)", "6 nov"], ["mrc", "NSH", "Jonathan Marchessault (RW)", "gf", 0.06, 0.5, "Tren inferior; se perdió el 3 nov y no se esperaba que jugara el 5 en COL (NHL.com, sin confirmar). NSH juega el sáb 7 en STL", "6 nov"], ["hei", "DAL", "Miro Heiskanen (D)", "ga", 0.1, 0.5, "Tren superior; no jugó el jue 5 en CBJ. \"Day to day de verdad\", probable regreso el sáb 7 en SJ (NHL.com/RotoWire, 5 nov)", "6 nov"], ["kan", "CHI", "Patrick Kane (RW)", "gf", 0.1, 1, "Tren superior desde el 2 nov; no jugó el 5 en TB. Blashill: fuera \"al menos los próximos juegos\"; Dobber estima regreso ~12 nov vs BUF (sin confirmar)", "6 nov"], ["hub", "CGY", "Jonathan Huberdeau (LW)", "gf", 0.08, 1, "IR (cadera); no hay confirmación de que volviera el lun 2 en SJ (Flames ganaron 2-1)", "3 nov"], ["kas", "DET", "Marco Kasper (C)", "gf", 0.05, 1, "Fuera de la alineación; se pierde el juego de hoy en FLA (TheSpread, 2 nov)", "2 nov"], ["app", "DET", "Mason Appleton (RW)", "gf", 0.03, 1, "Fuera de la alineación; se pierde el juego de hoy en FLA (TheSpread, 2 nov)", "2 nov"], ["how", "EDM", "Isaac Howard (LW)", "gf", 0.04, 1, "Rodilla (rodillazo de Heineman el 31 oct); semana a semana (DailyFaceoff, 4 nov)", "5 nov"], ["pry", "STL", "Colton Parayko (D)", "ga", 0.06, 0.5, "Tren superior; day-to-day, no jugó el sáb 31 en DET (NHL.com)", "1 nov"], ["cer", "TB", "Erik Cernak (D)", "ga", 0.04, 0.5, "Day-to-day; no jugó el sáb 31 en NSH (NHL.com)", "1 nov"], ["chy", "VAN", "Filip Chytil (C)", "gf", 0.05, 1, "A la IR (NHL.com, 31 oct)", "1 nov"], ["pul", "NYI", "Ryan Pulock (D)", "ga", 0.05, 1, "Tren superior; fuera 2-4 semanas, igual que Maccelli (DailyFaceoff, 4 nov)", "5 nov"], ["lrk", "DET", "Dylan Larkin (C)", "gf", 0.15, 1, "Suspendido sin sueldo por DET desde el 29 oct tras negarse a jugar; sin traspaso: DET quiere sumar BOS, BUF, LA y MTL a su lista de 10 equipos y el agente se niega (TSN/LeBrun, 4 nov)", "5 nov"], ["bur", "OTT", "Andre Burakovsky (LW)", "gf", 0.04, 1, "Tren inferior desde el 29 en LA; a la IR, fuera 3-4 semanas (TSN, 31 oct)", "1 nov"], ["fog", "OTT", "Warren Foegele (LW)", "gf", 0.03, 1, "Fuera 3-4 semanas, igual que Burakovsky (TSN, 31 oct)", "1 nov"], ["hel2", "BUF", "Konsta Helenius (C)", "gf", 0.03, 1, "Tren superior; fuera sin plazo (DailyFaceoff, 29 oct)", "30 oct"], ["coo", "CGY", "Devin Cooley (G)", "ga", 0.05, 1, "Tren inferior; semana a semana. Dustin Wolf es el titular (DailyFaceoff, 31 oct)", "1 nov"], ["mar2", "TOR", "Kirill Marchenko (RW)", "gf", 0.08, 1, "Tren inferior; a la IR, semana a semana (DailyFaceoff, 29 oct)", "30 oct"], ["man", "COL", "Josh Manson (D)", "ga", 0.04, 1, "Tobillo; fuera unas 8 semanas (NHL.com, 30 oct)", "1 nov"], ["oth", "CGY", "Brennan Othmann (LW)", "gf", 0.03, 0.5, "Tren superior; salió del juego del mié 28 en EDM y no regresó (DailyFaceoff)", "29 oct"], ["ajo", "DET", "Albert Johansson (D)", "ga", 0.03, 1, "Lesión no revelada; sigue fuera hoy ante CHI (DailyFaceoff, 28 oct)", "29 oct"], ["ris", "PHI", "Rasmus Ristolainen (D)", "ga", 0.05, 1, "Tren superior; fuera al menos 2 semanas tras agravar la lesión el sáb 24 (NHL.com, 26 oct)", "27 oct"], ["and", "EDM", "Frederik Andersen (G)", "ga", 0.15, 1, "Lesionado junto con Devon Levi; Tristan Jarry es el titular y se proyecta hoy ante CGY (DailyFaceoff, sin confirmar)", "28 oct"], ["che", "SJ", "Igor Chernyshov (LW)", "gf", 0.04, 1, "Tren superior; semana a semana (DobberHockey, 25 oct)", "26 oct"], ["mrn", "UTA", "John Marino (D)", "ga", 0.05, 1, "Tren superior; pasó de day-to-day a semana a semana (NHL.com, 26 oct)", "27 oct"], ["mcn", "SEA", "Jared McCann (LW)", "gf", 0.12, 1, "A la IR el 25 oct; fuera ~10 semanas por lesión en el tren inferior. Kaapo Kakko sube a la primera línea (NHL.com/ProHockeyRumors/DobberHockey)", "26 oct"], ["des", "WSH", "Vincent Desharnais (D)", "ga", 0.03, 1, "Apendicectomía; fuera 4-6 semanas (NHL.com)", "24 oct"], ["lev", "EDM", "Devon Levi (G)", "ga", 0.1, 1, "A la IR el viernes (lesión no revelada); fuera unas semanas. Subieron a Matt Tomkins (DobberHockey, 25 oct)", "26 oct"], ["ull", "OTT", "Linus Ullmark (G)", "ga", 0.3, 1, "IR (tren inferior, desde el 21 oct); practica con el equipo. Regreso posible el sáb 7 vs UTA, sin confirmar (DailyFaceoff, 4-5 nov)", "6 nov"], ["gus", "MIN", "Filip Gustavsson (G)", "ga", 0.25, 1, "Cadera; abre Jesper Wallstedt (DailyFaceoff/NHL.com, 20 oct)", "22 oct"], ["rus", "PIT", "Bryan Rust (RW)", "gf", 0.08, 1, "Tren inferior (salió el 19 en UTA); será reevaluado en 6 semanas (NHL.com, 22 oct)", "23 oct"], ["bac", "CGY", "Mikael Backlund (C)", "gf", 0.05, 1, "Tren superior; se perdió su 2º juego seguido el 24 (NHL.com)", "25 oct"], ["rit", "NYI", "Brett Ritchie (RW)", "gf", 0.02, 1, "Tren inferior; fuera (NHL.com Islanders, 19 oct)", "22 oct"], ["shs", "NYR", "Igor Shesterkin (G)", "ga", 0.4, 1, "Fuera el resto de la temporada (rodilla); Dylan Garand es el titular", "12 oct"], ["kor", "NYR", "Joonas Korpisalo (G)", "ga", 0.08, 1, "Tren inferior/pie; enviado a AHL Hartford en asignación de acondicionamiento el 4 nov (DailyFaceoff)", "5 nov"], ["bar", "FLA", "Aleksander Barkov (C)", "gf", 0.22, 1, "IR (tren inferior); hasta ~27 nov", "12 oct"], ["mch", "FLA", "Brad Marchand (LW)", "gf", 0.12, 1, "Pierna; volvió a patinar, fuera unas 3 semanas más (~20 nov) (DailyFaceoff, 29 oct)", "30 oct"], ["dem", "MTL", "Ivan Demidov (RW)", "gf", 0.15, 1, "Fractura de tobillo; semana a semana (DailyFaceoff, 5 nov)", "5 nov"], ["mon", "MTL", "Sam Montembeault (G)", "ga", 0.3, 0.5, "IR (tren inferior), ahora day-to-day; Jacob Fowler y Jakub Dobes se reparten la portería (NHL.com, 31 oct)", "1 nov"], ["bar2", "NYI", "Mathew Barzal (C)", "gf", 0.2, 1, "Rodilla (IR); volvió a practicar el mié 4 con jersey de no contacto, sin plazo (DailyFaceoff, 4 nov)", "5 nov"], ["rom", "NYI", "Alexander Romanov (D)", "ga", 0.1, 1, "Ligamento cruzado roto; fuera hasta abril", "12 oct"], ["mor", "WPG", "Josh Morrissey (D)", "ga", 0.12, 1, "Muñeca; en IR desde el 19 oct, semana a semana. Patinó con jersey de no contacto el 5 nov (RotoWire/Yahoo, 5 nov)", "6 nov"], ["hel", "WPG", "Connor Hellebuyck (G)", "ga", 0.35, 1, "Traspasado a NJ el 23 oct por Mercer, Daws, Bjugstad, los derechos de Command y 2 picks (NHL.com). WPG sigue con Skinner/Stevenson; en NJ se espera que Jake Allen pierda minutos", "26 oct"], ["ekl", "OTT", "William Eklund (LW)", "gf", 0.06, 1, "Cirugía de tobillo; fuera 10-12 semanas", "16 oct"], ["sdn", "WSH", "Rasmus Sandin (D)", "ga", 0.06, 1, "Reconstrucción de ligamento cruzado; regreso estimado a finales de diciembre", "12 oct"], ["dub", "WSH", "Pierre-Luc Dubois (C)", "gf", 0.08, 1, "Enfermedad (IR); 5 juegos fuera, podría volver el sáb 24 ante BUF (NHL.com)", "22 oct"], ["dmk", "VAN", "Thatcher Demko (G)", "ga", 0.15, 1, "Cadera; IR hasta al menos el 21 dic (CBS)", "19 oct"], ["sta", "CAR", "Jordan Staal (C)", "gf", 0.05, 1, "Desgarro en la pantorrilla; fuera 1-2 meses", "14 oct"], ["fab", "MIN", "Brock Faber (D)", "ga", 0.1, 1, "Fractura de cráneo; ya superó el protocolo y volverá a patinar en las próximas semanas, sin fecha de regreso (DailyFaceoff, 29 oct)", "30 oct"], ["olo", "VGK", "Victor Olofsson (LW)", "gf", 0.05, 1, "Practica con jersey de no contacto; casi 3 semanas sin jugar (DailyFaceoff, 29 oct)", "30 oct"], ["dom", "TOR", "Max Domi (C)", "gf", 0.05, 1, "Hasta ~21 nov", "12 oct"], ["ter", "ANA", "Troy Terry (RW)", "gf", 0.1, 1, "Cadera; hasta ~21 nov", "12 oct"], ["fia", "LA", "Kevin Fiala (LW)", "gf", 0.1, 1, "Tren inferior; practica con jersey de no contacto, semana a semana (DailyFaceoff, 29 oct)", "30 oct"], ["duc", "DAL", "Matt Duchene (C)", "gf", 0.07, 1, "Abdomen; IR hasta al menos el 12 ene", "13 oct"], ["mat", "OTT", "Nikolas Matinpalo (D)", "ga", 0.03, 1, "Tren superior; hasta ~24 oct", "14 oct"], ["hal", "CAR", "Taylor Hall (LW)", "gf", 0.1, 1, "Tren superior; dejó temprano la práctica matutina del mar 27, semana a semana (NHL.com, 28 oct)", "29 oct"], ["poe", "ANA", "Ryan Poehling (C)", "gf", 0.04, 1, "Esguince del ligamento colateral medial; 6-8 semanas", "14 oct"], ["bck", "DAL", "Oskar Bäck (C)", "gf", 0.03, 1, "Dedo roto; fuera 4-6 semanas (IR)", "16 oct"], ["tav", "TOR", "John Tavares (C)", "gf", 0.12, 0.5, "Pasó de IR a day-to-day y practicó como extremo; podría volver el sáb 7 en MTL si pasa la práctica del viernes (NHL.com Status Report, 5 nov)", "6 nov"], ["nam", "WPG", "Vladislav Namestnikov (C)", "gf", 0.04, 1, "Lesión no revelada en la práctica del 15 oct; fuera semanas", "18 oct"], ["grn", "ANA", "Mikael Granlund (C)", "gf", 0.08, 0.5, "Tren superior; CBS (17 oct) lo pasó a day-to-day", "19 oct"], ["byr", "CHI", "Bowen Byram (D)", "ga", 0.05, 1, "Day-to-day (tren superior); tampoco jugó el 25 vs FLA. Practica con jersey de no contacto y no está en protocolo de conmoción (Blashill vía DobberHockey, 25 oct)", "26 oct"], ["jvr", "PIT", "Trevor van Riemsdyk (D)", "ga", 0.04, 1, "IR (tren inferior); ESPN estima el 22 oct, sin confirmar", "21 oct"], ["sou", "WSH", "Justin Sourdif (C)", "gf", 0.03, 0.5, "Enfermedad; no jugó el 17 ante NJ, day-to-day", "18 oct"], ["bju", "NJ", "Nick Bjugstad (C)", "gf", 0.03, 1, "Pectoral; fuera hasta enero. Traspasado a WPG el 23 oct", "23 oct"], ["gou", "TB", "Yanni Gourde (C)", "gf", 0.04, 1, "Cadera; fuera", "16 oct"], ["dic", "EDM", "Jason Dickinson (C)", "gf", 0.03, 0.5, "Tren inferior (IR desde el 22); podría volver hoy ante CGY tras perderse 6 juegos (NHL.com, 27-28 oct)", "28 oct"], ["xhe", "MTL", "Florian Xhekaj (LW)", "gf", 0.03, 1, "Fuera unas 2 semanas", "16 oct"], ["mth", "MTL", "Mike Matheson (D)", "ga", 0.05, 1, "Tren inferior; fuera unas 2 semanas (NHL.com, 31 oct)", "1 nov"], ["chk", "PIT", "Egor Chinakhov (RW)", "gf", 0.05, 0.5, "Tren inferior (práctica del 15 oct); day-to-day según CBS (17 oct)", "18 oct"], ["spu", "MIN", "Jared Spurgeon (D)", "ga", 0.06, 1, "Lesión no revelada; semana a semana (DailyFaceoff, 29 oct)", "30 oct"], ["nfo", "MIN", "Nick Foligno (RW)", "gf", 0.03, 1, "IR (tren superior); CBS (19 oct): fuera hasta al menos el 29 oct", "20 oct"], ["mcc", "NYI", "Matias Maccelli (LW)", "gf", 0.04, 1, "Tren inferior; fuera 2-4 semanas (DailyFaceoff, 4 nov)", "5 nov"], ["zac", "BOS", "Pavel Zacha (C)", "gf", 0.06, 0.5, "Tren superior; day-to-day (CBS, 18 oct)", "19 oct"], ["hin", "DAL", "Roope Hintz (C)", "gf", 0.1, 0.5, "Lesión no revelada; day-to-day (CBS, 17 oct)", "19 oct"], ["gir", "PIT", "Samuel Girard (D)", "ga", 0.05, 1, "Tren inferior; a la IR (NHL.com, 24 oct)", "25 oct"], ["car", "UTA", "Michael Carcone (LW)", "gf", 0.04, 1, "Tren superior; fuera hasta al menos el 1 nov (CBS, 18 oct)", "19 oct"], ["wot", "VGK", "Parker Wotherspoon (D)", "ga", 0.04, 1, "Tren superior; fuera hasta al menos el 8 nov (CBS, 18 oct)", "19 oct"], ["lhe", "COL", "Zachary L'Heureux (LW)", "gf", 0.03, 1, "Tren superior; semana a semana (NHL.com)", "22 oct"], ["fab2", "CBJ", "Dante Fabbro (D)", "ga", 0.04, 1, "Mano (IR); CBS: fuera hasta al menos el 3 nov", "20 oct"], ["byf", "LA", "Quinton Byfield (C)", "gf", 0.08, 0.5, "Volvió a patinar el 25 con jersey de no contacto y trabajó en el 1er powerplay; duda para hoy en NYR (LA Kings Insider)", "26 oct"], ["wen", "SJ", "Alexander Wennberg (C)", "gf", 0.04, 1, "Tren superior; semana a semana (NHL.com, 22 oct)", "23 oct"], ["kin", "PIT", "Ben Kindel (C)", "gf", 0.04, 0.5, "Volvió a practicar el mar 27 tras el síncope en el avión del 20; podría volver el jue 29 vs UTA (NHL.com, 27 oct)", "28 oct"], ["hym", "EDM", "Zach Hyman (LW)", "gf", 0.1, 1, "En IR (tren superior/cuello); fuera al menos 3 juegos más (NHL.com/DailyFaceoff, 28 oct)", "29 oct"], ["cap", "DAL", "Kyle Capobianco (D)", "ga", 0.04, 1, "Tren inferior; fuera unas 4 semanas (DailyFaceoff, 29 oct)", "30 oct"], ["sod", "PIT", "Elmer Soderblom (RW)", "gf", 0.03, 1, "Tren superior; a la IR, fuera al menos una semana (DailyFaceoff, 28 oct)", "29 oct"]].map(x=>({
id:x[0],t:x[1],n:x[2],r:x[3],i:x[4],st:x[5],h:x[6],d:x[7]}
}
));
const D=[["Hoy · Vie 6 nov", [["BUF", "CBJ", "6:00 PM"], ["CGY", "ANA", "7:00 PM"], ["MIN", "SJ", "7:00 PM"]]],
["Sáb 7 nov", [["WSH", "FLA", "11:30 AM"], ["NSH", "STL", "12:00 PM"], ["SEA", "NYR", "4:00 PM"], ["OTT", "UTA", "6:00 PM"], ["TOR", "MTL", "6:00 PM"], ["NYI", "NJ", "6:00 PM"], ["DAL", "SJ", "7:00 PM"], ["CAR", "CHI", "7:00 PM"], ["MIN", "TB", "7:00 PM"], ["LA", "PIT", "8:00 PM"], ["COL", "DET", "8:00 PM"], ["EDM", "VAN", "9:00 PM"]]],
["Dom 8 nov", [["BOS", "FLA", "12:00 PM"], ["BUF", "VGK", "2:30 PM"], ["WPG", "TB", "5:00 PM"], ["TOR", "NJ", "6:00 PM"], ["CGY", "PHI", "6:00 PM"], ["ANA", "PIT", "7:00 PM"]]],
["Lun 9 nov", [["EDM", "NYR", "7:00 PM"], ["VAN", "PHI", "8:30 PM"], ["SJ", "NYI", "9:00 PM"]]],
["Mar 10 nov", [["TOR", "COL", "6:00 PM"], ["MTL", "MIN", "6:00 PM"], ["OTT", "WSH", "6:00 PM"], ["WPG", "NJ", "6:00 PM"], ["CBJ", "FLA", "6:30 PM"], ["STL", "DET", "7:00 PM"], ["LA", "NSH", "9:00 PM"]]],
["Mié 11 nov", [["BUF", "TB", "6:00 PM"], ["CGY", "NYR", "6:30 PM"], ["EDM", "PHI", "8:00 PM"], ["VGK", "UTA", "8:30 PM"], ["ANA", "NSH", "9:00 PM"], ["SJ", "PIT", "9:00 PM"]]],
["Jue 12 nov", [["SEA", "CAR", "11:00 AM · Helsinki"], ["OTT", "COL", "6:00 PM"], ["NJ", "WSH", "6:00 PM"], ["BOS", "MTL", "6:00 PM"], ["TOR", "MIN", "6:00 PM"], ["CBJ", "TB", "6:00 PM"], ["FLA", "DET", "6:30 PM"], ["CHI", "BUF", "7:00 PM"], ["DAL", "WPG", "7:00 PM"], ["UTA", "STL", "8:00 PM"], ["LA", "NYI", "9:00 PM"]]],
["Vie 13 nov", [["VAN", "NYR", "8:00 PM"], ["VGK", "NSH", "9:00 PM"]]],
["Auditoría 5 nov", [["PIT", "BOS", "6:00 PM", null, [2, 6]], ["CBJ", "DAL", "6:00 PM · SO", null, [2, 1]], ["DET", "VGK", "6:00 PM", null, [1, 2]], ["TB", "CHI", "6:00 PM", null, [4, 1]], ["NJ", "STL", "6:00 PM · OT", null, [5, 4]], ["MTL", "UTA", "6:00 PM · OT", null, [5, 4]], ["NYI", "CAR", "6:00 PM", null, [3, 5]], ["NYR", "PHI", "6:00 PM", null, [3, 2]], ["WPG", "VAN", "6:00 PM", null, [6, 2]], ["EDM", "ANA", "7:00 PM", null, [4, 5]], ["COL", "NSH", "8:30 PM · OT", null, [2, 3]]]]]
.map((d,i)=>[d[0],d[1].map((g,j)=>({
h:g[0],a:g[1],t:g[2],ref:g[3],sc:g[4],aud:!!g[4],k:i+"-"+j,dl:d[0].replace(/^Hoy · /,"")}
}
))]);
const E=2.15,HFA=.525,K=15,SHR=.85,NG=22,ed={
}
}
,SO=AVX.odds,SIM={
k:"sim",h:"COL",a:"CAR"}
}
;
let S,SA,day=0;
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
const dec=s=>{
  const v=parseFloat(String(s).replace(",","."));
  if(isNaN(v))return null;
  if(Math.abs(v)>=100)return v>0?1+v/100:1+100/-v;
return v>1?v:null}
}
;
function build(rows){
  const c={
  }
}
  ;
  Object.keys(T).forEach(k=>c[k]={
  n:0,f:0,a:0}
}
  );
  rows.forEach(([h,a,x,y])=>{
    c[h].n++;
    c[h].f+=x;
    c[h].a+=y;
    c[a].n++;
    c[a].f+=y;
  c[a].a+=x}
}
  );
  const o={
  }
}
  ;
  let sum=0;
  Object.keys(T).forEach(k=>{
    const e=ed[k]||{
    }
  }
    ,gf=e.f??T[k][1],ga=e.a??T[k][2],kn=gf>0&&ga>0,pf=(kn?gf:250)/82,pa=(kn?ga:250)/82,n=c[k].n,w=n/(n+K);
    o[k]={
    rs:pf*(1-w)+(n?c[k].f/n:0)*w,ra:pa*(1-w)+(n?c[k].a/n:0)*w,n,kn,gf:kn?gf:"",ga:kn?ga:""}
  }
    ;
  sum+=o[k].rs}
}
  );
  o.LG=sum/32;
return o}
}
function rebuild(){
  S=build(R.concat(AUD));
SA=build(R)}
}
/* forma reciente: los ultimos 5 juegos pesan 30% cuando el equipo ya lleva 7 o mas */
const FORMW=.3,_b0=build;
build=function(rows){
  const o=_b0(rows),L={
  }
}
  ;
  rows.forEach(([h,a,x,y])=>{
    (L[h]=L[h]||[]).push([x,y]);
  (L[a]=L[a]||[]).push([y,x])}
}
  );
  Object.keys(L).forEach(k=>{
    const g=L[k];
    if(!o[k]||g.length<7)return;
    const r=g.slice(-5),f=r.reduce((s,z)=>s+z[0],0)/5,a=r.reduce((s,z)=>s+z[1],0)/5;
    o[k].rs=o[k].rs*(1-FORMW)+f*FORMW;
    o[k].ra=o[k].ra*(1-FORMW)+a*FORMW;
  o[k].f5=[f,a]}
}
  );
return o}
}
;
/* consistencia: % de juegos del equipo que superaron la linea */
function OVR(t,L){
  const g=R.concat(AUD).filter(z=>z[0]===t||z[1]===t);
  if(g.length<3)return null;
return g.filter(z=>z[2]+z[3]>L).length/g.length}
}
function eff(t,SS,nn){
  const s=SS[t];
  let rs=s.rs,ra=s.ra;
  const nt=[];
  if(!nn)N.forEach(x=>{
    if(x.t===t&&x.st>0){
      const d=x.i*x.st;
      if(x.r==="gf")rs-=d;
      else ra+=d;
    nt.push([x.n,x.st<1])}
  }
  }
}
  );
  return{
  rs:Math.max(rs,1.5),ra:Math.max(ra,1.5),nt}
}
}
}
function model0(h,a,SS,nn){
  const H=eff(h,SS,nn),A=eff(a,SS,nn),LG=SS.LG,py=t=>Math.pow(t.rs,E)/(Math.pow(t.rs,E)+Math.pow(t.ra,E));
  const x=py(H),y=py(A),pn=(x-x*y)/(x+y-2*x*y),o=pn/(1-pn)*(HFA/(1-HFA)),pH=.5+SHR*(o/(1+o)-.5);
  const lh=H.rs*A.ra/LG,la=A.rs*H.ra/LG,tot=lh+la,ph=pois(lh),pa=pois(la);
  let w=0,d=0,l=0,m2h=0,m2a=0;
  for(let i=0;
  i<NG;
  i++)for(let j=0;
  j<NG;
  j++){
    const p=ph[i]*pa[j];
    if(i>j)w+=p;
    else if(i==j)d+=p;
    else l+=p;
    if(i-j>=2)m2h+=p;
  if(j-i>=2)m2a+=p}
}
  const line=half(tot),lH=half(lh),lA=half(la),fav=pH>=.5?"h":"a",plf=fav=="h"?m2h:m2a,fn=fav=="h"?h:a,dn=fav=="h"?a:h,pO=over(tot,line);
  const O=[
 {
  id:"mlh",l:h+" gana (ML)",p:pH,f:(p,q)=>p>q}
}
  ,{
  id:"mla",l:a+" gana (ML)",p:1-pH,f:(p,q)=>q>p}
}
  ,
 {
  id:"plf",l:fn+" −1.5",p:plf,f:(p,q)=>fav=="h"?p-q>=2:q-p>=2}
}
  ,{
  id:"pld",l:dn+" +1.5",p:1-plf,f:(p,q)=>fav=="h"?!(p-q>=2):!(q-p>=2)}
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
  id:"rh",l:h+" 60 min",p:w,g:1,f:(p,q)=>p>q}
}
  ,{
  id:"rd",l:"Empate 60 min",p:d,g:1,f:(p,q)=>p==q}
}
  ,{
  id:"ra",l:a+" 60 min",p:l,g:1,f:(p,q)=>q>p}
}
  ,
 {
  id:"tho",l:h+" Over "+lH,p:over(lh,lH),g:1,f:p=>p>lH}
}
  ,{
  id:"thu",l:h+" Under "+lH,p:1-over(lh,lH),g:1,f:p=>p<lH}
}
  ,
 {
  id:"tao",l:a+" Over "+lA,p:over(la,lA),g:1,f:(p,q)=>q>lA}
}
  ,{
  id:"tau",l:a+" Under "+lA,p:1-over(la,lA),g:1,f:(p,q)=>q<lA}
}
  ,
 {
  id:"by",l:"Ambos anotan: Sí",p:(1-Math.exp(-lh))*(1-Math.exp(-la)),g:1,f:(p,q)=>p>0&&q>0}
}
  ,{
  id:"bn",l:"Ambos anotan: No",p:1-(1-Math.exp(-lh))*(1-Math.exp(-la)),g:1,f:(p,q)=>!(p>0&&q>0)}
}
  ];
  const dom=H.rs>A.rs&&H.ra<A.ra?"h":A.rs>H.rs&&A.ra<H.ra?"a":null,by=id=>O.find(z=>z.id==id);
  let cp,ct;
  if(dom&&by(dom=="h"?"mlh":"mla").p>=.52){
    cp=by(dom=="h"?"mlh":"mla");
  ct="ML · DOMINA EN ATAQUE Y DEFENSA"}
}
  else if(Math.max(pH,1-pH)>=.58){
    cp=by(pH>=.5?"mlh":"mla");
  ct="ML FAVORITO (sin dominio total)"}
}
  else{
    cp=[by("pld"),by("ov"),by("un")].reduce((m,z)=>z.p>m.p?z:m);
  ct="SIN VENTAJA CLARA · opción más segura"}
}
  return{
  O,cp,ct,dom,lh,la,tot,H,A,x,y,pn,pH,notes:[...H.nt.map(z=>[h,...z]),...A.nt.map(z=>[a,...z])]}
}
}
}
const pc=v=>(v*100).toFixed(1)+"%";
const KEY=g=>"NHL:"+(g.dl||"sim")+":"+g.h+"-"+g.a,SPN=()=>"NHL";
const GR=[["ML",["mlh","mla"]],["±1.5",["plf","pld"]],["total",["ov","un"]],["60 min",["rh","rd","ra"]],["total local",["tho","thu"]],["total visita",["tao","tau"]],["ambos anotan",["by","bn"]]];
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
const CMIN=.40;
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
  const fh=m.pH>=.5,pF=fh?m.pH:1-m.pH;
  if(pF<.65)return null;
  const fc=fh?g.h:g.a,big=m.tot>=5.8,L=big?5.5:4.5,M=cmbOT(pois(m.lh),pois(m.la)),fs=fh?(i,j)=>i>j:(i,j)=>j>i;
  const c=cmbBuild(M,fs,pF,fc,[{
  id:"cb_o"+L,l:"Over "+L,f:(i,j)=>i+j>L}
}
  ])[0];
  const orr=OVR(fc,L);
  if(orr!=null&&orr<.5)return null;
  return{
  c,why:`${fc} gana ${pc(pF)} pero paga poco (justa ${(1/pF).toFixed(2)}). Over ${L} porque el partido proyecta ${m.tot.toFixed(2)} goles${big?"":" (para Over 5.5 pide 5.8+ proyectados)"}.`}
}
}
}
function MG(nv){
return nv.mg.map(([n,v])=>`<span class="bd">Margen casa ${n}: ${(v*100).toFixed(1)}%</span>`).join("")}
}
function card(g){
  const m=model(g.h,g.a,g.aud?SA:S,g.aud),b=g.aud?null:bestOf(g,m),nv=g.aud?{
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
  return `<div class="card"><div class="mt"><div class="tm">${g.h}<small>LOCAL</small></div><div class="vs">VS</div><div class="tm" style="text-align:right">${g.a}<small>VISITA</small></div></div>
 <div class="meta"><span>${g.t||"Simulación"}${g.ref?` · ref. proveedor local ${
  g.ref}
}
  %`:""}</span><span>Proy ${m.lh.toFixed(2)} – ${m.la.toFixed(2)} · Total ${m.tot.toFixed(2)}</span></div>
 ${main.map(o=>row(g,o,o===pk,nv.p)).join("")}
 <details><summary>MÁS MERCADOS (60 MIN · TOTALES POR EQUIPO · AMBOS ANOTAN)</summary>${ext.map(o=>row(g,o,o===pk,nv.p)).join("")}</details>
 ${ban}${m.why&&!g.aud?`<div class="cs2" style="margin-top:8px;font-size:11px;line-height:1.45;color:var(--mut)">${
  m.why}
}
  En tu casa búscala como "Crea tu apuesta" o "Bet Builder" y escribe su cuota en la casilla.</div>`:""}${!b&&NOB(g)&&!dec(SO[KEY(g)+"|"+pk.id])?"":STK(g,pk,b)}
 <div class="kp">${MG(nv)}${m.dom?`<span class="bd g">${
  m[ "dom"]=="h"?g.h:g.a}
}
  domina ataque + defensa</span>`:`<span class="bd">Ningún equipo domina en ataque y defensa</span>`}${m.notes.map(z=>`<span class="bd">${
  z[0]}
}
  · ${
  z[1]}
}
  ${
  z[2]?" (dudoso)":" fuera"}
}
</span>`).join("")}</div></div>`}
}
function topPanel(){
  const gs=D[day][1];
  if(gs[0].aud){
    let hit=0,mlh=0;
    gs.forEach(g=>{
      const m=model(g.h,g.a,SA,true);
      if(m.cp.f(g.sc[0],g.sc[1]))hit++;
      const ml=m.O[0].p>=.5?m.O[0]:m.O[1];
    if(ml.f(g.sc[0],g.sc[1]))mlh++}
  }
    );
    $("topp").innerHTML=`<h3>AUDITORÍA · QUÉ HABRÍA DICHO EL MODELO ANTES DE LOS JUEGOS</h3><div style="font-size:13px">Pick de confianza: <b>${hit}/${gs.length}</b> ✓ · Ganador por ML (favorito del modelo): <b>${mlh}/${gs.length}</b> ✓</div><div style="font-size:12px;color:var(--mut);margin-top:6px">Calculado solo con datos previos al 12 oct y sin noticias del día. Toca un partido para ver ✓/✗ por mercado.</div>`;
  return}
}
  const L=gs.map(g=>{
    const m=model(g.h,g.a,S,false),b=bestOf(g,m);
    return{
    g,m,b,s:b?10+b.ev:(m.dom?1:0)+m.cp.p}
  }
  }
}
  ).sort((a,b)=>b.s-a.s);
$("topp").innerHTML=`<h3>RANKING DEL DÍA · MEJORES PICKS</h3>`+L.map(z=>`<div class="top"><div>${z.g.h} vs ${z.g.a}<br><small>${z.b?"MEJOR VALOR · EV +"+(z.b.ev*100).toFixed(0)+"%":z.m.ct}</small></div><div style="text-align:right"><b>${z.b?z.b.o.l:z.m.cp.l}</b><br><small>${pc(z.b?z.b.o.p:z.m.cp.p)}</small></div></div>`).join("")}
}
function draw(){
  rebuild();
  $("days").innerHTML=D.map((d,i)=>`<button class="chip ${i==day?"a":""}" data-d="${i}">${d[0]} · ${d[1].length}</button>`).join("");
  topPanel();
  $("games").innerHTML=D[day][1].map(tile).join("");
  $("sim").innerHTML=tile(SIM);
  $("feed").innerHTML=N.map(x=>`<div class="feed"><div>${x.r=="gf"?"▼":"▼"} <b>${x.t}</b> · ${x.n}<small>${x.h} · ${x.d} · afecta ${x.r=="gf"?"ataque":"defensa/portero"}</small></div><select data-n="${x.id}"><option value="0" ${x.st==0?"selected":""}>Disponible</option><option value=".5" ${x.st==.5?"selected":""}>Dudoso</option><option value="1" ${x.st==1?"selected":""}>Fuera</option></select><input type="number" step="0.01" data-ni="${x.id}" value="${x.i}" title="goles/juego"></div>`).join("");
  $("tbl").innerHTML=`<tr><th>EQUIPO</th><th>GF 25-26</th><th>GA 25-26</th><th>JJ 26-27</th><th>GF/J</th><th>GA/J</th><th>PYTH</th></tr>`+Object.keys(T).sort().map(k=>{
    const s=S[k],p=Math.pow(s.rs,E)/(Math.pow(s.rs,E)+Math.pow(s.ra,E));
  return `<tr><td>${k} <span style="color:var(--mut);font-size:11px">${T[k][0]}</span>${s.kn?"":'<span class="tag">SIN DATO</span>'}</td><td><input type="number" data-e="${k}" data-f="f" value="${s.gf}" placeholder="250"></td><td><input type="number" data-e="${k}" data-f="a" value="${s.ga}" placeholder="250"></td><td>${s.n}</td><td>${s.rs.toFixed(2)}</td><td>${s.ra.toFixed(2)}</td><td>${(p*100).toFixed(1)}%</td></tr>`}
}
).join("")}
}
const ks=Object.keys(T).sort(),sh=$("sh"),sa=$("sa");
sh.innerHTML=sa.innerHTML=ks.map(k=>`<option value="${k}">${k} · ${T[k][0]}</option>`).join("");
sh.value="COL";
sa.value="CAR";
sh.onchange=()=>{
  SIM.h=sh.value;
draw()}
}
;
sa.onchange=()=>{
  SIM.a=sa.value;
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
  else if(ds.n)N.find(x=>x.id===ds.n).st=parseFloat(i.value);
  else if(ds.ni){
    const v=parseFloat(i.value);
  if(!isNaN(v))N.find(x=>x.id===ds.ni).i=v}
}
  else if(ds.e){
    const v=parseFloat(i.value);
    (ed[ds.e]=ed[ds.e]||{
    }
  }
  )[ds.f]=isNaN(v)?0:v}
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
function getG(k){
  if(k==="sim")return SIM;
for(const d of D)for(const g of d[1])if(g.k===k)return g}
}
function tile(g){
  const m=model(g.h,g.a,g.aud?SA:S,g.aud),b=g.aud?null:bestOf(g,m);
  let tag;
  if(g.aud){
    const ok=m.cp.f(g.sc[0],g.sc[1]);
  tag=`<b style="color:var(--${ok?"ok":"bad"})">${ok?"✓":"✗"} ${g.sc[0]}–${g.sc[1]}</b>`}
}
  else tag=`<b>${pc(b?b.o.p:m.cp.p)}</b>`;
  return `<div class="tile" data-open="${g.k}"><div class="mt"><div class="tm">${g.h}<small>LOCAL</small></div><span class="pkc"></span><div class="tm" style="text-align:right">${g.a}<small>VISITA</small></div></div>
 <div class="meta"><span>${g.t||"Simulación"}${g.ref?` · ref. ${
  g.ref}
}
%`:""}</span><span>Proy ${m.lh.toFixed(1)}–${m.la.toFixed(1)}</span></div>
 <div class="tp"><span>${b?"MEJOR VALOR":g.aud?"PICK PRE-JUEGO":NOB(g)?"NO APOSTAR":"PICK"}</span><div>${b?b.o.l:m.cp.l}</div>${tag}</div><div class="go">ANALIZAR ▸</div></div>`}
}
let OPEN=null,TMR=[];
function lines(g){
  const SS=g.aud?SA:S,m=model(g.h,g.a,SS,g.aud),f=v=>v.toFixed(2),q=v=>(v*100).toFixed(1)+"%";
return [`Sincronizando 2025-26 + ${SS[g.h].n+SS[g.a].n} juegos de 2026-27`,
 `Ataque/defensa · ${g.h} ${f(m.H.rs)}/${f(m.H.ra)} · ${g.a} ${f(m.A.rs)}/${f(m.A.ra)}`,
 g.aud?"Modo auditoría · sin noticias del día":`Leyendo noticias y lesiones · ${m.notes.length} ajustes activos`,
 `Pitágoras ${q(m.x)} vs ${q(m.y)}`,
 `Log5 + ventaja local 54% → ${g.h} ${q(m.pH)}`,
 `Poisson ${f(m.lh)}–${f(m.la)} goles · total ${f(m.tot)}`,
 "Escaneando 15 mercados · buscando valor",
 m.dom?`Dominio detectado: ${m.dom=="h"?g.h:g.a}`:"Sin dominio total en ataque y defensa",
 "ANÁLISIS COMPLETO"]}
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
  const g=getG(k);
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
  r.innerHTML=card(getG(OPEN));
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
let buf="";
const CODE="7779",dots=[...document.querySelectorAll("#dots i")],msg=$("msg"),pad=$("pad");
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
      draw()}
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
  if(e.key==="Escape"&&OPEN)closeGame();
  if($("lock").classList.contains("hide"))return;
  if(e.key==="Backspace")key("⌫");
else if(/^\d$/.test(e.key))key(e.key)}
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
const PXIDS=new Set(["mlh","mla","plf","pld","ov","un"]);
function PXG(){
  const d=D[day];
  if(!d||!d[1].length||d[1][0].aud)return null;
  const lab=d[0].replace(/^Hoy · /,"");
  return{
  gs:d[1],dn:/^Dom/.test(lab)?"DEL DOMINGO":"DEL DÍA",scope:""}
}
}
}
const PXM=g=>model(g.h,g.a,S,false),PXN=g=>g.h+" vs "+g.a,PXT=g=>D[day][0].replace(/^Hoy · /,"")+(g.t?" · "+g.t:"");
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
  document.getElementById('app').classList.remove('hide');
  try{
  draw()}
}
  catch(e){
  }
}
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