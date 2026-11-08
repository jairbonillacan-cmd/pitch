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


const LG=4.40,EX=1.83,HFA=.54,SHR=.85,SD=3*Math.SQRT2;
// equipo: nombre, RS/J, RA/J, ERA cuerpo de pitcheo, RS estimado?
const T={
ATL:["Atlanta Braves",4.58,3.87,3.62],CLE:["Cleveland Guardians",4.19,4.12,3.73],CWS:["Chicago White Sox",4.79,4.44,4.13],LAD:["Los Angeles Dodgers",4.94,3.70,3.59],MIL:["Milwaukee Brewers",5.14,3.81,3.52],NYY:["New York Yankees",4.59,3.70,3.20],SD:["San Diego Padres",4.46,4.14,3.93],TB:["Tampa Bay Rays",4.54,4.01,3.73]}
}
;
const ed={
}
}
,SO=AVX.odds;
const dec=s=>{
  const v=parseFloat(String(s).replace(",","."));
  if(isNaN(v))return null;
  if(Math.abs(v)>=100)return v>0?1+v/100:1+100/-v;
return v>1?v:null}
}
;
// abridores: id, equipo, nombre, ERA, IP (null = sin ERA verificado)
const PL={
}
}
;
[["mar","TB","Nick Martinez",3.10,180],["ras","TB","Drew Rasmussen",2.67,172],["per","TB","Freddy Peralta",4.42,169],["fri","NYY","Max Fried",null,0],["sch","NYY","Cam Schlittler",null,0],["hen","MIL","Logan Henderson",2.47,98.3],["wro","LAD","Justin Wrobleski (bullpen)",3.66,140],["may","MIL","Dustin May",4.70,145.7],["gas","MIL","Robert Gasser (proyectado)",3.87,109.3],["piv","SD","Nick Pivetta",2.86,35],["sne","LAD","Blake Snell",1.90,42.7],["yam","LAD","Yoshinobu Yamamoto",2.53,185],["sal","ATL","Chris Sale",null,0],["mah","ATL","Tyler Mahle",null,0],["esp","CLE","Daniel Espino",4.11,15.3],["wil","CLE","Gavin Williams",3.76,184.3],["mes","CLE","Parker Messick",2.56,186.3],["gri","CLE","Foster Griffin",3.60,172.7],["new","CWS","Sean Newcomb (opener)",3.09,60],["sku","LAD","Tarik Skubal",2.72,158.7],["mis","MIL","Jacob Misiorowski",1.80,174.7],["gla","LAD","Tyler Glasnow",3.53,74],["bur","CWS","Sean Burke",null,0],["arm","CLE","Shawn Armstrong (opener)",null,0],["cnt","CLE","Joey Cantillo (relevo largo)",null,0],["jax","TB","Griffin Jax",3.53,112.1],["can","CLE","Joey Cantillo (bullpen)",3.62,159],["bib","CLE","Tanner Bibee",4.36,188],["dro","MIL","Shane Drohan (opener; ERA/IP al 4 sep, sin verificar al cierre)",3.75,110.1]].forEach(p=>PL[p[0]]={
id:p[0],t:p[1],n:p[2],era:p[3],ip:p[4]}
}
);
// bateadores: id, equipo, nombre, impacto carreras/juego si falta (estimado), fuera?, nota
const BT=[["dlu","TB","Jonny DeLuca",0.06,0,"Sencillo que empató el J4 en la 12ª y anotó la 1ª carrera en la 2ª"],["wmb","TB","Ben Williamson",0.04,0,"Emergente: roletazo al jardín derecho que dejó tendido a MIL en la 12ª del J4"],["frk","MIL","Sal Frelick",0.08,0,"Doble productor en la 5ª del J3; 2-4 con jonrón solitario que empató el J2 en la 6ª"],["hic","TB","Liam Hicks",0.08,0,"Sencillo en el rally de la 12ª del J4; jonrón de 2 carreras en la 1ª del J2"],["yel","MIL","Christian Yelich",0.15,0,"BD: 1-4 con triple productor en la 1ª del J1, su primer hit en Serie Mundial"],["csi","TB","Chandler Simpson",0.08,0,"Doble productor en la 2ª del J4 y sencillo que llenó las bases en la 12ª; 1-4 con carrera y CI en el J2"],["oht","LAD","Shohei Ohtani",0.5,0,"Eliminado: LAD fue barrido. Volvió al 1er turno en el J4 y pegó jonrón de 3 carreras (428 pies), su primer HR y primeras RBI de la postemporada"],["fre","LAD","Freddie Freeman",0.3,0,"Eliminado: LAD fue barrido. 3er bate en el J4, sin hits destacados; la molestia en la rodilla no se volvió a reportar"],["mun","LAD","Max Muncy",0.2,0,"Eliminado: LAD fue barrido. Se ponchó ante Romero en la 6ª del J4 con corredor en 3ª"],["pag","LAD","Andy Pages",0.12,0,"Eliminado: LAD fue barrido. Sencillo productor en la 2ª del J4"],["roj","LAD","Miguel Rojas",0.05,0,"Eliminado: LAD fue barrido"],["con","MIL","William Contreras",0.2,0,"2-5 con CI en el J2 (sencillo productor en la 1ª); 2-3 con BB y CI en el J1. Jugador del J1 según Pat Murphy"],["cho","MIL","Jackson Chourio",0.2,0,"Doble productor en la 5ª del J3 (1er bate); 2-5 con carrera en el J2 y 2-4 con CI en el J1"],["tur","MIL","Brice Turang",0.15,0,"2 CI con sencillo en el rally de 8 carreras de la 5ª del J3; doble y anotó la carrera de la ventaja en la 7ª del J2"],["lar","MIL","Luis Lara",0.08,0,"1-3 con 1 RBI en la NLCS. Por el platoon de Murphy podría jugar ante derechos; MLB.com proyecta a Frelick en RF ante el derecho Nick Martinez en el J1"],["ort","MIL","Joey Ortiz",0.12,0,"Sencillo productor en la 9ª del J3, tras ir 1-10 en la NLDS. MLB.com proyecta a Hamilton en 3B ante el derecho Nick Martinez en el J1"],["vau","MIL","Andrew Vaughn",0.12,0,"Recibió la base por bolas antes del jonrón de Bauers en la 7ª del J3. Se espera que Yelich sea el BD por encima de él ante la rotación derecha de TB (MLB Trade Rumors)"],["cam","TB","Junior Caminero",0.3,0,"Llegó por error en la 12ª del J4 e inició el rally; anotó en el J4 con un toque fallado y tiro errado; 1-4 con carrera y CI en el J2"],["ram","CLE","José Ramírez",0.35,0,"Eliminado: CLE perdió la ALCS 4-2"],["roc","CLE","Brayan Rocchio",0.08,0,"Eliminado: CLE perdió la ALCS 4-2"],["bau","MIL","Jake Bauers",0.08,0,"Doble de 2 carreras en el J4; MVP de la NLCS"],["mit","MIL","Garrett Mitchell",0.06,0,"Sencillo productor en la 5ª del J3 y en la 1ª del J2. Jonrón en los J3 y J4 de la NLCS"],["hal","CLE","Petey Halpin",0.06,0,"Eliminado: CLE perdió la ALCS 4-2"],["ham","MIL","David Hamilton",0.05,0,"Jonrón solitario que empató el J4 en la 5ª (también cometió el tiro errado que dio una carrera a TB); sencillo productor en la 5ª del J3"],["pra","MIL","Cooper Pratt",0.08,0,"4 hits en el J4: doble productor en la 4ª y jonrón solitario en la 12ª; doble de 2 carreras en la 5ª del J3"],["dia","TB","Yandy Díaz",0.15,0,"2 de los 3 hits de TB en el J3, incluido el doble productor de la única carrera en la 9ª; se ponchó con el empate en 3ª para cerrar el J2"],["ara","TB","Jonathan Aranda",0.12,0,"Sencillo productor en la 1ª y doble en la 5ª del J2; 3-3 en el J1. .274, 22 HR y 92 CI en la temporada"],["baz","CLE","Travis Bazzana",0.08,0,"Eliminado: CLE perdió la ALCS 4-2"],["kwa","CLE","Steven Kwan",0.12,0,"Eliminado: CLE perdió la ALCS 4-2"]].map(b=>({
id:b[0],t:b[1],n:b[2],i:b[3],out:b[4],note:b[5]}
}
));
// calendario
const D=[["Auditoría 8-28 oct",[{
h:"CWS",a:"CLE",t:"8 oct · 6:00 PM",s:"ALDS · Juego 4",sc:[5,9]}
}
,{
h:"CLE",a:"CWS",t:"10 oct · 6:00 PM",s:"ALDS · Juego 5 · CLE avanza a la ALCS",sc:[2,0]}
}
,{
h:"MIL",a:"LAD",t:"11 oct · 6:00 PM",s:"NLCS · Juego 1 · Misiorowski vs Skubal",sc:[2,1]}
}
,{
h:"MIL",a:"LAD",t:"12 oct · 3:04 PM",s:"NLCS · Juego 2 · Henderson vs Yamamoto · HR de Contreras",sc:[7,4]}
}
,{
h:"TB",a:"CLE",t:"12 oct · 6:08 PM",s:"ALCS · Juego 1 · Rasmussen vs Griffin · HR de DeLauter y Bailey",sc:[3,7]}
}
,{
h:"TB",a:"CLE",t:"13 oct · 6:00 PM",s:"ALCS · Juego 2 · Peralta (6 IP en blanco) vence a Messick · 3 carreras sucias tras error de Ramírez",sc:[3,1]}
}
,{
h:"LAD",a:"MIL",t:"14 oct · 6:00 PM",s:"NLCS · Juego 3 · Gasser (5 IP, 0 CL) vence a Snell · HR de Chourio, Bauers y Mitchell",sc:[2,6]}
}
,{
h:"CLE",a:"TB",t:"15 oct · 11:00 AM",s:"ALCS · Juego 3 · Gavin Williams (5 IP, 2 C, 9 K) vs Jax · HR de 2 carreras de Petey Halpin en la 5ª; salvamento de Cade Smith · CLE 2-1",sc:[3,2]}
}
,{
h:"LAD",a:"MIL",t:"15 oct · 7:00 PM",s:"NLCS · Juego 4 · MIL barre 4-0 y va a la Serie Mundial · HR de Ohtani (3 C), Mitchell y Hamilton; MVP: Jake Bauers",sc:[4,6]}
}
,{
h:"CLE",a:"TB",t:"17 oct · 6:00 PM",s:"ALCS · Juego 4 (aplazado del viernes) · Martinez (5.1 IP, 1 C) vs bullpen de CLE (Armstrong 1 IP, Griffin 3.2 IP) · 3 carreras de TB en la 7ª con error de DeLauter; HR de Bazzana (CLE) y de 2 carreras de Yandy Díaz (TB) · perdió Espino · serie 2-2",sc:[3,7]}
}
,{
h:"CLE",a:"TB",t:"18 oct · 3:08 PM",s:"ALCS · Juego 5 (aplazado) · Rasmussen (7 IP, 4 H, 1 C, 6 K) vence a Messick (2 IP, 2 C, 3 BB) · TB anotó en cada una de las 3 primeras entradas: BB con bases llenas a DeLuca, sencillo productor de Aranda y sencillo de Liam Hicks; CLE descontó en la 7ª con sencillo de DeLauter · salvamento de Bryan Baker · TB 3-2 en la serie",sc:[1,3]}
}
,{
h:"TB",a:"CLE",t:"19 oct · 6:08 PM",s:"ALCS · Juego 6 · Peralta (5.1 IP) vence al opener Shawn Armstrong · jonrones de 2 carreras de Junior Caminero y Yandy Díaz · TB gana la serie 4-2 y va a la Serie Mundial ante MIL; Peralta, MVP de la ALCS",sc:[7,3]}
}
,{
h:"MIL",a:"TB",t:"23 oct · 6:00 PM",s:"Serie Mundial · Juego 1 · Misiorowski (5 IP, 4 H, 1 C, 3 K; primer lanzamiento a 103.5 mph, récord de Serie Mundial) gana; Nick Martinez (5 IP, 2 C) · MIL 2 en la 1ª (triple productor de Yelich, sencillo de Contreras) y 1 en la 7ª (sencillo de Chourio); TB 0-6 con corredores en posición de anotar · salvamento de Megill · MIL 1-0 en la serie",sc:[3,2]}
}
,{
h:"MIL",a:"TB",t:"24 oct · 6:00 PM",s:"Serie Mundial · Juego 2 · TB se fue arriba 4-0 en la 1ª (jonrón de 2 carreras de Liam Hicks) ante Henderson (3 IP, 4 C, 3 CL); Rasmussen 3.2 IP, 3 C · Frelick empató con jonrón solitario en la 6ª y Pratt dio el sencillo de la ventaja en la 7ª · el bullpen de MIL lanzó 6 entradas en blanco; gana Abner Uribe, pierde Tyler Wells; Ashby sacó los últimos 5 outs · MIL 2-0 en la serie",sc:[5,4]}
}
,{
h:"TB",a:"MIL",t:"26 oct · 6:00 PM",s:"Serie Mundial · Juego 3 · Robert Gasser (6 IP, 1 H, 0 C; enfrentó al mínimo en 6 entradas) vence a Freddy Peralta (4.2 IP) · MIL anotó 2 en la 3ª y 8 en la 5ª con 16 hits: 2 CI de Turang y de Cooper Pratt, 1 de Mitchell, Frelick, Hamilton y Chourio · TB solo 3 hits; doble productor de Yandy Díaz en la 9ª · Brandon Woodruff volvió para lanzar la 9ª · MIL 3-0 en la serie",sc:[1,10]}
}
,{
h:"TB",a:"MIL",t:"27 oct · 6:00 PM",s:"Serie Mundial · Juego 4 · TB evita la barrida en 12 entradas · Griffin Jax (4+ IP) abrió por TB; doble productor de Chandler Simpson en la 2ª, doble productor de Cooper Pratt en la 4ª y jonrón solitario de David Hamilton en la 5ª · Pratt (4 hits) puso arriba a MIL 3-2 con jonrón en la 12ª, pero Jonny DeLuca empató con sencillo y el emergente Ben Williamson dejó tendido a MIL ante Shane Drohan · MIL 3-1 en la serie",sc:[4,3]}
}
,{
h:"TB",a:"MIL",t:"28 oct · 6:00 PM",s:"Serie Mundial · Juego 5 · Milwaukee gana 4-1 y es campeón de la Serie Mundial 2026 · temporada terminada",sc:[1,4]}
}
]]];
D.forEach((d,i)=>d[1].forEach((g,j)=>{
  g.sp=g.sp||[null,null];
  g.k=i+"-"+j;
  g.dl=d[0].replace(/^Hoy · /,"");
if(g.sc)g.aud=true}
}
));
const SIM={
k:"sim",h:"MIL",a:"LAD",sp:[null,null]}
}
,GM={
sim:SIM}
}
;
D.forEach(d=>d[1].forEach(g=>GM[g.k]=g));
const phi=x=>{
  const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
return x>0?1-p:p}
}
;
const base=k=>({
rs:ed[k]?.rs??T[k][1],ra:ed[k]?.ra??T[k][2],era:T[k][3]}
}
);
function eff(t,sp,nn){
  const b=base(t);
  let rs=b.rs,ra=b.ra;
  const nt=[];
  if(nn)return{
  rs,ra,nt}
}
  ;
  BT.filter(x=>x.t===t&&x.out).forEach(x=>{
    rs-=x.i;
  nt.push(x.n+" fuera (−"+x.i.toFixed(2)+" R)")}
}
  );
  const p=sp&&PL[sp];
  if(p&&p.era!=null&&p.era!==""&&p.ip>0){
    const reg=(p.era*p.ip+b.era*80)/(p.ip+80),f=1+.55*(reg/b.era-1);
    ra*=f;
  nt.push(p.n+" · ERA "+(+p.era).toFixed(2)+" ("+(f>=1?"+":"")+((f-1)*100).toFixed(0)+"% RA)")}
}
  return{
  rs,ra,nt}
}
}
}
function model0(h,a,sh,sa,nn){
  const H=eff(h,sh,nn),A=eff(a,sa,nn),py=t=>Math.pow(t.rs,EX)/(Math.pow(t.rs,EX)+Math.pow(t.ra,EX));
  const x=py(H),y=py(A),pn=(x-x*y)/(x+y-2*x*y),o=pn/(1-pn)*(HFA/(1-HFA)),pH=.5+SHR*(o/(1+o)-.5);
  const gh=H.rs*A.ra/LG,ga=A.rs*H.ra/LG,tot=gh+ga;
  let line=Math.round(tot*2)/2;
  if(Number.isInteger(line))line+=.5;
  const pO=1-phi((line-tot)/SD),homeFav=pH>=.5,df=homeFav?gh-ga:ga-gh,pc=1-phi((1.5-df)/SD);
  const fav=homeFav?h:a,dog=homeFav?a:h;
  const O=[{
  id:"h",l:h+" gana",p:pH,f:(x,y)=>x>y}
}
  ,{
  id:"a",l:a+" gana",p:1-pH,f:(x,y)=>y>x}
}
  ,{
  id:"ov",l:"Over "+line,p:pO,f:(x,y)=>x+y>line}
}
  ,{
  id:"un",l:"Under "+line,p:1-pO,f:(x,y)=>x+y<line}
}
  ,{
  id:"plf",l:fav+" −1.5",p:pc,f:(x,y)=>homeFav?x-y>=2:y-x>=2}
}
  ,{
  id:"pld",l:dog+" +1.5",p:1-pc,f:(x,y)=>homeFav?!(x-y>=2):!(y-x>=2)}
}
  ];
  return{
  O,opts:O,gh,ga,tot,line,H,A,x,y,pH,pick:O.reduce((m,o)=>o.p>m.p?o:m),notes:[...H.nt,...A.nt]}
}
}
}
const pc=v=>(v*100).toFixed(1)+"%";
const spOpts=(t,sel)=>`<option value="">Sin ajuste</option>`+Object.values(PL).filter(p=>p.t===t).map(p=>`<option value="${p.id}" ${p.id===sel?"selected":""}>${p.n}${p.era!=null?" · "+(+p.era).toFixed(2):" · s/ERA"}</option>`).join("");
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
const pois=l=>{
  const a=[];
  let p=Math.exp(-l);
  a.push(p);
  for(let k=1;
  k<26;
  k++){
    p*=l/k;
  a.push(p)}
}
return a}
}
;
function COMBOS(g,m){
  const fh=m.pH>=.5,pF=fh?m.pH:1-m.pH;
  if(pF<.65)return null;
  const fc=fh?g.h:g.a,big=m.tot>=8,L=big?7.5:6.5,M=cmbOT(pois(m.gh),pois(m.ga)),fs=fh?(i,j)=>i>j:(i,j)=>j>i;
  const c=cmbBuild(M,fs,pF,fc,[{
  id:"cb_o"+L,l:"Over "+L,f:(i,j)=>i+j>L}
}
  ])[0];
  return{
  c,why:`${fc} gana ${pc(pF)} pero paga poco (justa ${(1/pF).toFixed(2)}). Over ${L} porque el juego proyecta ${m.tot.toFixed(2)} carreras${big?"":" (para Over 7.5 pide 8.0+ proyectadas)"}.`}
}
}
}
function MG(nv){
return nv.mg.map(([n,v])=>`<span class="bd">Margen casa ${n}: ${(v*100).toFixed(1)}%</span>`).join("")}
}
const KEY=g=>"MLB:"+(g.dl||"sim")+":"+g.h+"-"+g.a+(g.s?":"+g.s:""),SPN=()=>"MLB";
const GR=[["ganador",["h","a"]],["total",["ov","un"]],["±1.5",["plf","pld"]]];
function card(g){
  const m=model(g.h,g.a,g.sp[0],g.sp[1],g.aud),b=g.aud?null:bestOf(g,m),pk=b?b.o:m.pick,nv=g.aud?{
    p:{
    }
  }
  ,mg:[]}
}
  :NV(g);
  let ban;
  if(g.aud){
    const ok=m.pick.f(g.sc[0],g.sc[1]);
  ban=`<div class="pick"><div><span>PICK PRE-JUEGO · FINAL ${g.sc[0]}–${g.sc[1]}</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.pick.l}</div></div><b style="color:var(--${ok?"ok":"bad"});font-size:20px">${ok?"✓":"✗"}</b></div>`}
}
  else if(b)ban=`<div class="pick v"><div><span>MEJOR VALOR · EV +${(b.ev*100).toFixed(0)}%</span><div style="margin-top:3px;font-size:16px;font-weight:600">${b.o.l} @ ${b.d.toFixed(2)}</div></div><b>${pc(b.o.p)}</b></div>`;
  else if(NOB(g))ban=`<div class="pick nb"><div><span>SIN VALOR · NO APOSTAR</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.pick.l}</div><small style="display:block;margin-top:3px;font-size:11px;opacity:.8;letter-spacing:0">Ninguna cuota que escribiste le saca 4% de ventaja a la casa. Este pick solo vale si te pagan ${(1.04/m.pick.p).toFixed(2)} o más.</small></div><b>✕</b></div>`;
  else ban=`<div class="pick"><div><span>${m.ct||"PICK DEL MODELO"}</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.pick.l}</div></div><b>${pc(m.pick.p)}</b></div>`;
  return `<div class="card"><div class="mt"><div class="tm">${g.h}<small>LOCAL</small></div><div class="vs">VS</div><div class="tm" style="text-align:right">${g.a}<small>VISITA</small></div></div>
 ${g.s?`<div class="ser">${
  g.s}
}
  </div>`:""}
 <div class="meta"><span>${g.t||"Simulación"}${g.live?` · <span class="live">${
  g.live}
}
  </span>`:""}</span><span>Proy: ${m.gh.toFixed(2)} – ${m.ga.toFixed(2)} · Total ${m.tot.toFixed(2)}</span></div>
 ${m.O.map(o=>row(g,o,o===pk,nv.p)).join("")}
 ${ban}${m.why&&!g.aud?`<div class="cs2" style="margin-top:8px;font-size:11px;line-height:1.45;color:var(--mut)">${
  m.why}
}
  En tu casa búscala como "Crea tu apuesta" o "Bet Builder" y escribe su cuota en la casilla.</div>`:""}${!b&&NOB(g)&&!dec(SO[KEY(g)+"|"+pk.id])?"":STK(g,pk,b)}
 <div class="kp"><div class="l" ${g.aud?'style="display:none"':""}><div><label>ABRIDOR ${g.h}</label><select data-k="${g.k}" data-s="0">${spOpts(g.h,g.sp[0])}</select></div><div><label>ABRIDOR ${g.a}</label><select data-k="${g.k}" data-s="1">${spOpts(g.a,g.sp[1])}</select></div></div>
 ${m.notes.length?m.notes.map(n=>`<span class="bd">${
  n}
}
  </span>`).join(""):"Sin ajustes por jugadores clave"}${MG(nv)}</div>
 ${g.ref?`<div class="meta" style="margin:10px 0 0"><span>Ref. proveedor (local)</span><span>${
  g.ref}
}
%</span></div>`:""}</div>`}
}
let day=0;
const $=id=>document.getElementById(id);
function tile(g){
  const m=model(g.h,g.a,g.sp[0],g.sp[1],g.aud),b=g.aud?null:bestOf(g,m);
  let tag;
  if(g.aud){
    const ok=m.pick.f(g.sc[0],g.sc[1]);
  tag=`<b style="color:var(--${ok?"ok":"bad"})">${ok?"✓":"✗"} ${g.sc[0]}–${g.sc[1]}</b>`}
}
  else tag=`<b>${pc(b?b.o.p:m.pick.p)}</b>`;
  return `<div class="tile" data-open="${g.k}"><div class="mt"><div class="tm">${g.h}<small>LOCAL</small></div><span class="bbc"></span><div class="tm" style="text-align:right">${g.a}<small>VISITA</small></div></div>
 ${g.s?`<div class="ser">${
  g.s}
}
</div>`:""}<div class="meta"><span>${g.t||"Simulación"}</span><span>Proy ${m.gh.toFixed(1)}–${m.ga.toFixed(1)}</span></div>
 <div class="tp"><span>${b?"MEJOR VALOR":g.aud?"PICK PRE-JUEGO":"PICK DEL MODELO"}</span><div>${b?b.o.l:m.pick.l}</div>${tag}</div><div class="go">ANALIZAR ▸</div></div>`}
}
let OPEN=null,TMR=[];
function lines(g){
  const m=model(g.h,g.a,g.sp[0],g.sp[1],g.aud),f=v=>v.toFixed(2),q=v=>(v*100).toFixed(1)+"%";
return ["Sincronizando carreras anotadas y permitidas · temporada 2026",
 `Ataque/defensa · ${g.h} ${f(m.H.rs)}/${f(m.H.ra)} · ${g.a} ${f(m.A.rs)}/${f(m.A.ra)}`,
 g.aud?"Modo auditoría · sin abridores ni jugadores clave":`Revisando abridores y jugadores clave · ${m.notes.length} ajustes activos`,
 `Pitágoras 1.83 · ${q(m.x)} vs ${q(m.y)}`,
 `Log5 + ventaja local 54% → ${g.h} ${q(m.pH)}`,
 `Carreras proyectadas ${f(m.gh)}–${f(m.ga)} · total ${f(m.tot)} · SD 4.24`,
 "Calculando Over/Under y línea ±1.5 con la curva normal",
 `Pick del modelo: ${m.pick.l} (${q(m.pick.p)})`,
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
function draw(){
  $("days").innerHTML=D.map((d,i)=>`<button class="chip ${i==day?"a":""}" data-d="${i}">${d[0]} · ${d[1].length}</button>`).join("");
  const gs=D[day][1],au=gs.length&&gs[0].aud;
  $("topp").classList.toggle("hide",!au);
  if(au){
    let hit=0,ml=0;
    gs.forEach(g=>{
      const m=model(g.h,g.a,null,null,true);
      if(m.pick.f(g.sc[0],g.sc[1]))hit++;
      const w=m.opts[0].p>=.5?m.opts[0]:m.opts[1];
    if(w.f(g.sc[0],g.sc[1]))ml++}
  }
    );
  $("topp").innerHTML=`<h3>AUDITORÍA · QUÉ HABRÍA DICHO EL MODELO ANTES DE LOS JUEGOS</h3><div style="font-size:13px">Pick del modelo: <b>${hit}/${gs.length}</b> ✓ · Ganador por ML (favorito del modelo): <b>${ml}/${gs.length}</b> ✓</div><div style="font-size:12px;color:var(--mut);margin-top:6px">Sin abridores ni jugadores clave. Muestra muy pequeña. Toca un juego para ver ✓/✗ por mercado.</div>`}
}
  $("games").innerHTML=gs.length?gs.map(tile).join(""):'<div class="panel" style="grid-column:1/-1"><h3>SIN JUEGOS HOY</h3><div style="font-size:13px;line-height:1.6">No hay juegos de MLB este día. La Serie Mundial (TB vs MIL) arranca el viernes 23 de octubre en Milwaukee. Elige otro día arriba.</div></div>';
  $("sim").innerHTML=tile(SIM);
  $("tbl").innerHTML=`<tr><th>EQUIPO</th><th>RS/J</th><th>RA/J</th><th>ERA STAFF</th><th>PYTH</th></tr>`+Object.keys(T).sort().map(k=>{
    const b=base(k),p=Math.pow(b.rs,EX)/(Math.pow(b.rs,EX)+Math.pow(b.ra,EX));
  return `<tr><td>${k} <span style="color:var(--mut);font-size:11px">${T[k][0]}</span>${T[k][4]?'<span class="tag">RS ESTIMADO</span>':""}</td><td><input type="number" step="0.01" data-e="${k}" data-f="rs" value="${b.rs.toFixed(2)}"></td><td><input type="number" step="0.01" data-e="${k}" data-f="ra" value="${b.ra.toFixed(2)}"></td><td>${b.era.toFixed(2)}</td><td>${(p*100).toFixed(1)}%</td></tr>`}
}
  ).join("");
  $("tsp").innerHTML=`<tr><th>ABRIDOR</th><th>ERA</th><th>IP</th></tr>`+Object.values(PL).map(p=>`<tr><td>${p.t} · ${p.n}${p.era==null?'<span class="tag">SIN ERA</span>':""}</td><td><input type="number" step="0.01" data-p="${p.id}" data-f="era" value="${p.era??""}" placeholder="—"></td><td><input type="number" data-p="${p.id}" data-f="ip" value="${p.ip||""}" placeholder="60"></td></tr>`).join("");
$("tbt").innerHTML=`<tr><th>BATEADOR</th><th>FUERA</th><th>IMPACTO R/J</th></tr>`+BT.map(b=>`<tr><td>${b.t} · ${b.n}<div style="font-size:10px;color:var(--mut)">${b.note}</div></td><td><input type="checkbox" data-b="${b.id}" data-f="out" ${b.out?"checked":""}></td><td><input type="number" step="0.01" data-b="${b.id}" data-f="i" value="${b.i}"></td></tr>`).join("")}
}
const ks=Object.keys(T).sort(),sh=$("sh"),sa=$("sa");
sh.innerHTML=sa.innerHTML=ks.map(k=>`<option value="${k}">${k} · ${T[k][0]}</option>`).join("");
sh.value="MIL";
sa.value="LAD";
sh.onchange=()=>{
  SIM.h=sh.value;
  SIM.sp[0]=null;
draw()}
}
;
sa.onchange=()=>{
  SIM.a=sa.value;
  SIM.sp[1]=null;
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
  ["g","s","e","k"].forEach(x=>$("t"+x).classList.toggle("hide",x!==t))}
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
  else if(ds.k!=null){
  GM[ds.k].sp[+ds.s]=i.value||null}
}
  else if(ds.e){
    const v=parseFloat(i.value);
    if(!isNaN(v))(ed[ds.e]=ed[ds.e]||{
    }
  }
  )[ds.f]=v}
}
  else if(ds.p){
    const p=PL[ds.p],v=parseFloat(i.value);
    if(ds.f==="era"){
      p.era=isNaN(v)?null:v;
    if(p.era!=null&&!(p.ip>0))p.ip=60}
  }
  else p.ip=isNaN(v)?0:v}
}
  else if(ds.b){
    const b=BT.find(x=>x.id===ds.b);
    if(ds.f==="out")b.out=i.checked?1:0;
    else{
      const v=parseFloat(i.value);
    if(!isNaN(v))b.i=v}
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
const PXIDS=new Set(["h","a","plf","pld","ov","un"]);
function PXG(){
  const d=D[day];
  if(!d||!d[1].length||d[1][0].aud)return null;
  return{
  gs:d[1],dn:"DEL DÍA",scope:""}
}
}
}
const PXM=g=>model(g.h,g.a,g.sp[0],g.sp[1],false),PXN=g=>g.h+" vs "+g.a,PXT=g=>(g.s?g.s.split(" · ").slice(0,2).join(" · "):"")+(g.t?" · "+g.t:"");
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