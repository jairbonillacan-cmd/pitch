import fs from "fs";
import path from "path";

const dir = path.resolve("research/aztecavet");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));

files.forEach(f => {
  const filePath = path.join(dir, f);
  let content = fs.readFileSync(filePath, "utf-8");
  if (content.includes("7779")) {
    content = content.replace(/7779/g, "[REDACTED_AUTH_CODE]");
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`Redacted 7779 in ${f}`);
  }
});
