// 대결 밖의 소리: 메인 화면 배경음(반복), 랜덤 대결 소개(VS) 소리, 단추 누름 소리. 브라우저·노드 공용.
// 대결 배경음(audio.js)과 같은 합성 방식·조성으로 만들어 한 게임 소리로 들리게 한다.
// 2026-11-20 Jinwoo가 후보(tools/ui-sound-preview.mjs)에서 고름: 메인 '두근'(C), 소개 '곡이 VS부터'(D), 누름 '튕김'(A)
import { loudness, CEILING, renderAudio } from './audio.js';

const SR = 44100;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const env = (k, a = 0.01, p = 3) => (k < a ? k / a : Math.max(0, 1 - (k - a) / (1 - a)) ** p);

function buffer(sec, seed = 7) {
  const n = Math.ceil(sec * SR), out = new Float32Array(n);
  let rs = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return ((rs >>> 0) / 4294967296) * 2 - 1; };
  const add = (t0, len, fn, gain) => {
    const s = Math.max(0, Math.floor(t0 * SR)), e = Math.min(n, Math.floor((t0 + len) * SR));
    for (let i = s; i < e; i++) { const t = (i - s) / SR; out[i] += fn(t, t / len) * gain; }
  };
  const kick = (t0, g) => { let ph = 0; add(t0, 0.28, (t, k) => { ph += (2 * Math.PI * (45 + 110 * Math.exp(-t * 28))) / SR; return Math.sin(ph) * env(k, 0.002, 2.2); }, g); };
  const hat = (t0, g, len = 0.045) => add(t0, len, (t, k) => rnd() * env(k, 0.002, 4), g);
  return { out, n, add, kick, hat };
}
// 음량 맞춤: 목표 LUFS로 올리고 내린 뒤 최고점을 천장(-1 dBFS) 아래로 부드럽게 누른다
function finish(x, lufs) {
  const T = 0.6 * CEILING, R = CEILING - T;
  const limit = (v) => { const a = Math.abs(v); return a <= T ? v : Math.sign(v) * (T + R * Math.tanh((a - T) / R)); };
  const l = loudness(x);
  const g = Number.isFinite(l) ? 10 ** ((lufs - l) / 20) : 1;
  return x.map((v) => limit(v * g));
}
// 짧은 소리(400ms보다 짧으면 LUFS를 못 잰다)는 최고점으로 맞춘다
function peak(x, db) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const g = m ? 10 ** (db / 20) / m : 1; return x.map((v) => v * g); }

// ---- 메인 화면 배경음: 대결 곡 Pulse의 단조, 킥과 플럭 아르페지오. 8마디를 만들고 끝을 넘친 꼬리는 앞에 더해 이음매 없이 반복 ----
const LOBBY = { bpm: 118, root: 45, scale: MINOR, bars: 8, prog: [0, 0, 5, 3], kick: 'x...x...x...x...', hat: '..o...o...o...o.', pluck: [0, 2, 4, 2, 7, 4, 2, 4] };
export function renderLobby() {
  const L = LOBBY, step = 60 / L.bpm / 4, loop = L.bars * 16 * step;
  const b = buffer(loop + 2, 11);
  const note = (deg, base = L.root) => { const n = L.scale.length, o = Math.floor(deg / n); return base + L.scale[((deg % n) + n) % n] + 12 * o; };
  for (let i = 0; i < L.bars * 16; i++) {
    const c = i % 16, pr = L.prog[Math.floor(i / 16) % L.prog.length], t = i * step;
    if (L.kick[c] === 'x') b.kick(t, 0.45);
    if (L.hat[c] !== '.') b.hat(t, 0.04, 0.1);
    if (c === 0) b.add(t, step * 14, (tt, k) => sine(midi(note(pr) - 12), tt) * env(k, 0.02, 1.2), 0.22);
    if (c % 2 === 0) { const f = midi(note(L.pluck[(c / 2) % L.pluck.length] + pr, L.root + 12)); b.add(t, step * 1.8, (tt, k) => (sine(f, tt) + 0.4 * sine(2 * f, tt) + 0.15 * sine(3 * f, tt)) * env(k, 0.004, 3), 0.08); }
  }
  const n = Math.round(loop * SR), out = b.out.slice(0, n);
  for (let i = n; i < b.n; i++) out[i - n] += b.out[i];
  return finish(out, -21); // 대결(-16 LUFS)보다 작게: 기다리는 화면
}

// ---- 랜덤 대결 소개(2.5초): 그 판의 곡을 소개 화면에서 먼저 시작한다. 대결 소리는 곡의 INTRO_SEC 지점부터 이어 튼다 ----
export const INTRO_SEC = 2.5;
export function renderIntro(seed) {
  // ring: 2.5초 전에 친 음은 끝까지 울리게 둔다(대결 쪽은 2.5초부터 새 음만 친다)
  const x = finish(renderAudio([], INTRO_SEC, seed, { normalize: false, ring: 0.6 }), -17);
  const f = Math.round(0.3 * SR); // 긴 음(Glide 패드)이 버퍼 끝에서 뚝 끊기지 않게 마지막 0.3초를 줄인다
  for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
  return x;
}

// ---- 단추 누름 소리(튕김): kind = tap(일반)·pick(색·능력 고르기, 한 옥타브 위)·go(시작, 두 음). v로 5음계 중 하나 ----
export const TAP_VARIANTS = 5;
const PENT = [0, 2, 4, 7, 9];
export function renderTap(kind = 'tap', v = 0) {
  const len = kind === 'go' ? 0.42 : 0.14, b = buffer(len, 31 + v);
  const f = midi(69 + PENT[v % 5] + (kind === 'pick' ? 12 : 0));
  b.add(0, len, (t, k) => (sine(f, t) + 0.4 * sine(2 * f, t) + 0.15 * sine(3 * f, t)) * env(k, 0.004, 3), 0.5);
  if (kind === 'go') b.add(0.07, len - 0.07, (t, k) => (sine(f * 1.5, t) + 0.4 * sine(3 * f, t)) * env(k, 0.004, 2.5), 0.45);
  return peak(b.out, kind === 'go' ? -4 : -8);
}
