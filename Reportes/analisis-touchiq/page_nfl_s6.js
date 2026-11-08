
/* jugadores: mascota del equipo (vendada si esta en duda o fuera) + numero + sigla */
function PAV(p){const num=JN[p.t+"|"+p.n],u=(p.st>0?MSC.inj:MSC.ok)[p.t],c=TC[p.t]||["#334155","#fff"];if(!u)return AV(p.t,p.n);
 return`<span class="mb"><span class="mi"><img src="${u}" alt="${p.t}">${num!=null?`<i>#${num}</i>`:""}</span><b style="background:${c[0]};color:${c[1]}">${p.t}</b></span>`}
try{drawProps()}catch(e){}
