import fs from "fs";

async function run() {
  const sgpUrl = "https://api.linemate.io/api/nfl/v1/trends/parlays?limit=5&parlayType=SAME_GAME";
  console.log("Fetching SGP parlays...");
  const sgpRes = await fetch(sgpUrl);
  const sgpData = await sgpRes.json();
  console.log("SGP items:", sgpData.length);
  fs.writeFileSync("research/linemate/evidence/network-schemas/parlays_sgp_sample.json", JSON.stringify(sgpData, null, 2));
  if (sgpData.length > 0) {
    console.log("SGP keys:", Object.keys(sgpData[0]));
    console.log("SGP legs:", sgpData[0].legs);
    console.log("SGP signals/insights:", sgpData[0].signals || sgpData[0].insights);
  }

  const cgpUrl = "https://api.linemate.io/api/nfl/v1/trends/parlays?limit=5&parlayType=CROSS_GAME";
  console.log("Fetching Cross-game parlays...");
  const cgpRes = await fetch(cgpUrl);
  const cgpData = await cgpRes.json();
  console.log("CGP items:", cgpData.length);
  fs.writeFileSync("research/linemate/evidence/network-schemas/parlays_cgp_sample.json", JSON.stringify(cgpData, null, 2));
  if (cgpData.length > 0) {
    console.log("CGP keys:", Object.keys(cgpData[0]));
    console.log("CGP legs:", cgpData[0].legs);
  }
}

run().catch(console.error);
