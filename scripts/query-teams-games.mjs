import fs from "fs";

async function run() {
  const teamsRes = await fetch("https://api.linemate.io/api/nfl/v3/teams");
  const teams = await teamsRes.json();
  console.log("Teams count:", teams.length);
  fs.mkdirSync("research/linemate/evidence/network-schemas", { recursive: true });
  fs.writeFileSync("research/linemate/evidence/network-schemas/teams_sample.json", JSON.stringify(teams.slice(0, 3), null, 2));

  const upcomingRes = await fetch("https://api.linemate.io/api/nfl/v3/games/upcoming?recordType=REGULAR&format=daily");
  const upcoming = await upcomingRes.json();
  console.log("Upcoming games count:", upcoming.length);
  fs.writeFileSync("research/linemate/evidence/network-schemas/upcoming_sample.json", JSON.stringify(upcoming.slice(0, 2), null, 2));

  // Let's get one game ID and check its game summary!
  if (upcoming.length > 0) {
    const gameId = upcoming[0].gameId || upcoming[0].id || upcoming[0].game?.gameId;
    console.log("First upcoming game ID:", gameId, Object.keys(upcoming[0]));
  }
}

run().catch(console.error);
