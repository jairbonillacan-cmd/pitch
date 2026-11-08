
/* arreglo: paneles más altos que la pantalla (ej. Lesiones) nunca llegaban al 6% visible y se quedaban invisibles */
(function(){const big=()=>document.querySelectorAll(".rv0:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();if(r.height>innerHeight*.8&&el.offsetParent!==null)el.classList.add("in")});
let t=0;const q=()=>{clearTimeout(t);t=setTimeout(big,60)};
document.addEventListener("click",()=>{q();setTimeout(big,450)},true);addEventListener("scroll",q,{passive:true});addEventListener("resize",q);setInterval(big,1200)})();
