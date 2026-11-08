import fs from "fs";
import path from "path";

const map = JSON.parse(fs.readFileSync("research/linemate/evidence/javascript/main.1f0201a8.js.map", "utf8"));
const outDir = "research/linemate/evidence/javascript/extracted_src";

let appFilesCount = 0;
let totalFilesCount = 0;

for (let i = 0; i < map.sources.length; i++) {
  const srcPath = map.sources[i];
  const content = map.sourcesContent ? map.sourcesContent[i] : null;
  if (!content) continue;

  totalFilesCount++;
  // Filter for app source files
  if (!srcPath.includes("node_modules")) {
    appFilesCount++;
    const cleanPath = srcPath.replace(/^webpack:\/\/\//, "").replace(/^\.\.\//, "").replace(/^\.\//, "");
    const dest = path.join(outDir, cleanPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }
}

console.log(`Extracted ${appFilesCount} application files (out of ${totalFilesCount} total sources with content).`);
