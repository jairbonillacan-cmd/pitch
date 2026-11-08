// AztecaVet — fase UI: extrae del bundle público el CSS, el DOM estático y los
// assets embebidos (robots webp, imagen del overlay de análisis) para el rebuild.
// El CSS/DOM se conservan verbatim para fidelidad visual; los assets se llevan a
// archivos porque en el original viajan embebidos en base64.
// Categoría: OBSERVADO (assets y estilos del propio sitio; autorización del dueño).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = decodeURIComponent(new URL("../Reportes/analisis-aztecavet/", import.meta.url).pathname);
const SRC = decodeURIComponent(new URL("../src/", import.meta.url).pathname);
const PUB = decodeURIComponent(new URL("../public/", import.meta.url).pathname);
mkdirSync(SRC + "styles", { recursive: true });
mkdirSync(SRC + "shell", { recursive: true });
mkdirSync(SRC + "pages", { recursive: true });
mkdirSync(PUB + "assets", { recursive: true });

const raw = (p) => readFileSync(BASE + p, "utf8");
const shellHtml = raw("raw/index.html");
const fb = raw("scripts/pages/fb.html");
const nhl = raw("scripts/pages/nhl.html");
const mlb = raw("scripts/pages/mlb.html");

const stylesOf = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
const bodyOf = (html) => {
  const i = html.indexOf("<body");
  const j = html.indexOf("</body>");
  let body = html.slice(html.indexOf(">", i) + 1, j);
  // sin scripts: el comportamiento vive en el rebuild
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "<!-- script portado a TS -->");
  return body;
};

// 1) CSS verbatim
writeFileSync(SRC + "styles/aztecavet-shell.css", stylesOf(shellHtml).join("\n\n/* ---- bloque original ---- */\n\n"));
writeFileSync(SRC + "styles/aztecavet-fb.css", stylesOf(fb).join("\n\n/* ---- bloque original ---- */\n\n"));
writeFileSync(SRC + "styles/aztecavet-nhl.css", stylesOf(nhl).join("\n\n/* ---- bloque original ---- */\n\n"));
writeFileSync(SRC + "styles/aztecavet-mlb.css", stylesOf(mlb).join("\n\n/* ---- bloque original ---- */\n\n"));
console.log("css: shell", stylesOf(shellHtml).length, "bloques · fb", stylesOf(fb).length, "· nhl", stylesOf(nhl).length, "· mlb", stylesOf(mlb).length);

// 2) DOM estático (sin scripts)
const shellDom = bodyOf(shellHtml);
writeFileSync(SRC + "shell/shell-dom.html", shellDom);
for (const [name, html] of [["football", fb], ["nhl", nhl], ["mlb", mlb]]) {
  let dom = bodyOf(html);
  // La página deportiva abre #app visible al montarse (en el original lo hace el bootstrap)
  dom = dom.replace(/(<main id="app" class=")hide(")/i, "$1$2").replace(/<main id="app" class="hide"/i, '<main id="app" class="hide"');
  writeFileSync(SRC + "pages/" + name + "-dom.html", dom);
}
console.log("dom: shell + 3 páginas");

// 3) Assets base64 → archivos
function saveDataUri(html, regex, outName) {
  const m = html.match(regex);
  if (!m) return console.log("  NO MATCH:", outName);
  const b64 = m[1];
  const buf = Buffer.from(b64, "base64");
  writeFileSync(PUB + "assets/" + outName, buf);
  console.log("  assets/" + outName, buf.length, "bytes");
}

// robots del shell: ROB=[{t:"MLB",img:"data:image/webp;base64,..."},{FÚTBOL},{NHL}]
const robImgs = [...shellHtml.matchAll(/img:"data:image\/(webp|png);base64,([A-Za-z0-9+\/=]+)"/g)].map((m) => m[2]);
const robNames = ["robot-mlb.webp", "robot-futbol.webp", "robot-nhl.webp"];
robImgs.forEach((b64, i) => {
  writeFileSync(PUB + "assets/" + (robNames[i] || `robot-${i}.webp`), Buffer.from(b64, "base64"));
});
console.log("robots:", robImgs.length);

// RIMG por página (overlay "ANALIZANDO EN TIEMPO REAL")
saveDataUri(fb, /const RIMG="data:image\/(?:jpeg|webp|png);base64,([A-Za-z0-9+\/=]+)"/, "rimg-football.jpg");
saveDataUri(nhl, /const RIMG="data:image\/(?:jpeg|webp|png);base64,([A-Za-z0-9+\/=]+)"/, "rimg-nhl.jpg");
saveDataUri(mlb, /const RIMG="data:image\/(?:jpeg|webp|png);base64,([A-Za-z0-9+\/=]+)"/, "rimg-mlb.jpg");
// El bg del shell usa robots vía ROB; el favicon no existe (404 observado).
