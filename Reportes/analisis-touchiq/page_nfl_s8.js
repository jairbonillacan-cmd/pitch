
(function(){const $=id=>document.getElementById(id),rm=matchMedia("(prefers-reduced-motion:reduce)").matches;let navT=0;
 const cu=root=>{if(rm)return;[root,...root.querySelectorAll("*")].forEach(n=>{if(n.children.length||n._cu)return;const m=n.textContent.trim().match(/^(\d+(?:\.\d+)?)%([\s\S]*)$/);if(!m)return;n._cu=1;const v=+m[1],d=(m[1].split(".")[1]||"").length,rest=m[2],t0=performance.now();const st=t=>{const k=Math.min(1,(t-t0)/900),e=1-Math.pow(1-k,3);n.textContent=(v*e).toFixed(d)+"%"+rest;if(k<1)requestAnimationFrame(st)};requestAnimationFrame(st)})};
 document.addEventListener("click",e=>{if(e.target.closest("#nav button,#days button,[data-d],[data-t],.chips button"))navT=Date.now()+900},true);
 const io=new IntersectionObserver(es=>{es.forEach(en=>{if(!en.isIntersecting)return;const el=en.target;io.unobserve(el);el.style.setProperty("--rd",Math.min(+el.dataset.rk||0,7)*.06+"s");el.classList.add("in");cu(el)})},{threshold:.06,rootMargin:"0px 0px -4% 0px"});
 let rk=0,rt=0;
 function arm(){document.querySelectorAll(".panel,#games .card,#sim .card,.nc").forEach(el=>{if(el._rv)return;el._rv=1;if(rm)return;
  const r=el.getBoundingClientRect(),vis=r.top<innerHeight&&r.bottom>0,fresh=Date.now()<navT;
  if(vis&&!fresh){el.classList.add("rv0","in","nt");return}
  el.dataset.rk=vis?rk++:0;el.classList.add("rv0");io.observe(el)});clearTimeout(rt);rt=setTimeout(()=>{rk=0},400)}
 new MutationObserver(arm).observe(document.getElementById("app"),{childList:true,subtree:true});arm();
 let tk=0;const onS=()=>{if(tk)return;tk=requestAnimationFrame(()=>{tk=0;const h=document.documentElement,m=h.scrollHeight-innerHeight,y=scrollY;$("sbar").style.setProperty("--sp",m>0?Math.min(1,y/m):0);$("aur").style.setProperty("--py",(y*.22).toFixed(1))})};
 addEventListener("scroll",onS,{passive:true});onS();
 if(matchMedia("(hover:hover) and (pointer:fine)").matches&&!rm){
  document.addEventListener("pointermove",e=>{const c=e.target.closest&&e.target.closest(".card");if(!c)return;const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.setProperty("--mx",x*100+"%");c.style.setProperty("--my",y*100+"%");c.style.setProperty("--ry",((x-.5)*5).toFixed(2)+"deg");c.style.setProperty("--rx",((.5-y)*4).toFixed(2)+"deg")});
  document.addEventListener("pointerout",e=>{const c=e.target.closest&&e.target.closest(".card");if(c&&!c.contains(e.relatedTarget)){c.style.setProperty("--rx","0deg");c.style.setProperty("--ry","0deg")}})}
})();
