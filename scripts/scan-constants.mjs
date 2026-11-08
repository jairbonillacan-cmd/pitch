import fs from "fs";

const text = fs.readFileSync("research/linemate/evidence/javascript/extracted_src/linemate-react-common/src/constants.js", "utf8");

// Find exported constants
const exportMatches = text.matchAll(/export const ([A-Z0-9_]+)\s*=/g);
const exportedNames = Array.from(exportMatches).map(m => m[1]);
console.log("Total exported constants in constants.js:", exportedNames.length);
console.log("Sample exported constants:");
console.log(exportedNames.filter(n => n.includes("MARKET") || n.includes("NFL") || n.includes("FOOTBALL") || n.includes("PROVIDER") || n.includes("SPORTSBOOK") || n.includes("TIMEFRAME") || n.includes("SPLIT")));
