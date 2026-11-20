import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const sharp = require("sharp");
const source = resolve(root, "pitchlab-assets-gemini");
const destination = resolve(root, "apps/web/public/landing");

async function exportRender(input, output) {
  const image = sharp(resolve(source, input));
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + channels - 1] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error(`No visible pixels in ${input}`);
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  await image.extract(crop).webp({ quality: 92, alphaQuality: 100 }).toFile(resolve(destination, output));
  console.log(`${output} ${crop.width} × ${crop.height}`);
}

await mkdir(destination, { recursive: true });
await Promise.all([
  exportRender("pitchlab-iphone-16-pro-render.png", "hero-phones.webp"),
  exportRender("pitchlab-iphone-18-pro-max-render.png", "app-phones.webp"),
  exportRender("pitchlab-soccer-ball-studio-render.png", "cta-ball-cards.webp"),
  sharp(resolve(source, "pitchlab-studio-light-16bit.png"))
    .webp({ nearLossless: true, quality: 75 })
    .toFile(resolve(destination, "hero-light.webp"))
    .then(({ width, height }) => console.log(`hero-light.webp ${width} × ${height}`)),
]);
