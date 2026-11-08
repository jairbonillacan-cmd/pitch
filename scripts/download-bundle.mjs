import fs from "fs";

async function run() {
  console.log("Fetching JS bundle...");
  const res = await fetch("https://linemate.io/static/js/main.1f0201a8.js");
  const text = await res.text();
  console.log("Bundle size bytes:", text.length);
  fs.mkdirSync("research/linemate/evidence/javascript", { recursive: true });
  fs.writeFileSync("research/linemate/evidence/javascript/main.1f0201a8.js", text);

  console.log("Fetching CSS bundle...");
  const cssRes = await fetch("https://linemate.io/static/css/main.f806c574.css");
  const cssText = await cssRes.text();
  fs.writeFileSync("research/linemate/evidence/javascript/main.f806c574.css", cssText);

  // Check if source map exists!
  console.log("Checking source map...");
  const mapRes = await fetch("https://linemate.io/static/js/main.1f0201a8.js.map");
  console.log("Source map status:", mapRes.status);
  if (mapRes.status === 200) {
    const mapText = await mapRes.text();
    fs.writeFileSync("research/linemate/evidence/javascript/main.1f0201a8.js.map", mapText);
    console.log("Source map downloaded! Size:", mapText.length);
  }
}

run().catch(console.error);
