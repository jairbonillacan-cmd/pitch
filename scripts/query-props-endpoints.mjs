import fs from "fs";

async function run() {
  const hitRatesUrl = "https://api.linemate.io/api/nfl/v3/markets/hitRates?limit=5&preferredProviders=&levelsToInclude=player&timeframe=SEASON";
  console.log("Fetching markets/hitRates...");
  const hitRatesRes = await fetch(hitRatesUrl);
  const hitRates = await hitRatesRes.json();
  console.log("hitRates items count:", hitRates.length);
  fs.writeFileSync("research/linemate/evidence/network-schemas/markets_hitRates_sample.json", JSON.stringify(hitRates, null, 2));

  const injuriesUrl = "https://api.linemate.io/api/nfl/v3/teams/IND/injuries";
  console.log("Fetching team injuries...");
  const injuriesRes = await fetch(injuriesUrl);
  const injuries = await injuriesRes.json();
  console.log("injuries count:", injuries.length);
  fs.writeFileSync("research/linemate/evidence/network-schemas/team_injuries_sample.json", JSON.stringify(injuries, null, 2));

  const playerMarketsUrl = "https://api.linemate.io/api/nfl/v4/players/40733896-17bf-49e1-a49f-a7510aa557c9/markets";
  console.log("Fetching player markets...");
  const playerMarketsRes = await fetch(playerMarketsUrl);
  const playerMarkets = await playerMarketsRes.json();
  console.log("playerMarkets keys:", Object.keys(playerMarkets));
  fs.writeFileSync("research/linemate/evidence/network-schemas/player_markets_sample.json", JSON.stringify(playerMarkets, null, 2));
}

run().catch(console.error);
