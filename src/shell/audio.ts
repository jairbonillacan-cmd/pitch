/**
 * Motor de audio AztecaVet — port fiel del bloque "motor de audio" del shell
 * original (caracol, huehuetl, ocarina, campanas y barridos; escala pentatónica,
 * reverb por convolución con IR de ruido, compresor maestro).
 * Categoría: OBSERVADO (mismos parámetros; parado de inline_1 con REA/lectura).
 */

const PENT = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];

interface AudioState {
  ctx: AudioContext | null;
  master: GainNode | null;
  rev: ConvolverNode | null;
  started: boolean;
  bed: GainNode | null;
  chimes: boolean;
  drums: boolean;
}
const AU: AudioState = { ctx: null, master: null, rev: null, started: false, bed: null, chimes: false, drums: false };
let snd = true;

function initAudio(c: AudioContext): void {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 6;
  const m = c.createGain();
  m.gain.value = snd ? 0.55 : 0;
  m.connect(comp);
  comp.connect(c.destination);
  AU.master = m;
  const len = Math.floor(c.sampleRate * 2.6);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const cv = c.createConvolver();
  cv.buffer = ir;
  const rg = c.createGain();
  rg.gain.value = 0.6;
  cv.connect(rg);
  rg.connect(m);
  AU.rev = cv;
}

function actx(): AudioContext | null {
  if (!AU.ctx) {
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      AU.ctx = new C();
      initAudio(AU.ctx);
    } catch { /* sin audio */ }
  }
  return AU.ctx;
}

export function isOn(): boolean { return snd; }
export function toggle(): boolean { snd = !snd; muteApply(); return snd; }
export function started(): boolean { return AU.started; }

function muteApply(): void {
  if (AU.ctx && AU.master) AU.master.gain.setTargetAtTime(snd ? 0.55 : 0, AU.ctx.currentTime, 0.05);
  const ic = snd ? "🔊" : "🔇";
  const a = document.getElementById("snd");
  const b = document.getElementById("snd2");
  if (a) a.textContent = ic;
  if (b) b.textContent = ic;
}

function out(n: AudioNode, wet?: number): void {
  if (!AU.ctx || !AU.master) return;
  n.connect(AU.master);
  if (wet) {
    const g = AU.ctx.createGain();
    g.gain.value = wet;
    n.connect(g);
    if (AU.rev) g.connect(AU.rev);
  }
}

function env(g: GainNode, t: number, a: number, d: number, peak: number, end?: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end || 0.0001, t + a + d);
}

function noiseBuf(dur: number): AudioBuffer {
  const c = AU.ctx!;
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function bell(f: number, t: number, vol: number, wet?: number): void {
  const c = AU.ctx!;
  const g = c.createGain();
  [[1, 1], [2.76, 0.32], [5.4, 0.14]].forEach(([m, amp]: [number, number]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = "sine";
    o.frequency.value = f * m;
    og.gain.value = amp;
    o.connect(og);
    og.connect(g);
    o.start(t);
    o.stop(t + 2.3);
  });
  env(g, t, 0.005, 1.9, vol);
  out(g, wet == null ? 0.7 : wet);
}

function drum(t: number, vol: number): void {
  const c = AU.ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(135, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.3);
  env(g, t, 0.004, 0.55, vol);
  o.connect(g);
  out(g, 0.35);
  o.start(t);
  o.stop(t + 0.7);
  const n = c.createBufferSource();
  n.buffer = noiseBuf(0.14);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 950;
  const ng = c.createGain();
  env(ng, t, 0.002, 0.12, vol * 0.55);
  n.connect(f);
  f.connect(ng);
  out(ng, 0.2);
  n.start(t);
  n.stop(t + 0.2);
}

function conch(t: number, f0: number, dur: number, vol: number): void {
  const c = AU.ctx!;
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(380, t);
  lp.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.45);
  lp.frequency.exponentialRampToValueAtTime(500, t + dur);
  const lfo = c.createOscillator();
  const lg = c.createGain();
  lfo.frequency.value = 5.2;
  lg.gain.value = f0 * 0.012;
  lfo.connect(lg);
  [[f0, "sawtooth", 0.6], [f0 * 1.5, "triangle", 0.25], [f0 * 0.5, "sine", 0.5]].forEach(([f, ty, amp]: [number, string, number]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = ty as OscillatorType;
    o.frequency.value = f as number;
    lg.connect(o.frequency);
    og.gain.value = amp as number;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.2);
  });
  lfo.start(t);
  lfo.stop(t + dur + 0.2);
  lp.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out(g, 0.6);
}

function ocarina(t: number, f: number, dur: number, vol: number): void {
  const c = AU.ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  const vib = c.createOscillator();
  const vg = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(f * 0.985, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  vib.frequency.value = 5.5;
  vg.gain.value = f * 0.007;
  vib.connect(vg);
  vg.connect(o.frequency);
  const n = c.createBufferSource();
  n.buffer = noiseBuf(dur + 0.2);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f * 2;
  bp.Q.value = 2;
  const ng = c.createGain();
  ng.gain.value = 0.1;
  n.connect(bp);
  bp.connect(ng);
  ng.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.07);
  g.gain.setValueAtTime(vol, t + Math.max(0.08, dur - 0.18));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  out(g, 0.65);
  o.start(t);
  vib.start(t);
  n.start(t);
  o.stop(t + dur + 0.1);
  vib.stop(t + dur + 0.1);
  n.stop(t + dur + 0.1);
}

function sweep(t: number, dur: number, vol: number, up: boolean): void {
  const c = AU.ctx!;
  const n = c.createBufferSource();
  n.buffer = noiseBuf(dur + 0.2);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 4;
  const a = up ? 180 : 7000;
  const b = up ? 7000 : 180;
  bp.frequency.setValueAtTime(a, t);
  bp.frequency.exponentialRampToValueAtTime(b, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * (up ? 0.85 : 0.15));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp);
  bp.connect(g);
  out(g, 0.5);
  n.start(t);
  n.stop(t + dur + 0.2);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(up ? 110 : 1760, t);
  o.frequency.exponentialRampToValueAtTime(up ? 1760 : 110, t + dur);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(vol * 0.35, t + dur * (up ? 0.85 : 0.15));
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(og);
  out(og, 0.6);
  o.start(t);
  o.stop(t + dur + 0.1);
}

function drone(): void {
  const c = AU.ctx!;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.value = 0.0001;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 260;
  const l = c.createOscillator();
  const lg = c.createGain();
  l.frequency.value = 0.12;
  lg.gain.value = 120;
  l.connect(lg);
  lg.connect(lp.frequency);
  l.start();
  [[55, "sine", 0.7], [55.35, "triangle", 0.4], [110.4, "sine", 0.25], [82.4, "sine", 0.2]].forEach(([f, ty, amp]: [number, string, number]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = ty as OscillatorType;
    o.frequency.value = f as number;
    og.gain.value = amp as number;
    o.connect(og);
    og.connect(lp);
    o.start();
  });
  lp.connect(g);
  out(g, 0.5);
  g.gain.exponentialRampToValueAtTime(0.12, t + 5);
  AU.bed = g;
}

function chimeLoop(): void {
  if (!AU.chimes || !AU.ctx) return;
  bell(PENT[Math.floor(Math.random() * 7)], AU.ctx.currentTime + 0.02, 0.045 + Math.random() * 0.03, 0.85);
  setTimeout(chimeLoop, 1000 + Math.random() * 1600);
}

function beat(): void {
  if (!AU.drums || !AU.ctx) return;
  const t = AU.ctx.currentTime + 0.02;
  drum(t, 0.26);
  drum(t + 0.24, 0.14);
  setTimeout(beat, 1800);
}

function openingCue(t: number): void {
  sweep(t, 1.7, 0.22, true);
  conch(t + 0.6, 196, 2.6, 0.26);
  drum(t + 2.0, 0.5);
  const DEL: number[] = [0, 0.55, 1.1, 2.1, 2.7, 3.3];
  const DUR: number[] = [0.5, 0.5, 0.9, 0.55, 0.55, 1.5];
  [659.25, 783.99, 880, 659.25, 587.33, 440].forEach((f, i) => ocarina(t + 2.4 + DEL[i]!, f, DUR[i]!, 0.085));
  [1046.5, 1318.5, 1568].forEach((f, i) => bell(f, t + 3.4 + i * 0.18, 0.05, 0.9));
}

export function portal(): void {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime + 0.02;
  sweep(t, 1.1, 0.2, true);
  conch(t + 0.25, 174.6, 1.9, 0.22);
  drum(t + 0.95, 0.55);
  [880, 1046.5, 1318.5].forEach((f, i) => bell(f, t + 1 + i * 0.12, 0.06, 0.8));
}

export function unlockSound(): void {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime + 0.02;
  sweep(t, 1.5, 0.3, true);
  drum(t + 1.1, 0.7);
  drum(t + 1.45, 0.55);
  conch(t + 0.5, 196, 2.2, 0.28);
  [440, 523.25, 659.25, 783.99, 880, 1046.5, 1318.5].forEach((f, i) => bell(f, t + 1.0 + i * 0.09, 0.08, 0.9));
  AU.chimes = false;
  AU.drums = false;
  if (AU.bed) AU.bed.gain.setTargetAtTime(0.0001, AU.ctx.currentTime + 0.5, 0.7);
}

export function keySound(d: number): void {
  if (!AU.ctx) return;
  bell(PENT[d % 10], AU.ctx.currentTime + 0.01, 0.17, 0.5);
}
export function tick(v = 1): void { if (AU.ctx) drum(AU.ctx.currentTime + 0.01, 0.12 * v); }
export function failSound(): void {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime + 0.01;
  drum(t, 0.5);
  bell(220, t, 0.07, 0.4);
  bell(233.1, t, 0.06, 0.4);
}
export function navSound(): void {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime + 0.01;
  sweep(t, 0.7, 0.14, true);
  drum(t + 0.45, 0.38);
  bell(1046.5, t + 0.5, 0.05, 0.8);
}
export function backSound(): void {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime + 0.01;
  sweep(t, 0.6, 0.1, false);
  bell(659.25, t + 0.3, 0.05, 0.8);
}
export function hoverBell(): void {
  if (!AU.ctx) return;
  bell(PENT[3 + Math.floor(Math.random() * 4)], AU.ctx.currentTime + 0.01, 0.035, 0.8);
}

let lastHover = 0;
export function bindHoverSounds(getPaused: () => boolean): void {
  document.addEventListener("pointerover", (e) => {
    const b = (e.target as HTMLElement).closest?.(".bc");
    if (!b || !AU.started || getPaused()) return;
    const n = Date.now();
    if (n - lastHover < 250) return;
    lastHover = n;
    hoverBell();
  });
}

export function startScore(cue: boolean): void {
  if (AU.started) return;
  const c = actx();
  if (!c) return;
  AU.started = true;
  if (c.resume) c.resume();
  muteApply();
  const t = c.currentTime + 0.05;
  drone();
  AU.chimes = true;
  AU.drums = true;
  if (cue) openingCue(t);
  setTimeout(chimeLoop, cue ? 3200 : 1200);
  setTimeout(beat, cue ? 2600 : 1600);
  const h = document.getElementById("sndh");
  if (h) (h as HTMLElement).style.display = "none";
}

export function tryAutoStart(): void {
  const c = actx();
  if (!c) return;
  try {
    const r = c.resume && c.resume();
    if (r && (r as Promise<void>).then)
      (r as Promise<void>).then(() => { if (c.state === "running") startScore(true); }).catch(() => {});
  } catch { /* gesto requerido */ }
}

export function bindSoundToggles(): void {
  ["snd", "snd2"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
      if (snd && AU.ctx) bell(660, AU.ctx.currentTime + 0.01, 0.08, 0.6);
    });
  });
}
