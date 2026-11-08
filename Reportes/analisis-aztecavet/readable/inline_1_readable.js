const $=id=>document.getElementById(id);
const PAGES={
'fb': '<B64:BLOB>','nhl': '<B64:BLOB>','mlb': '<B64:BLOB>'}
}
;
const dec=b=>new TextDecoder().decode(Uint8Array.from(atob(b),c=>c.charCodeAt(0)));
/* ---------- utilidades ---------- */
const GOLD="#c9952b",TQ="#13995a";
function hex(h){
  const n=parseInt(h.slice(1),16);
return [(n>>16)&255,(n>>8)&255,n&255].join(",")}
}
/* ---------- Piedra del Sol (HUD) ---------- */
function sunSVG(mini){
  const C=300,P=(r,a)=>[C+r*Math.cos(a*Math.PI/180),C+r*Math.sin(a*Math.PI/180)],f=n=>n.toFixed(1),u=mini?"m":"b";
  const rays=(()=>{
    let o="";
    const N=16;
    for(let k=0;
    k<N;
    k++){
      const a=k*360/N-90,w=360/N/2*.6,tip=k%2?256:272,base=234,p1=P(base,a-w),p2=P(tip,a),p3=P(base,a+w);
    o+=`<polygon points="${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])} ${f(p3[0])},${f(p3[1])}" fill="rgba(245,194,107,.07)"/>`}
  }
  return o}
}
  )();
  const defs=`<defs><radialGradient id="sg${u}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="rgba(245,194,107,.5)"/><stop offset=".6" stop-color="rgba(94,231,255,.18)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>`;
  if(mini)return `<SVG_ART>`;
  let ticks="";
  for(let k=0;
  k<104;
  k++){
    const a=k*360/104,l=k%4?7:15,p=P(291,a),q=P(291-l,a);
  ticks+=`<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`}
}
  const R1=190,R2=228,gl=[
  `<circle r="7"/><path d="M-7 0a7 7 0 0 1 14 0a3.5 3.5 0 0 1 -7 0"/>`,
  `<path d="M-10 9h6v-6h6v-6h6v-6"/>`,
  `<ellipse rx="10" ry="6"/><circle r="2.6" fill="${GOLD}"/>`,
  `<path d="M0-9V9M-9 0H9"/><circle cx="-6" cy="-6" r="1.6"/><circle cx="6" cy="-6" r="1.6"/><circle cx="-6" cy="6" r="1.6"/><circle cx="6" cy="6" r="1.6"/>`,
  `<polyline points="-10,4 -5,-4 0,4 5,-4 10,4"/>`];
  let cells="",glyphs="";
  for(let k=0;
  k<20;
  k++){
    const a0=k*18-99,a1=a0+18,aC=k*18-90,p1=P(R1,a0),p2=P(R2,a0),p3=P(R2,a1),p4=P(R1,a1),gp=P((R1+R2)/2,aC);
    cells+=`<path class="cell" style="--cd:${(k*.31)%5}s" fill="${GOLD}" fill-opacity="0" d="M${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}A${R2} ${R2} 0 0 1 ${f(p3[0])} ${f(p3[1])}L${f(p4[0])} ${f(p4[1])}A${R1} ${R1} 0 0 0 ${f(p1[0])} ${f(p1[1])}Z"/>`;
  glyphs+=`<g transform="translate(${f(gp[0])} ${f(gp[1])}) rotate(${aC+90})">${gl[k%5]}</g>`}
}
  let fret="";
  for(let k=0;
  k<24;
  k++){
    const a=k*15-90,p=P(172,a);
  fret+=`<path transform="translate(${f(p[0])} ${f(p[1])}) rotate(${a+90})" d="M-8 6H4V-6H-4V0H0"/>`}
}
  let cart="";
  [45,135,225,315].forEach(a=>{
    const p=P(138,a-90+0);
  cart+=`<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${a})"><rect x="-17" y="-17" width="34" height="34" rx="5"/><rect x="-8" y="-8" width="16" height="16"/><circle r="2.4" fill="${TQ}"/></g>`}
}
  );
return `<SVG_ART>`}
}
$("sunsvg").innerHTML=sunSVG(false);
$("mav").innerHTML=sunSVG(true);
$("lgi").innerHTML=sunSVG(true);
/* ---------- piramide + rejilla ---------- */
(function(){
  const L=[],R=[];
  let y=300;
  for(let i=0;
  i<5;
  i++){
    const x=150+55*i;
    L.push([x,y],[x,y-40]);
  y-=40}
}
  const top=y;
  L.push([425,top]);
  let pts=L.map(p=>p.join(",")).join(" ");
  const mir=L.slice().reverse().map(p=>[1000-p[0],p[1]].join(","));
  const temple=`M440,${top} V${top-38} H560 V${top}`;
  let st="";
  for(let i=0;
  i<5;
  i++){
    const yy=300-40*(i+1);
  st+=`<line x1="${150+55*(i+1)}" y1="${yy}" x2="${850-55*(i+1)}" y2="${yy}"/>`}
}
  let stairs="";
  for(let k=-3;
  k<=3;
  k++)stairs+=`<line x1="${500+k*14}" y1="300" x2="${500+k*5}" y2="${top}"/>`;
$("pyr").innerHTML=`<defs><linearGradient id="pgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2ef"/></linearGradient></defs><polygon points="150,300 ${pts} ${mir.join(" ")} 850,300" fill="url(#pgr)" stroke="${GOLD}" stroke-opacity=".7" stroke-width="1.6"/><path d="${temple}" fill="#ffffff" stroke="${GOLD}" stroke-opacity=".7" stroke-width="1.6"/><g stroke="${GOLD}" stroke-opacity=".35" stroke-width="1.2">${st}</g><g stroke="${TQ}" stroke-opacity=".5" stroke-width="1.2">${stairs}</g>`}
}
)();
/* ---------- balon 3D realista ---------- */
const BALLS=[];
let PTR={
x:0,y:0}
}
;
addEventListener("pointermove",e=>{
  PTR.x=e.clientX/innerWidth-.5;
PTR.y=e.clientY/innerHeight-.5}
}
);
(function(){
  const phi=(1+Math.sqrt(5))/2,nz=v=>{
    const l=Math.hypot(...v);
  return v.map(x=>x/l)}
}
  ;
  const V=[];
  [[0,1,phi],[0,1,-phi],[0,-1,phi],[0,-1,-phi],[1,phi,0],[1,-phi,0],[-1,phi,0],[-1,-phi,0],[phi,0,1],[phi,0,-1],[-phi,0,1],[-phi,0,-1]].forEach(v=>V.push(nz(v)));
  const F=[];
  // aristas: distancia minima entre vertices
 let emin=9;
  for(let i=0;
  i<12;
  i++)for(let j=i+1;
  j<12;
  j++){
    const d=Math.hypot(V[i][0]-V[j][0],V[i][1]-V[j][1],V[i][2]-V[j][2]);
  if(d<emin)emin=d}
}
  const adj=(a,b)=>Math.abs(Math.hypot(V[a][0]-V[b][0],V[a][1]-V[b][1],V[a][2]-V[b][2])-emin)<1e-3;
  for(let i=0;
  i<12;
  i++)for(let j=i+1;
  j<12;
  j++)if(adj(i,j))for(let k=j+1;
  k<12;
  k++)if(adj(i,k)&&adj(j,k))F.push(nz([V[i][0]+V[j][0]+V[k][0],V[i][1]+V[j][1]+V[k][1],V[i][2]+V[j][2]+V[k][2]]));
  const AP=16.5*Math.PI/180,AH=20.9*Math.PI/180,L=nz([-.5,.6,.65]),H=nz([L[0],L[1],L[2]+1]);
  function rot(ay,ax,az){
    const cy=Math.cos(ay),sy=Math.sin(ay),cx=Math.cos(ax),sx=Math.sin(ax),cz=Math.cos(az),sz=Math.sin(az);
    const my=[[cy,0,sy],[0,1,0],[-sy,0,cy]],mx=[[1,0,0],[0,cx,-sx],[0,sx,cx]],mz=[[cz,-sz,0],[sz,cz,0],[0,0,1]];
    const mm=(a,b)=>a.map((r,i)=>[0,1,2].map(j=>r[0]*b[0][j]+r[1]*b[1][j]+r[2]*b[2][j]));
  return mm(mm(mz,mx),my)}
}
  const ap=(M,v)=>[M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]];
  window.startBall=function(cv,S,vis,spin){
    const cx=cv.getContext("2d");
    cv.width=cv.height=S;
    const img=cx.createImageData(S,S),d=img.data,px=[];
    for(let y=0;
    y<S;
    y++)for(let x=0;
    x<S;
    x++){
      const nx=(x+.5)/S*2-1,ny=1-(y+.5)/S*2,r2=nx*nx+ny*ny;
    if(r2<=1)px.push([y*S+x,nx,ny,Math.sqrt(1-r2),Math.sqrt(r2)])}
  }
    BALLS.push({
    cv,cx,S,img,d,px,vis,spin:spin||1,t0:performance.now()}
  }
  )}
}
  ;
  window.ballFrame=function(now){
    let any=false;
    BALLS.forEach(B=>{
      if(!B.vis())return;
      any=true;
      const t=(now-B.t0)*B.spin,M=rot(t*.00042+PTR.x*.9,.55+.18*Math.sin(t*.0003)+PTR.y*.5,.25),Vr=V.map(v=>ap(M,v)),Fr=F.map(v=>ap(M,v)),d=B.d;
      for(const p of B.px){
        const i=p[0]*4,nx=p[1],ny=p[2],nz2=p[3],rr=p[4];
        let dp=-2,dh=-2;
        for(let k=0;
        k<12;
        k++){
          const c=Vr[k],q=c[0]*nx+c[1]*ny+c[2]*nz2;
        if(q>dp)dp=q}
      }
        for(let k=0;
        k<20;
        k++){
          const c=Fr[k],q=c[0]*nx+c[1]*ny+c[2]*nz2;
        if(q>dh)dh=q}
      }
        const sP=Math.acos(Math.min(1,dp))/AP,sH=Math.acos(Math.min(1,dh))/AH,pent=sP<sH,s=Math.min(sP,sH),b=Math.abs(sP-sH);
        let r,g,bl;
        if(pent){
          r=20;
          g=22;
        bl=28}
      }
        else{
          r=247;
          g=248;
        bl=252}
      }
        const bulge=1-.2*Math.pow(Math.min(s,1.2),2.4);
        const dif=Math.max(0,nx*L[0]+ny*L[1]+nz2*L[2])*.78+.3;
        let sh=dif*bulge;
        const seam=b<.045?(1-b/.045):0;
        sh*=1-seam*.5;
        const spec=Math.pow(Math.max(0,nx*H[0]+ny*H[1]+nz2*H[2]),pent?60:34)*(pent?.85:.5);
        const rim=Math.pow(1-nz2,2.6);
        d[i]=Math.min(255,r*sh+spec*255+rim*30);
        d[i+1]=Math.min(255,g*sh+spec*255+rim*90);
        d[i+2]=Math.min(255,bl*sh+spec*255+rim*190);
      d[i+3]=rr>.985?Math.max(0,(1-rr)/.015)*255:255}
    }
    B.cx.putImageData(B.img,0,0)}
  }
    );
  return any}
}
}
}
)();
(function loop(now){
  window.ballFrame(now||0);
requestAnimationFrame(loop)}
}
)();
startBall($("ballc1"),240,()=>stage===1&&!$("lock").classList.contains("hide"),1);
/* ---------- intro: sonido, codigo, canvas ---------- */
const CODE="7779",dots=[...document.querySelectorAll("#dots i")],msg=$("msg"),pad=$("pad");
let buf="",stage=1,busy=false,snd=true;
const T0=Date.now(),intro={
  warp:0,stop(){
  cancelAnimationFrame(intro.raf)}
}
}
}
;
/* ---------- motor de audio: caracol, huehuetl, ocarina, campanas y barridos ---------- */
const AU={
ctx:null,master:null,rev:null,started:false,bed:null,chimes:false,drums:false}
}
;
const PENT=[440,523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.5,1568];
function initAudio(c){
  const comp=c.createDynamicsCompressor();
  comp.threshold.value=-20;
  comp.ratio.value=6;
  const m=c.createGain();
  m.gain.value=snd?.55:0;
  m.connect(comp);
  comp.connect(c.destination);
  AU.master=m;
  const len=Math.floor(c.sampleRate*2.6),ir=c.createBuffer(2,len,c.sampleRate);
  for(let ch=0;
  ch<2;
  ch++){
    const d=ir.getChannelData(ch);
    for(let i=0;
    i<len;
  i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}
}
  const cv=c.createConvolver();
  cv.buffer=ir;
  const rg=c.createGain();
  rg.gain.value=.6;
  cv.connect(rg);
  rg.connect(m);
AU.rev=cv}
}
function actx(){
  if(!AU.ctx){
    try{
      const C=window.AudioContext||window.webkitAudioContext;
      AU.ctx=new C();
    initAudio(AU.ctx)}
  }
    catch(e){
    }
  }
  }
}
return AU.ctx}
}
function muteApply(){
  if(AU.ctx&&AU.master)AU.master.gain.setTargetAtTime(snd?.55:0,AU.ctx.currentTime,.05);
  const ic=snd?"🔊":"🔇";
  $("snd").textContent=ic;
$("snd2").textContent=ic}
}
function out(n,wet){
  n.connect(AU.master);
  if(wet){
    const g=AU.ctx.createGain();
    g.gain.value=wet;
    n.connect(g);
  g.connect(AU.rev)}
}
}
}
function env(g,t,a,d,peak,end){
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+a);
g.gain.exponentialRampToValueAtTime(end||.0001,t+a+d)}
}
function noiseBuf(dur){
  const c=AU.ctx,b=c.createBuffer(1,Math.max(1,Math.floor(c.sampleRate*dur)),c.sampleRate),d=b.getChannelData(0);
  for(let i=0;
  i<d.length;
  i++)d[i]=Math.random()*2-1;
return b}
}
function bell(f,t,vol,wet){
  const c=AU.ctx,g=c.createGain();
  [[1,1],[2.76,.32],[5.4,.14]].forEach(([m,a])=>{
    const o=c.createOscillator(),og=c.createGain();
    o.type="sine";
    o.frequency.value=f*m;
    og.gain.value=a;
    o.connect(og);
    og.connect(g);
    o.start(t);
  o.stop(t+2.3)}
}
  );
  env(g,t,.005,1.9,vol);
out(g,wet==null?.7:wet)}
}
function drum(t,vol){
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain();
  o.type="sine";
  o.frequency.setValueAtTime(135,t);
  o.frequency.exponentialRampToValueAtTime(46,t+.3);
  env(g,t,.004,.55,vol);
  o.connect(g);
  out(g,.35);
  o.start(t);
  o.stop(t+.7);
  const n=c.createBufferSource();
  n.buffer=noiseBuf(.14);
  const f=c.createBiquadFilter();
  f.type="lowpass";
  f.frequency.value=950;
  const ng=c.createGain();
  env(ng,t,.002,.12,vol*.55);
  n.connect(f);
  f.connect(ng);
  out(ng,.2);
  n.start(t);
n.stop(t+.2)}
}
function conch(t,f0,dur,vol){
  const c=AU.ctx,g=c.createGain(),lp=c.createBiquadFilter();
  lp.type="lowpass";
  lp.frequency.setValueAtTime(380,t);
  lp.frequency.exponentialRampToValueAtTime(1500,t+dur*.45);
  lp.frequency.exponentialRampToValueAtTime(500,t+dur);
  const lfo=c.createOscillator(),lg=c.createGain();
  lfo.frequency.value=5.2;
  lg.gain.value=f0*.012;
  lfo.connect(lg);
  [[f0,"sawtooth",.6],[f0*1.5,"triangle",.25],[f0*.5,"sine",.5]].forEach(([f,ty,a])=>{
    const o=c.createOscillator(),og=c.createGain();
    o.type=ty;
    o.frequency.value=f;
    lg.connect(o.frequency);
    og.gain.value=a;
    o.connect(og);
    og.connect(lp);
    o.start(t);
  o.stop(t+dur+.2)}
}
  );
  lfo.start(t);
  lfo.stop(t+dur+.2);
  lp.connect(g);
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+dur*.35);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
out(g,.6)}
}
function ocarina(t,f,dur,vol){
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain(),vib=c.createOscillator(),vg=c.createGain();
  o.type="sine";
  o.frequency.setValueAtTime(f*.985,t);
  o.frequency.exponentialRampToValueAtTime(f,t+.05);
  vib.frequency.value=5.5;
  vg.gain.value=f*.007;
  vib.connect(vg);
  vg.connect(o.frequency);
  const n=c.createBufferSource();
  n.buffer=noiseBuf(dur+.2);
  const bp=c.createBiquadFilter();
  bp.type="bandpass";
  bp.frequency.value=f*2;
  bp.Q.value=2;
  const ng=c.createGain();
  ng.gain.value=.1;
  n.connect(bp);
  bp.connect(ng);
  ng.connect(g);
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+.07);
  g.gain.setValueAtTime(vol,t+Math.max(.08,dur-.18));
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);
  out(g,.65);
  o.start(t);
  vib.start(t);
  n.start(t);
  o.stop(t+dur+.1);
  vib.stop(t+dur+.1);
n.stop(t+dur+.1)}
}
function sweep(t,dur,vol,up){
  const c=AU.ctx,n=c.createBufferSource();
  n.buffer=noiseBuf(dur+.2);
  const bp=c.createBiquadFilter();
  bp.type="bandpass";
  bp.Q.value=4;
  const a=up?180:7000,b=up?7000:180;
  bp.frequency.setValueAtTime(a,t);
  bp.frequency.exponentialRampToValueAtTime(b,t+dur);
  const g=c.createGain();
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+dur*(up?.85:.15));
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  n.connect(bp);
  bp.connect(g);
  out(g,.5);
  n.start(t);
  n.stop(t+dur+.2);
  const o=c.createOscillator(),og=c.createGain();
  o.type="sine";
  o.frequency.setValueAtTime(up?110:1760,t);
  o.frequency.exponentialRampToValueAtTime(up?1760:110,t+dur);
  og.gain.setValueAtTime(.0001,t);
  og.gain.exponentialRampToValueAtTime(vol*.35,t+dur*(up?.85:.15));
  og.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(og);
  out(og,.6);
  o.start(t);
o.stop(t+dur+.1)}
}
function drone(){
  const c=AU.ctx,t=c.currentTime,g=c.createGain();
  g.gain.value=.0001;
  const lp=c.createBiquadFilter();
  lp.type="lowpass";
  lp.frequency.value=260;
  const l=c.createOscillator(),lg=c.createGain();
  l.frequency.value=.12;
  lg.gain.value=120;
  l.connect(lg);
  lg.connect(lp.frequency);
  l.start();
  [[55,"sine",.7],[55.35,"triangle",.4],[110.4,"sine",.25],[82.4,"sine",.2]].forEach(([f,ty,a])=>{
    const o=c.createOscillator(),og=c.createGain();
    o.type=ty;
    o.frequency.value=f;
    og.gain.value=a;
    o.connect(og);
    og.connect(lp);
  o.start()}
}
  );
  lp.connect(g);
  out(g,.5);
  g.gain.exponentialRampToValueAtTime(.12,t+5);
AU.bed=g}
}
function chimeLoop(){
  if(!AU.chimes||!AU.ctx)return;
  bell(PENT[Math.floor(Math.random()*7)],AU.ctx.currentTime+.02,.045+Math.random()*.03,.85);
setTimeout(chimeLoop,1000+Math.random()*1600)}
}
function beat(){
  if(!AU.drums||!AU.ctx)return;
  const t=AU.ctx.currentTime+.02;
  drum(t,.26);
  drum(t+.24,.14);
setTimeout(beat,1800)}
}
function openingCue(t){
  sweep(t,1.7,.22,true);
  conch(t+.6,196,2.6,.26);
  drum(t+2.0,.5);
  [659.25,783.99,880,659.25,587.33,440].forEach((f,i)=>ocarina(t+2.4+[0,.55,1.1,2.1,2.7,3.3][i],f,[.5,.5,.9,.55,.55,1.5][i],.085));
[1046.5,1318.5,1568].forEach((f,i)=>bell(f,t+3.4+i*.18,.05,.9))}
}
function portal(){
  if(!AU.ctx)return;
  const t=AU.ctx.currentTime+.02;
  sweep(t,1.1,.2,true);
  conch(t+.25,174.6,1.9,.22);
  drum(t+.95,.55);
[880,1046.5,1318.5].forEach((f,i)=>bell(f,t+1+i*.12,.06,.8))}
}
function unlockSound(){
  if(!AU.ctx)return;
  const t=AU.ctx.currentTime+.02;
  sweep(t,1.5,.3,true);
  drum(t+1.1,.7);
  drum(t+1.45,.55);
  conch(t+.5,196,2.2,.28);
  [440,523.25,659.25,783.99,880,1046.5,1318.5].forEach((f,i)=>bell(f,t+1.0+i*.09,.08,.9));
  AU.chimes=false;
  AU.drums=false;
if(AU.bed)AU.bed.gain.setTargetAtTime(.0001,AU.ctx.currentTime+.5,.7)}
}
function keySound(d){
  if(!AU.ctx)return;
bell(PENT[d%10],AU.ctx.currentTime+.01,.17,.5)}
}
function tick(v){
  if(!AU.ctx)return;
drum(AU.ctx.currentTime+.01,.12*(v||1))}
}
function failSound(){
  if(!AU.ctx)return;
  const t=AU.ctx.currentTime+.01;
  drum(t,.5);
  bell(220,t,.07,.4);
bell(233.1,t,.06,.4)}
}
function navSound(){
  if(!AU.ctx)return;
  const t=AU.ctx.currentTime+.01;
  sweep(t,.7,.14,true);
  drum(t+.45,.38);
bell(1046.5,t+.5,.05,.8)}
}
function backSound(){
  if(!AU.ctx)return;
  const t=AU.ctx.currentTime+.01;
  sweep(t,.6,.1,false);
bell(659.25,t+.3,.05,.8)}
}
let lastHover=0;
document.addEventListener("pointerover",e=>{
  const b=e.target.closest&&e.target.closest(".bc");
  if(!b||!AU.started||SPOPEN)return;
  const n=Date.now();
  if(n-lastHover<250)return;
  lastHover=n;
bell(PENT[3+Math.floor(Math.random()*4)],AU.ctx.currentTime+.01,.035,.8)}
}
);
function startScore(cue){
  if(AU.started)return;
  const c=actx();
  if(!c)return;
  AU.started=true;
  if(c.resume)c.resume();
  muteApply();
  const t=c.currentTime+.05;
  drone();
  AU.chimes=true;
  AU.drums=true;
  if(cue)openingCue(t);
  setTimeout(chimeLoop,cue?3200:1200);
  setTimeout(beat,cue?2600:1600);
  const h=$("sndh");
if(h)h.style.display="none"}
}
function onFirst(e){
  if(AU.started)return;
  const adv=stage===1&&Date.now()-T0>900&&!(e.target.closest&&e.target.closest("#snd"));
startScore(!adv)}
}
["pointerdown","keydown","touchstart"].forEach(ev=>document.addEventListener(ev,onFirst,{
capture:true}
}
));
(function tryAuto(){
  const c=actx();
  if(!c)return;
  try{
    const r=c.resume&&c.resume();
    if(r&&r.then)r.then(()=>{
    if(c.state==="running")startScore(true)}
  }
    ).catch(()=>{
    }
  }
  )}
}
  catch(e){
  }
}
}
}
)();
$("snd").onclick=e=>{
  e.stopPropagation();
  snd=!snd;
  muteApply();
if(snd&&AU.ctx)bell(660,AU.ctx.currentTime+.01,.08,.6)}
}
;
$("snd2").onclick=e=>{
  e.stopPropagation();
  snd=!snd;
  muteApply();
if(snd&&AU.ctx)bell(660,AU.ctx.currentTime+.01,.08,.6)}
}
;
function goStage2(){
  if(stage!==1)return;
  stage=2;
  portal();
  $("stg1").classList.add("gone");
  setTimeout(()=>{
    $("stg1").classList.add("hide");
  $("stg2").classList.remove("hide")}
}
,650)}
}
$("lock").addEventListener("click",e=>{
if(stage===1&&Date.now()-T0>900&&!e.target.closest("#snd"))goStage2()}
}
);
["1","2","3","4","5","6","7","8","9","","0","⌫"].forEach(k=>{
  const b=document.createElement("button");
  b.textContent=k;
  if(!k)b.style.visibility="hidden";
  b.onclick=e=>{
    e.stopPropagation();
  key(k)}
}
  ;
pad.appendChild(b)}
}
);
function key(k){
  if(stage!==2||busy)return;
  if(k==="⌫"){
    buf=buf.slice(0,-1);
  tick(.5)}
}
  else if(/\d/.test(k)&&buf.length<4){
    buf+=k;
  keySound(+k)}
}
  [...$("dots").children].forEach((d,i)=>d.classList.toggle("on",i<buf.length));
  if(buf.length===4){
    busy=true;
  buf===CODE?success():fail()}
}
}
}
function fail(){
  const sl=$("dots"),p=$("plate");
  sl.classList.add("bad");
  msg.textContent="CÓDIGO INCORRECTO";
  failSound();
  p.classList.add("shake");
  setTimeout(()=>{
    p.classList.remove("shake");
    sl.classList.remove("bad");
    buf="";
    [...sl.children].forEach(d=>d.classList.remove("on"));
    msg.textContent="VUELVE A INTENTAR";
  busy=false}
}
,650)}
}
function success(){
  const sl=$("dots");
  sl.classList.add("ok");
  msg.textContent="ACCESO CONCEDIDO";
  unlockSound();
  intro.warp=1;
  $("flash").classList.add("go");
  setTimeout(()=>{
    $("lock").classList.add("out");
    $("app").classList.remove("hide");
    $("app").classList.add("enter");
    drawHome();
    clk();
  $("slipb").classList.remove("hide")}
}
  ,650);
  setTimeout(()=>{
    $("lock").classList.add("hide");
  intro.stop()}
}
,1800)}
}
(function(){
  const cv=$("cv"),cx=cv.getContext("2d");
  let W,H,D=1,mx=0,my=0,w=0;
  const t0=performance.now(),P=[];
  for(let i=0;
  i<120;
  i++)P.push({
  x:Math.random(),y:Math.random(),z:Math.random()*.9+.1,s:Math.random()*2+.5,v:Math.random()*.0018+.0004}
}
  );
  const L=["FÚTBOL","NHL","MLB","UCL"];
  function rs(){
    D=Math.min(window.devicePixelRatio||1,2);
    W=cv.width=innerWidth*D;
  H=cv.height=innerHeight*D}
}
  addEventListener("resize",rs);
  rs();
  addEventListener("pointermove",e=>{
    mx=e.clientX/innerWidth-.5;
  my=e.clientY/innerHeight-.5}
}
  );
  function rb(t,k,col,amp,yo,al){
    cx.beginPath();
    for(let x=0;
    x<=W;
    x+=14){
      const u=x/W,y=H*yo+Math.sin(u*5+t*.0006*k)*amp*H+Math.sin(u*9-t*.0004*k)*amp*.5*H+my*46*D*k;
    x?cx.lineTo(x,y):cx.moveTo(x,y)}
  }
    cx.strokeStyle=col;
    cx.globalAlpha=al;
    cx.lineWidth=2*D;
  cx.stroke()}
}
  function pill(x,y,txt,sc,al){
    cx.save();
    cx.globalAlpha=al;
    cx.translate(x,y);
    cx.scale(sc,sc);
    const f=11*D;
    cx.font="600 "+f+"px system-ui,Segoe UI,sans-serif";
    const tw=cx.measureText(txt).width,pw=tw+22*D,ph=26*D;
    cx.fillStyle="rgba(245,194,107,.1)";
    cx.strokeStyle="rgba(245,194,107,.7)";
    cx.lineWidth=1.2*D;
    cx.beginPath();
    if(cx.roundRect)cx.roundRect(-pw/2,-ph/2,pw,ph,ph/2);
    else cx.rect(-pw/2,-ph/2,pw,ph);
    cx.fill();
    cx.stroke();
    cx.fillStyle="#ffeccb";
    cx.textAlign="center";
    cx.textBaseline="middle";
    cx.fillText(txt,0,1);
  cx.restore()}
}
  function frame(now){
    const t=now-t0,fade=Math.min(1,t/1600);
    w+=(intro.warp-w)*.06;
    cx.clearRect(0,0,W,H);
    cx.globalAlpha=1;
    const g=cx.createRadialGradient(W/2,H*.42,0,W/2,H*.42,Math.max(W,H)*.7);
    g.addColorStop(0,"rgba(31,191,106,"+(.10*fade)+")");
    g.addColorStop(.5,"rgba(201,149,43,"+(.06*fade)+")");
    g.addColorStop(1,"rgba(255,255,255,0)");
    cx.fillStyle=g;
    cx.fillRect(0,0,W,H);
    cx.save();
    for(let i=0;
    i<5;
    i++)rb(now,1+i*.35+w*3,i%2?"rgb(31,191,106)":"rgb(201,149,43)",.03+i*.006,.5+(i-2.5)*.04,(.06+.035*(i%3))*fade);
    cx.restore();
    P.forEach(p=>{
      p.y-=p.v*(1+w*40);
      if(p.y<-.05){
        p.y=1.05;
      p.x=Math.random()}
    }
      const x=(p.x+mx*.05*p.z)*W,y=p.y*H;
      cx.globalAlpha=(.10+.4*p.z)*fade;
      cx.fillStyle=p.z>.55?"#c9952b":"#1fbf6a";
      if(w>.05)cx.fillRect(x,y,p.s*D,p.s*D*(1+w*26));
      else{
        cx.beginPath();
        cx.arc(x,y,p.s*D*p.z,0,6.283);
      cx.fill()}
    }
    }
  }
    );
    if(stage===1){
      const b=$("ballw").getBoundingClientRect(),ox=(b.left+b.width/2)*D,oy=(b.top+b.height/2)*D,oa=Math.max(0,Math.min(1,(t-3000)/1200));
    }
  }
    cx.globalAlpha=1;
  intro.raf=requestAnimationFrame(frame)}
}
intro.raf=requestAnimationFrame(frame)}
}
)();
/* ---------- selector ---------- */
const SP=[
{
n:"Liga MX",sub:"APERTURA 2026 · JORNADA 16",info:"J16 del 6 al 8 nov · 9 partidos · 3 hoy · J15 en auditoría",ab:"MX",pg:"fb",c:"MX",col:"#30d158"}
}
,
{
n:"La Liga",sub:"ESPAÑA · 2026-27",info:"J12 del 6 al 8 nov · 10 partidos · 1 hoy (Sevilla–Alavés) · J11 en auditoría",ab:"ES",pg:"fb",c:"LL",col:"#ff9f0a"}
}
,
{
n:"Premier League",sub:"INGLATERRA · 2026-27",info:"J10 del 6 al 8 nov · 10 partidos · 1 hoy (Everton–Coventry) · J9 en auditoría",ab:"EN",pg:"fb",c:"PL",col:"#bf5af2"}
}
,
{
n:"Champions League",sub:"UEFA · FASE DE LIGA 26/27",info:"Jornada 4 completa (18 juegos) en auditoría · sin partidos esta semana",ab:"UCL",pg:"fb",c:"UCL",col:"#0a84ff"}
}
,
{
n:"NHL",pg:"nhl",c:"NHL",col:"#64d2ff"}
}
,{
n:"MLB",pg:"mlb",c:"MLB",col:"#ff453a"}
}
,
{
n:"Europa League",sub:"UEFA · FASE DE LIGA 26/27",info:"Jornada 4 completa (18 juegos) en auditoría · sin partidos esta semana",ab:"UEL",pg:"fb",c:"UEL",col:"#ffb020"}
}
];
let LV=1,SPOPEN=false;
const ART={
ball:'<canvas id="ballc2"></canvas>',
puck:`<SVG_ART>`,
bat:`<SVG_ART>`}
}
;
const TOP=[
{
big:1,t:"Fútbol",eb:"5 TORNEOS",desc:"Liga MX, La Liga, Premier League, Champions League y Europa League. Elige tu liga y analiza cada partido.",st:["29 partidos próximos","5 hoy (Liga MX, La Liga y Premier)"],col:"#30d158",art:"ball",go:"fb",tag:"PITÁGORAS · POISSON · EN LÍNEA"}
}
,
{
t:"NHL",eb:"HOCKEY",desc:"Picks con noticias, lesiones y cuotas.",st:["3 hoy","12 el sábado"],col:"#64d2ff",art:"puck",go:"4",tag:"NOTICIAS · VALOR"}
}
,
{
t:"MLB",eb:"BÉISBOL",desc:"Postemporada con abridores y jugadores clave.",st:["MIL campeón 4-1","Temporada terminada"],col:"#ff453a",art:"bat",go:"5",tag:"ABRIDORES · CLAVE"}
}
];
function spark(){
  let y=16,p=[];
  for(let i=0;
  i<12;
  i++){
    y=Math.max(3,Math.min(23,y+(Math.random()*12-6)));
  p.push((i*8.7).toFixed(0)+","+y.toFixed(0))}
}
return `<svg class="spk" viewBox="0 0 96 26"><polyline points="${p.join(" ")}"/></svg>`}
}
function emblem(o){
  const t=o.ab,id="em"+o.c;
return `<div class="emb"><svg viewBox="0 0 120 120"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.col}"/><stop offset="1" stop-color="#0b3d24"/></linearGradient></defs><circle cx="60" cy="60" r="54" fill="rgba(255,255,255,.7)" stroke="url(#${id})" stroke-width="2"/><circle class="rt" cx="60" cy="60" r="46" fill="none" stroke="${o.col}" stroke-opacity=".7" stroke-dasharray="3 7"/><text x="60" y="${t.length>2?72:74}" text-anchor="middle" font-size="${t.length>2?32:42}" font-weight="700" fill="url(#${id})" letter-spacing="-1">${t}</text></svg></div>`}
}
function bc(o,d,attr,art,hud){
  return `<div class="bc ${o.big?"big":""} rv" ${attr} style="--cr:${hex(o.col)};--d:${d}">${art}<div class="hud"><i></i><i></i><i></i><i></i></div><div class="scn"></div><div class="bt">${o.tag?`<div class="mono"><i></i>${
  o.tag}
}
  </div>`:""}<div class="eb2">${o.eb}</div><h2>${o.t}</h2><p>${o.desc}</p></div><div class="ft">${o.st.map(x=>`<span class="chip2">${
  x}
}
</span>`).join("")}<span class="more">Entrar ›</span>${o.tag?spark():""}</div></div>`}
}
function tilt(root){
  root.querySelectorAll(".bc").forEach(c=>{
    c.addEventListener("pointermove",e=>{
      const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      c.style.setProperty("--mx",x*100+"%");
      c.style.setProperty("--my",y*100+"%");
      c.style.setProperty("--rx",((.5-y)*7).toFixed(2)+"deg");
      c.style.setProperty("--ry",((x-.5)*9).toFixed(2)+"deg");
      c.style.setProperty("--px",(x-.5).toFixed(3));
    c.style.setProperty("--py",(y-.5).toFixed(3))}
  }
    );
    c.addEventListener("pointerleave",()=>{
      c.style.setProperty("--rx","0deg");
      c.style.setProperty("--ry","0deg");
      c.style.setProperty("--px","0");
    c.style.setProperty("--py","0")}
  }
  )}
}
)}
}
const ROB=[{
t:"MLB",eb:"BÉISBOL",go:"5",img:"<IMG_B64>"}
}
,{
t:"FÚTBOL",eb:"4 TORNEOS",go:"fb",img:"<IMG_B64>"}
}
,{
t:"NHL",eb:"HOCKEY",go:"4",img:"<IMG_B64>"}
}
];
$("trio").innerHTML=ROB.map(o=>`<img src="${o.img}" alt="Robot ${o.t}">`).join("");
function drawHome(){
  LV=1;
  $("s1").classList.remove("hide","leave");
  $("s2").classList.add("hide");
  $("bento").innerHTML=`<div class="mystic">${sunSVG(false)}</div>`+ROB.map((o,i)=>`<div class="rc rv" data-go="${o.go}" style="--d:${4+i};--dl:${(i*.6).toFixed(1)}s" role="button" aria-label="${o.t}"><div class="im"><div class="gw"></div><img src="${o.img}" alt="Robot ${o.t}"></div><div class="pd"><b>${o.t}</b><small>${o.eb}</small><em>Entrar ›</em></div></div>`).join("");
  $("lgrid").innerHTML=SP.map((o,i)=>[o,i]).filter(x=>x[0].pg==="fb").map(([o,i],j)=>bc({
  t:o.n,eb:o.sub,desc:o.info,st:[],col:o.col}
}
  ,1+j,`data-i="${i}"`,emblem(o))).join("");
tilt($("lgrid"))}
}
function lv2(){
  if(LV===2)return;
  LV=2;
  const a=$("s1");
  a.classList.add("leave");
  setTimeout(()=>{
    a.classList.add("hide");
    a.classList.remove("leave");
    $("s2").classList.remove("hide");
  window.scrollTo(0,0)}
}
,380)}
}
function lv1(){
  if(LV===1)return;
  LV=1;
  const a=$("s2");
  a.classList.add("leave");
  setTimeout(()=>{
    a.classList.add("hide");
    a.classList.remove("leave");
    $("s1").classList.remove("hide");
  window.scrollTo(0,0)}
}
,380)}
}
function clk(){
  const d=new Date();
  $("clk").textContent=d.toLocaleTimeString("es-MX",{
  hour:"2-digit",minute:"2-digit"}
}
)}
}
setInterval(clk,20000);
function openSport(i){
  const s=SP[i];
  if(!s)return;
  SPOPEN=true;
  let h=dec(PAGES[s.pg]);
  h=h.replace("<head>","<head><script>window.__START="+JSON.stringify(s.c)+"<\/script>");
  const f=$("fr");
  f.srcdoc=h;
  f.classList.remove("hide");
  $("hintbar").classList.add("sp");
document.body.style.overflow="hidden"}
}
function closeSport(){
  if(!SPOPEN)return;
  SPOPEN=false;
  const f=$("fr");
  f.classList.add("hide");
  f.srcdoc="";
  $("hintbar").classList.remove("sp");
document.body.style.overflow=""}
}
document.addEventListener("click",e=>{
  if(SPOPEN){
    if(e.target.closest("#hback")){
      backSound();
    closeSport()}
  }
  return}
}
  const g=e.target.closest("[data-go]");
  if(g){
    navSound();
    const v=g.dataset.go;
    if(v==="fb"){
    if(LV===1)lv2()}
  }
    else openSport(+v);
  return}
}
  const c=e.target.closest("[data-i]");
  if(c){
    navSound();
    openSport(+c.dataset.i);
  return}
}
  if(e.target.closest("#bk2")){
    backSound();
    lv1();
  return}
}
  if(e.target.closest("#explore"))$("bento").scrollIntoView({
  behavior:"smooth",block:"center"}
}
)}
}
);
addEventListener("message",e=>{
  if(e.data==="home"){
    backSound();
  closeSport()}
}
}
}
);
document.addEventListener("keydown",e=>{
  if(!$("lock").classList.contains("hide")){
    if(stage===1){
      if(Date.now()-T0>900)goStage2();
    return}
  }
    if(e.key==="Backspace")key("⌫");
    else if(/^\d$/.test(e.key))key(e.key);
  return}
}
  if(e.key==="Escape"||e.key==="Backspace"){
    if(SPOPEN)closeSport();
  else if(LV===2)lv1()}
}
}
}
);
/* ---------- boleto, historial y bankroll ---------- */
const AV={
  cfg:{
  start:1000,th:.6}
}
  ,odds:{
  }
}
,slip:[],bets:[],ovr:"",u:null,tab:"b",db:null,base:null,ready:false,arm:null}
}
;
const money=v=>(v<0?"−":"")+"$"+Math.abs(Math.round(v)).toLocaleString("es-MX");
const pct=v=>(v*100).toFixed(1)+"%";
const decO=s=>{
  const v=parseFloat(String(s==null?"":s).replace(",","."));
  if(isNaN(v))return null;
  if(Math.abs(v)>=100)return v>0?1+v/100:1+100/-v;
return v>1?v:null}
}
;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;
","<":"&lt;
",">":"&gt;
",'"':"&quot;"}[c]));
const profit=b=>b.st==="w"?b.stake*(b.d-1):b.st==="l"?-b.stake:0;
const curBank=()=>Math.max(0,AV.cfg.start+AV.bets.reduce((a,b)=>a+profit(b),0));
const unitOf=(p,d)=>d&&p*d-1>=.04?(p>=AV.cfg.th?10:5):0;
/* almacenamiento: base privada del usuario (db) o, si no hay, este navegador */
function lsSave(){try{localStorage.setItem("azteca_av",JSON.stringify({cfg:AV.cfg,odds:AV.odds,slip:AV.slip,bets:AV.bets}))}catch(e){}}
function lsLoad(){try{const j=JSON.parse(localStorage.getItem("azteca_av")||"null");if(j){Object.assign(AV.cfg,j.cfg||{});AV.odds=j.odds||{};AV.slip=j.slip||[];AV.bets=j.bets||[]}}catch(e){}}
const QT={},BUSY={},AGAIN={};
function save(n){if(!AV.ready)return;clearTimeout(QT[n]);QT[n]=setTimeout(()=>flush(n),500)}
async function flush(n){if(BUSY[n]){AGAIN[n]=1;return}BUSY[n]=1;
 try{if(AV.db){const body=n==="cfg"?{v:AV.cfg}:n==="odds"?{m:AV.odds}:{items:AV.slip};await AV.db.doc(AV.base+"/"+n).set(body)}else lsSave()}
 catch(e){if(e&&(e.code==="invalid_argument"||e.code==="revoked"||e.code==="not_granted")){AV.db=null;lsSave();renderSlip()}}
 BUSY[n]=0;if(AGAIN[n]){AGAIN[n]=0;flush(n)}}
const betRef=id=>AV.db.doc(AV.base+"/cfg").collection("bets").doc(id);
async function saveBet(b){if(!AV.db){lsSave();return}const o=Object.assign({},b);delete o.id;try{await betRef(b.id).set(o)}catch(e){AV.db=null;lsSave();toast("No se pudo guardar en tu cuenta; quedó en este navegador")}}
async function delBet(id){if(!AV.db){lsSave();return}try{await betRef(id).delete()}catch(e){}}
async function avInit(){
 try{const c=window.claude;if(c&&c.use){const [db,user]=await Promise.all([c.use("db"),c.use("user")]);if(db&&user){const id=await user.id();if(id){AV.db=db;AV.base="data/users/"+id}}}}catch(e){AV.db=null}
 if(AV.db){try{const [c,o,s]=await Promise.all(["cfg","odds","slip"].map(n=>AV.db.doc(AV.base+"/"+n).get()));
   if(c.exists){const v=(c.data()||{}).v||{};if(v.start!=null)AV.cfg.start=v.start;if(v.th)AV.cfg.th=v.th}if(o.exists)AV.odds=Object.assign({},(o.data()||{}).m||{});if(s.exists)AV.slip=((s.data()||{}).items||[]).slice();
   const bs=await AV.db.doc(AV.base+"/cfg").collection("bets").orderBy("ts","desc").limit(1000).get();AV.bets=bs.docs.map(d=>Object.assign({},d.data(),{id:d.id}))}
  catch(e){AV.db=null;lsLoad()}}
 else lsLoad();
 AV.ready=true;pushCfg();renderSlip()}
/* comunicación con la sección abierta */
function pushCfg(){const f=$("fr");if(!f||!f.contentWindow||f.classList.contains("hide"))return;try{f.contentWindow.postMessage({av:"cfg",bank:curBank(),th:AV.cfg.th,odds:AV.odds,inSlip:AV.slip.map(x=>x.k)},"*")}catch(e){}}
addEventListener("message",e=>{const m=e.data;if(!m||typeof m!=="object"||!m.av)return;
 if(m.av==="ready")pushCfg();
 else if(m.av==="odd"&&typeof m.k==="string"){if(m.v)AV.odds[m.k]=String(m.v).slice(0,12);else delete AV.odds[m.k];
  const ks=Object.keys(AV.odds);if(ks.length>800)ks.slice(0,ks.length-800).forEach(k=>delete AV.odds[k]);save("odds");
  const L=AV.slip.find(x=>x.k===m.k);if(L){L.d=decO(m.v);save("slip");renderSlip()}}
 else if(m.av==="add"&&m.pk&&typeof m.pk.k==="string"){const i=AV.slip.findIndex(x=>x.k===m.pk.k);
  if(i>=0)AV.slip.splice(i,1);else{const p=m.pk;AV.slip.push({k:p.k,gk:String(p.gk),sp:String(p.sp),m:String(p.m),l:String(p.l),p:+p.p,d:p.d?+p.d:null,t:String(p.t||"")})}
  AV.u=null;save("slip");renderSlip();const b=$("slipb");b.classList.remove("bump");void b.offsetWidth;b.classList.add("bump")}});
function toast(t){const d=document.createElement("div");d.className="toast";d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
/* vistas */
function renderSlip(){const n=AV.slip.length;$("slipn").textContent=n;$("slipb").classList.toggle("has",n>0);
 document.querySelectorAll(".sp-tabs button").forEach(b=>b.classList.toggle("a",b.dataset.st===AV.tab));["b","h","c"].forEach(t=>$("sp"+t).classList.toggle("hide",t!==AV.tab));
 /* boleto */
 if(!n)$("spb").innerHTML=`<div class="sp-empty">Toca <b>+</b> junto a cualquier mercado, o <b>+ BOLETO</b> debajo del pick, para armar tu apuesta.<br><br>Con una selección es una apuesta sencilla; con dos o más se arma un parlay y aquí ves su probabilidad combinada, su cuota justa y si la cuota de tu casa tiene valor.</div>`;
 else{const L=AV.slip,cnt={};L.forEach(x=>cnt[x.gk]=(cnt[x.gk]||0)+1);const corr=L.some(x=>cnt[x.gk]>1);
  const p=L.reduce((a,x)=>a*x.p,1),allD=L.every(x=>x.d),dP=allD?L.reduce((a,x)=>a*x.d,1):null,ov=n>1?decO(AV.ovr):null,d=ov||dP,ev=d?p*d-1:null,sug=unitOf(p,d),u=AV.u!=null?AV.u:sug;
  $("spb").innerHTML=L.map((x,i)=>`<div class="leg ${cnt[x.gk]>1?"cr":""}"><div><small>${esc(x.sp)} · ${esc(x.t)}</small><b>${esc(x.l)}</b><em>${esc(x.m)} · modelo ${pct(x.p)}</em></div><input inputmode="decimal" data-leg="${i}" value="${x.d?x.d.toFixed(2):""}" placeholder="cuota"><button class="rm" data-rm="${i}" aria-label="Quitar">✕</button></div>`).join("")
  +(corr?`<div class="warn">Hay selecciones del mismo partido (borde naranja). Sus resultados están relacionados, así que la probabilidad combinada de abajo, que las trata como independientes, puede estar inflada o desinflada. Tómala con cuidado.</div>`:"")
  +`<div class="sum"><div class="r"><span>${n>1?"Parlay de "+n+" selecciones":"Apuesta sencilla"}</span><b>prob. ${pct(p)}</b></div>
  <div class="r"><span>Cuota justa (sin margen)</span><b>${(1/p).toFixed(2)}</b></div>
  <div class="r"><span>Cuota ${n>1?"combinada":"de tu casa"}</span><b>${dP?dP.toFixed(2):"falta cuota"}</b></div>
  ${n>1?`<div class="r inp"><span>Cuota que te da tu casa por el parlay <small style="display:block;font-size:10px;color:rgba(255,255,255,.45)">opcional, si es distinta</small></span><input inputmode="decimal" id="spov" value="${esc(AV.ovr)}" placeholder="${dP?dP.toFixed(2):"cuota"}"></div>`:""}
  <div class="r"><span>Valor esperado (EV)</span><b class="${ev==null?"":ev>0?"sp-pos":"sp-neg"}">${ev==null?"—":(ev>0?"+":"")+(ev*100).toFixed(1)+"%"}</b></div>
  <div class="r"><span>Apuesta sugerida <small style="display:block;font-size:10px;color:rgba(255,255,255,.45)">${!d?"escribe las cuotas":sug?`el modelo da ${pct(p)} · ${p>=AV.cfg.th?"alta":"normal"} confianza`:"sin valor (menos de +4% EV): no apostar"}</small></span><b class="big">${!d?"—":sug?sug+"% del bank":"No apostar"}</b></div>
  <div class="r"><span>Cuánto vas a apostar</span><span class="uch"><button data-u="5" class="${u===5?"a":""}">5% bank</button><button data-u="10" class="${u===10?"a":""}">10% bank</button></span></div>
  <div class="r"><span>Si acierta</span><b class="sp-pos">${d&&u?"+"+(u*(d-1)).toFixed(1)+"% de tu bank":"—"}</b></div></div>
  <button class="sp-btn" id="spreg" ${d&&u?"":"disabled"}>REGISTRAR APUESTA</button><button class="sp-btn gh" id="spclr">VACIAR BOLETO</button>`}
 /* historial */
 const S=AV.bets.filter(b=>b.st==="w"||b.st==="l"),W=S.filter(b=>b.st==="w").length,stk=S.reduce((a,b)=>a+b.stake,0),net=AV.bets.reduce((a,b)=>a+profit(b),0),P=AV.bets.filter(b=>b.st==="p"),inPlay=P.reduce((a,b)=>a+b.stake,0);
 const avgP=S.length?S.reduce((a,b)=>a+b.p,0)/S.length:0;
 $("sph").innerHTML=`<div class="stats"><div class="stat"><small>BANKROLL ACTUAL</small><b>${money(curBank())}</b></div><div class="stat"><small>GANANCIA NETA</small><b class="${net>0?"sp-pos":net<0?"sp-neg":""}">${money(net)}</b></div>
 <div class="stat"><small>ROI</small><b class="${net>0?"sp-pos":net<0?"sp-neg":""}">${stk?((net/stk)*100).toFixed(1)+"%":"—"}</b></div><div class="stat"><small>ACIERTOS</small><b>${S.length?W+"/"+S.length+" · "+Math.round(W/S.length*100)+"%":"—"}</b></div>
 <div class="stat"><small>CRECIMIENTO DEL BANK</small><b class="${net>0?"sp-pos":net<0?"sp-neg":""}">${AV.cfg.start?((net/AV.cfg.start)*100>0?"+":"")+((net/AV.cfg.start)*100).toFixed(1)+"%":"—"}</b></div><div class="stat"><small>PENDIENTES</small><b>${P.length}${P.length?" · "+P.reduce((a,b)=>a+(b.u||0),0)+"% bank":""}</b></div></div>
 ${S.length?`<div class="cal">En tus ${S.length} apuesta${S.length>1?"s":""} resuelta${S.length>1?"s":""}, el modelo les daba en promedio <b>${pct(avgP)}</b> de probabilidad y acertaste el <b>${pct(W/S.length)}</b>. ${S.length<30?"Con menos de 30 apuestas la diferencia todavía es sobre todo suerte.":Math.abs(W/S.length-avgP)<.04?"Van bastante parejos: el modelo está bien calibrado contigo.":W/S.length>avgP?"Estás acertando más de lo que el modelo esperaba.":"Estás acertando menos de lo que el modelo esperaba; conviene ser más selectivo."}</div>`:""}${BRK()}
 ${AV.bets.length?AV.bets.map(b=>{const pr=profit(b);return `<div class="bet"><div class="top"><div><small>${new Date(b.ts).toLocaleDateString("es-MX",{day:"numeric",month:"short"})} · ${b.legs.length>1?"Parlay "+b.legs.length:"Sencilla"} · ${b.u?b.u+"% bank":money(b.stake)} @ ${(+b.d).toFixed(2)} · modelo ${pct(b.p)}</small></div><span class="chipst ${b.st}">${b.st==="p"?"PENDIENTE":b.st==="w"?"GANÓ "+(b.u?"+"+(b.u*(b.d-1)).toFixed(1)+"% bank":money(pr)):b.st==="l"?"PERDIÓ "+(b.u?b.u+"% bank":money(-pr)):"NULA"}</span></div>
  <ul>${b.legs.map(l=>`<li><b>${esc(l.l)}</b> · ${esc(l.m)} <span style="color:rgba(255,255,255,.45)">${esc(l.sp)}</span></li>`).join("")}</ul>
  <div class="acts">${b.st==="p"?`<button class="w" data-set="w" data-id="${b.id}">✓ Ganó</button><button class="l" data-set="l" data-id="${b.id}">✗ Perdió</button><button data-set="v" data-id="${b.id}">Nula</button>`:`<button data-set="p" data-id="${b.id}">Deshacer</button>`}<button class="del ${AV.arm===b.id?"arm":""}" data-del="${b.id}">${AV.arm===b.id?"¿Borrar?":"Borrar"}</button></div></div>`}).join(""):`<div class="sp-empty">Todavía no registras apuestas. Arma tu boleto y toca <b>Registrar apuesta</b>; después marca aquí si ganó o perdió para ver tu ROI real.</div>`}`;
 /* bankroll */
 $("spc").innerHTML=`<div class="fld"><label>BANKROLL INICIAL</label><input inputmode="decimal" id="cfst" value="${AV.cfg.start}"><small>Tu bankroll actual es este monto más lo que ganaste o perdiste en las apuestas resueltas: <b>${money(curBank())}</b>.</small></div>
 <div class="fld"><label>CUÁNDO APOSTAR 10%</label><select id="cfth">${[.55,.6,.65,.7].map(v=>`<option value="${v}" ${AV.cfg.th==v?"selected":""}>Cuando el modelo da ${v*100}% o más</option>`).join("")}</select></div>
 <div class="note2"><b>Cómo se decide cuánto apostar:</b> solo hay dos tamaños. <b>10% del bank</b> cuando el modelo le da ${Math.round(AV.cfg.th*100)}% o más de probabilidad al pick, y <b>5% del bank</b> cuando le da menos. Si ya escribiste la cuota y no le saca al menos <b>4% de ventaja</b> a la casa (EV +4%), la recomendación es <b>no apostar</b>: el pick sale como "Sin valor · No apostar".<br><br><b>Dónde se guarda:</b> ${AV.db?"en tu cuenta, de forma privada; solo tú lo ves, en cualquier dispositivo.":"solo en este navegador. Si abres la página en otro dispositivo no verás tu historial."}</div>`}
/* desglose del historial: ROI por liga y por tipo de apuesta */
function BRK(){const S=AV.bets.filter(b=>b.st==="w"||b.st==="l");if(!S.length)return"";
 const grp=f=>{const m={};S.forEach(b=>{const k=f(b);(m[k]=m[k]||[]).push(b)});return Object.entries(m).map(([k,L])=>{const w=L.filter(b=>b.st==="w").length,st=L.reduce((a,b)=>a+b.stake,0),n=L.reduce((a,b)=>a+profit(b),0);return{k,n:L.length,w,roi:st?n/st:0}}).sort((a,b)=>b.n-a.n)};
 const tb=(t,R)=>`<div class="brk"><h4>${t}</h4><div class="br hd"><span></span><small>G-P</small><small>ROI</small></div>${R.map(r=>`<div class="br"><span>${esc(r.k)}</span><small>${r.w}-${r.n-r.w}</small><b class="${r.roi>0?"sp-pos":r.roi<0?"sp-neg":""}">${r.roi>0?"+":""}${(r.roi*100).toFixed(1)}%</b></div>`).join("")}</div>`;
 const typ=b=>b.legs.length>1?"Parlay":/ gana \+ /.test(b.legs[0].l)?"Combinada (gana + over)":/ o empate|^Empate o /.test(b.legs[0].l)?"Doble oportunidad":"Sencilla";
 return tb("ROI POR LIGA",grp(b=>b.legs.length>1?"Parlays":b.legs[0].sp||"Otro"))+tb("ROI POR TIPO DE APUESTA",grp(typ))+(S.length<20?`<div class="cal">Con menos de 20 apuestas resueltas el ROI por liga todavía cambia mucho. Revísalo cuando lleves más para decidir qué ligas o tipos de apuesta dejar.</div>`:"")}
function openSlip(t){if(t)AV.tab=t;AV.arm=null;renderSlip();$("slipv").classList.remove("hide")}
function closeSlip(){$("slipv").classList.add("hide");pushCfg()}
$("slipb").onclick=()=>openSlip();
$("slipv").addEventListener("click",async e=>{const t=e.target;
 if(t.id==="slipv"||t.id==="slipx"){closeSlip();return}
 if(t.dataset.st){AV.tab=t.dataset.st;AV.arm=null;renderSlip();return}
 if(t.dataset.rm!=null){AV.slip.splice(+t.dataset.rm,1);AV.u=null;save("slip");renderSlip();pushCfg();return}
 if(t.id==="spclr"){AV.slip=[];AV.ovr="";AV.u=null;save("slip");renderSlip();pushCfg();return}
 if(t.dataset.u){AV.u=+t.dataset.u;renderSlip();return}
 if(t.id==="spreg"){const L=AV.slip,p=L.reduce((a,x)=>a*x.p,1),dP=L.every(x=>x.d)?L.reduce((a,x)=>a*x.d,1):null,d=(L.length>1&&decO(AV.ovr))||dP,u=AV.u!=null?AV.u:unitOf(p,d),amt=curBank()*u/100;
  if(!d||!u)return;const b={id:"b"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),ts:Date.now(),legs:L.map(x=>({l:x.l,m:x.m,sp:x.sp,t:x.t,p:x.p,d:x.d})),p:+p.toFixed(4),d:+d.toFixed(3),stake:Math.round(amt*100)/100,u,st:"p"};
  AV.bets.unshift(b);AV.slip=[];AV.ovr="";AV.u=null;await saveBet(b);save("slip");AV.tab="h";renderSlip();pushCfg();toast("Apuesta registrada");return}
 if(t.dataset.set){const b=AV.bets.find(x=>x.id===t.dataset.id);if(!b)return;b.st=t.dataset.set;AV.arm=null;renderSlip();pushCfg();await saveBet(b);return}
 if(t.dataset.del){if(AV.arm!==t.dataset.del){AV.arm=t.dataset.del;renderSlip();return}const id=AV.arm;AV.bets=AV.bets.filter(x=>x.id!==id);AV.arm=null;renderSlip();pushCfg();await delBet(id);return}});
$("slipv").addEventListener("change",e=>{const t=e.target;
 if(t.dataset.leg!=null){const x=AV.slip[+t.dataset.leg];if(!x)return;x.d=decO(t.value);AV.u=null;if(x.d)AV.odds[x.k]=x.d.toFixed(2);else delete AV.odds[x.k];save("slip");save("odds");renderSlip();pushCfg();return}
 if(t.id==="spov"){AV.ovr=t.value.trim();AV.u=null;renderSlip();return}
 if(t.id==="cfst"){const v=parseFloat(t.value);if(v>=0){AV.cfg.start=Math.round(v*100)/100;save("cfg")}renderSlip();pushCfg();return}
 if(t.id==="cfth"){AV.cfg.th=+t.value;save("cfg");renderSlip();pushCfg();return}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("slipv").classList.contains("hide")){e.stopImmediatePropagation();closeSlip()}},true);
renderSlip();avInit();