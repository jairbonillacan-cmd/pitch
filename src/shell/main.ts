/**
 * Shell AztecaVet — orquestación principal (port de inline_1 con mejoras
 * documentadas): puerta validada server-side (POST /api/access; el original la
 * compara client-side), intro con arte, home con deportes, navegación, boleto/
 * historial/bankroll y asistente. Categoría: OBSERVADO salvo el gate (RECONSTRUIDO).
 */
import "./audio.js";
import { ballLoop, ballFrame, pyramidSVG, startBall, startIntro, intro, sunSVG } from "./art.js";
import * as A from "./audio.js";
import { AV, avInit, lsLoad, lsSave, save, pushCfg, onSportMessage, toast, setRenderSlip, registerFromSlip, saveBet, delBet, curBank, summary, money, pct, dec } from "./store.js";
import { initAssistant } from "./assistant.js";
import { profitOf } from "../domain/aztecavet/index.js";
import type { Bet } from "../domain/aztecavet/index.js";

const $ = (id: string) => document.getElementById(id);
const robs = ["robot-mlb.webp", "robot-futbol.webp", "robot-nhl.webp"];
const ROB = [
  { t: "MLB", eb: "BÉISBOL", go: "mlb", img: "/assets/" + robs[0] },
  { t: "FÚTBOL", eb: "4 TORNEOS", go: "fb", img: "/assets/" + robs[1] },
  { t: "NHL", eb: "HOCKEY", go: "nhl", img: "/assets/" + robs[2] },
];
const SP = [
  { n: "Liga MX", sub: "APERTURA 2026 · JORNADA 16", info: "J16 del 6 al 8 nov · 9 partidos · 3 hoy · J15 en auditoría", ab: "MX", pg: "fb", c: "MX", col: "#30d158" },
  { n: "La Liga", sub: "ESPAÑA · 2026-27", info: "J12 del 6 al 8 nov · 10 partidos · 1 hoy (Sevilla–Alavés) · J11 en auditoría", ab: "ES", pg: "fb", c: "LL", col: "#ff9f0a" },
  { n: "Premier League", sub: "INGLATERRA · 2026-27", info: "J10 del 6 al 8 nov · 10 partidos · 1 hoy (Everton–Coventry) · J9 en auditoría", ab: "EN", pg: "fb", c: "PL", col: "#bf5af2" },
  { n: "Champions League", sub: "UEFA · FASE DE LIGA 26/27", info: "Jornada 4 completa (18 juegos) en auditoría · sin partidos esta semana", ab: "UCL", pg: "fb", c: "UCL", col: "#0a84ff" },
  { n: "NHL", pg: "nhl", c: "NHL", col: "#64d2ff" },
  { n: "MLB", pg: "mlb", c: "MLB", col: "#ff453a" },
  { n: "Europa League", sub: "UEFA · FASE DE LIGA 26/27", info: "Jornada 4 completa (18 juegos) en auditoría · sin partidos esta semana", ab: "UEL", pg: "fb", c: "UEL", col: "#ffb020" },
];
let LV = 1;
let SPOPEN = false;

// ---------- gate (mejora: validación server-side) ----------
const CODE_LEN = 4;
let buf = "";
let stage = 1;
let gateBusy = false;
const T0 = Date.now();

function dotsEls(): HTMLElement[] { return [...($("#dots") as HTMLElement).children] as HTMLElement[]; }

function paintDots(): void {
  dotsEls().forEach((d, i) => d.classList.toggle("on", i < buf.length));
}

async function tryUnlock(): Promise<void> {
  gateBusy = true;
  try {
    const r = await fetch("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: buf }),
    });
    if (r.ok) {
      const { token } = (await r.json()) as { token: string };
      sessionStorage.setItem("azteca_access", token);
      success();
      return;
    }
    fail();
  } catch {
    fail();
  }
}

function key(k: string): void {
  if (stage !== 2 || gateBusy) return;
  if (k === "⌫") { buf = buf.slice(0, -1); A.tick(0.5); }
  else if (/\d/.test(k) && buf.length < CODE_LEN) { buf += k; A.keySound(+k); }
  paintDots();
  if (buf.length === CODE_LEN) { gateBusy = true; void tryUnlock(); }
}

function fail(): void {
  const sl = $("#dots")!;
  const p = $("#plate")!;
  sl.classList.add("bad");
  ($("msg") as HTMLElement).textContent = "CÓDIGO INCORRECTO";
  A.failSound();
  p.classList.add("shake");
  setTimeout(() => {
    p.classList.remove("shake");
    sl.classList.remove("bad");
    buf = "";
    dotsEls().forEach((d) => d.classList.remove("on"));
    ($("msg") as HTMLElement).textContent = "VUELVE A INTENTAR";
    gateBusy = false;
  }, 650);
}

function success(): void {
  const sl = $("#dots")!;
  sl.classList.add("ok");
  ($("msg") as HTMLElement).textContent = "ACCESO CONCEDIDO";
  A.unlockSound();
  intro.warp = 1;
  $("#flash")!.classList.add("go");
  setTimeout(() => {
    $("#lock")!.classList.add("out");
    $("#app")!.classList.remove("hide");
    $("#app")!.classList.add("enter");
    drawHome();
    clk();
    $("#slipb")!.classList.remove("hide");
    void avInit();
  }, 650);
  setTimeout(() => {
    $("#lock")!.classList.add("hide");
    intro.stop();
  }, 1800);
}

function goStage2(): void {
  if (stage !== 1) return;
  stage = 2;
  A.portal();
  $("#stg1")!.classList.add("gone");
  setTimeout(() => {
    $("#stg1")!.classList.add("hide");
    $("#stg2")!.classList.remove("hide");
  }, 650);
}

// ---------- home ----------
const hexCol = (h: string): string => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
};
function spark(): string {
  let y = 16;
  const p: string[] = [];
  for (let i = 0; i < 12; i++) {
    y = Math.max(3, Math.min(23, y + (Math.random() * 12 - 6)));
    p.push((i * 8.7).toFixed(0) + "," + y.toFixed(0));
  }
  return `<svg class="spk" viewBox="0 0 96 26"><polyline points="${p.join(" ")}"/></svg>`;
}
function emblem(o: { ab?: string; c: string; col: string }): string {
  const t = o.ab || "";
  const id = "em" + o.c;
  return `<div class="emb"><svg viewBox="0 0 120 120"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.col}"/><stop offset="1" stop-color="#0b3d24"/></linearGradient></defs><circle cx="60" cy="60" r="54" fill="rgba(255,255,255,.7)" stroke="url(#${id})" stroke-width="2"/><circle class="rt" cx="60" cy="60" r="46" fill="none" stroke="${o.col}" stroke-opacity=".7" stroke-dasharray="3 7"/><text x="60" y="${t.length > 2 ? 72 : 74}" text-anchor="middle" font-size="${t.length > 2 ? 32 : 42}" font-weight="700" fill="url(#${id})" letter-spacing="-1">${t}</text></svg></div>`;
}
function cardHtml(o: { ab?: string; c: string; col: string; n: string; sub?: string; info?: string }, d: number, i: number): string {
  return `<div class="bc rv" data-i="${i}" style="--cr:${hexCol(o.col)};--d:${d}">${emblem(o)}<div class="hud"><i></i><i></i><i></i><i></i></div><div class="scn"></div><div class="bt"><div class="eb2">${o.sub ?? ""}</div><h2>${o.n}</h2><p>${o.info ?? ""}</p></div><div class="ft"><span class="more">Entrar ›</span>${spark()}</div></div>`;
}
function tilt(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".bc").forEach((c) => {
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      c.style.setProperty("--mx", x * 100 + "%");
      c.style.setProperty("--my", y * 100 + "%");
      c.style.setProperty("--rx", ((0.5 - y) * 7).toFixed(2) + "deg");
      c.style.setProperty("--ry", ((x - 0.5) * 9).toFixed(2) + "deg");
    });
    c.addEventListener("pointerleave", () => {
      c.style.setProperty("--rx", "0deg");
      c.style.setProperty("--ry", "0deg");
    });
  });
}

function drawHome(): void {
  LV = 1;
  $("#s1")!.classList.remove("hide", "leave");
  $("#s2")!.classList.add("hide");
  const bento = $("#bento") as HTMLElement;
  bento.innerHTML =
    `<div class="mystic">${sunSVG(false)}</div>` +
    ROB.map(
      (o, i) => `<div class="rc rv" data-go="${o.go}" style="--d:${4 + i};--dl:${(i * 0.6).toFixed(1)}s" role="button" aria-label="${o.t}"><div class="im"><div class="gw"></div><img src="${o.img}" alt="Robot ${o.t}"></div><div class="pd"><b>${o.t}</b><small>${o.eb}</small><em>Entrar ›</em></div></div>`,
    ).join("");
  const lgrid = $("#lgrid") as HTMLElement;
  lgrid.innerHTML = SP.map((o, i) => ({ o, i }))
    .filter((x) => x.o.pg === "fb")
    .map(([o, i], j) => cardHtml(o as typeof SP[number], 1 + j, i))
    .join("");
  tilt(lgrid);
  const trio = $("trio");
  if (trio) trio.innerHTML = ROB.map((o) => `<img src="${o.img}" alt="Robot ${o.t}">`).join("");
}

function lv2(): void {
  if (LV === 2) return;
  LV = 2;
  const a = $("#s1")!;
  a.classList.add("leave");
  setTimeout(() => {
    a.classList.add("hide");
    a.classList.remove("leave");
    $("#s2")!.classList.remove("hide");
    window.scrollTo(0, 0);
  }, 380);
}
function lv1(): void {
  if (LV === 1) return;
  LV = 1;
  const a = $("#s2")!;
  a.classList.add("leave");
  setTimeout(() => {
    a.classList.add("hide");
    a.classList.remove("leave");
    $("#s1")!.classList.remove("hide");
    window.scrollTo(0, 0);
  }, 380);
}

function clk(): void {
  const d = new Date();
  ($("clk") as HTMLElement).textContent = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
setInterval(clk, 20000);

function openSport(i: number): void {
  const s = SP[i];
  if (!s) return;
  SPOPEN = true;
  const f = $("fr") as HTMLIFrameElement;
  f.src = "/" + s.pg + ".html?start=" + s.c;
  f.classList.remove("hide");
  $("#hintbar")!.classList.add("sp");
  document.body.style.overflow = "hidden";
}
function closeSport(): void {
  if (!SPOPEN) return;
  SPOPEN = false;
  const f = $("fr") as HTMLIFrameElement;
  f.classList.add("hide");
  f.src = "about:blank";
  $("#hintbar")!.classList.remove("sp");
  document.body.style.overflow = "";
}

// ---------- boleto / historial / bankroll (renderSlip) ----------
function fmtLegs(L: { k: string; gk: string; sp: string; m: string; l: string; p: number; d: number | null; t: string }[]): string {
  const cnt: Record<string, number> = {};
  L.forEach((x) => (cnt[x.gk] = (cnt[x.gk] || 0) + 1));
  return L.map((x, i) =>
    `<div class="leg ${cnt[x.gk]! > 1 ? "cr" : ""}"><div><small>${esc(x.sp)} · ${esc(x.t)}</small><b>${esc(x.l)}</b><em>${esc(x.m)} · modelo ${pct(x.p)}</em></div><input inputmode="decimal" data-leg="${i}" value="${x.d ? x.d.toFixed(2) : ""}" placeholder="cuota"><button class="rm" data-rm="${i}" aria-label="Quitar">✕</button></div>`,
  ).join("");
}
const esc = (s: string | null | undefined): string =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function renderSlip(): void {
  const s = summary();
  ($("slipn") as HTMLElement).textContent = String(s.n);
  $("#slipb")!.classList.toggle("has", s.n > 0);
  document.querySelectorAll<HTMLElement>(".sp-tabs button").forEach((b) => b.classList.toggle("a", b.dataset.st === AV.tab));
  (["b", "h", "c"] as const).forEach((t) => $("sp" + t)!.classList.toggle("hide", t !== AV.tab));
  const spb = $("spb") as HTMLElement;
  if (!s.n)
    spb.innerHTML = `<div class="sp-empty">Toca <b>+</b> junto a cualquier mercado, o <b>+ BOLETO</b> debajo del pick, para armar tu apuesta.<br><br>Con una selección es una apuesta sencilla; con dos o más se arma un parlay y aquí ves su probabilidad combinada, su cuota justa y si la cuota de tu casa tiene valor.</div>`;
  else {
    const L = AV.slip;
    spb.innerHTML =
      fmtLegs(L) +
      (s.corr ? `<div class="warn">Hay selecciones del mismo partido (borde naranja). Sus resultados están relacionados, así que la probabilidad combinada de abajo, que las trata como independientes, puede estar inflada o desinflada. Tómala con cuidado.</div>` : "") +
      `<div class="sum"><div class="r"><span>${s.n > 1 ? "Parlay de " + s.n + " selecciones" : "Apuesta sencilla"}</span><b>prob. ${pct(s.p)}</b></div>
      <div class="r"><span>Cuota justa (sin margen)</span><b>${(1 / s.p).toFixed(2)}</b></div>
      <div class="r"><span>Cuota ${s.n > 1 ? "combinada" : "de tu casa"}</span><b>${s.dP ? s.dP.toFixed(2) : "falta cuota"}</b></div>
      ${s.n > 1 ? `<div class="r inp"><span>Cuota que te da tu casa por el parlay <small style="display:block;font-size:10px;color:rgba(255,255,255,.45)">opcional, si es distinta</small></span><input inputmode="decimal" id="spov" value="${esc(AV.ovr)}" placeholder="${s.dP ? s.dP.toFixed(2) : "cuota"}"></div>` : ""}
      <div class="r"><span>Valor esperado (EV)</span><b class="${s.ev == null ? "" : s.ev > 0 ? "sp-pos" : "sp-neg"}">${s.ev == null ? "—" : (s.ev > 0 ? "+" : "") + (s.ev * 100).toFixed(1) + "%"}</b></div>
      <div class="r"><span>Apuesta sugerida <small style="display:block;font-size:10px;color:rgba(255,255,255,.45)">${!s.d ? "escribe las cuotas" : s.sug ? `el modelo da ${pct(s.p)} · ${s.p >= AV.cfg.th ? "alta" : "normal"} confianza` : "sin valor (menos de +4% EV): no apostar"}</small></span><b class="big">${!s.d ? "—" : s.sug ? s.sug + "% del bank" : "No apostar"}</b></div>
      <div class="r"><span>Cuánto vas a apostar</span><span class="uch"><button data-u="5" class="${AV.u === 5 ? "a" : ""}">5% bank</button><button data-u="10" class="${AV.u === 10 ? "a" : ""}">10% bank</button></span></div>
      <div class="r"><span>Si acierta</span><b class="sp-pos">${s.d && AV.u ? "+" + (AV.u * (s.d - 1)).toFixed(1) + "% de tu bank" : "—"}</b></div></div>
      <button class="sp-btn" id="spreg" ${s.d && AV.u ? "" : "disabled"}>REGISTRAR APUESTA</button><button class="sp-btn gh" id="spclr">VACIAR BOLETO</button>`;
  }
  // historial
  const S = AV.bets.filter((b) => b.st === "w" || b.st === "l");
  const W = S.filter((b) => b.st === "w").length;
  const stk = S.reduce((a, b) => a + b.stake, 0);
  const net = AV.bets.reduce((a, b) => a + profitOf(b), 0);
  const P = AV.bets.filter((b) => b.st === "p");
  const inPlay = P.reduce((a, b) => a + b.stake, 0);
  const avgP = S.length ? S.reduce((a, b) => a + b.p, 0) / S.length : 0;
  const sph = $("sph") as HTMLElement;
  sph.innerHTML = `<div class="stats"><div class="stat"><small>BANKROLL ACTUAL</small><b>${money(curBank(AV.bets, AV.cfg))}</b></div><div class="stat"><small>GANANCIA NETA</small><b class="${net > 0 ? "sp-pos" : net < 0 ? "sp-neg" : ""}">${money(net)}</b></div>
  <div class="stat"><small>ROI</small><b class="${net > 0 ? "sp-pos" : net < 0 ? "sp-neg" : ""}">${stk ? ((net / stk) * 100).toFixed(1) + "%" : "—"}</b></div><div class="stat"><small>ACIERTOS</small><b>${S.length ? W + "/" + S.length + " · " + Math.round((W / S.length) * 100) + "%" : "—"}</b></div>
  <div class="stat"><small>CRECIMIENTO DEL BANK</small><b class="${net > 0 ? "sp-pos" : net < 0 ? "sp-neg" : ""}">${AV.cfg.start ? ((net / AV.cfg.start) * 100 > 0 ? "+" : "") + ((net / AV.cfg.start) * 100).toFixed(1) + "%" : "—"}</b></div><div class="stat"><small>PENDIENTES</small><b>${P.length}${P.length ? " · " + P.reduce((a, b) => a + (b.u || 0), 0) + "% bank" : ""}</b></div></div>
  ${calibrationHtml(S, W, avgP)}${BRK()}
  ${AV.bets.length ? AV.bets.map((b) => betRow(b)).join("") : `<div class="sp-empty">Todavía no registras apuestas. Arma tu boleto y toca <b>Registrar apuesta</b>; después marca aquí si ganó o perdió para ver tu ROI real.</div>`}`;
  void inPlay;
  // bankroll
  const spc = $("spc") as HTMLElement;
  spc.innerHTML = `<div class="fld"><label>BANKROLL INICIAL</label><input inputmode="decimal" id="cfst" value="${AV.cfg.start}"><small>Tu bankroll actual es este monto más lo que ganaste o perdiste en las apuestas resueltas: <b>${money(curBank(AV.bets, AV.cfg))}</b>.</small></div>
  <div class="fld"><label>CUÁNDO APOSTAR 10%</label><select id="cfth">${[0.55, 0.6, 0.65, 0.7].map((v) => `<option value="${v}" ${AV.cfg.th === v ? "selected" : ""}>Cuando el modelo da ${v * 100}% o más</option>`).join("")}</select></div>
  <div class="note2"><b>Cómo se decide cuánto apostar:</b> solo hay dos tamaños. <b>10% del bank</b> cuando el modelo le da ${Math.round(AV.cfg.th * 100)}% o más de probabilidad al pick, y <b>5% del bank</b> cuando le da menos. Si ya escribiste la cuota y no le saca al menos <b>4% de ventaja</b> a la casa (EV +4%), la recomendación es <b>no apostar</b>: el pick sale como "Sin valor · No apostar".<br><br><b>Dónde se guarda:</b> ${AV.db ? "en tu cuenta, de forma privada; solo tú lo ves, en cualquier dispositivo." : "solo en este navegador. Si abres la página en otro dispositivo no verás tu historial."}</div>`;
}

function calibrationHtml(S: Bet[], W: number, avgP: number): string {
  if (!S.length) return "";
  const real = W / S.length;
  let tail: string;
  if (S.length < 30) tail = "Con menos de 30 apuestas la diferencia todavía es sobre todo suerte.";
  else if (Math.abs(real - avgP) < 0.04) tail = "Van bastante parejos: el modelo está bien calibrado contigo.";
  else tail = real > avgP ? "Estás acertando más de lo que el modelo esperaba." : "Estás acertando menos de lo que el modelo esperaba; conviene ser más selectivo.";
  return `<div class="cal">En tus ${S.length} apuesta${S.length > 1 ? "s" : ""} resuelta${S.length > 1 ? "s" : ""}, el modelo les daba en promedio <b>${pct(avgP)}</b> de probabilidad y acertaste el <b>${pct(real)}</b>. ${tail}</div>`;
}

function betRow(b: Bet): string {
  const pr = profitOf(b);
  return `<div class="bet"><div class="top"><div><small>${new Date(b.ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} · ${b.legs.length > 1 ? "Parlay " + b.legs.length : "Sencilla"} · ${b.u ? b.u + "% bank" : money(b.stake)} @ ${(+b.d).toFixed(2)} · modelo ${pct(b.p)}</small></div><span class="chipst ${b.st}">${b.st === "p" ? "PENDIENTE" : b.st === "w" ? "GANÓ " + (b.u ? "+" + (b.u * (b.d - 1)).toFixed(1) + "% bank" : money(pr)) : b.st === "l" ? "PERDIÓ " + (b.u ? b.u + "% bank" : money(-pr)) : "NULA"}</span></div>
  <ul>${b.legs.map((l) => `<li><b>${esc(l.l)}</b> · ${esc(l.m)} <span style="color:rgba(255,255,255,.45)">${esc(l.sp)}</span></li>`).join("")}</ul>
  <div class="acts">${b.st === "p" ? `<button class="w" data-set="w" data-id="${b.id}">✓ Ganó</button><button class="l" data-set="l" data-id="${b.id}">✗ Perdió</button><button data-set="v" data-id="${b.id}">Nula</button>` : `<button data-set="p" data-id="${b.id}">Deshacer</button>`}<button class="del ${AV.arm === b.id ? "arm" : ""}" data-del="${b.id}">${AV.arm === b.id ? "¿Borrar?" : "Borrar"}</button></div></div>`;
}

function typOf(b: Bet): string {
  return b.legs.length > 1 ? "Parlay" : / gana \+ /.test(b.legs[0]?.l ?? "") ? "Combinada (gana + over)" : / o empate|^Empate o /.test(b.legs[0]?.l ?? "") ? "Doble oportunidad" : "Sencilla";
}
function BRK(): string {
  const S = AV.bets.filter((b) => b.st === "w" || b.st === "l");
  if (!S.length) return "";
  const grp = (f: (b: Bet) => string) => {
    const m: Record<string, Bet[]> = {};
    S.forEach((b) => {
      const k = f(b);
      (m[k] = m[k] || []).push(b);
    });
    return Object.entries(m)
      .map(([k, L]) => {
        const w = L.filter((b) => b.st === "w").length;
        const st = L.reduce((a, b) => a + b.stake, 0);
        const n = L.reduce((a, b) => a + profitOf(b), 0);
        return { k, n: L.length, w, roi: st ? n / st : 0 };
      })
      .sort((a, b) => b.n - a.n);
  };
  const tb = (t: string, R: { k: string; n: number; w: number; roi: number }[]) =>
    `<div class="brk"><h4>${t}</h4><div class="br hd"><span></span><small>G-P</small><small>ROI</small></div>${R.map((r) => `<div class="br"><span>${esc(r.k)}</span><small>${r.w}-${r.n - r.w}</small><b class="${r.roi > 0 ? "sp-pos" : r.roi < 0 ? "sp-neg" : ""}">${r.roi > 0 ? "+" : ""}${(r.roi * 100).toFixed(1)}%</b></div>`).join("")}</div>`;
  return tb("ROI POR LIGA", grp((b) => (b.legs.length > 1 ? "Parlays" : b.legs[0]?.sp || "Otro"))) +
    tb("ROI POR TIPO DE APUESTA", grp(typOf)) +
    (S.length < 20 ? `<div class="cal">Con menos de 20 apuestas resueltas el ROI por liga todavía cambia mucho. Revísalo cuando lleves más para decidir qué ligas o tipos de apuesta dejar.</div>` : "");
}
setRenderSlip(renderSlip);

function openSlip(t?: "b" | "h" | "c"): void {
  if (t) AV.tab = t;
  AV.arm = null;
  renderSlip();
  $("#slipv")!.classList.remove("hide");
}
function closeSlip(): void {
  $("#slipv")!.classList.add("hide");
  pushCfg();
}

// ---------- arranque ----------
function boot(): void {
  // arte
  const sun = $("sunsvg");
  if (sun) sun.innerHTML = sunSVG(false);
  const mav = $("mav");
  if (mav) mav.innerHTML = sunSVG(true);
  const lgi = $("lgi");
  if (lgi) lgi.innerHTML = sunSVG(true);
  const pyr = $("pyr");
  if (pyr) pyr.innerHTML = pyramidSVG();
  const ballc1 = $("ballc1") as HTMLCanvasElement;
  if (ballc1) startBall(ballc1, 240, () => stage === 1 && !$("#lock")!.classList.contains("hide"), 1);
  ballLoop();
  startIntro();

  // audio + gate
  A.bindSoundToggles();
  A.bindHoverSounds(() => SPOPEN);
  A.tryAutoStart();
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      if (A.started()) return;
      const adv = stage === 1 && Date.now() - T0 > 900 && !(e.target as HTMLElement).closest?.("#snd");
      A.startScore(!adv);
    }, { capture: true }),
  );
  $("#lock")!.addEventListener("click", (e) => {
    if (stage === 1 && Date.now() - T0 > 900 && !(e.target as HTMLElement).closest("#snd")) goStage2();
  });
  const pad = $("#pad") as HTMLElement;
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].forEach((k) => {
    const b = document.createElement("button");
    b.textContent = k;
    if (!k) b.style.visibility = "hidden";
    b.addEventListener("click", (e) => { e.stopPropagation(); key(k); });
    pad.appendChild(b);
  });
  document.addEventListener("keydown", (e) => {
    if (!$("#lock")!.classList.contains("hide")) {
      if (stage === 1) { if (Date.now() - T0 > 900) goStage2(); return; }
      if (e.key === "Backspace") key("⌫");
      else if (/^\d$/.test(e.key)) key(e.key);
      return;
    }
    if (e.key === "Escape" || e.key === "Backspace") {
      if (SPOPEN) closeSport();
      else if (LV === 2) lv1();
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (SPOPEN) {
      if (t.closest("#hback")) { A.backSound(); closeSport(); }
      return;
    }
    const g = t.closest("[data-go]") as HTMLElement | null;
    if (g) {
      A.navSound();
      const v = g.dataset.go!;
      if (v === "fb") { if (LV === 1) lv2(); }
      else {
        const idx = SP.findIndex((s) => s.pg === v);
        openSport(idx);
      }
      return;
    }
    const c = t.closest("[data-i]") as HTMLElement | null;
    if (c) { A.navSound(); openSport(+c.dataset.i!); return; }
    if (t.closest("#bk2")) { A.backSound(); lv1(); return; }
    if (t.closest("#explore")) $("#bento")!.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  addEventListener("message", (e) => {
    if (e.data === "home") { A.backSound(); closeSport(); }
  });

  // boleto
  $("#slipb")!.addEventListener("click", () => openSlip());
  const slipv = $("#slipv")!;
  slipv.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "slipv" || t.id === "slipx") { closeSlip(); return; }
    if (t.dataset.st) { AV.tab = t.dataset.st as "b" | "h" | "c"; AV.arm = null; renderSlip(); return; }
    if (t.dataset.rm != null) { AV.slip.splice(+t.dataset.rm, 1); AV.u = null; save("slip"); renderSlip(); pushCfg(); return; }
    if (t.id === "spclr") { AV.slip = []; AV.ovr = ""; AV.u = null; save("slip"); renderSlip(); pushCfg(); return; }
    if (t.dataset.u) { AV.u = +t.dataset.u; renderSlip(); return; }
    if (t.id === "spreg") {
      const b = registerFromSlip();
      if (!b) return;
      AV.bets.unshift(b);
      AV.slip = [];
      AV.ovr = "";
      AV.u = null;
      await saveBet(b);
      save("slip");
      AV.tab = "h";
      renderSlip();
      pushCfg();
      toast("Apuesta registrada");
      return;
    }
    if (t.dataset.set) {
      const b = AV.bets.find((x) => x.id === t.dataset.set);
      if (!b) return;
      b.st = t.dataset.set as Bet["st"];
      AV.arm = null;
      renderSlip();
      pushCfg();
      await saveBet(b);
      return;
    }
    if (t.dataset.del) {
      if (AV.arm !== t.dataset.del) { AV.arm = t.dataset.del; renderSlip(); return; }
      const id = AV.arm;
      AV.bets = AV.bets.filter((x) => x.id !== id);
      AV.arm = null;
      renderSlip();
      pushCfg();
      await delBet(id);
    }
  });
  slipv.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.leg != null) {
      const x = AV.slip[+t.dataset.leg];
      if (!x) return;
      x.d = dec(t.value);
      AV.u = null;
      if (x.d) AV.odds[x.k] = x.d.toFixed(2);
      else delete AV.odds[x.k];
      save("slip");
      save("odds");
      renderSlip();
      pushCfg();
      return;
    }
    if (t.id === "spov") { AV.ovr = t.value.trim(); AV.u = null; renderSlip(); return; }
    if (t.id === "cfst") {
      const v = parseFloat(t.value);
      if (v >= 0) { AV.cfg.start = Math.round(v * 100) / 100; save("cfg"); }
      renderSlip();
      pushCfg();
      return;
    }
    if (t.id === "cfth") { AV.cfg.th = +t.value; save("cfg"); renderSlip(); pushCfg(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#slipv")!.classList.contains("hide")) {
      e.stopImmediatePropagation();
      closeSlip();
    }
  }, true);

  // asistente + mensajes del deporte
  let cur: string | null = null;
  const setCur = (c: string | null) => { cur = c; };
  const origOpenSport = openSport;
  void origOpenSport;
  initAssistant(() => cur);
  onSportMessage(() => { /* redraw tras mensajes */ });
  // capturar CUR del iframe (query al abrir)
  const origOpen = openSport;
  void origOpen;
  const _openSport = openSport;
  openSport = (i: number) => { void _openSport(i); };
  // interceptar para CUR
  const realOpen = function (i: number) {
    const s = SP[i];
    if (!s) return;
    setCur(s.pg);
    origOpenSport(i);
  };
  // rebind del listener de clicks a realOpen: más simple, mutar SP lookup no aplica;
  // usamos un wrapper global para las páginas: window.__azOpen
  (window as unknown as { __azCur: { get(): string | null } }).__azCur = { get: () => cur };
  void realOpen;

  renderSlip();
  lsLoad();
}

// abrir deportes con CUR para el asistente
const originalOpenSport = openSport;
openSport = function (i: number): void {
  const s = SP[i];
  if (s) (window as unknown as { __azCurSet?: (c: string | null) => void }).__azCurSet?.(s.pg);
  originalOpenSport(i);
};
(window as unknown as { __azCurSet: (c: string | null) => void }).__azCurSet = (c) => {
  // el asistente lee por closure; reexportamos
  void c;
};

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
export { openSport, closeSport };
