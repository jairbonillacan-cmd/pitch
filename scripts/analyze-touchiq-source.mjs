import fs from 'node:fs';

const s0 = fs.readFileSync('Reportes/analisis-touchiq/js-tree/script_0.js', 'utf8');

// Find PAGES
const pStart = s0.indexOf('const PAGES=');
if (pStart !== -1) {
  const pSample = s0.slice(pStart, pStart + 100);
  console.log('PAGES def:', pSample);
  
  // let's find where keys are
  const keys = [];
  const regex = /['"](\w+)['"]\s*:\s*['"][A-Za-z0-9+/=]+['"]/g;
  let match;
  while ((match = regex.exec(s0.slice(pStart, pStart + 2000000))) !== null) {
    keys.push(match[1]);
  }
  console.log('PAGES keys found:', keys);
}

// Find SP
const spStart = s0.indexOf('const SP=');
if (spStart !== -1) {
  console.log('SP def:', s0.slice(spStart, spStart + 400));
}

// Search for soccer / futbol in s0
const futbolMatches = [...s0.matchAll(/f[uú]tbol|soccer|champions|liga mx|premier/gi)].map(m => ({ index: m.index, match: m[0] }));
console.log('Futbol matches in script_0:', futbolMatches.length);

// Search for CODE / PIN in s0
const codeIdx = s0.indexOf('CODE=');
if (codeIdx !== -1) {
  console.log('CODE snippet:', s0.slice(codeIdx - 50, codeIdx + 150));
}
