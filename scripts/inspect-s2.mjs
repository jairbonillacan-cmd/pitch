import fs from 'node:fs';

const html = fs.readFileSync('Reportes/analisis-touchiq/index.html', 'utf8');

const s2Idx = html.indexOf('id="s2"');
console.log('s2 index:', s2Idx);
if (s2Idx !== -1) {
  console.log(html.slice(s2Idx - 100, s2Idx + 1200));
}

// Let's also search where openSport is called or what else is in s2
const s1Idx = html.indexOf('id="s1"');
console.log('s1 index:', s1Idx);
if (s1Idx !== -1) {
  console.log(html.slice(s1Idx - 50, s1Idx + 500));
}
