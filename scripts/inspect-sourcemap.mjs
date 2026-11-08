import fs from "fs";

const map = JSON.parse(fs.readFileSync("research/linemate/evidence/javascript/main.1f0201a8.js.map", "utf8"));
console.log("Source map version:", map.version);
console.log("Total sources:", map.sources?.length);
console.log("Sample sources (first 25):");
for (let i = 0; i < Math.min(25, map.sources.length); i++) {
  console.log(` - ${map.sources[i]}`);
}
