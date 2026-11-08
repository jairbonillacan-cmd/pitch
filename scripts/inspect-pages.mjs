import fs from 'node:fs';

const s0 = fs.readFileSync('Reportes/analisis-touchiq/js-tree/script_0.js', 'utf8');

// Inspect PAGES['m'] or where 'm' came from
const pStart = s0.indexOf('const PAGES=');
const nflIdx = s0.indexOf("'nfl':", pStart);
const ncaaIdx = s0.indexOf("'ncaa':", pStart);
console.log('nfl start:', nflIdx, 'ncaa start:', ncaaIdx);

// Let's find what follows 'ncaa':
const afterNcaa = s0.indexOf("'ncaa':", pStart);
const ncaaQuoteStart = s0.indexOf("'", afterNcaa + 7);
const ncaaQuoteEnd = s0.indexOf("'", ncaaQuoteStart + 1);
console.log('ncaa string length:', ncaaQuoteEnd - ncaaQuoteStart);
console.log('after ncaa quote:', s0.slice(ncaaQuoteEnd, ncaaQuoteEnd + 200));

// Check futbol matches
const regex = /f[uú]tbol|soccer|champions|liga mx|premier/gi;
let m;
while ((m = regex.exec(s0)) !== null) {
  console.log('Futbol match at', m.index, ':', s0.slice(Math.max(0, m.index - 50), Math.min(s0.length, m.index + 50)));
}
