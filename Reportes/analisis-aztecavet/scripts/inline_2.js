
(function(){const $=id=>document.getElementById(id);let busy=false,CUR=null;
const NM={fb:"Fútbol",nhl:"NHL",mlb:"MLB"};
try{const _os=openSport;openSport=function(i){try{CUR=SP[i].pg}catch(e){}return _os(i)}}catch(e){}
const aim=$("aim"),aip=$("aip");
const add=(c,t)=>{const d=document.createElement("div");d.className="am "+c;d.textContent=t;aim.appendChild(d);aim.scrollTop=aim.scrollHeight;return d};
const chips=["Mejor pick de hoy","Bajas importantes","¿Cómo decide la IA?","Resumen de esta pantalla"];
$("aic").innerHTML=chips.map(c=>`<button type="button">${c}</button>`).join("");
function pageDoc(){const f=$("fr");if(!f||f.classList.contains("hide"))return null;try{return f.contentDocument&&f.contentDocument.body?f.contentDocument:null}catch(e){return null}}
function pageText(){const d=pageDoc();if(!d)return "";return (d.body.innerText||"").replace(/[ \t]+/g," ").replace(/\n{2,}/g,"\n").trim().slice(0,9000)}
function ctx(){const d=pageDoc();if(!d)return "El usuario está en el inicio de AZTECA VET. Hay tres deportes: Fútbol (Liga MX, La Liga, Premier League, Champions y Europa League), NHL y MLB (la temporada terminó: campeón MIL). Datos al 6 nov 2026. Para ver picks tiene que abrir un deporte.";
return `Deporte abierto: ${NM[CUR]||"deporte"}. Datos al 6 nov 2026. Lo siguiente es el texto que el usuario ve ahora en pantalla (día seleccionado, pick del día, partidos con probabilidades del modelo, bajas):\n${pageText()}`}
function local(q){const t=q.toLowerCase(),d=pageDoc();
 if(!d)return "Abre un deporte (Fútbol, NHL o MLB) y te respondo con los picks y datos de esa pantalla.";
 const pdx=d.getElementById("pdx");
 if(/pick|mejor/.test(t)&&pdx&&pdx.innerText.trim())return pdx.innerText.trim().replace(/\n{2,}/g,"\n");
 if(/f[oó]rmula|decide|c[oó]mo (funciona|calcula|piensa)/.test(t)){const n=d.querySelector(".note");if(n)return n.innerText.trim()}
 const L=pageText().split("\n"),w=t.split(/[^a-záéíóúñ0-9]+/).filter(x=>x.length>3);
 const hit=L.filter(l=>w.some(x=>l.toLowerCase().includes(x))).slice(0,6);
 return hit.length?hit.join("\n"):"No encuentro eso en esta pantalla. Prueba con el nombre de un equipo o cambia de día."}
function open(){aip.hidden=false;if(!aim.children.length)add("a","Hola, soy la IA de AZTECA VET. Abre un deporte y pregúntame por los partidos, el pick del día, las bajas o cómo decide el modelo; te respondo con los datos de la pantalla.");setTimeout(()=>$("aiq").focus(),60)}
$("aib").addEventListener("click",()=>aip.hidden?open():aip.hidden=true);
$("aix").addEventListener("click",()=>aip.hidden=true);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!aip.hidden)aip.hidden=true});
$("aic").addEventListener("click",e=>{const b=e.target.closest("button");if(b)ask(b.textContent)});
$("aif").addEventListener("submit",e=>{e.preventDefault();const q=$("aiq").value.trim();if(q){$("aiq").value="";ask(q)}});
async function ask(q){if(busy)return;busy=true;add("u",q);const out=add("a th","Pensando…");let sample=null;
 try{if(window.claude&&claude.use)sample=await claude.use("sample")}catch(e){}
 if(sample){try{const prompt=`Eres "la IA" de AZTECA VET, una plataforma de estadística de fútbol, NHL y MLB. Responde en español, en máximo 100 palabras, directo y claro, usando SOLO los datos de abajo (probabilidades del modelo). No inventes cuotas, resultados ni jugadores. Si piden algo que no está en los datos, dilo y sugiere abrir el deporte o el día correcto. Es una referencia estadística, no consejo de apuesta.\n\nDATOS:\n${ctx()}\n\nPREGUNTA: ${q}`;
  const r=await sample([{role:"user",content:prompt}],{cache:false,onText:({text})=>{out.className="am a";out.textContent=text;aim.scrollTop=aim.scrollHeight}});
  out.className="am a";out.textContent=(r&&r.text)||local(q);$("aisrc").textContent="Respuesta de Claude con los datos de esta pantalla";busy=false;return}catch(e){}}
 out.className="am a";out.textContent=local(q);$("aisrc").textContent="Modo local: responde con los datos de esta pantalla";busy=false}
})();
