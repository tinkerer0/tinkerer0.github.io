// 소리 합성: 이벤트 기록에서 배경음 + 효과음을 모노 PCM으로 만든다. 브라우저·노드 공용.
// 배경음은 6곡 중 시드로 하나를 고른다(판마다 바뀌고, 같은 시드면 같은 곡). 효과음 음높이는 그 곡의 조성에 맞춘다.
const SR = 44100;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], PHRYG = [0, 1, 3, 5, 7, 8, 10], LYD = [0, 2, 4, 6, 7, 9, 11];
// 16칸 패턴: x=침, o=약하게. bass/lead는 칸마다 음계 도수(없으면 null). prog는 마디마다 더하는 도수
export const TRACKS = [
  { name: 'Pulse', bpm: 128, root: 45, scale: MINOR, kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', bassWave: 'sine',
    bass: [0, null, 0, null, 0, null, 7, null, 0, null, 0, null, 2, null, 7, null], prog: [0, 0, 2, 2], lead: 'pluck', leadOct: 1, arp: [0, 2, 4, 6, 7, 6, 4, 2] },
  { name: 'Breaks', bpm: 140, root: 38, scale: MINOR, kick: 'x.....x...x.....', clap: '....x.......x..o', hat: 'x.x.x.xox.x.x.xo', bassWave: 'square',
    bass: [0, null, null, 0, null, null, 0, null, 3, null, null, 3, null, 4, null, null], prog: [0, 5, 3, 4], lead: 'square', leadOct: 1, arp: [4, null, 2, null, 0, 2, null, 4, 7, null, 6, null, 4, null, 2, null] },
  { name: 'Bounce', bpm: 112, root: 41, scale: MAJOR, kick: 'x.......x.x.....', clap: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', bassWave: 'sine', swing: 0.22,
    bass: [0, null, 7, null, 0, null, 7, null, 0, null, 7, null, 4, null, 5, null], prog: [0, 3, 4, 3], lead: 'bell', leadOct: 2, arp: [0, 4, 2, 4, 0, 4, 2, 4] },
  { name: 'Drive', bpm: 150, root: 40, scale: PHRYG, kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..o...o...o...o.', bassWave: 'saw',
    bass: [0, 0, 7, 0, 0, 7, 0, 1, 0, 0, 7, 0, 0, 7, 1, 0], prog: [0, 0, 1, 0], lead: 'square', leadOct: 1, arp: [0, null, null, 1, null, null, 4, null, 3, null, 1, null, 0, null, null, null] },
  { name: 'Glide', bpm: 96, root: 36, scale: LYD, kick: 'x.........x.....', clap: '........x.......', hat: '..x...x...x...x.', bassWave: 'sine',
    bass: [0, null, null, null, null, null, null, null, 4, null, null, null, null, null, null, null], prog: [0, 1, 4, 3], lead: 'bell', leadOct: 2, arp: [4, null, null, 7, null, null, 9, null, null, 11, null, null, 7, null, null, null], pad: true },
  { name: 'Chip', bpm: 132, root: 43, scale: MAJOR, kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', bassWave: 'square',
    bass: [0, null, 7, null, 0, null, 7, null, 0, null, 7, null, 0, null, 7, 9], prog: [0, 5, 3, 4], lead: 'square', leadOct: 2, arp: [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 7] },
];
export const trackFor = (seed) => TRACKS[(seed >>> 0) % TRACKS.length];

export function renderAudio(log, duration, seed = 1, opts = {}) {
  const n = Math.ceil(duration * SR);
  const out = new Float32Array(n);
  const tr = opts.track ? TRACKS.find((x) => x.name === opts.track) : trackFor(seed);
  let rs = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return ((rs >>> 0) / 4294967296) * 2 - 1; };
  const add = (t0, len, fn, gain) => {
    const s = Math.max(0, Math.floor(t0 * SR)), e = Math.min(n, Math.floor((t0 + len) * SR));
    for (let i = s; i < e; i++) { const t = (i - s) / SR; out[i] += fn(t, t / len) * gain; }
  };
  // 칸 경계 반올림으로 k가 1을 살짝 넘으면 음수의 소수 거듭제곱이 NaN이 된다 → 0으로 자른다
  const env = (k, a = 0.01, p = 3) => (k < a ? k / a : Math.max(0, 1 - (k - a) / (1 - a)) ** p);

  const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
  const sq = (f, t) => Math.tanh(5 * Math.sin(2 * Math.PI * f * t));
  const saw = (f, t) => { const x = f * t; return 2 * (x - Math.floor(x)) - 1; };
  const WAVE = { sine: (f, t) => sine(f, t) + 0.35 * Math.sign(sine(f, t)), square: (f, t) => 0.6 * sq(f, t), saw: (f, t) => 0.55 * saw(f, t) + 0.4 * sine(f, t) };
  const note = (deg, base = tr.root) => { const L = tr.scale.length, o = Math.floor(deg / L); return base + tr.scale[((deg % L) + L) % L] + 12 * o; };
  const kick = (t0, g) => { let ph = 0; add(t0, 0.28, (t, k) => { ph += (2 * Math.PI * (45 + 110 * Math.exp(-t * 28))) / SR; return Math.sin(ph) * env(k, 0.002, 2.2); }, g); };
  const hat = (t0, g, len = 0.045) => add(t0, len, (t, k) => rnd() * env(k, 0.002, 4), g);
  const clap = (t0, g) => add(t0, 0.14, (t, k) => rnd() * env(k, 0.003, 3) * (0.6 + 0.4 * Math.sin(t * 900)), g);
  const bass = (t0, len, m, g) => { const f = midi(m), w = WAVE[tr.bassWave]; add(t0, len, (t, k) => w(f, t) * env(k, 0.01, 1.4), g); };
  const LEAD = {
    pluck: (f, t, k) => (sine(f, t) + 0.4 * sine(2 * f, t) + 0.15 * sine(3 * f, t)) * env(k, 0.004, 3),
    square: (f, t, k) => 0.55 * sq(f, t) * env(k, 0.004, 2.2),
    bell: (f, t, k) => (sine(f, t) + 0.45 * sine(f * 2.76, t) * Math.exp(-t * 9)) * env(k, 0.003, 2.6),
  };
  const lead = (t0, len, m, g) => { const f = midi(m), v = LEAD[tr.lead]; add(t0, len, (t, k) => v(f, t, k), g); };

  // 곡: 16분 칸 단위. 처음엔 드럼·베이스, 8초부터 멜로디, 시간이 갈수록 하이햇이 촘촘해진다
  const step = 60 / tr.bpm / 4, sw = tr.swing || 0;
  const at = (i) => i * step + (i % 2 ? sw * step : 0);
  for (let i = 0; opts.music !== false && at(i) < duration; i++) {
    const t = at(i), c = i % 16, bar = Math.floor(i / 16), heat = Math.min(1, t / 30), pr = tr.prog[bar % tr.prog.length];
    if (tr.kick[c] !== '.') kick(t, tr.kick[c] === 'x' ? 0.75 : 0.45);
    if (tr.clap[c] !== '.') clap(t, tr.clap[c] === 'x' ? 0.18 : 0.08);
    if (tr.hat[c] !== '.') hat(t, (tr.hat[c] === 'x' ? 0.07 : 0.05) + 0.04 * heat, tr.hat[c] === 'o' ? 0.12 : 0.045);
    else if (heat > 0.5 && c % 2) hat(t, 0.03);
    const bd = tr.bass[c];
    if (bd != null) bass(t, step * (tr.pad ? 7.5 : 1.8), note(bd + pr) - 12, tr.pad ? 0.3 : 0.32);
    if (tr.pad && c === 0) for (const d of [0, 2, 4]) add(t, step * 15, (tt, k) => sine(midi(note(d + pr) + 12), tt) * Math.sin(Math.PI * k) ** 1.5, 0.05);
    if (t > 8) {
      const ad = tr.arp[c % tr.arp.length];
      if (ad != null) lead(t, step * 1.8, note(ad + pr, tr.root + 12 * tr.leadOct), c % 4 === 0 ? 0.1 : 0.075);
    }
  }

  // 효과음
  const pent = [0, 2, 4, 7, 9];
  const lastCap = [0, -1, -1];
  const capIdx = [0, 0, 0];
  for (const e of opts.sfx === false ? [] : log) {
    if (e.type === 'cap') {
      if (e.t - lastCap[e.team] < 0.06) continue; lastCap[e.team] = e.t;
      const i = capIdx[e.team]++; const m = tr.root + 24 + (e.team === 2 ? 7 : 0) + pent[i % 5] + 12 * (Math.floor(i / 5) % 2);
      add(e.t, 0.09, (t, k) => sine(midi(m), t) * env(k, 0.003, 2), 0.1 + 0.03 * Math.min(4, e.n));
    } else if (e.type === 'beam') {
      add(e.t, 0.16, (t, k) => sine(700 + 2600 * (1 - k) ** 2, t) * env(k, 0.002, 2), 0.1);
    } else if (e.type === 'bounce') {
      add(e.t, 0.05, (t, k) => sine(220, t) * env(k, 0.002, 2), 0.08);
    } else if (e.type === 'wave') {
      add(e.t, 0.35, (t, k) => rnd() * Math.sin(Math.PI * k) * (0.5 + 0.5 * Math.sin(t * 60)), 0.1);
    } else if (e.type === 'blast') {
      add(e.t, 0.25, (t, k) => sine(95 * Math.exp(-t * 9) + 40, t) * env(k, 0.002, 2) * 1.2 + rnd() * env(k, 0.001, 5) * 0.3, 0.4);
    } else if (e.type === 'lock') {
      for (const [d, m] of [[0, 84], [0.07, 91]]) add(e.t + d, 0.5, (t, k) => (sine(midi(m), t) + 0.3 * sine(midi(m) * 2.76, t)) * env(k, 0.003, 3), 0.11);
    } else if (e.type === 'end') {
      [60, 64, 67, 72, 76].forEach((m, i) => add(e.t + i * 0.09, 1.2, (t, k) => (sine(midi(m), t) + 0.3 * sine(2 * midi(m), t)) * env(k, 0.005, 1.8), 0.16));
      kick(e.t, 1.1);
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.tanh(out[i] * 1.1); peak = Math.max(peak, Math.abs(out[i])); }
  const norm = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= norm;
  return out;
}

export function toWav(pcm) {
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return new Uint8Array(buf);
}
export const SAMPLE_RATE = SR;
