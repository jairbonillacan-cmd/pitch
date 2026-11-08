/**
 * Estado del shell AztecaVet (AV) — port del módulo de boleto/bankroll con
 * persistencia localStorage y hook opcional window.claude (db/user).
 * Mejora documentada (RECONSTRUIDO): el gate se valida server-side (docs/01).
 * Categoría del comportamiento: OBSERVADO (mismo esquema azteca_av).
 */
import { curBank, registerBet, slipSummary, STORAGE_KEY, unitOf, evOf, dec, money, pct,
  type AvPersisted, type BankConfig, type Bet, type SlipPick } from "../domain/aztecavet/index.js";

export interface AvState {
  cfg: BankConfig;
  odds: Record<string, string>;
  slip: SlipPick[];
  bets: Bet[];
  ovr: string;
  u: number | null;
  tab: "b" | "h" | "c";
  db: CloudDb | null;
  base: string | null;
  ready: boolean;
  arm: string | null;
}

/** Puente opcional del entorno de hospedaje (estilo Firestore, window.claude). */
export interface CloudDb {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): unknown }>;
    set(body: unknown): Promise<void>;
  };
  doc(path: string): CloudDocRef;
}
interface CloudDocRef {
  get(): Promise<{ exists: boolean; data(): unknown }>;
  set(body: unknown): Promise<void>;
  delete(): Promise<void>;
  collection(name: string): {
    doc(id: string): { set(body: unknown): Promise<void>; delete(): Promise<void> };
    orderBy(field: string, dir: string): { limit(n: number): { get(): Promise<{ docs: { id: string; data(): unknown }[] }> } };
  };
}

export const AV: AvState = {
  cfg: { start: 1000, th: 0.6 },
  odds: {},
  slip: [],
  bets: [],
  ovr: "",
  u: null,
  tab: "b",
  db: null,
  base: null,
  ready: false,
  arm: null,
};

export { curBank, money, pct, evOf, dec, unitOf };

export const profitOf = (b: Bet): number => (b.st === "w" ? b.stake * (b.d - 1) : b.st === "l" ? -b.stake : 0);
export const summary = () => slipSummary(AV.slip, AV.ovr, AV.cfg.th);
export const registerFromSlip = (): Bet | null => registerBet(AV.slip, AV.ovr, AV.u, curBank(AV.bets, AV.cfg), Date.now());

// ---------- persistencia ----------
export function lsSave(): void {
  try {
    const data: AvPersisted = { cfg: AV.cfg, odds: AV.odds, slip: AV.slip, bets: AV.bets };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* modo privado */ }
}

export function lsLoad(): void {
  try {
    const j = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as AvPersisted | null;
    if (j) {
      Object.assign(AV.cfg, j.cfg || {});
      AV.odds = j.odds || {};
      AV.slip = j.slip || [];
      AV.bets = j.bets || [];
    }
  } catch { /* corrupto: estado por defecto */ }
}

const QT: Record<string, ReturnType<typeof setTimeout>> = {};
const BUSY: Record<string, number> = {};
const AGAIN: Record<string, number> = {};

export function save(n: string): void {
  if (!AV.ready) return;
  clearTimeout(QT[n]);
  QT[n] = setTimeout(() => void flush(n), 500);
}

export async function flush(n: string): Promise<void> {
  if (BUSY[n]) { AGAIN[n] = 1; return; }
  BUSY[n] = 1;
  try {
    if (AV.db) {
      const body = n === "cfg" ? { v: AV.cfg } : n === "odds" ? { m: AV.odds } : { items: AV.slip };
      await AV.db.doc(`${AV.base}/${n}`).set(body);
    } else lsSave();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid_argument" || code === "revoked" || code === "not_granted") {
      AV.db = null;
      lsSave();
      renderSlip();
    }
  }
  BUSY[n] = 0;
  if (AGAIN[n]) { AGAIN[n] = 0; void flush(n); }
}

function betRef(id: string) {
  return AV.db!.doc(`${AV.base}/cfg`).collection("bets").doc(id);
}

export async function saveBet(b: Bet): Promise<void> {
  if (!AV.db) { lsSave(); return; }
  const o: Bet = { ...b };
  try {
    await betRef(b.id).set(o);
  } catch {
    AV.db = null;
    lsSave();
    toast("No se pudo guardar en tu cuenta; quedó en este navegador");
  }
}

export async function delBet(id: string): Promise<void> {
  if (!AV.db) { lsSave(); return; }
  try { await betRef(id).delete(); } catch { /* local queda */ }
}

/** Inicialización: nube si hay puente window.claude, si no localStorage. */
export async function avInit(): Promise<void> {
  try {
    const c = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
    if (c && c.use) {
      const [db, user] = (await Promise.all([c.use("db"), c.use("user")])) as [CloudDb, { id(): Promise<string> }] | [null, null];
      if (db && user) {
        const id = await user.id();
        if (id) { AV.db = db; AV.base = "data/users/" + id; }
      }
    }
  } catch { AV.db = null; }
  if (AV.db) {
    try {
      const [c, o, s] = await Promise.all(["cfg", "odds", "slip"].map((n) => AV.db!.doc(`${AV.base}/${n}`).get()));
      if (c.exists) {
        const v = ((c.data() as { v?: BankConfig })?.v) || {};
        if (v.start != null) AV.cfg.start = v.start;
        if (v.th) AV.cfg.th = v.th;
      }
      if (o.exists) AV.odds = Object.assign({}, (o.data() as { m?: Record<string, string> })?.m || {});
      if (s.exists) AV.slip = (((s.data() as { items?: SlipPick[] })?.items) || []).slice();
      const bs = await AV.db.doc(`${AV.base}/cfg`).collection("bets").orderBy("ts", "desc").limit(1000).get();
      AV.bets = bs.docs.map((d) => Object.assign({}, d.data() as Bet, { id: d.id }));
    } catch { AV.db = null; lsLoad(); }
  } else lsLoad();
  AV.ready = true;
  pushCfg();
  renderSlip();
}

// ---------- mensajería con la página deportiva (iframe) ----------
export function pushCfg(): void {
  const f = document.getElementById("fr") as HTMLIFrameElement | null;
  if (!f || !f.contentWindow || f.classList.contains("hide")) return;
  try {
    f.contentWindow.postMessage({ av: "cfg", bank: curBank(AV.bets, AV.cfg), th: AV.cfg.th, odds: AV.odds, inSlip: AV.slip.map((x) => x.k) }, "*");
  } catch { /* iframe cerrado */ }
}

export function onSportMessage(cb: () => void): void {
  addEventListener("message", (e) => {
    const m = e.data as { av?: string; k?: string; v?: string; pk?: SlipPick } | string;
    if (!m || typeof m !== "object" || !(m as { av?: string }).av) return;
    if (m.av === "ready") pushCfg();
    else if (m.av === "odd" && typeof m.k === "string") {
      if (m.v) AV.odds[m.k] = String(m.v).slice(0, 12);
      else delete AV.odds[m.k];
      const ks = Object.keys(AV.odds);
      if (ks.length > 800) ks.slice(0, ks.length - 800).forEach((k) => delete AV.odds[k]);
      save("odds");
      const L = AV.slip.find((x) => x.k === m.k);
      if (L) { L.d = dec(m.v); save("slip"); renderSlip(); }
    } else if (m.av === "add" && m.pk && typeof m.pk.k === "string") {
      const i = AV.slip.findIndex((x) => x.k === m.pk!.k);
      if (i >= 0) AV.slip.splice(i, 1);
      else AV.slip.push(m.pk);
      AV.u = null;
      save("slip");
      renderSlip();
      const b = document.getElementById("slipb");
      if (b) { b.classList.remove("bump"); void (b as HTMLElement).offsetWidth; b.classList.add("bump"); }
    }
    cb();
  });
}

export function toast(t: string): void {
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = t;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2200);
}

/** Render del boleto — se inyecta desde main.ts para mantener el módulo libre de DOM. */
export let renderSlip: () => void = () => {};
export function setRenderSlip(fn: () => void): void { renderSlip = fn; }
