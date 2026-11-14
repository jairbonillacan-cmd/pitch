/* Ejemplo para Storybook: cifras de un partido real de otra liga (Bzzoiro), con equipos y
   jugadores sustituidos. No son datos de Querétaro ni de Monterrey. */
import type { LiveIncident, LiveMatchDetail } from "@pitchlab/contracts";

export const STORY_INCIDENTS: LiveIncident[] = [
  {
    "order": 800,
    "kind": "penalty_goal",
    "side": "home",
    "minute": 8,
    "addedTime": null,
    "player": "Jugador 1",
    "secondary": null,
    "score": {
      "home": 1,
      "away": 0
    },
    "note": null
  },
  {
    "order": 1900,
    "kind": "yellow",
    "side": "away",
    "minute": 19,
    "addedTime": null,
    "player": "Jugador 2",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 2100,
    "kind": "var",
    "side": "away",
    "minute": 21,
    "addedTime": null,
    "player": "Jugador 3",
    "secondary": null,
    "score": null,
    "note": "VAR: penal concedido"
  },
  {
    "order": 3500,
    "kind": "yellow",
    "side": "home",
    "minute": 35,
    "addedTime": null,
    "player": "Jugador 1",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 4507,
    "kind": "yellow",
    "side": "away",
    "minute": 45,
    "addedTime": 7,
    "player": "Jugador 4",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 4599,
    "kind": "period",
    "side": null,
    "minute": 45,
    "addedTime": null,
    "player": null,
    "secondary": null,
    "score": null,
    "note": "Medio tiempo"
  },
  {
    "order": 4600,
    "kind": "sub",
    "side": "away",
    "minute": 46,
    "addedTime": null,
    "player": "Jugador 5",
    "secondary": "Jugador 6",
    "score": null,
    "note": null
  },
  {
    "order": 4600,
    "kind": "sub",
    "side": "away",
    "minute": 46,
    "addedTime": null,
    "player": "Jugador 7",
    "secondary": "Jugador 8",
    "score": null,
    "note": null
  },
  {
    "order": 4600,
    "kind": "sub",
    "side": "home",
    "minute": 46,
    "addedTime": null,
    "player": "Jugador 9",
    "secondary": "Jugador 1",
    "score": null,
    "note": null
  },
  {
    "order": 4700,
    "kind": "goal",
    "side": "away",
    "minute": 47,
    "addedTime": null,
    "player": "Jugador 7",
    "secondary": "Jugador 5",
    "score": {
      "home": 1,
      "away": 1
    },
    "note": null
  },
  {
    "order": 5000,
    "kind": "yellow",
    "side": "home",
    "minute": 50,
    "addedTime": null,
    "player": "Jugador 10",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 5400,
    "kind": "yellow",
    "side": "home",
    "minute": 54,
    "addedTime": null,
    "player": "Jugador 11",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 5700,
    "kind": "second_yellow",
    "side": "away",
    "minute": 57,
    "addedTime": null,
    "player": "Jugador 4",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 5700,
    "kind": "var",
    "side": "home",
    "minute": 57,
    "addedTime": null,
    "player": "Jugador 9",
    "secondary": null,
    "score": null,
    "note": "VAR: penal concedido"
  },
  {
    "order": 6200,
    "kind": "goal",
    "side": "away",
    "minute": 62,
    "addedTime": null,
    "player": "Jugador 7",
    "secondary": "Jugador 12",
    "score": {
      "home": 1,
      "away": 2
    },
    "note": null
  },
  {
    "order": 6700,
    "kind": "sub",
    "side": "home",
    "minute": 67,
    "addedTime": null,
    "player": "Jugador 13",
    "secondary": "Jugador 14",
    "score": null,
    "note": null
  },
  {
    "order": 6700,
    "kind": "sub",
    "side": "home",
    "minute": 67,
    "addedTime": null,
    "player": "Jugador 15",
    "secondary": "Jugador 11",
    "score": null,
    "note": null
  },
  {
    "order": 7200,
    "kind": "sub",
    "side": "away",
    "minute": 72,
    "addedTime": null,
    "player": "Jugador 16",
    "secondary": "Jugador 12",
    "score": null,
    "note": null
  },
  {
    "order": 7200,
    "kind": "sub",
    "side": "away",
    "minute": 72,
    "addedTime": null,
    "player": "Jugador 17",
    "secondary": "Jugador 18",
    "score": null,
    "note": null
  },
  {
    "order": 7500,
    "kind": "sub",
    "side": "home",
    "minute": 75,
    "addedTime": null,
    "player": "Jugador 19",
    "secondary": "Jugador 20",
    "score": null,
    "note": null
  },
  {
    "order": 8200,
    "kind": "yellow",
    "side": "home",
    "minute": 82,
    "addedTime": null,
    "player": "Jugador 21",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 8400,
    "kind": "goal",
    "side": "home",
    "minute": 84,
    "addedTime": null,
    "player": "Jugador 9",
    "secondary": "Jugador 22",
    "score": {
      "home": 2,
      "away": 2
    },
    "note": null
  },
  {
    "order": 8500,
    "kind": "sub",
    "side": "home",
    "minute": 85,
    "addedTime": null,
    "player": "Jugador 23",
    "secondary": "Jugador 22",
    "score": null,
    "note": null
  },
  {
    "order": 8500,
    "kind": "yellow",
    "side": "away",
    "minute": 85,
    "addedTime": null,
    "player": "Jugador 7",
    "secondary": null,
    "score": null,
    "note": null
  },
  {
    "order": 8500,
    "kind": "yellow",
    "side": "home",
    "minute": 85,
    "addedTime": null,
    "player": "Jugador 24",
    "secondary": null,
    "score": null,
    "note": null
  }
];

export const STORY_STATS: Pick<LiveMatchDetail, "stats" | "xgEstimated" | "momentum" | "xgTimeline" | "shots"> = {"stats":{"home":{"xg":1.81,"shots":20,"shotsOnTarget":6,"corners":4,"possessionPct":61,"fouls":6,"yellowCards":5,"redCards":0,"offsides":1,"bigChances":1},"away":{"xg":0.35,"shots":8,"shotsOnTarget":3,"corners":3,"possessionPct":39,"fouls":6,"yellowCards":4,"redCards":1,"offsides":0,"bigChances":1}},"xgEstimated":false,"momentum":[{"minute":1,"value":3},{"minute":2,"value":25},{"minute":3,"value":20},{"minute":4,"value":19},{"minute":5,"value":28},{"minute":6,"value":23},{"minute":7,"value":55},{"minute":8,"value":36},{"minute":9,"value":55},{"minute":10,"value":39},{"minute":11,"value":40},{"minute":12,"value":44},{"minute":13,"value":4},{"minute":14,"value":-4},{"minute":15,"value":-21},{"minute":16,"value":-18},{"minute":17,"value":13},{"minute":18,"value":-5},{"minute":19,"value":-2},{"minute":20,"value":-1},{"minute":21,"value":-1},{"minute":22,"value":12},{"minute":23,"value":1},{"minute":24,"value":13},{"minute":25,"value":33},{"minute":26,"value":30},{"minute":27,"value":57},{"minute":28,"value":38},{"minute":29,"value":48},{"minute":30,"value":29},{"minute":31,"value":19},{"minute":32,"value":17},{"minute":33,"value":27},{"minute":34,"value":22},{"minute":35,"value":20},{"minute":36,"value":22},{"minute":37,"value":11},{"minute":38,"value":6},{"minute":39,"value":-70},{"minute":40,"value":-59},{"minute":41,"value":-34},{"minute":42,"value":-20},{"minute":43,"value":-32},{"minute":44,"value":-15},{"minute":45,"value":-9},{"minute":45.5,"value":-3},{"minute":46,"value":-9},{"minute":47,"value":25},{"minute":48,"value":16},{"minute":49,"value":-29},{"minute":50,"value":15},{"minute":51,"value":-3},{"minute":52,"value":11},{"minute":53,"value":13},{"minute":54,"value":14},{"minute":55,"value":10},{"minute":56,"value":6},{"minute":57,"value":6},{"minute":58,"value":3},{"minute":59,"value":2},{"minute":60,"value":16},{"minute":61,"value":26},{"minute":62,"value":19},{"minute":63,"value":-64},{"minute":64,"value":-28},{"minute":65,"value":-14},{"minute":66,"value":21},{"minute":67,"value":11},{"minute":68,"value":15},{"minute":69,"value":15},{"minute":70,"value":12},{"minute":71,"value":46},{"minute":72,"value":27},{"minute":73,"value":43},{"minute":74,"value":29},{"minute":75,"value":19},{"minute":76,"value":68},{"minute":77,"value":50},{"minute":78,"value":47},{"minute":79,"value":44},{"minute":80,"value":31},{"minute":81,"value":51},{"minute":82,"value":32},{"minute":83,"value":58},{"minute":84,"value":33},{"minute":85,"value":23},{"minute":86,"value":56},{"minute":87,"value":34}],"xgTimeline":[{"minute":2,"home":0.038,"away":0},{"minute":6,"home":0.082,"away":0},{"minute":7,"home":0.099,"away":0},{"minute":8,"home":0.887,"away":0},{"minute":12,"home":0.898,"away":0},{"minute":14,"home":0.898,"away":0.013},{"minute":16,"home":0.929,"away":0.013},{"minute":25,"home":0.986,"away":0.013},{"minute":27,"home":1.012,"away":0.013},{"minute":33,"home":1.038,"away":0.013},{"minute":34,"home":1.038,"away":0.032},{"minute":37,"home":1.038,"away":0.045},{"minute":38,"home":1.038,"away":0.064},{"minute":39,"home":1.038,"away":0.083},{"minute":41,"home":1.191,"away":0.105},{"minute":45,"home":1.201,"away":0.105},{"minute":47,"home":1.213,"away":0.219},{"minute":60,"home":1.383,"away":0.219},{"minute":62,"home":1.383,"away":0.348},{"minute":71,"home":1.405,"away":0.348},{"minute":73,"home":1.418,"away":0.348},{"minute":75,"home":1.548,"away":0.348},{"minute":81,"home":1.56,"away":0.348},{"minute":82,"home":1.637,"away":0.348},{"minute":84,"home":1.815,"away":0.348}],"shots":[]};
