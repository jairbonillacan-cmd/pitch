import fs from "fs";

async function run() {
  const url = "https://api.linemate.io/api/nfl/v1/trends/straights?limit=5&preferredProviders=&lineTypes=MAIN&outcomes=OVER,YES,COVER&signals=RECENT_FORM&trendTypes=PLAYER&sortBySignals=RECENT_FORM";
  const res = await fetch(url);
  const data = await res.json();
  console.log("Trends straights items count:", data.length);
  fs.writeFileSync("research/linemate/evidence/network-schemas/trends_straights_sample.json", JSON.stringify(data, null, 2));

  if (data.length > 0) {
    const item = data[0];
    console.log("Trend item keys:", Object.keys(item));
    console.log("Subject:", item.subject);
    console.log("Market:", item.market);
    console.log("Odds info:", item.odds, item.bookId);
    console.log("Insights / Signals:", item.insights || item.signals);
  }
}

run().catch(console.error);
