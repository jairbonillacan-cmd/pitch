/**
 * Asistente AztecaVet — port del módulo inline_2 del original.
 * Modo "Claude" si el entorno provee window.claude.use("sample") (streaming);
 * si no, MODO LOCAL determinista sobre el texto de la pantalla abierta —
 * nunca inventa datos. Categoría: OBSERVADO (mismo comportamiento; el prompt
 * del proveedor es RECONSTRUIDO porque vive en el entorno de hospedaje).
 */

interface SportPageApi {
  CUR: string | null;
  openSport(i: number): void;
  SP: { n: string; pg: string; c: string }[];
}

const $ = (id: string) => document.getElementById(id);
let busy = false;
let CUR: string | null = null;
export const NM: Record<string, string> = { fb: "Fútbol", nhl: "NHL", mlb: "MLB" };

export function setCur(c: string | null): void { CUR = c; }

const aim = () => $("aim")!;
const aip = () => $("aip")!;

const add = (cls: string, t: string): HTMLElement => {
  const d = document.createElement("div");
  d.className = "am " + cls;
  d.textContent = t;
  aim().appendChild(d);
  aim().scrollTop = aim().scrollHeight;
  return d;
};

const chips = ["Mejor pick de hoy", "Bajas importantes", "¿Cómo decide la IA?", "Resumen de esta pantalla"];

export function initAssistant(getCur: () => string | null): void {
  (window as unknown as { openSport?: unknown }).openSport; // referencia viva del host
  const aic = $("aic")!;
  aic.innerHTML = chips.map((c) => `<button type="button">${c}</button>`).join("");

  const pageDoc = (): Document | null => {
    const f = $("fr") as HTMLIFrameElement | null;
    if (!f || f.classList.contains("hide")) return null;
    try {
      return f.contentDocument && f.contentDocument.body ? f.contentDocument : null;
    } catch { return null; }
  };
  const pageText = (): string => {
    const d = pageDoc();
    if (!d) return "";
    return (d.body.innerText || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim().slice(0, 9000);
  };
  const ctx = (): string => {
    const d = pageDoc();
    if (!d)
      return "El usuario está en el inicio de AZTECA VET. Hay tres deportes: Fútbol (Liga MX, La Liga, Premier League, Champions y Europa League), NHL y MLB (la temporada terminó: campeón MIL). Datos al 6 nov 2026. Para ver picks tiene que abrir un deporte.";
    return `Deporte abierto: ${NM[getCur() || ""] || "deporte"}. Datos al 6 nov 2026. Lo siguiente es el texto que el usuario ve ahora en pantalla (día seleccionado, pick del día, partidos con probabilidades del modelo, bajas):\n${pageText()}`;
  };

  function local(q: string): string {
    const t = q.toLowerCase();
    const d = pageDoc();
    if (!d) return "Abre un deporte (Fútbol, NHL o MLB) y te respondo con los picks y datos de esa pantalla.";
    const pdx = d.getElementById("pdx");
    if (/pick|mejor/.test(t) && pdx && pdx.innerText.trim()) return pdx.innerText.trim().replace(/\n{2,}/g, "\n");
    if (/f[oó]rmula|decide|c[oó]mo (funciona|calcula|piensa)/.test(t)) {
      const n = d.querySelector(".note");
      if (n) return n.textContent?.trim() ?? "";
    }
    const L = pageText().split("\n");
    const w = t.split(/[^a-záéíóúñ0-9]+/).filter((x) => x.length > 3);
    const hit = L.filter((l) => w.some((x) => l.toLowerCase().includes(x))).slice(0, 6);
    return hit.length ? hit.join("\n") : "No encuentro eso en esta pantalla. Prueba con el nombre de un equipo o cambia de día.";
  }

  function open(): void {
    aip().hidden = false;
    if (!aim().children.length)
      add("a", "Hola, soy la IA de AZTECA VET. Abre un deporte y pregúntame por los partidos, el pick del día, las bajas o cómo decide el modelo; te respondo con los datos de la pantalla.");
    setTimeout(() => ($("aiq") as HTMLInputElement)?.focus(), 60);
  }

  $("aib")!.addEventListener("click", () => (aip().hidden ? open() : (aip().hidden = true)));
  $("aix")!.addEventListener("click", () => (aip().hidden = true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !aip().hidden) aip().hidden = true;
  });
  aic.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b) ask(b.textContent || "");
  });
  $("aif")!.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = ($("aiq") as HTMLInputElement).value.trim();
    if (q) { ($("aiq") as HTMLInputElement).value = ""; ask(q); }
  });

  async function ask(q: string): Promise<void> {
    if (busy) return;
    busy = true;
    add("u", q);
    const outEl = add("a th", "Pensando…");
    type SampleFn = (msgs: { role: string; content: string }[], opts: { cache: boolean; onText: (x: { text: string }) => void }) => Promise<{ text?: string }>;
    let sample: SampleFn | null = null;
    try {
      const c = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
      if (c && c.use) sample = (await c.use("sample")) as SampleFn;
    } catch { sample = null; }
    if (sample) {
      try {
        const prompt = `Eres "la IA" de AZTECA VET, una plataforma de estadística de fútbol, NHL y MLB. Responde en español, en máximo 100 palabras, directo y claro, usando SOLO los datos de abajo (probabilidades del modelo). No inventes cuotas, resultados ni jugadores. Si piden algo que no está en los datos, dilo y sugiere abrir el deporte o el día correcto. Es una referencia estadística, no consejo de apuesta.\n\nDATOS:\n${ctx()}\n\nPREGUNTA: ${q}`;
        const r = await sample([{ role: "user", content: prompt }], {
          cache: false,
          onText: ({ text }) => {
            outEl.className = "am a";
            outEl.textContent = text;
            aim().scrollTop = aim().scrollHeight;
          },
        });
        outEl.className = "am a";
        outEl.textContent = (r && r.text) || local(q);
        ($("aisrc") as HTMLElement).textContent = "Respuesta de Claude con los datos de esta pantalla";
        busy = false;
        return;
      } catch { /* cae a local */ }
    }
    outEl.className = "am a";
    outEl.textContent = local(q);
    ($("aisrc") as HTMLElement).textContent = "Modo local: responde con los datos de esta pantalla";
    busy = false;
  }
}

export function setCurForNM(v: string | null): void { setCur(v); }
