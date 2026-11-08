import fs from "fs";

async function testParams() {
  const playerId = "b633d550-9ff2-4ae1-9528-4a65680e248d";
  const tests = [
    { name: "default", query: "" },
    { name: "limit_50", query: "limit=50" },
    { name: "last_5", query: "timeframe=LAST_5" },
    { name: "last_10", query: "timeframe=LAST_10" },
    { name: "last_20", query: "timeframe=LAST_20" },
    { name: "season_current", query: "timeframe=SEASON&limit=500" },
    { name: "range_2024_2026", query: "timeframe=RANGE_2024_2026&limit=500" },
    { name: "split_home", query: "split=HOME&limit=50" },
    { name: "split_away", query: "split=AWAY&limit=50" },
    { name: "with_player", query: "withPlayerIds=some-id" },
    { name: "without_player", query: "withoutPlayerIds=some-id" }
  ];

  for (const t of tests) {
    const res = await fetch(`https://api.linemate.io/api/nfl/v4/players/${playerId}/games?${t.query}`);
    const data = await res.json();
    console.log(`[${t.name}] (${t.query}) -> Status: ${res.status}, games returned: ${Array.isArray(data) ? data.length : 'not array'}`);
  }
}

testParams().catch(console.error);
