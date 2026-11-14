// Vista previa local: genera una galería HTML con los 15 correos en packages/emails/.preview/
// Uso: pnpm --filter @pitchlab/emails preview   (luego abre .preview/index.html)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EMAIL_TEMPLATES, renderEmail, type EmailTemplateId } from "../src/registry";

// En local el logo vive en el servidor de desarrollo.
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
// El logo se incrusta en la vista previa, para que se vea sin servidor y en cualquier visor.
const logoPng = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "public", "brand", "email", "pitchlab-horizontal.png"),
);
process.env.EMAIL_LOGO_URL ??= `data:image/png;base64,${logoPng.toString("base64")}`;

const out = join(dirname(fileURLToPath(import.meta.url)), "..", ".preview");
await mkdir(out, { recursive: true });

const ids = Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[];
const rows: string[] = [];
for (const id of ids) {
  const def = EMAIL_TEMPLATES[id];
  const { subject, html } = await renderEmail(id, def.sample as never);
  await writeFile(join(out, `${id}.html`), html, "utf8");
  rows.push(`<li><a href="${id}.html">${def.phase} · ${def.label}</a> <small>${subject}</small></li>`);
}
await writeFile(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Correos PitchLab</title><body style="font:15px/1.8 system-ui;padding:24px"><h1>Correos de PitchLab</h1><ul>${rows.join("")}</ul>`,
  "utf8",
);
console.log(`OK: ${ids.length} correos en ${out}`);
