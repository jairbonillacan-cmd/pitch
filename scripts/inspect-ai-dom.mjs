import fs from 'node:fs';

const html = fs.readFileSync('Reportes/analisis-touchiq/index.html', 'utf8');

const s2Idx = html.indexOf('aip');
console.log('aip index in html:', s2Idx);

const matches = [...html.matchAll(/<[^>]+id=["']ai[^"']*["'][^>]*>/gi)].map(m => m[0]);
console.log('AI elements in html:', matches);

// Let's also check script_2.js which contains the AI assistant logic!
const s2js = fs.readFileSync('Reportes/analisis-touchiq/js-tree/script_2.js', 'utf8');
console.log('script_2.js content:');
console.log(s2js);
