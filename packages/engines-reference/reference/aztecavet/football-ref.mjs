
const AVX={odds:{},EVMIN:.04,th:.6,bank:1000,inSlip:new Set(),pk:{},cbs:[],
  unit:()=>0,setOdd:()=>{},add:()=>{},on:()=>{},addBtn:()=>"",stakeBox:()=>"",noVig:()=>({p:{},mg:[]}),anim:()=>{},fmt:""};
const document={addEventListener(){},getElementById:()=>({innerHTML:"",value:"",textContent:"",style:{},
  classList:{toggle(){},add(){},remove(){},contains:()=>false},addEventListener(){},on(){},appendChild(){},children:[],
  dataset:{},scrollTop:0,querySelectorAll:()=>[],querySelector:()=>null,contentWindow:null,scrollIntoView(){}})};
const window={addEventListener(){},__START:undefined};
const parent={postMessage(){}};
const localStorage={getItem:()=>null,setItem(){}};
const performance={now:()=>0};
const requestAnimationFrame=()=>0;const cancelAnimationFrame=()=>{};
const setTimeout=()=>0;const clearTimeout=()=>{};
const Image=function(){};const CSS={escape:s=>s};
const LG0={PL:1.45,LL:1.35,MX:1.51,SA:1.21,BL:1.62,L1:1.41,OT:1.40},STR={PL:1,LL:.98,BL:.96,SA:.96,L1:.92,MX:.8,OT:.85},LGU=1.45;
const E=1.7,HFA=.54,SHR=.85,DRAW=.28,DCO=.42,K=6,NG=14,ed={},SO=AVX.odds;
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
// Europa League 26/27: Serie A, Bundesliga y Ligue 1 con su liga 2025-26 (Wikipedia); el resto sin dato de liga. En todos, el campo actual son sus 3 partidos de la fase de liga (GF, GC, PJ)
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
const TM={};TD.forEach(t=>TM[t[0]]={c:t[0],n:t[1],lg:t[2],gf:t[3],ga:t[4],gp:t[5],cur:t[6],fl:t[7],comps:t[8].split(",")});
const COMPS={
 MX:{n:"Liga MX",sub:"APERTURA 2026 · JORNADA 16",lg:"MX",em:"MX",g:"linear-gradient(160deg,#00d68f,#04503a 70%,#021a14)",gl:"rgba(0,214,143,.55)",ac:"#00d68f",ac2:"#04503a",sim:["AME","MTY"]},
 LL:{n:"La Liga",sub:"ESPAÑA · 2026-27",lg:"LL",em:"ES",g:"linear-gradient(160deg,#ff8a1f,#8a2a00 70%,#2a0c00)",gl:"rgba(255,138,31,.55)",ac:"#ff8a1f",ac2:"#6e2300",sim:["BAR","RMA"]},
 PL:{n:"Premier League",sub:"INGLATERRA · 2026-27",lg:"PL",em:"EN",g:"linear-gradient(160deg,#c15bff,#3a0b7a 70%,#12032e)",gl:"rgba(193,91,255,.55)",ac:"#c15bff",ac2:"#34096f",sim:["ARS","MCI"]},
 UCL:{n:"Champions League",sub:"UEFA · FASE DE LIGA 26/27",lg:"OT",em:"UCL",g:"linear-gradient(160deg,#3d8bff,#0b2a7a 70%,#030c2e)",gl:"rgba(61,139,255,.6)",ac:"#3d8bff",ac2:"#0b2a7a",sim:["BMU","PSG"]},
 UEL:{n:"Europa League",sub:"UEFA · FASE DE LIGA 26/27",lg:"OT",em:"UEL",g:"linear-gradient(160deg,#ffb020,#7a3d00 70%,#241200)",gl:"rgba(255,176,32,.55)",ac:"#ffb020",ac2:"#7a3d00",sim:["SLB","B04"]}};
const CK=["MX","LL","PL","UCL","UEL"];
// partidos: [local, visita, hora CST (CDMX), ref 1/X/2 %, nota]
const mk=(arr)=>arr.map(g=>({h:g[0],a:g[1],t:g[2],ref:g[3],s:g[4]}));
const aud=(arr)=>arr.map(g=>({h:g[0],a:g[1],t:"Final",sc:[g[2],g[3]]}));
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
["Auditoría 16-17 sep (jornada 1)",aud([["ARA", "SPA", 1, 4], ["OMO", "RCC", 1, 0], ["MIL", "SLB", 0, 2], ["B04", "CLJ", 2, 0], ["HBS", "DZG", 0, 0], ["OLY", "JAG", 2, 1], ["AND", "LYO", 1, 2], ["STU", "REN", 0, 0], ["SUN", "AZA", 1, 0], ["OFI", "TSG", 2, 0], ["LSO", "RBS", 0, 1], ["BJK", "MAR", 4, 1], ["CEL", "FTC", 1, 3], ["CRY", "LPO", 4, 0], ["VPL", "USG", 0, 3], ["JUV", "NIJ", 5, 0], ["LSK", "TOR", 1, 2], ["RSO", "BOU", 1, 2]])]]};
const GM={};CK.forEach(c=>DD[c].forEach((d,i)=>d[1].forEach((g,j)=>{g.k=c+i+"-"+j;g.dl=d[0].replace(/^Hoy · /,"");g.cp=c;if(g.sc)g.aud=true;GM[g.k]=g})));
let CP=null,day=0,OPEN=null,TMR=[];const SIMS={};CK.forEach(c=>SIMS[c]={k:"sim"+c,h:COMPS[c].sim[0],a:COMPS[c].sim[1],cp:c,t:"Simulación"});CK.forEach(c=>GM["sim"+c]=SIMS[c]);
const $=id=>document.getElementById(id);
const pois=l=>{const a=[];let p=Math.exp(-l);a.push(p);for(let k=1;k<NG;k++){p*=l/k;a.push(p)}return a};
const over=(l,line)=>{const a=pois(l);let c=0;for(let k=0;k<=Math.floor(line);k++)c+=a[k];return 1-c};
const half=x=>{let l=Math.round(x*2)/2;if(Number.isInteger(l))l+=.5;return l};
function shr(lh,la){const p=pois(lh),q=pois(la);let w=0,l=0;for(let i=0;i<NG;i++)for(let j=0;j<NG;j++){if(i>j)w+=p[i]*q[j];else if(i<j)l+=p[i]*q[j]}return w/(w+l)}
function tilt(lh,la,t){let lo=-1.5,hi=1.5;for(let k=0;k<16;k++){const m=(lo+hi)/2;if(shr(lh*Math.exp(m),la*Math.exp(-m))<t)lo=m;else hi=m}const d=(lo+hi)/2;return[lh*Math.exp(d),la*Math.exp(-d)]}
const dec=s=>{const v=parseFloat(String(s).replace(",","."));if(isNaN(v))return null;if(Math.abs(v)>=100)return v>0?1+v/100:1+100/-v;return v>1?v:null};
function base(c,useCur){const t=TM[c],lg=LG0[t.lg],e=ed[c];if(e)return{rs:e.rs,ra:e.ra,lg};if(!t.gp&&!(useCur&&t.cur))return{rs:lg,ra:lg,lg};let F=t.gf,A=t.ga,G=t.gp;if(useCur&&t.cur){F+=3*t.cur[0];A+=3*t.cur[1];G+=3*t.cur[2]}return{rs:(F+K*lg)/(G+K),ra:(A+K*lg)/(G+K),lg}}
function rate(c,comp,useCur){const b=base(c,useCur);if(comp!=="UCL"&&comp!=="UEL")return{rs:b.rs,ra:b.ra};const s=STR[TM[c].lg];return{rs:b.rs/b.lg*s*LGU,ra:b.ra/b.lg/s*LGU}}
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
 .map(x=>({id:x[0],t:x[1],n:x[2],r:x[3],i:x[4],st:x[5],h:x[6],d:x[7]}));
function inj(t,r,au){if(au)return r;let rs=r.rs,ra=r.ra;NW.forEach(x=>{if(x.t===t&&x.st>0){const d=x.i*x.st;if(x.r==="gf")rs-=d;else ra+=d}});return{rs:Math.max(rs,.3),ra:Math.max(ra,.3)}}
const INJ=g=>g.aud?"":NW.filter(x=>(x.t===g.h||x.t===g.a)&&x.st>0).map(x=>`<span class="bd">${x.t} · ${x.n}${x.st<1?" (duda)":" fuera"}</span>`).join("");
function model0(h,a,comp,au){
 const H=inj(h,rate(h,comp,!au),au),A=inj(a,rate(a,comp,!au),au),LG=(comp==="UCL"||comp==="UEL")?LGU:LG0[COMPS[comp].lg],py=t=>Math.pow(t.rs,E)/(Math.pow(t.rs,E)+Math.pow(t.ra,E));
 const x=py(H),y=py(A),pn=(x-x*y)/(x+y-2*x*y),o=pn/(1-pn)*(HFA/(1-HFA)),share=.5+SHR*(o/(1+o)-.5);
 let [lh,la]=tilt(H.rs*A.ra/LG,A.rs*H.ra/LG,share);const tot=lh+la,P=pois(lh),Q=pois(la),rho=comp==="MX"?-.14:-.08,tau=(i,j)=>i==0&&j==0?1-lh*la*rho:i==0&&j==1?1+lh*rho:i==1&&j==0?1+la*rho:i==1&&j==1?1-rho:1;
 let w=0,d=0,l=0,m2h=0,m2a=0;for(let i=0;i<NG;i++)for(let j=0;j<NG;j++){const p=P[i]*Q[j]*tau(i,j);if(i>j)w+=p;else if(i==j)d+=p;else l+=p;if(i-j>=2)m2h+=p;if(j-i>=2)m2a+=p}
 const line=half(tot),lH=half(lh),lA=half(la),favH=w>=l,plf=favH?m2h:m2a,fn=favH?h:a,dn=favH?a:h,pO=over(tot,line),bt=(1-Math.exp(-lh))*(1-Math.exp(-la));
 const O=[
 {id:"h",l:h+" gana",p:w,f:(p,q)=>p>q},{id:"d",l:"Empate",p:d,f:(p,q)=>p==q},{id:"a",l:a+" gana",p:l,f:(p,q)=>q>p},
 {id:"ov",l:"Over "+line,p:pO,f:(p,q)=>p+q>line},{id:"un",l:"Under "+line,p:1-pO,f:(p,q)=>p+q<line},
 {id:"plf",l:fn+" −1.5",p:plf,f:(p,q)=>favH?p-q>=2:q-p>=2},{id:"pld",l:dn+" +1.5",p:1-plf,f:(p,q)=>favH?!(p-q>=2):!(q-p>=2)},
 {id:"dc1x",l:h+" o empate",p:w+d,g:1,f:(p,q)=>p>=q},{id:"dcx2",l:"Empate o "+a,p:d+l,g:1,f:(p,q)=>q>=p},{id:"dc12",l:h+" o "+a+" (sin empate)",p:w+l,g:1,f:(p,q)=>p!=q},
 {id:"o15",l:"Over 1.5",p:over(tot,1.5),g:1,f:(p,q)=>p+q>1.5},{id:"u35",l:"Under 3.5",p:1-over(tot,3.5),g:1,f:(p,q)=>p+q<3.5},{id:"o35",l:"Over 3.5",p:over(tot,3.5),g:1,f:(p,q)=>p+q>3.5},
 {id:"tho",l:h+" Over "+lH,p:over(lh,lH),g:1,f:p=>p>lH},{id:"thu",l:h+" Under "+lH,p:1-over(lh,lH),g:1,f:p=>p<lH},{id:"tao",l:a+" Over "+lA,p:over(la,lA),g:1,f:(p,q)=>q>lA},{id:"tau",l:a+" Under "+lA,p:1-over(la,lA),g:1,f:(p,q)=>q<lA},
 {id:"by",l:"Ambos anotan: Sí",p:bt,g:1,f:(p,q)=>p>0&&q>0},{id:"bn",l:"Ambos anotan: No",p:1-bt,g:1,f:(p,q)=>!(p>0&&q>0)}];
 const by=id=>O.find(z=>z.id==id),dom=H.rs>A.rs&&H.ra<A.ra?"h":A.rs>H.rs&&A.ra<H.ra?"a":null;let cp,ct;
 if(dom&&by(dom).p>=.42){cp=by(dom);ct="GANA · DOMINA EN ATAQUE Y DEFENSA"}
 else if(dom){cp=by(dom=="h"?"dc1x":"dcx2");ct="DOMINA, PERO PARTIDO CERRADO · DOBLE OPORTUNIDAD"}
 else{const fv=by(favH?"h":"a");if(fv.p>=.5){cp=fv;ct="FAVORITO (sin dominio total)"}else{const dc=by(favH?"dc1x":"dcx2");if(dc.p>=.65){cp=dc;ct="SIN VENTAJA CLARA · OPCIÓN MÁS SEGURA"}else{cp=by("u35");ct="SIN VENTAJA CLARA · TOTAL MÁS SEGURO"}}}
 /* empate probable: en lugar de ganador directo, doble oportunidad */
 if(d>=DRAW&&(cp.id==="h"||cp.id==="a")){cp=by(cp.id==="h"?"dc1x":"dcx2");ct="EMPATE PROBABLE ("+(d*100).toFixed(0)+"%) · DOBLE OPORTUNIDAD"}
 /* doble oportunidad sola paga poco: se combina con Over 1.5 si sigue siendo muy probable */
 let wy="";if(cp.id==="dc1x"||cp.id==="dcx2"){const hs=cp.id==="dc1x",dc=cp;let pj=0;for(let i=0;i<NG;i++)for(let j=0;j<NG;j++)if((hs?i>=j:j>=i)&&i+j>=2)pj+=P[i]*Q[j]*tau(i,j);
  if(pj>=DCO){const c={id:"dco15",l:dc.l+" + Over 1.5",p:pj,g:1,f:(p,q)=>(hs?p>=q:q>=p)&&p+q>1.5};O.push(c);cp=c;ct="DOBLE OPORTUNIDAD + GOLES · EMPATE "+(d*100).toFixed(0)+"%";wy=dc.l+" tiene "+(dc.p*100).toFixed(0)+"% pero paga muy poco (justa "+(1/dc.p).toFixed(2)+"). Le sumo Over 1.5 porque el partido proyecta "+tot.toFixed(2)+" goles: la combinada sigue en "+(pj*100).toFixed(0)+"% y sube la cuota."}}
 return{why:wy||undefined,O,cp,ct,dom,lh,la,tot,H,A,x,y,share,w,d,l,line,fav:by(favH?"h":"a")}}
const pc=v=>(v*100).toFixed(1)+"%";
const KEY=g=>"FB:"+(g.cp||"")+":"+(g.dl||"sim")+":"+g.h+"-"+g.a,SPN=g=>"Fútbol · "+COMPS[g.cp].n;
const GR=[["1X2",["h","d","a"]],["total",["ov","un"]],["±1.5",["plf","pld"]],["O/U 3.5",["o35","u35"]],["ambos anotan",["by","bn"]],["total local",["tho","thu"]],["total visita",["tao","tau"]]];
const flags=g=>[g.h,g.a].filter(c=>TM[c].fl&&!ed[c]);
const FL={e:"ESTIMADO",n:"SIN DATO",p:"ASCENDIDO"};
function row(g,o,pk,nv){const gk=KEY(g),k=gk+"|"+o.id,od=SO[k]||"",d=dec(od),ev=d?o.p*d-1:null;let res="";if(g.aud){const ok=o.f(g.sc[0],g.sc[1]);res=` <span style="color:var(--${ok?"ok":"bad"})">${ok?"✓":"✗"}</span>`}
 const s=d&&ev>0?AVX.unit(o.p,d):0,cv=nv&&nv[o.id]!=null?` · <span class="nv">casa ${pc(nv[o.id])}</span>`:"";
 return `<div class="row ${pk?"p":""}">${g.aud?"<span></span>":AVX.addBtn(k,PK(g,o,d))}<span>${o.l}<small>justa ${(1/o.p).toFixed(2)}${cv}</small></span><div class="bar"><i style="width:${o.p*100}%"></i></div><b>${pc(o.p)}${res}</b>${g.aud?"<span></span>":`<div class="od"><input type="text" inputmode="decimal" data-o="${k}" value="${od}" placeholder="cuota">${ev!=null?`<em class="${ev>0?"pos":"neg"}">EV ${ev>0?"+":""}${(ev*100).toFixed(0)}%</em>`:""}${s>0?`<i class="stk">${s}% bank</i>`:""}</div>`}</div>`}
/* sin valor: el usuario ya escribio cuotas y ninguna le saca 4% a la casa */
function NOB(g){if(g.aud)return false;const gk=KEY(g)+"|";return Object.keys(SO).some(k=>k.startsWith(gk)&&dec(SO[k]))}
const CMIN=.35;
function bestOf(g,m){let b=null;const gk=KEY(g);m.O.forEach(o=>{const d=dec(SO[gk+"|"+o.id]);if(d){const ev=o.p*d-1;if(ev>=AVX.EVMIN&&(!b||ev>b.ev))b={o,ev,d}}});return b}
function PK(g,o,d){const gk=KEY(g);return{k:gk+"|"+o.id,gk,sp:SPN(g),m:g.h+" vs "+g.a,l:o.l,p:+o.p.toFixed(4),d:d||null,t:(g.dl||"Simulación")+(g.t?" · "+g.t:"")}}
function NV(g){const gk=KEY(g);return AVX.noVig(GR,id=>dec(SO[gk+"|"+id]))}
function STK(g,pk,b){if(g.aud)return"";const k=KEY(g)+"|"+pk.id,d=b&&b.o===pk?b.d:dec(SO[k]);return AVX.stakeBox(pk,d,k,PK(g,pk,d))}
/* COMBINADAS DEL MISMO PARTIDO: P(fav gana y B) = P_modelo(fav gana) x P_matriz(B | fav gana) */
function cmbBuild(M,fs,pF,fav,cands){let pw=0;const n=M.length;for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(fs(i,j))pw+=M[i][j];if(!pw)return[];
 return cands.map(c=>{let pj=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(fs(i,j)&&c.f(i,j))pj+=M[i][j];return{id:c.id,l:c.full||fav+" gana + "+c.l,p:pF*pj/pw,f:(x,y)=>fs(x,y)&&c.f(x,y)}}).filter(c=>c.p>.05)}
function cmbOT(P,Q){const n=P.length+1,M=Array.from({length:n},()=>new Array(n).fill(0));for(let i=0;i<P.length;i++)for(let j=0;j<Q.length;j++){const v=P[i]*Q[j];if(i!==j)M[i][j]+=v;else{M[i+1][j]+=v/2;M[i][j+1]+=v/2}}return M}
/* cuando hay favorito claro, la combinada ES el pick del modelo (una sola apuesta) */
function model(...A){const m=model0(...A);try{const C=COMBOS({h:A[0],a:A[1]},m);if(C&&C.c&&C.c.p>=CMIN){m.O.push(C.c);m.cp=C.c;m.pick=C.c;m.ct="FAVORITO CLARO · GANA + GOLES";m.why=C.why}}catch(e){}return m}
function CMB(g,m){const C=COMBOS(g,m);if(!C||!C.c)return"";
 return `<div class="combo"><div class="ch">COMBINADA SUGERIDA · FAVORITO CLARO</div>${row(g,C.c,true)}<div class="cs2">${C.why} Búscala como "Crea tu apuesta" o "Bet Builder" y escribe su cuota para ver si tiene valor.</div></div>`}
function COMBOS(g,m){const fh=m.fav.id==="h",pF=m.fav.p;if(pF<0.62||m.d>=DRAW)return null;const fc=fh?g.h:g.a,t=TM[fc],gf=t.cur&&t.cur[2]>=3?t.cur[0]/t.cur[2]:t.gp?t.gf/t.gp:null;
 /* regla: Over 2.5 si el partido proyecta 2.6+ goles o el favorito promedia 3.0+ goles a favor; si no, Over 1.5 */
 const big=m.tot>=2.6||(gf!=null&&gf>=3),L=big?2.5:1.5,P=pois(m.lh),Q=pois(m.la),M=P.map(p=>Q.map(q=>p*q)),fs=fh?(i,j)=>i>j:(i,j)=>j>i;
 const c=cmbBuild(M,fs,pF,fc,[{id:"cb_o"+L,l:"Over "+L,f:(i,j)=>i+j>L}])[0];
 return{c,why:`${fc} gana ${pc(pF)} pero paga poco (justa ${(1/pF).toFixed(2)}). Over ${L} porque el partido proyecta ${m.tot.toFixed(2)} goles${gf!=null?` y ${fc} promedia ${gf.toFixed(1)} goles a favor por partido`:""}${big?"":" (para Over 2.5 pide 2.6+ proyectados o que el favorito promedie 3.0+ a favor)"}.`}}
function MG(nv){return nv.mg.map(([n,v])=>`<span class="bd">Margen casa ${n}: ${(v*100).toFixed(1)}%</span>`).join("")}
function card(g){const m=model(g.h,g.a,g.cp,g.aud),b=g.aud?null:bestOf(g,m),nv=g.aud?{p:{},mg:[]}:NV(g),pk=b?b.o:m.cp,main=m.O.filter(o=>!o.g),ext=m.O.filter(o=>o.g);let ban;
 if(g.aud){const ok=m.cp.f(g.sc[0],g.sc[1]);ban=`<div class="pick"><div><span>PICK PRE-JUEGO · FINAL ${g.sc[0]}–${g.sc[1]}</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.cp.l}</div></div><b style="color:var(--${ok?"ok":"bad"});font-size:20px">${ok?"✓":"✗"}</b></div>`}
 else if(b)ban=`<div class="pick v"><div><span>MEJOR VALOR · EV +${(b.ev*100).toFixed(0)}%</span><div style="margin-top:3px;font-size:16px;font-weight:600">${b.o.l} @ ${b.d.toFixed(2)}</div></div><b>${pc(b.o.p)}</b></div>`;
 else if(NOB(g))ban=`<div class="pick nb"><div><span>SIN VALOR · NO APOSTAR</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.cp.l}</div><small style="display:block;margin-top:3px;font-size:11px;opacity:.8;letter-spacing:0">Ninguna cuota que escribiste le saca 4% de ventaja a la casa. Este pick solo vale si te pagan ${(1.04/m.cp.p).toFixed(2)} o más.</small></div><b>✕</b></div>`;
 else ban=`<div class="pick"><div><span>${m.ct}</span><div style="margin-top:3px;font-size:16px;font-weight:600">${m.cp.l}</div></div><b>${pc(m.cp.p)}</b></div>`;
 const fl=flags(g);
 return `<div class="card"><div class="mt"><div class="tm">${g.h}<small>${TM[g.h].n.toUpperCase()}</small></div><div class="vs">VS</div><div class="tm" style="text-align:right">${g.a}<small>${TM[g.a].n.toUpperCase()}</small></div></div>
 ${g.s?`<div class="ser">${g.s}</div>`:""}<div class="meta"><span>${g.t}</span><span>Proy ${m.lh.toFixed(2)} – ${m.la.toFixed(2)} · Total ${m.tot.toFixed(2)}</span></div>
 ${Array.isArray(g.ref)?`<div class="meta" style="margin-top:0"><span>Ref. proveedor 1 / X / 2</span><span>${g.ref.map(v=>v+"%").join(" · ")}</span></div>`:""}
 ${main.map(o=>row(g,o,o===pk,nv.p)).join("")}
 <details><summary>MÁS MERCADOS (DOBLE OPORTUNIDAD · TOTALES · AMBOS ANOTAN)</summary>${ext.map(o=>row(g,o,o===pk,nv.p)).join("")}</details>${ban}${m.why&&!g.aud?`<div class="cs2" style="margin-top:8px;font-size:11px;line-height:1.45;color:var(--mut)">${m.why} En tu casa búscala como "Crea tu apuesta" o "Bet Builder" y escribe su cuota en la casilla.</div>`:""}${!b&&NOB(g)&&!dec(SO[KEY(g)+"|"+pk.id])?"":STK(g,pk,b)}
 <div class="kp">${INJ(g)}${MG(nv)}${m.dom?`<span class="bd g">${m.dom=="h"?g.h:g.a} domina ataque + defensa</span>`:`<span class="bd">Ningún equipo domina en ataque y defensa</span>`}${fl.map(c=>`<span class="bd">${c}: ${FL[TM[c].fl]}</span>`).join("")}</div></div>`}
function tile(g){const m=model(g.h,g.a,g.cp,g.aud),b=g.aud?null:bestOf(g,m),fl=flags(g);let tag;
 if(g.aud){const ok=m.cp.f(g.sc[0],g.sc[1]);tag=`<b style="color:var(--${ok?"ok":"bad"})">${ok?"✓":"✗"} ${g.sc[0]}–${g.sc[1]}</b>`}else tag=`<b>${pc(b?b.o.p:m.cp.p)}</b>`;
 return `<div class="tile" data-open="${g.k}"><div class="mt"><div class="tm">${g.h}<small>${TM[g.h].n.toUpperCase()}</small></div><span class="ball"></span><div class="tm" style="text-align:right">${g.a}<small>${TM[g.a].n.toUpperCase()}</small></div></div>
 ${g.s?`<div class="ser">${g.s}</div>`:""}<div class="meta"><span>${g.t}</span><span>Proy ${m.lh.toFixed(1)}–${m.la.toFixed(1)}</span></div>
 <div class="tp"><span>${b?"MEJOR VALOR":g.aud?"PICK PRE-JUEGO":NOB(g)?"NO APOSTAR · SIN VALOR":"PICK DEL MODELO"}</span><div>${b?b.o.l:m.cp.l}</div>${tag}</div>${fl.length?`<div style="margin-top:6px">${fl.map(c=>`<span class="bd">${c}: ${FL[TM[c].fl]}</span>`).join("")}</div>`:""}<div class="go">ANALIZAR ▸</div></div>`}
function lines(g){const m=model(g.h,g.a,g.cp,g.aud),f=v=>v.toFixed(2),q=v=>(v*100).toFixed(1)+"%",fl=flags(g);
 return [g.cp==="MX"?"Sincronizando tabla Apertura 2026 (goles a favor y en contra)":"Sincronizando temporada 2025-26 + tabla 2026-27",
 `Ataque/defensa · ${g.h} ${f(m.H.rs)}/${f(m.H.ra)} · ${g.a} ${f(m.A.rs)}/${f(m.A.ra)}`,
 fl.length?`Datos limitados: ${fl.map(c=>c+" ("+FL[TM[c].fl].toLowerCase()+")").join(", ")}`:"Datos completos para ambos equipos",
 (g.aud?"Modo auditoría · sin bajas del día":`Revisando bajas y lesiones · ${NW.filter(x=>(x.t===g.h||x.t===g.a)&&x.st>0).length} ajustes activos`),`Pitágoras 1.7 · ${q(m.x)} vs ${q(m.y)}`,`Log5 + ventaja local 55% → ${g.h} ${q(m.share)} sin empate`,
 `Goles proyectados ${f(m.lh)}–${f(m.la)} · total ${f(m.tot)} · Poisson`,`Empate ${q(m.d)} · escaneando ${m.O.length} mercados`,
 m.dom?`Dominio detectado: ${m.dom=="h"?g.h:g.a}`:"Sin dominio total en ataque y defensa",`Pick del modelo: ${m.cp.l} (${q(m.cp.p)})`,"ANÁLISIS COMPLETO"]}

;const __ref = {model, model0, bestOf, NOB, NV, STK, PK, KEY, SPN, dec, MG, TD, TM, COMPS, DD, NW, AVX, C:{LG0,STR,LGU,E,HFA,SHR,DRAW,DCO,K,NG}};
export default __ref;
