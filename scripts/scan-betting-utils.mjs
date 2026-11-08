import fs from "fs";

const text = fs.readFileSync("research/linemate/evidence/javascript/extracted_src/linemate-react-common/src/betting-utils.js", "utf8");

const exportMatches = text.matchAll(/export (const|function) ([a-zA-Z0-9_]+)/g);
for (const m of exportMatches) {
  console.log(` - ${m[1]} ${m[2]}`);
}
