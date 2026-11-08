import fs from "fs";

async function run() {
  const playerId = "b633d550-9ff2-4ae1-9528-4a65680e248d";
  console.log("Fetching player games for Breece Hall...");
  const gamesRes = await fetch(`https://api.linemate.io/api/nfl/v4/players/${playerId}/games`);
  console.log("Games status:", gamesRes.status);
  if (gamesRes.status === 200) {
    const games = await gamesRes.json();
    console.log("Player games count:", games.length);
    fs.writeFileSync("research/linemate/evidence/network-schemas/player_games_breece_hall.json", JSON.stringify(games.slice(0, 3), null, 2));
    if (games.length > 0) {
      console.log("Sample game keys:", Object.keys(games[0]));
      console.log("CumulativeStats keys:", Object.keys(games[0].cumulativeStats || {}));
      console.log("Sample cumulativeStats:", games[0].cumulativeStats);
    }
  } else {
    console.log("Games error response:", await gamesRes.text());
  }

  console.log("Fetching player record...");
  const recordRes = await fetch(`https://api.linemate.io/api/nfl/v4/players/${playerId}/record`);
  console.log("Record status:", recordRes.status);
  if (recordRes.status === 200) {
    const record = await recordRes.json();
    fs.writeFileSync("research/linemate/evidence/network-schemas/player_record_breece_hall.json", JSON.stringify(record, null, 2));
    console.log("Record summary keys:", Object.keys(record));
  } else {
    console.log("Record error response:", await recordRes.text());
  }
}

run().catch(console.error);
