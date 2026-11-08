
window.AVX=(function(){
 const A={bank:1000,th:.6,odds:{},inSlip:new Set(),cbs:[],pk:{}};
 A.fmt=v=>"$"+Math.round(v).toLocaleString("es-MX");
 /* regla de bank: 10% si el modelo da >= umbral, 5% si da menos; 0 si la cuota no tiene valor */
 A.EVMIN=.04;A.unit=(p,d)=>{if(d&&p*d-1<A.EVMIN)return 0;return p>=A.th?10:5};
 A.setOdd=(k,v)=>{if(v)A.odds[k]=v;else delete A.odds[k];try{parent.postMessage({av:"odd",k,v:v||""},"*")}catch(e){}};
 A.add=k=>{const p=A.pk[k];if(!p)return;if(A.inSlip.has(k))A.inSlip.delete(k);else A.inSlip.add(k);try{parent.postMessage({av:"add",pk:p},"*")}catch(e){}};
 A.on=f=>A.cbs.push(f);
 /* quita el margen de la casa: grupos de mercados complementarios */
 A.noVig=(groups,odd)=>{const r={},mg=[];groups.forEach(([name,ids])=>{const ds=ids.map(odd);if(ds.every(d=>d)){const s=ds.reduce((a,d)=>a+1/d,0);ids.forEach((id,i)=>r[id]=(1/ds[i])/s);mg.push([name,s-1])}});return{p:r,mg}};
 A.addBtn=(k,pk)=>{A.pk[k]=pk;return `<button class="ad ${A.inSlip.has(k)?"on":""}" data-add="${k}" title="Agregar al boleto">${A.inSlip.has(k)?"✓":"+"}</button>`};
 /* bloque de monto sugerido bajo el pick */
 A.stakeBox=(o,d,k,pk)=>{A.pk[k]=pk;const on=A.inSlip.has(k),btn=`<button class="addb ${on?"on":""}" data-add="${k}">${on?"✓ EN BOLETO":"+ BOLETO"}</button>`,u=A.unit(o.p,d),pp=(o.p*100).toFixed(1)+"%";
  if(!d)return `<div class="stake"><div>APUESTA SUGERIDA · SOLO CON VALOR<small>Modelo ${pp} · juégala solo si tu casa paga ${((1+A.EVMIN)/o.p).toFixed(2)} o más</small></div><b>${u}% del bank</b>${btn}</div>`;
  const ev=o.p*d-1;
  if(!u)return `<div class="stake mut"><div>NO APOSTAR · sin valor a ${d.toFixed(2)}<small>EV ${ev>0?"+":""}${(ev*100).toFixed(1)}% · necesitas cuota ≥ ${((1+A.EVMIN)/o.p).toFixed(2)} (ventaja mínima 4%)</small></div>${btn}</div>`;
  return `<div class="stake"><div>APUESTA SUGERIDA<small>Modelo ${pp} · EV +${(ev*100).toFixed(0)}%</small></div><b>${u}% del bank</b>${btn}</div>`};
 A.anim=root=>{root.classList.add("anim");root.querySelectorAll(".row").forEach((r,i)=>{r.style.animationDelay=(i*.05)+"s";const b=r.querySelector(".bar i");if(b)b.style.animationDelay=(.15+i*.05)+"s"});
  const pb=root.querySelector(".pick b");if(pb){const m=pb.textContent.match(/^([\d.]+)%$/);if(m){const t=+m[1],t0=performance.now()+550;const st=n=>{const k=Math.min(1,Math.max(0,(n-t0)/700));pb.textContent=(t*(1-Math.pow(1-k,3))).toFixed(1)+"%";if(k<1)requestAnimationFrame(st)};requestAnimationFrame(st)}}};
 addEventListener("message",e=>{const m=e.data;if(!m||m.av!=="cfg")return;A.bank=m.bank;if(m.th)A.th=m.th;
  if(m.odds){Object.keys(A.odds).forEach(k=>delete A.odds[k]);Object.assign(A.odds,m.odds)}
  if(m.inSlip)A.inSlip=new Set(m.inSlip);A.cbs.forEach(f=>{try{f()}catch(err){}})});
 document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-add]");if(!b)return;e.stopPropagation();A.add(b.dataset.add);
  const on=A.inSlip.has(b.dataset.add);document.querySelectorAll(`[data-add="${CSS.escape(b.dataset.add)}"]`).forEach(x=>{x.classList.toggle("on",on);x.textContent=x.classList.contains("ad")?(on?"✓":"+"):(on?"✓ EN BOLETO":"+ BOLETO")})},true);
 try{parent.postMessage({av:"ready"},"*")}catch(e){}
 return A})();
