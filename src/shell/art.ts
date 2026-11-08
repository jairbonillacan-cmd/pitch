/**
 * Arte del shell AztecaVet — port del original: Piedra del Sol (sunSVG),
 * pirámide escalonada, balón 3D "ray-traced" por píxel (icosaedro con
 * pentágonos/hexágonos, luz + rim + costuras) y el canvas de partículas/warp
 * de la intro. Categoría: OBSERVADO (parámetros idénticos).
 */

export const GOLD = "#c9952b";
export const TQ = "#13995a";

export const hex = (h: string): string => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
};

export function sunSVG(mini: boolean): string {
  const C = 300;
  const P = (r: number, a: number) => [C + r * Math.cos((a * Math.PI) / 180), C + r * Math.sin((a * Math.PI) / 180)];
  const f = (n: number) => n.toFixed(1);
  const u = mini ? "m" : "b";
  let rays = "";
  {
    const N = 16;
    for (let k = 0; k < N; k++) {
      const a = (k * 360) / N - 90;
      const w = ((360 / N) / 2) * 0.6;
      const tip = k % 2 ? 256 : 272;
      const base = 234;
      const p1 = P(base, a - w);
      const p2 = P(tip, a);
      const p3 = P(base, a + w);
      rays += `<polygon points="${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])} ${f(p3[0])},${f(p3[1])}" fill="rgba(245,194,107,.07)"/>`;
    }
  }
  const defs = `<defs><radialGradient id="sg${u}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="rgba(245,194,107,.5)"/><stop offset=".6" stop-color="rgba(94,231,255,.18)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>`;
  if (mini)
    return `<svg viewBox="0 0 600 600">${defs}<circle cx="300" cy="300" r="292" fill="url(#sg${u})"/><circle cx="300" cy="300" r="150" fill="rgba(255,255,255,.75)"/><g fill="none" stroke="${GOLD}" stroke-opacity=".6">${rays}</g><circle cx="300" cy="300" r="100" fill="none" stroke="${GOLD}" stroke-opacity=".55" stroke-dasharray="3 7"/></svg>`;
  let ticks = "";
  for (let k = 0; k < 104; k++) {
    const a = (k * 360) / 104;
    const l = k % 4 ? 7 : 15;
    const p = P(291, a);
    const q = P(291 - l, a);
    ticks += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`;
  }
  const R1 = 190, R2 = 228;
  const gl = [
    `<circle r="7"/><path d="M-7 0a7 7 0 0 1 14 0a3.5 3.5 0 0 1 -7 0"/>`,
    `<path d="M-10 9h6v-6h6v-6h6v-6"/>`,
    `<ellipse rx="10" ry="6"/><circle r="2.6" fill="${GOLD}"/>`,
    `<path d="M0-9V9M-9 0H9"/><circle cx="-6" cy="-6" r="1.6"/><circle cx="6" cy="-6" r="1.6"/><circle cx="-6" cy="6" r="1.6"/><circle cx="6" cy="6" r="1.6"/>`,
    `<polyline points="-10,4 -5,-4 0,4 5,-4 10,4"/>`,
  ];
  let cells = "", glyphs = "";
  for (let k = 0; k < 20; k++) {
    const a0 = k * 18 - 99, a1 = a0 + 18, aC = k * 18 - 90;
    const p1 = P(R1, a0), p2 = P(R2, a0), p3 = P(R2, a1), p4 = P(R1, a1), gp = P((R1 + R2) / 2, aC);
    cells += `<path class="cell" style="--cd:${((k * 0.31) % 5).toFixed(2)}s" fill="${GOLD}" fill-opacity="0" d="M${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}A${R2} ${R2} 0 0 1 ${f(p3[0])} ${f(p3[1])}L${f(p4[0])} ${f(p4[1])}A${R1} ${R1} 0 0 0 ${f(p1[0])} ${f(p1[1])}Z"/>`;
    glyphs += `<g transform="translate(${f(gp[0])} ${f(gp[1])}) rotate(${aC + 90})">${gl[k % 5]}</g>`;
  }
  let fret = "";
  for (let k = 0; k < 24; k++) {
    const a = k * 15 - 90;
    const p = P(172, a);
    fret += `<path transform="translate(${f(p[0])} ${f(p[1])}) rotate(${a + 90})" d="M-8 6H4V-6H-4V0H0"/>`;
  }
  let cart = "";
  [45, 135, 225, 315].forEach((a) => {
    const p = P(138, a - 90);
    cart += `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${a})"><rect x="-17" y="-17" width="34" height="34" rx="5"/><rect x="-8" y="-8" width="16" height="16"/><circle r="2.4" fill="${TQ}"/></g>`;
  });
  return `<svg viewBox="0 0 600 600">${defs}<circle cx="300" cy="300" r="296" fill="url(#sg${u})"/><circle cx="300" cy="300" r="297" fill="none" stroke="${GOLD}" stroke-opacity=".5"/><g stroke="${GOLD}" stroke-opacity=".45" stroke-width="1.1">${ticks}</g><g fill="none" stroke="${GOLD}">${fret}</g><g fill="none" stroke="${GOLD}" stroke-opacity=".8">${cart}</g><circle cx="300" cy="300" r="160" fill="rgba(255,255,255,.82)" stroke="${GOLD}" stroke-width="2"/><g fill="none" stroke="${TQ}" stroke-opacity=".8">${cells}</g><g fill="${GOLD}" fill-opacity=".85">${glyphs}</g></svg>`;
}

export function pyramidSVG(): string {
  const L: [number, number][] = [];
  let y = 300;
  for (let i = 0; i < 5; i++) {
    const x = 150 + 55 * i;
    L.push([x, y], [x, y - 40]);
    y -= 40;
  }
  const top = y;
  L.push([425, top]);
  const pts = L.map((p) => p.join(",")).join(" ");
  const mir = L.slice().reverse().map((p) => [1000 - p[0], p[1]].join(","));
  const temple = `M440,${top} V${top - 38} H560 V${top}`;
  let st = "";
  for (let i = 0; i < 5; i++) {
    const yy = 300 - 40 * (i + 1);
    st += `<line x1="${150 + 55 * (i + 1)}" y1="${yy}" x2="${850 - 55 * (i + 1)}" y2="${yy}"/>`;
  }
  let stairs = "";
  for (let k = -3; k <= 3; k++) stairs += `<line x1="${500 + k * 14}" y1="300" x2="${500 + k * 5}" y2="${top}"/>`;
  return `<svg viewBox="0 0 1000 320"><defs><linearGradient id="pgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2ef"/></linearGradient></defs><polygon points="150,300 ${pts} ${mir.join(" ")} 850,300" fill="url(#pgr)" stroke="${GOLD}" stroke-opacity=".7" stroke-width="1.6"/><path d="${temple}" fill="#ffffff" stroke="${GOLD}" stroke-opacity=".7" stroke-width="1.6"/><g stroke="${GOLD}" stroke-opacity=".35" stroke-width="1.2">${st}</g><g stroke="${TQ}" stroke-opacity=".5" stroke-width="1.2">${stairs}</g></svg>`;
}

// ---------- balón 3D (icosaedro) ----------
const PHI = (1 + Math.sqrt(5)) / 2;
const nz = (v: number[]) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const V: number[][] = [
  [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1],
].map(nz);
const F: number[][] = (() => {
  let emin = 9;
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++) {
      const d = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]);
      if (d < emin) emin = d;
    }
  const adj = (a: number, b: number) => Math.abs(Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1], V[a][2] - V[b][2]) - emin) < 1e-3;
  const Fv: number[][] = [];
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      if (adj(i, j))
        for (let k = j + 1; k < 12; k++)
          if (adj(i, k) && adj(j, k)) Fv.push(nz([V[i][0] + V[j][0] + V[k][0], V[i][1] + V[j][1] + V[k][1], V[i][2] + V[j][2] + V[k][2]]));
  return Fv;
})();
const AP = (16.5 * Math.PI) / 180;
const AH = (20.9 * Math.PI) / 180;
const Ld = nz([-0.5, 0.6, 0.65]);
const Hd = nz([Ld[0], Ld[1], Ld[2] + 1]);

function rot(ay: number, ax: number, az: number): number[][] {
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az);
  const my = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const mx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const mz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  const mm = (a: number[][], b: number[][]) => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
  return mm(mm(mz, mx), my);
}
const ap = (M: number[][], v: number[]) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];

interface Ball { cx: CanvasRenderingContext2D; S: number; img: ImageData; px: [number, number, number, number, number][]; vis: () => boolean; spin: number; t0: number; }
const BALLS: Ball[] = [];
const PTR = { x: 0, y: 0 };
addEventListener("pointermove", (e) => {
  PTR.x = e.clientX / innerWidth - 0.5;
  PTR.y = e.clientY / innerHeight - 0.5;
});

export function startBall(cv: HTMLCanvasElement, S: number, vis: () => boolean, spin = 1): void {
  const cx = cv.getContext("2d")!;
  cv.width = cv.height = S;
  const img = cx.createImageData(S, S);
  const px: [number, number, number, number, number][] = [];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const nx = (x + 0.5) / S * 2 - 1;
      const ny = 1 - (y + 0.5) / S * 2;
      const r2 = nx * nx + ny * ny;
      if (r2 <= 1) px.push([y * S + x, nx, ny, Math.sqrt(1 - r2), Math.sqrt(r2)]);
    }
  BALLS.push({ cx, S, img, px, vis, spin, t0: performance.now() });
}

export function ballFrame(now: number): boolean {
  let any = false;
  BALLS.forEach((B) => {
    if (!B.vis()) return;
    any = true;
    const t = (now - B.t0) * B.spin;
    const M = rot(t * 0.00042 + PTR.x * 0.9, 0.55 + 0.18 * Math.sin(t * 0.0003) + PTR.y * 0.5, 0.25);
    const Vr = V.map((v) => ap(M, v));
    const Fr = F.map((v) => ap(M, v));
    const d = B.img.data;
    for (const p of B.px) {
      const i = p[0] * 4;
      const nx = p[1], ny = p[2], nz2 = p[3], rr = p[4];
      let dp = -2, dh = -2;
      for (let k = 0; k < 12; k++) {
        const c = Vr[k];
        const q = c[0] * nx + c[1] * ny + c[2] * nz2;
        if (q > dp) dp = q;
      }
      for (let k = 0; k < 20; k++) {
        const c = Fr[k];
        const q = c[0] * nx + c[1] * ny + c[2] * nz2;
        if (q > dh) dh = q;
      }
      const sP = Math.acos(Math.min(1, dp)) / AP;
      const sH = Math.acos(Math.min(1, dh)) / AH;
      const pent = sP < sH;
      const s = Math.min(sP, sH);
      const b = Math.abs(sP - sH);
      let r: number, g: number, bl: number;
      if (pent) { r = 20; g = 22; bl = 28; }
      else { r = 247; g = 248; bl = 252; }
      const bulge = 1 - 0.2 * Math.pow(Math.min(s, 1.2), 2.4);
      const dif = Math.max(0, nx * Ld[0] + ny * Ld[1] + nz2 * Ld[2]) * 0.78 + 0.3;
      let sh = dif * bulge;
      const seam = b < 0.045 ? 1 - b / 0.045 : 0;
      sh *= 1 - seam * 0.5;
      const spec = Math.pow(Math.max(0, nx * Hd[0] + ny * Hd[1] + nz2 * Hd[2]), pent ? 60 : 34) * (pent ? 0.85 : 0.5);
      const rim = Math.pow(1 - nz2, 2.6);
      d[i] = Math.min(255, r * sh + spec * 255 + rim * 30);
      d[i + 1] = Math.min(255, g * sh + spec * 255 + rim * 90);
      d[i + 2] = Math.min(255, bl * sh + spec * 255 + rim * 190);
      d[i + 3] = rr > 0.985 ? Math.max(0, (1 - rr) / 0.015) * 255 : 255;
    }
    B.cx.putImageData(B.img, 0, 0);
  });
  return any;
}

export function ballLoop(): void {
  const loop = (now?: number) => {
    ballFrame(now || 0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- intro canvas (partículas + ondas + warp) ----------
export const intro = {
  warp: 0,
  raf: 0,
  stop() { cancelAnimationFrame(intro.raf); },
};

export function startIntro(): void {
  const cv = document.getElementById("cv") as HTMLCanvasElement;
  const cx = cv.getContext("2d")!;
  let W = 0, H = 0, D = 1;
  let mx = 0, my = 0, w = 0;
  const t0 = performance.now();
  const P: { x: number; y: number; z: number; s: number; v: number }[] = [];
  for (let i = 0; i < 120; i++)
    P.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.9 + 0.1, s: Math.random() * 2 + 0.5, v: Math.random() * 0.0018 + 0.0004 });
  const rs = () => {
    D = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * D;
    H = cv.height = innerHeight * D;
  };
  addEventListener("resize", rs);
  rs();
  addEventListener("pointermove", (e) => {
    mx = e.clientX / innerWidth - 0.5;
    my = e.clientY / innerHeight - 0.5;
  });
  function rb(t: number, k: number, col: string, amp: number, yo: number, al: number): void {
    cx.beginPath();
    for (let x = 0; x <= W; x += 14) {
      const u = x / W;
      const y = H * yo + Math.sin(u * 5 + t * 0.0006 * k) * amp * H + Math.sin(u * 9 - t * 0.0004 * k) * amp * 0.5 * H + my * 46 * D * k;
      x ? cx.lineTo(x, y) : cx.moveTo(x, y);
    }
    cx.strokeStyle = col;
    cx.globalAlpha = al;
    cx.lineWidth = 2 * D;
    cx.stroke();
  }
  function frame(now: number): void {
    const t = now - t0;
    const fade = Math.min(1, t / 1600);
    w += (intro.warp - w) * 0.06;
    cx.clearRect(0, 0, W, H);
    cx.globalAlpha = 1;
    const g = cx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(31,191,106," + 0.1 * fade + ")");
    g.addColorStop(0.5, "rgba(201,149,43," + 0.06 * fade + ")");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);
    cx.save();
    for (let i = 0; i < 5; i++) rb(now, 1 + i * 0.35 + w * 3, i % 2 ? "rgb(31,191,106)" : "rgb(201,149,43)", 0.03 + i * 0.006, 0.5 + (i - 2.5) * 0.04, (0.06 + 0.035 * (i % 3)) * fade);
    cx.restore();
    P.forEach((p) => {
      p.y -= p.v * (1 + w * 40);
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      const x = (p.x + mx * 0.05 * p.z) * W;
      const y = p.y * H;
      cx.globalAlpha = (0.1 + 0.4 * p.z) * fade;
      cx.fillStyle = p.z > 0.55 ? "#c9952b" : "#1fbf6a";
      if (w > 0.05) cx.fillRect(x, y, p.s * D, p.s * D * (1 + w * 26));
      else { cx.beginPath(); cx.arc(x, y, p.s * D * p.z, 0, 6.283); cx.fill(); }
    });
    cx.globalAlpha = 1;
    intro.raf = requestAnimationFrame(frame);
  }
  intro.raf = requestAnimationFrame(frame);
}
