
/* ===== APUESTAS POR JUGADOR (misma idea del modelo: ritmo del jugador x defensa rival, curva normal / Poisson) ===== */
// jugador: equipo, nombre, pos, partidos, yds pase, TD pase, acarreos, yds tierra, TD tierra, recepciones, yds recepcion, TD recepcion, estado (0 juega, .5 duda, 1 fuera), nota
const PJ=[
["CHI","Caleb Williams","QB",3,712,3,19,110,2,null,null,0,0,"Volvió en la semana 6 tras perderse 3 juegos"],
["CHI","D'Andre Swift","RB",6,0,0,94,398,6,18,140,0,0,""],
["CHI","Kyle Monangai","RB",4,0,0,60,324,3,null,null,0,0.5,"Pulgar y dedo del pie; estado para el lunes 2 nov sin confirmar"],
["CHI","Luther Burden","WR",6,0,0,0,0,0,31,361,1,0,""],
["CHI","Rome Odunze","WR",6,0,0,0,0,0,20,312,0,0,""],
["CHI","Colston Loveland","TE",6,0,0,0,0,0,19,175,1,0,""],
["NE","Drake Maye","QB",6,1463,11,34,185,1,null,null,0,0,""],
["NE","Rhamondre Stevenson","RB",6,0,0,71,263,2,15,111,0,0,""],
["NE","TreVeyon Henderson","RB",5,0,0,49,194,1,null,null,0,0,""],
["NE","DeMario Douglas","WR",6,0,0,0,0,0,20,233,3,0,"Romeo Doubs (hombro) a la lista de lesionados"],
["NE","Hunter Henry","TE",6,0,0,0,0,0,19,225,2,0,""],
["NO","Tyler Shough","QB",6,1443,12,21,104,2,null,null,0,0,""],
["NO","Alvin Kamara","RB",5,0,0,35,120,2,15,76,1,0,"Sin designación"],
["NO","Kendre Miller","RB",5,0,0,49,153,2,null,null,0,0,""],
["NO","Chris Olave","WR",6,0,0,0,0,0,43,580,2,0,""],
["NO","Devaughn Vele","WR",6,0,0,0,0,0,28,294,2,0,""],
["NO","Juwan Johnson","TE",6,0,0,0,0,0,25,248,3,0,""],
["PIT","Aaron Rodgers","QB",6,1487,12,9,17,0,null,null,0,0,""],
["PIT","Jaylen Warren","RB",6,0,0,84,460,1,21,258,1,0,""],
["PIT","D.K. Metcalf","WR",6,0,0,0,0,0,30,318,1,0,""],
["PIT","Germie Bernard","WR",6,0,0,0,0,0,24,227,1,0,""],
["PIT","Pat Freiermuth","TE",6,0,0,0,0,0,21,180,4,0,""],
["ATL","Michael Penix Jr.","QB",4,944,6,7,5,0,null,null,0,0,"Sin designación en el reporte final"],
["ATL","Bijan Robinson","RB",6,0,0,111,641,4,20,144,1,0,""],
["ATL","Brian Robinson Jr.","RB",6,0,0,53,211,4,null,null,0,0,""],
["ATL","Drake London","WR",6,0,0,0,0,0,31,550,0,0,""],
["ATL","Jahan Dotson","WR",6,0,0,0,0,0,11,236,2,0,""],
["ATL","Kyle Pitts","TE",6,0,0,0,0,0,15,169,3,0,""],
["SF","Brock Purdy","QB",5,1196,13,25,128,1,null,null,0,0,"Cifras sin el juego del lunes 19"],
["SF","Christian McCaffrey","RB",5,0,0,61,286,5,19,137,0,0,""],
["SF","Mike Evans","WR",5,0,0,0,0,0,24,326,3,1,"Descartado ante ATL (costillas/Aquiles)"],
["SF","Deebo Samuel","WR",5,0,0,0,0,0,16,206,3,1,"Isquiotibial; regreso estimado en la semana 9"],
["SF","George Kittle","TE",5,0,0,0,0,0,21,268,4,0,""],
["CAR","Bryce Young","QB",5,1549,11,9,25,1,null,null,0,0,""],
["CAR","Chuba Hubbard","RB",5,0,0,89,426,4,11,85,2,0,""],
["CAR","Tetairoa McMillan","WR",5,0,0,0,0,0,32,471,2,0,""],
["CAR","Jalen Coker","WR",4,0,0,0,0,0,24,319,2,0,""],
["CAR","Darren Waller","TE",5,0,0,0,0,0,13,148,2,0,""],
["TB","Baker Mayfield","QB",3,615,2,0,0,0,null,null,0,0,"Pulgar derecho; práctica completa el miércoles"],
["TB","Jalon Daniels","QB",4,501,3,20,126,0,null,null,0,1,"Suplente si Mayfield juega"],
["TB","Bucky Irving","RB",6,0,0,96,452,2,17,74,1,0,""],
["TB","Emeka Egbuka","WR",6,0,0,0,0,0,28,240,2,0,""],
["TB","Chris Godwin","WR",6,0,0,0,0,0,23,216,0,0,""],
["TB","Cade Otton","TE",6,0,0,0,0,0,19,186,0,0,""],
["HOU","C.J. Stroud","QB",6,1714,9,16,76,1,null,null,0,0,""],
["HOU","Woody Marks","RB",6,0,0,58,205,2,13,79,0,0,""],
["HOU","Nico Collins","WR",4,0,0,0,0,0,22,323,3,0,""],
["HOU","Jaylin Noel","WR",6,0,0,0,0,0,17,334,2,0,""],
["HOU","Dalton Schultz","TE",6,0,0,0,0,0,28,277,0,0,""],
["NYG","Jameis Winston","QB",5,957,7,12,46,0,null,null,0,1,"Suplente: J.J. McCarthy abre ante HOU (Giants, 22 oct)"],
["NYG","Cam Skattebo","RB",6,0,0,81,294,1,10,79,0,0,""],
["NYG","Malik Nabers","WR",6,0,0,0,0,0,41,494,2,0,""],
["NYG","Malachi Fields","WR",6,0,0,0,0,0,12,165,1,0,""],
["NYG","Isaiah Likely","TE",6,0,0,0,0,0,39,383,5,0,""],
["BAL","Lamar Jackson","QB",4,967,6,19,144,1,null,null,0,0,"Práctica completa el miércoles tras perderse 3 juegos; se espera titular ante BUF"],
["BAL","Derrick Henry","RB",6,0,0,130,534,7,9,64,1,0,""],
["BAL","Zay Flowers","WR",5,0,0,0,0,0,32,471,2,0,""],
["BAL","Rashod Bateman","WR",6,0,0,0,0,0,16,233,1,0,""],
["BAL","Mark Andrews","TE",6,0,0,0,0,0,23,181,1,0,""],
["CIN","Joe Burrow","QB",5,1361,11,15,48,1,null,null,0,0,""],
["CIN","Chase Brown","RB",5,0,0,71,246,1,24,124,0,0,""],
["CIN","Tee Higgins","WR",5,0,0,0,0,0,27,423,1,0,""],
["CIN","Ja'Marr Chase","WR",5,0,0,0,0,0,27,289,4,0,""],
["CIN","Mike Gesicki","TE",5,0,0,0,0,0,12,159,4,0,""],
["MIN","Kyler Murray","QB",4,662,2,20,93,0,null,null,0,0,""],
["MIN","Aaron Jones","RB",5,0,0,97,410,2,12,72,0,0,""],
["MIN","Justin Jefferson","WR",4,0,0,0,0,0,19,258,3,0,""],
["MIN","Jordan Addison","WR",4,0,0,0,0,0,11,163,1,0,"Sin designación; práctica completa toda la semana"],
["MIN","T.J. Hockenson","TE",5,0,0,0,0,0,23,202,1,0,"Sin designación; práctica completa toda la semana"],
["IND","Daniel Jones","QB",6,1290,4,17,55,1,null,null,0,0,""],
["IND","Jonathan Taylor","RB",6,0,0,122,492,7,15,163,0,0,""],
["IND","Josh Downs","WR",6,0,0,0,0,0,24,289,0,0,""],
["IND","Keenan Allen","WR",5,0,0,0,0,0,26,227,1,0,""],
["IND","Tyler Warren","TE",5,0,0,0,0,0,30,213,2,0.25,"Ingle; limitado (estimado) el miércoles"],
["NYJ","Geno Smith","QB",6,1336,7,20,42,0,null,null,0,0,""],
["NYJ","Braelon Allen","RB",6,0,0,74,314,2,9,45,0,0,""],
["NYJ","Breece Hall","RB",3,0,0,51,163,1,10,102,0,0.25,"Cuádriceps; práctica limitada el miércoles"],
["NYJ","Garrett Wilson","WR",6,0,0,0,0,0,35,418,3,0,""],
["NYJ","Kenyon Sadiq","TE",6,0,0,0,0,0,15,158,1,0,""],
["MIA","Malik Willis","QB",5,849,2,27,186,2,null,null,0,0,""],
["MIA","Ollie Gordon","RB",5,0,0,47,236,3,null,null,0,0,"RB principal por la baja de De'Von Achane"],
["MIA","Malik Washington","WR",5,0,0,0,0,0,23,262,0,0,""],
["MIA","Greg Dulcich","TE",5,0,0,0,0,0,13,127,0,0,""],
["TEN","Cam Ward","QB",6,998,4,17,66,2,null,null,0,0,""],
["TEN","Tony Pollard","RB",6,0,0,87,349,1,null,null,0,0,""],
["TEN","Carnell Tate","WR",6,0,0,0,0,0,29,344,1,0,""],
["TEN","Wan'Dale Robinson","WR",6,0,0,0,0,0,25,198,2,0,""],
["CLE","Deshaun Watson","QB",6,1174,7,45,196,0,null,null,0,0,""],
["CLE","Quinshon Judkins","RB",5,0,0,73,221,1,18,102,0,0,"Fuera del reporte de lesiones; jugará"],
["CLE","Denzel Boston","WR",6,0,0,0,0,0,17,345,3,0,""],
["CLE","KC Concepcion","WR",6,0,0,0,0,0,22,186,0,0,""],
["CLE","Harold Fannin","TE",6,0,0,0,0,0,19,166,3,0,""],
["ARI","Jacoby Brissett","QB",6,1328,9,19,64,1,null,null,0,0,""],
["ARI","Jeremiyah Love","RB",5,0,0,67,245,1,11,36,1,0.5,"Tobillo; estado para el domingo por confirmar"],
["ARI","Tyler Allgeier","RB",6,0,0,53,157,1,13,54,0,0,""],
["ARI","Michael Wilson","WR",6,0,0,0,0,0,33,320,1,0,""],
["ARI","Kendrick Bourne","WR",6,0,0,0,0,0,22,225,0,0,""],
["ARI","Trey McBride","TE",6,0,0,0,0,0,49,361,3,0,""],
["DEN","Bo Nix","QB",6,1049,6,22,37,1,null,null,0,0,""],
["DEN","J.K. Dobbins","RB",6,0,0,81,270,2,null,null,0,0,""],
["DEN","RJ Harvey","RB",5,0,0,21,81,1,23,163,0,0,""],
["DEN","Jaylen Waddle","WR",6,0,0,0,0,0,22,228,1,0,""],
["DEN","Courtland Sutton","WR",6,0,0,0,0,0,13,123,1,0,"Pat Bryant a la lista de lesionados"],
["DEN","Evan Engram","TE",6,0,0,0,0,0,12,134,1,0,""],
["DET","Jared Goff","QB",5,1485,12,10,16,1,null,null,0,0,""],
["DET","Jahmyr Gibbs","RB",5,0,0,105,504,7,27,243,2,0,""],
["DET","Amon-Ra St. Brown","WR",5,0,0,0,0,0,37,372,5,0,""],
["DET","Jameson Williams","WR",5,0,0,0,0,0,18,276,2,0,""],
["DET","Sam LaPorta","TE",5,0,0,0,0,0,27,316,3,0,""],
["GB","Jordan Love","QB",6,1684,11,11,10,1,null,null,0,0,""],
["GB","MarShawn Lloyd","RB",6,0,0,48,122,2,10,55,1,0,"Josh Jacobs ya fue reactivado; puede quitarle carreras"],
["GB","Christian Watson","WR",6,0,0,0,0,0,29,538,6,0,""],
["GB","Matthew Golden","WR",6,0,0,0,0,0,30,501,3,0.5,"Hombro/pie; limitado el miércoles, en duda ante CAR"],
["GB","Tucker Kraft","TE",6,0,0,0,0,0,25,249,1,0,""],
["LV","Kirk Cousins","QB",6,1582,14,12,-2,0,null,null,0,0,""],
["LV","Ashton Jeanty","RB",6,0,0,98,313,1,26,251,2,0,""],
["LV","Tre Tucker","WR",6,0,0,0,0,0,24,371,3,0,""],
["LV","Brock Bowers","TE",4,0,0,0,0,0,28,382,3,0,""],
["LV","Michael Mayer","TE",6,0,0,0,0,0,28,266,1,0,""],
["LAR","Matthew Stafford","QB",6,1794,11,11,21,0,null,null,0,0,""],
["LAR","Kyren Williams","RB",6,0,0,80,393,4,30,217,1,0,""],
["LAR","Puka Nacua","WR",4,0,0,0,0,0,37,417,1,0,"Más volumen por la baja de Davante Adams (6-10 semanas)"],
["LAR","Tyler Higbee","TE",6,0,0,0,0,0,24,246,1,0,""],
["SEA","Sam Darnold","QB",5,1033,7,0,0,0,null,null,0,0,""],
["SEA","Emanuel Wilson","RB",6,0,0,87,303,2,null,null,0,0,""],
["SEA","Jaxon Smith-Njigba","WR",6,0,0,0,0,0,49,717,7,0,""],
["SEA","Cooper Kupp","WR",6,0,0,0,0,0,16,179,1,0,""],
["SEA","AJ Barner","TE",6,0,0,0,0,0,15,138,0,0,""],
["KC","Patrick Mahomes","QB",5,1309,9,17,57,1,null,null,0,0,""],
["KC","Kenneth Walker III","RB",5,0,0,106,665,6,14,95,2,0,""],
["KC","Tyquan Thornton","WR",4,0,0,0,0,0,11,219,2,1,"En la lista de lesionados (IR)"],
["KC","Xavier Worthy","WR",5,0,0,0,0,0,21,206,1,0,""],
["KC","Travis Kelce","TE",5,0,0,0,0,0,20,299,2,0,""],
["PHI","Tanner McKee","QB",1,215,1,0,0,0,null,null,0,0,"Titular: Jalen Hurts fuera el resto de la temporada. Muestra de 1 juego"],
["PHI","Dameon Pierce","RB",2,0,0,23,49,1,null,null,0,0,"Titular si Saquon no juega"],
["PHI","Saquon Barkley","RB",4,0,0,36,182,0,null,null,0,0.5,"Isquiotibial/espalda; no practicó el miércoles"],
["PHI","DeVonta Smith","WR",4,0,0,0,0,0,26,310,2,0.5,"Isquiotibial; no practicó el miércoles"],
["PHI","Dontayvion Wicks","WR",6,0,0,0,0,0,19,284,1,0,""],
["PHI","Dallas Goedert","TE",4,0,0,0,0,0,17,180,2,0,""],
["DAL","Dak Prescott","QB",6,1639,10,14,73,0,null,null,0,0,""],
["DAL","Javonte Williams","RB",6,0,0,85,317,7,19,103,1,0,""],
["DAL","CeeDee Lamb","WR",6,0,0,0,0,0,48,577,4,0,""],
["DAL","George Pickens","WR",6,0,0,0,0,0,33,428,1,0,""],
["DAL","Jake Ferguson","TE",6,0,0,0,0,0,17,115,3,0,""]
].map(x=>({t:x[0],n:x[1],pos:x[2],g:x[3],py:x[4],ptd:x[5],ra:x[6],ry:x[7],rtd:x[8],rec:x[9],rcy:x[10],rctd:x[11],st:x[12],nt:x[13]}));
// defensa 2026: partidos, puntos, yds de pase y yds por tierra permitidas (Pro-Football-Reference, al 19 oct)
const DF={MIN:[5,64,866,433],KC:[5,83,1086,444],SF:[5,93,998,488],CIN:[5,109,1106,615],NE:[6,113,1254,551],CHI:[6,119,1271,543],CLE:[6,122,1231,674],SEA:[6,122,848,576],NYJ:[6,122,1110,738],CAR:[5,123,1110,661],DEN:[6,125,1251,839],GB:[6,125,1160,686],PIT:[6,128,1226,619],TEN:[6,129,1323,735],MIA:[5,132,1096,553],BAL:[6,132,1262,603],PHI:[6,137,1467,716],TB:[6,138,1344,453],LAR:[6,138,1002,762],NYG:[6,140,1141,813],HOU:[6,143,1476,498],DET:[5,148,1487,535],ATL:[6,153,1512,499],DAL:[6,159,1396,899],LV:[6,162,1424,806],IND:[6,164,1372,735],NO:[6,178,1438,828],ARI:[6,178,1378,725]};
const LGP=220,LGR=110,LGS=23.1,PK2=2,PRI={QB:{py:225,ptd:1.4,ry:15,td:.15},RB:{ry:60,rec:2.5,rcy:18,td:.5},WR:{rec:4.5,rcy:55,td:.35},TE:{rec:3.5,rcy:38,td:.3}};
const shr=(tot,g,pr)=>(tot+pr*PK2)/(g+PK2),fct=(v,lg)=>1+.5*(v/lg-1);
const poisCDF=(k,l)=>{let s=0,p=Math.exp(-l);for(let i=0;i<=k;i++){s+=p;p*=l/(i+1)}return s};
const PDAYS=D.map((d,i)=>[d[0],d[1],i]).filter(d=>d[1].length&&!d[1][0].aud);
let pday=0,PLINE={};
function opp(t){for(const d of D)for(const g of d[1])if(!g.aud&&(g.h===t||g.a===t))return g.h===t?g.a:g.h;return null}
function pmk(p,o){const df=DF[o],pr=PRI[p.pos]||PRI.WR,fP=df?fct(df[2]/df[0],LGP):1,fR=df?fct(df[3]/df[0],LGR):1,fS=df?fct(df[1]/df[0],LGS):1,M=[];
 const nrm=(id,lab,mu,sd)=>M.push({id,lab,mu,sd,kind:"n"}),poi=(id,lab,l)=>M.push({id,lab,mu:l,kind:"p"});
 if(p.pos==="QB"){nrm("py","Yardas de pase",shr(p.py,p.g,pr.py)*fP,62);poi("ptd","TD de pase",shr(p.ptd,p.g,pr.ptd)*fS);const ry=shr(p.ry,p.g,pr.ry)*fR;if(ry>=18)nrm("ry","Yardas por tierra",ry,Math.max(12,.55*ry))}
 else if(p.pos==="RB"){const ry=shr(p.ry,p.g,pr.ry)*fR;nrm("ry","Yardas por tierra",ry,Math.max(15,.45*ry));if(p.rec!=null&&p.rec/p.g>=1.5){poi("rec","Recepciones",shr(p.rec,p.g,pr.rec)*fP);nrm("rcy","Yardas por recepción",shr(p.rcy,p.g,pr.rcy)*fP,Math.max(10,.6*shr(p.rcy,p.g,pr.rcy)))}
  M.push({id:"td",lab:"Anota TD",mu:shr(p.rtd+p.rctd,p.g,pr.td)*fS,kind:"td"})}
 else{const y=shr(p.rcy,p.g,pr.rcy)*fP;nrm("rcy","Yardas por recepción",y,Math.max(14,.55*y));poi("rec","Recepciones",shr(p.rec,p.g,pr.rec)*fP);M.push({id:"td",lab:"Anota TD",mu:shr(p.rctd,p.g,pr.td)*fS,kind:"td"})}
 return M}
function pline(p,m){const k=p.t+"|"+p.n+"|"+m.id;if(PLINE[k]!=null)return PLINE[k];return m.kind==="td"?.5:m.kind==="p"?Math.max(.5,Math.round(m.mu)-.5):half(m.mu)}
function pprob(m,L){if(m.kind==="td")return 1-Math.exp(-m.mu);if(m.kind==="p")return 1-poisCDF(Math.floor(L),m.mu);return 1-phi((L-m.mu)/m.sd)}
function safeAlt(m){if(m.kind==="td")return null;if(m.kind==="p"){let L=Math.floor(m.mu)-.5;while(L>.5&&1-poisCDF(Math.floor(L),m.mu)<.68)L-=1;return L>=.5?L:null}const L=Math.floor((m.mu-.5*m.sd)/5)*5+.5;return L>0?L:null}
function drawProps(){const box=$("tjx");if(!box)return;if(!PDAYS.length){box.innerHTML='<div class="panel">No hay partidos próximos.</div>';return}
 const d=PDAYS[Math.min(pday,PDAYS.length-1)];
 let html=`<div class="chips">${PDAYS.map((x,i)=>`<button class="chip ${i==pday?"a":""}" data-pd="${i}">${x[0]} · ${x[1].length}</button>`).join("")}</div>`;
 const top=[];
 const games=d[1].map(g=>{const ps=PJ.filter(p=>(p.t===g.h||p.t===g.a)&&p.st<1);return{g,ps}});
 games.forEach(({g,ps})=>ps.forEach(p=>{if(p.st>=.5)return;pmk(p,opp(p.t)).forEach(m=>{if(m.kind==="td"){const pr=pprob(m);if(pr>=.45)top.push({p,m,l:"Anota TD",pr,g})}else{const L=safeAlt(m);if(L!=null&&(m.kind==="p"?L>=3.5:L>=20)){const pr=pprob(m,L);if(pr>=.64&&pr<=.78)top.push({p,m,l:`Más de ${L} ${m.lab.toLowerCase()}`,pr,g})}}})}));
 top.sort((a,b)=>b.pr-a.pr);const seen=new Set(),uniq=L=>L.filter(z=>{const k=z.p.n;if(seen.has(k))return false;seen.add(k);return true});
 const tds=uniq(top.filter(z=>z.m.kind==="td")).slice(0,5),alts=uniq(top.filter(z=>z.m.kind!=="td")).slice(0,6),row=z=>`<div class="pjr">${typeof MSC!=="undefined"&&MSC.ok[z.p.t]?`<img class="pjm2" src="${MSC.ok[z.p.t]}" alt="${z.p.t}">`:""}<div style="flex:1;min-width:0"><b>${z.p.n}</b> <small>${z.p.t} · ${z.p.pos} vs ${opp(z.p.t)}</small><br><span>${z.l}</span></div><b>${pc(z.pr)}<small>justa ${(1/z.pr).toFixed(2)}</small></b></div>`;
 html+=`<div class="panel pjtop"><h3>ANOTA TD · MÁS PROBABLES · ${d[0].replace(/^Hoy · /,"").toUpperCase()}</h3>${tds.map(row).join("")||'<div class="pjn">Nadie llega a 45%.</div>'}<h3 style="margin-top:14px">YARDAS Y RECEPCIONES · LÍNEAS ALTERNAS</h3>${alts.map(z=>`<div class="pjr">${typeof MSC!=="undefined"&&MSC.ok[z.p.t]?`<img class="pjm2" src="${MSC.ok[z.p.t]}" alt="${z.p.t}">`:""}<div style="flex:1;min-width:0"><b>${z.p.n}</b> <small>${z.p.t} · ${z.p.pos} vs ${opp(z.p.t)}</small><br><span>${z.l}</span></div><b>${pc(z.pr)}<small>justa ${(1/z.pr).toFixed(2)}</small></b></div>`).join("")||'<div class="pjn">Sin opciones de 64% o más.</div>'}
 <div class="pjn">Un pick por jugador, solo de jugadores sin duda de lesión. Líneas alternas de 64% a 78% (yardas desde 20.5, recepciones desde 3.5): pagan poco, úsalas para parlays. Comprueba que tu casa ofrezca esa línea y escribe su cuota abajo para ver si tiene valor.</div></div>`;
 html+=games.map(({g,ps})=>`<div class="panel"><h3>${g.h} VS ${g.a}${g.t?" · "+g.t:""}</h3>${ps.map(p=>{const o=opp(p.t),M=pmk(p,o);return`<div class="pjp ${p.st>=1?"s1":p.st>0?"s5":""}"><div class="pjh">${window.PAV?PAV(p):(window.AV?AV(p.t,p.n):"")}<div><b>${p.n}</b><small>${p.t} · ${p.pos} · ${p.g} juegos · vs ${o}</small>${p.st>0?`<span class="pjd">DUDA</span>`:""}${p.nt?`<div class="pjnt">${p.nt}</div>`:""}</div></div>
  <div class="pjm hd"><span>MERCADO</span><span>PROY.</span><span>LÍNEA</span><span>MÁS</span><span>MENOS</span></div>
  ${M.map(m=>{const L=pline(p,m),po=pprob(m,L),k="PJ:"+p.t+":"+p.n+":"+m.id,dO=dec(SO[k+"|o"]),dU=dec(SO[k+"|u"]),eO=dO?po*dO-1:null,eU=dU?(1-po)*dU-1:null;
   return`<div class="pjm"><span>${m.lab}</span><span class="pr">${m.kind==="td"?pc(po):m.mu.toFixed(m.kind==="p"?1:0)}</span><span>${m.kind==="td"?"Sí / No":`<input type="text" inputmode="decimal" data-pl="${p.t}|${p.n}|${m.id}" value="${L}">`}</span>
   <span class="pv"><b>${pc(po)}</b><input type="text" inputmode="decimal" data-o="${k}|o" value="${SO[k+"|o"]||""}" placeholder="cuota">${eO!=null?`<em class="${eO>0?"pos":"neg"}">EV ${eO>0?"+":""}${(eO*100).toFixed(0)}%</em>`:""}</span>
   <span class="pv"><b>${pc(1-po)}</b><input type="text" inputmode="decimal" data-o="${k}|u" value="${SO[k+"|u"]||""}" placeholder="cuota">${eU!=null?`<em class="${eU>0?"pos":"neg"}">EV ${eU>0?"+":""}${(eU*100).toFixed(0)}%</em>`:""}</span></div>`}).join("")}</div>`}).join("")}</div>`).join("");
 html+=`<div class="note"><b>Cómo calcula:</b> el promedio por juego del jugador en 2026 (con un freno de 2 juegos hacia el promedio de su posición, para que una muestra corta no exagere) × qué tanto permite la defensa rival frente al promedio de la liga (a la mitad, porque también es muestra corta). Yardas: curva normal; recepciones y TD de pase: Poisson; "Anota TD": probabilidad de al menos un TD por tierra o recepción. La línea que aparece es la del modelo: cámbiala por la de tu casa y escribe las cuotas para ver el EV. Datos de Pro-Football-Reference al 19 oct (las cifras de SF no incluyen el lunes 19 ante WAS); las cifras de jugadores no incluyen los juegos de la semana 7 (las bajas sí se actualizaron con los reportes del miércoles 28 oct: CBS Sports, Yahoo y NFL.com). Los "DUDA" dependen de las prácticas del jueves y viernes. Referencia estadística; no garantiza resultados.</div>`;
 box.innerHTML=html}
document.addEventListener("click",e=>{const t=e.target;if(t.dataset&&t.dataset.pd!=null){pday=+t.dataset.pd;drawProps()}if(t.dataset&&t.dataset.t){const on=t.dataset.t==="j"&&t.closest("#nav");$("tj").classList.toggle("hide",!on);if(on){["g","s","w","n","e"].forEach(x=>$("t"+x).classList.add("hide"));drawProps()}}});
document.addEventListener("change",e=>{const t=e.target;if(t.dataset&&t.dataset.pl){const v=parseFloat(String(t.value).replace(",","."));if(isNaN(v))delete PLINE[t.dataset.pl];else PLINE[t.dataset.pl]=v;drawProps()}else if(t.dataset&&t.dataset.o&&t.dataset.o.startsWith("PJ:"))drawProps()});
try{drawProps()}catch(e){}
