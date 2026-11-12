// Genera los PNG del logo para los correos (los clientes de correo no muestran SVG).
// Uso: pnpm --filter @pitchlab/emails logos
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "public", "brand");
const out = join(root, "email");
await mkdir(out, { recursive: true });

// Tema oscuro: violeta + texto claro sobre el fondo oscuro del correo. Ancho 2x del que se muestra (160 px).
const svg = await readFile(join(root, "logos", "r1", "pitchlab-horizontal-dark.svg"));
await sharp(svg, { density: 384 })
  .resize({ width: 320 })
  .png({ compressionLevel: 9 })
  .toFile(join(out, "pitchlab-horizontal.png"));
console.log("OK: apps/web/public/brand/email/pitchlab-horizontal.png");
