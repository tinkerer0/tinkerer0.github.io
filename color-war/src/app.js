// 아이폰 앱 화면. 시작 전 화면(미리보기·주인공·시간·랜덤/시작) → 주인공 고르기 → 대결.
import { ABILITIES, COLORS, buildMap } from './sim.js';
import { prepare, makeSession, hash } from './session.js';
import { initAds, adsForScreen, whenPrivacyOptionsRequired, showPrivacyOptions } from './ads.js';
import { polygon, cellShapes } from './render.js';
import { renderAudio, SAMPLE_RATE } from './audio.js';
import { renderLobby, renderIntro, renderTap, INTRO_SEC, TAP_VARIANTS } from './ui-audio.js';
import { randomPair, colorDistance, MIN_PAIR_DISTANCE, COLOR_ORDER } from './colors.js';
import { THEMES, DEFAULT_THEME, themeOf } from './themes.js';
import { APP_VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
// 문구: 한국어 기기면 한국어, 그 밖은 영어(HTML의 data-en)
const KO = (navigator.language || '').toLowerCase().startsWith('ko');
if (!KO) {
  document.documentElement.lang = 'en';
  document.querySelectorAll('[data-en]').forEach((el) => { if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.en); else el.textContent = el.dataset.en; });
} else document.documentElement.lang = 'ko';

const TIMES = [45, 60, 75];
const AUTO_NEXT = 3; // 승자 화면 뒤 다음 판까지(초)
const ABS = Object.keys(ABILITIES);

// ---- 저장: 버전 키, 이상한 값은 기본값으로 ----
const SAVE_KEY = 'colorwar.prefs.v1';
function loadPrefs() {
  const d = { sound: true, haptic: true, time: 60, theme: DEFAULT_THEME };
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return { sound: typeof v.sound === 'boolean' ? v.sound : d.sound, haptic: typeof v.haptic === 'boolean' ? v.haptic : d.haptic, time: TIMES.includes(v.time) ? v.time : d.time, theme: v.theme in THEMES ? v.theme : d.theme };
  } catch { return d; }
}
const prefs = loadPrefs();
// 테마(themes.js)를 화면 바탕에 입힌다. 판은 대결을 만들 때 prefs.theme으로 그린다
function applyTheme() {
  const t = themeOf(prefs.theme), st = document.documentElement.style;
  st.setProperty('--bg', t.bg); st.setProperty('--tile', t.tile); st.setProperty('--ink', t.ink);
  st.setProperty('--bg-rgb', [1, 3, 5].map((i) => parseInt(t.bg.slice(i, i + 2), 16)).join(','));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}
applyTheme();
const savePrefs = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(prefs)); } catch { /* 저장 공간 없음: 이번 실행만 유지 */ } };
// 누름: 진동 + 누름 소리(kind: tap 일반 · pick 색·능력 고르기 · go 시작). 소리는 아래 '대결 밖 소리'에서
const haptic = (kind = 'tap') => { tapSound(kind); if (prefs.haptic && window.Capacitor?.isNativePlatform?.()) window.Capacitor.nativePromise?.('Haptics', 'impact', { style: 'LIGHT' })?.catch?.(() => {}); };

// ---- 고른 것 ----
const rndSeed = () => Math.random().toString(36).slice(2, 6);
const rndAbility = () => ABS[Math.floor(Math.random() * ABS.length)];
function randomPicks() { const [ca, cb] = randomPair(); return { a: { color: ca, ability: rndAbility() }, b: { color: cb, ability: rndAbility() } }; }
let picks = randomPicks();
const paramsFrom = (p) => ({ colorA: p.a.color, abilityA: p.a.ability, colorB: p.b.color, abilityB: p.b.ability, seed: rndSeed(), maxTime: prefs.time });

// ---- 화면 전환 ----
let screen = 'lobby';
function show(name) {
  for (const s of ['lobby', 'picker', 'play']) $(s).hidden = s !== name;
  screen = name;
  if (name === 'lobby') paintLobby();
  if (name === 'play') stopLobby(); else startLobby();
  adsForScreen(name);
}

// ---- 작은 판 조각(주인공 타일): 실제 판과 같은 재료로 그린다 ----
const tileMap = buildMap(7, 80, 80, 11);
const shade = [0.27, 0.95, 0.27, 0.6, 0.27, 0.27, 0.6, 0.95, 0.27, 0.6, 0.27, 0.27];
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function drawTile(cv, color, ability) {
  const S = cv.width, g = cv.getContext('2d'), c = rgbOf(COLORS[color]);
  // 판과 같이 칸을 다각형으로 그린다(크게 띄워도 테두리가 계단지지 않게)
  const { polys, edges } = cellShapes(tileMap), k = S / 80, rgb = (m) => `rgb(${c.map((v) => (v * m) | 0).join(',')})`;
  g.save(); g.scale(k, k); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 1;
  polys.forEach((P, i) => { g.beginPath(); P.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = rgb(shade[i % shade.length]); g.fill(); });
  for (const e of edges) { g.beginPath(); g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); g.strokeStyle = rgb(shade[e.a % shade.length] * 0.55 + 0.12); g.stroke(); }
  g.restore();
  polygon(g, ABILITIES[ability].icon, S / 2, S / 2, -0.5, S * 0.26);
  g.fillStyle = COLORS[color]; g.shadowColor = COLORS[color]; g.shadowBlur = S * 0.12; g.fill();
  g.shadowBlur = 0; g.lineWidth = Math.max(2, S * 0.035); g.strokeStyle = '#fff'; g.stroke();
}
function drawIcon(cv, color, ability) {
  const S = cv.width, g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  polygon(g, ABILITIES[ability].icon, S / 2, S / 2, -0.5, S * 0.36);
  g.fillStyle = COLORS[color]; g.fill(); g.lineWidth = S * 0.05; g.strokeStyle = '#fff'; g.stroke();
}

// ---- 시작 전 화면 ----
function paintLobby() {
  document.documentElement.style.setProperty('--a', COLORS[picks.a.color]);
  document.documentElement.style.setProperty('--b', COLORS[picks.b.color]);
  document.querySelectorAll('.side').forEach((el) => {
    const s = picks[el.dataset.side];
    drawTile(el.querySelector('canvas'), s.color, s.ability);
    el.querySelector('b').textContent = s.color;
    el.querySelector('b').style.fontSize = s.color.length > 8 ? '22px' : '';
    el.querySelector('small').textContent = ABILITIES[s.ability].label;
    el.querySelector('em').textContent = ABILITIES[s.ability].text;
    el.querySelector('b').style.color = COLORS[s.color];
  });
  document.querySelectorAll('#times button').forEach((b) => b.classList.toggle('on', Number(b.dataset.t) === prefs.time));
  document.querySelectorAll('#themes button').forEach((b) => b.classList.toggle('on', b.dataset.theme === prefs.theme));
  $('bSound').classList.toggle('off', !prefs.sound); $('bSound2').classList.toggle('off', !prefs.sound);
  $('bHaptic').classList.toggle('off', !prefs.haptic); $('bHaptic2').classList.toggle('off', !prefs.haptic);
}

document.querySelectorAll('.side').forEach((el) => { el.onclick = () => { haptic(); openPicker(el.dataset.side); }; });
document.querySelectorAll('#times button').forEach((b) => { b.onclick = () => { haptic(); prefs.time = Number(b.dataset.t); savePrefs(); paintLobby(); }; });
// 테마 줄: themes.js에 테마가 둘 이상일 때만 보인다. 바꾸면 화면 바탕은 바로, 판은 다음 대결부터
if (Object.keys(THEMES).length > 1) {
  const box = $('themes'); box.hidden = false;
  for (const [key, t] of Object.entries(THEMES)) {
    const b = document.createElement('button'); b.dataset.theme = key; b.textContent = KO ? t.label.ko : t.label.en;
    const dot = document.createElement('i'); dot.style.background = t.bg; dot.style.borderColor = `rgb(${t.line.join(',')})`; b.prepend(dot);
    b.onclick = () => { haptic(); prefs.theme = key; savePrefs(); applyTheme(); paintLobby(); };
    box.append(b);
  }
}
$('bRandom').onclick = () => { haptic('go'); picks = randomPicks(); startPlay(paramsFrom(picks), 'random'); };
$('bStart').onclick = () => { haptic('go'); startPlay(paramsFrom(picks), 'fixed'); };
const setSettings = (open) => { $('settings').hidden = !open; $('scrim').hidden = !open; };
$('bSettings').onclick = () => { haptic(); setSettings(true); };
whenPrivacyOptionsRequired(() => { $('adPrivacy').hidden = false; $('adPrivacySep').hidden = false; });
$('adPrivacy').onclick = (e) => { e.preventDefault(); haptic(); showPrivacyOptions(); };
$('bSettingsClose').onclick = () => { haptic(); setSettings(false); };
$('scrim').onclick = () => { haptic(); setSettings(false); };
const toggleSound = () => { haptic(); prefs.sound = !prefs.sound; savePrefs(); paintLobby(); if (prefs.sound) { actx?.resume?.().catch(() => {}); if (screen === 'play') { if (!clk.pausedAt) startAudio(); } else startLobby(); } else { stopAudio(); stopIntroSound(); stopLobby(); } };
$('bSound').onclick = toggleSound; $('bSound2').onclick = toggleSound;
$('bHaptic').onclick = () => { prefs.haptic = !prefs.haptic; savePrefs(); haptic(); paintLobby(); };

// ---- 주인공 고르기 ----
let side = 'a';
const swBox = $('swatches'), abBox = $('abilities');
for (const name of COLOR_ORDER) { // 색상환 순서(colors.js가 정렬). 새 색은 목록 아무 데나 넣어도 제자리에 온다
  const b = document.createElement('button'); b.style.background = COLORS[name]; b.dataset.c = name; b.setAttribute('aria-label', name);
  b.onclick = () => {
    if (b.classList.contains('taken')) { haptic(); toast(KO ? `상대 ${picks[side === 'a' ? 'b' : 'a'].color}와 비슷해서 판에서 구별이 안 됨` : `Too close to ${picks[side === 'a' ? 'b' : 'a'].color} to tell apart on the board`); return; }
    haptic('pick'); picks[side].color = name; paintPicker();
  };
  swBox.append(b);
}
for (const key of ABS) {
  const b = document.createElement('button'); b.dataset.a = key; b.setAttribute('aria-label', ABILITIES[key].label);
  const cv = document.createElement('canvas'); cv.width = cv.height = 96; b.append(cv);
  b.onclick = () => { haptic('pick'); picks[side].ability = key; paintPicker(); };
  abBox.append(b);
}
const otherOf = (s) => picks[s === 'a' ? 'b' : 'a'];
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1600); }
const tooClose = (c, o) => c === o || colorDistance(c, o) < MIN_PAIR_DISTANCE;
function paintPicker() {
  const me = picks[side], other = otherOf(side);
  drawTile($('pickHero').querySelector('canvas'), me.color, me.ability);
  $('pickHero').querySelector('b').textContent = me.color;
  $('pickHero').querySelector('b').style.color = COLORS[me.color];
  $('pickHero').querySelector('small').textContent = ABILITIES[me.ability].label;
  $('pickHero').querySelector('em').textContent = ABILITIES[me.ability].text;
  abBox.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.a === me.ability); drawIcon(b.querySelector('canvas'), me.color, b.dataset.a); });
  swBox.querySelectorAll('button').forEach((b) => { const c = b.dataset.c; b.classList.toggle('on', c === me.color); b.classList.toggle('taken', c !== me.color && tooClose(c, other.color)); });
}
function openPicker(s) { side = s; paintPicker(); show('picker'); }
$('bBack').onclick = () => { haptic(); show('lobby'); };
$('bDice1').onclick = () => {
  haptic('pick');
  const other = otherOf(side).color, ok = Object.keys(COLORS).filter((c) => !tooClose(c, other));
  picks[side] = { color: ok[Math.floor(Math.random() * ok.length)], ability: rndAbility() };
  paintPicker();
};

// ---- 대결: 시계와 소리 ----
const canvas = $('c');
const wall = () => performance.now() / 1000;
let actx = null, src = null, unlocked = false, cur = null, nextTimer = 0, dirty = true;
const clk = { t0: 0, paused: 0, pausedAt: 0, manual: false, hidden: false, intro: false };
const now = () => Math.max(0, (clk.pausedAt || wall()) - clk.t0 - clk.paused);
function pauseClock() { if (!clk.pausedAt) clk.pausedAt = wall(); actx?.suspend?.().catch(() => {}); }
function resumeClock() {
  if (clk.manual || clk.hidden || clk.intro || screen !== 'play') return;
  if (clk.pausedAt) { clk.paused += wall() - clk.pausedAt; clk.pausedAt = 0; }
  if (prefs.sound) actx?.resume?.().catch(() => {});
}
function stopAudio() { try { src?.stop(); } catch { /* 이미 멈춤 */ } src = null; }
// 소리 합성은 worker에서. worker를 못 쓰면 화면 스레드에서 한 번 만든다
let audioWorker = null, reqId = 0, busy = false, queued = null; // 빠르게 넘기면 마지막 판 것만 만든다
const waiting = new Map();
const send = (c) => { busy = true; const id = ++reqId; waiting.set(id, c); audioWorker.postMessage({ id, log: c.prep.log, duration: c.prep.duration, seed: hash(c.params.seed), musicOffset: c.offset }); };
try {
  audioWorker = new Worker(new URL('./audio-worker.js', import.meta.url), { type: 'module' });
  audioWorker.onmessage = (e) => {
    const c = waiting.get(e.data.id); waiting.delete(e.data.id);
    if (c?.lobby) { if (e.data.error) { console.error('[colorwar] lobby audio', e.data.error); lobby.pending = false; } else gotLobby(e.data.pcm); return; }
    busy = false;
    if (queued) { const q = queued; queued = null; if (q === cur) send(q); else q.pcmPending = false; }
    if (!c) return;
    if (e.data.error) { console.error('[colorwar] audio worker', e.data.error); return; }
    c.pcm = e.data.pcm;
    if (cur === c && !clk.pausedAt) startAudio();
  };
  audioWorker.onerror = (e) => { console.error('[colorwar] audio worker off', e.message); audioWorker = null; for (const c of waiting.values()) { c.pcmPending = false; } waiting.clear(); if (queued) queued.pcmPending = false; queued = null; busy = false; };
} catch { audioWorker = null; }
function requestPcm(c) {
  if (c.pcm || c.pcmPending) return;
  c.pcmPending = true;
  const seed = hash(c.params.seed);
  if (audioWorker) { if (busy) { if (queued) queued.pcmPending = false; queued = c; } else send(c); return; }
  setTimeout(() => { try { c.pcm = renderAudio(c.prep.log, c.prep.duration, seed, { musicOffset: c.offset }); if (cur === c && !clk.pausedAt) startAudio(); } catch (e) { console.error('[colorwar] audio', e?.message || e); } }, 50);
}
function startAudio() {
  stopAudio();
  if (!prefs.sound || !unlocked || !actx || !cur || screen !== 'play') return;
  const t = now();
  if (t >= cur.prep.duration) return;
  if (!cur.pcm) { requestPcm(cur); return; } // 다 만들어지면 그 시점부터 이어서 튼다
  try {
    if (!cur.buf) { cur.buf = actx.createBuffer(1, cur.pcm.length, SAMPLE_RATE); cur.buf.copyToChannel(cur.pcm, 0); }
    src = actx.createBufferSource(); src.buffer = cur.buf; src.connect(actx.destination);
    src.start(actx.currentTime + 0.02, t + 0.02);
  } catch (e) { console.error('[colorwar] audio', e?.message || e); src = null; } // 소리만 빠지고 대결은 계속
}
// ---- 대결 밖 소리(ui-audio.js): 메인 화면 배경음, 랜덤 대결 소개 곡, 누름 소리. 모두 소리 설정·무음 스위치를 따른다 ----
// 메인 배경음: 대결 화면이 아닐 때(처음 화면·고르기·설정) 반복. 처음 한 번 worker에서 만든다
const lobby = { pcm: null, buf: null, pending: false, src: null, gain: null };
function gotLobby(pcm) { lobby.pcm = pcm; lobby.pending = false; startLobby(); }
function startLobby() {
  if (!prefs.sound || !actx || !unlocked || screen === 'play' || document.hidden || lobby.src) return;
  if (!lobby.pcm) {
    if (lobby.pending) return;
    lobby.pending = true;
    if (audioWorker) { const id = ++reqId; waiting.set(id, { lobby: true }); audioWorker.postMessage({ id, kind: 'lobby' }); }
    else setTimeout(() => { try { gotLobby(renderLobby()); } catch (e) { lobby.pending = false; console.error('[colorwar] lobby audio', e?.message || e); } }, 50);
    return;
  }
  try {
    actx.resume?.().catch(() => {}); // 대결 메뉴·앱 전환에서 멈춰 둔 오디오를 다시 켠다
    if (!lobby.buf) { lobby.buf = actx.createBuffer(1, lobby.pcm.length, SAMPLE_RATE); lobby.buf.copyToChannel(lobby.pcm, 0); }
    const g = actx.createGain(), at = actx.currentTime + 0.02;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.6); g.connect(actx.destination);
    const s = actx.createBufferSource(); s.buffer = lobby.buf; s.loop = true; s.connect(g); s.start(at);
    lobby.src = s; lobby.gain = g;
  } catch (e) { console.error('[colorwar] lobby audio', e?.message || e); lobby.src = null; }
}
function stopLobby() {
  const { src, gain } = lobby;
  if (!src) return;
  lobby.src = null;
  try { const t = actx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + 0.25); src.stop(t + 0.3); } catch { /* 이미 멈춤 */ }
}
// 소개 곡: 그 판 곡의 첫 2.5초. 대결 소리는 곡의 2.5초 지점부터 이어 튼다(cur.offset). 소개 화면이 뜬 때에 박자를 맞춘다
let introSnd = null;
function playIntroSound() {
  stopIntroSound();
  if (!prefs.sound || !actx || !cur) return;
  try {
    actx.resume?.().catch(() => {});
    const pcm = renderIntro(hash(cur.params.seed)), buf = actx.createBuffer(1, pcm.length, SAMPLE_RATE); buf.copyToChannel(pcm, 0);
    const g = actx.createGain(); g.connect(actx.destination);
    const s = actx.createBufferSource(); s.buffer = buf; s.connect(g);
    s.start(actx.currentTime + 0.02, Math.min(buf.duration - 0.05, wall() - introStart + 0.02)); // 곡을 만드는 동안 흐른 시간만큼 건너뛴다
    introSnd = { s, g };
  } catch (e) { console.error('[colorwar] intro audio', e?.message || e); introSnd = null; }
}
function stopIntroSound() {
  if (!introSnd) return;
  const { s, g } = introSnd; introSnd = null;
  try { const t = actx.currentTime; g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.08); s.stop(t + 0.1); } catch { /* 이미 멈춤 */ }
}
// 누름 소리: 종류마다 5음 중 직전과 다른 음
let tapBufs = null;
const tapLast = { tap: 0, pick: 0, go: 0 };
function tapSound(kind) {
  if (!prefs.sound || !actx || document.hidden) return;
  try {
    if (actx.state === 'suspended') actx.resume?.().catch(() => {}); // 대결 메뉴에서도 들리게(대결 소리는 메뉴를 열 때 이미 멈춤)
    if (!tapBufs) {
      tapBufs = {};
      for (const k of ['tap', 'pick', 'go']) tapBufs[k] = Array.from({ length: TAP_VARIANTS }, (_, v) => { const p = renderTap(k, v), b = actx.createBuffer(1, p.length, SAMPLE_RATE); b.copyToChannel(p, 0); return b; });
    }
    const k = tapBufs[kind] ? kind : 'tap', i = (tapLast[k] = (tapLast[k] + 1 + Math.floor(Math.random() * (TAP_VARIANTS - 1))) % TAP_VARIANTS);
    const s = actx.createBufferSource(); s.buffer = tapBufs[k][i]; s.connect(actx.destination); s.start();
  } catch { /* 소리만 빠진다 */ }
}
// iOS는 첫 터치 뒤에만 소리를 낼 수 있다
// 앱(WKWebView)은 Capacitor가 자동 재생을 허용해(mediaTypesRequiringUserActionForPlayback = []) 켜자마자 소리를 낼 수 있다
function unlockAudio() {
  if (unlocked) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume().then(() => { if (unlocked || actx.state !== 'running') return; unlocked = true; if (screen === 'play') { if (!clk.pausedAt) startAudio(); } else startLobby(); }).catch(() => {});
  } catch { /* 소리 없이 계속 */ }
}
document.addEventListener('pointerdown', unlockAudio, true);
if (window.Capacitor?.isNativePlatform?.()) unlockAudio();
document.addEventListener('visibilitychange', () => {
  clk.hidden = document.hidden;
  if (document.hidden) { pauseClock(); stopAudio(); stopIntroSound(); stopLobby(); } else { resumeClock(); if (screen === 'play') { if (!clk.pausedAt) startAudio(); } else startLobby(); }
});

let mode = 'random';
function startPlay(params, m) {
  mode = m; setSettings(false);
  clearTimeout(nextTimer); nextTimer = 0;
  stopAudio();
  let prep;
  const layout = layoutFor();
  try { prep = prepare({ ...params, dims: layout === 'desk' ? [403, 313] : undefined }); cur = { params, prep, sess: makeSession(prep, canvas, { footer: '', layout, theme: prefs.theme }), pcm: null, offset: m === 'random' ? INTRO_SEC : 0 }; } catch (e) { recover(e); return; }
  // 랜덤 대결은 소개가 처음부터 다 보이게 대결 화면을 흐려지는 전환 없이 바로 띄운다
  if (m === 'random') { const pl = $('play'); pl.classList.add('instant'); requestAnimationFrame(() => requestAnimationFrame(() => pl.classList.remove('instant'))); }
  show('play'); placeMenuBtn();
  clk.t0 = wall(); clk.paused = 0; clk.pausedAt = 0;
  endIntro(false);
  // 랜덤 대결은 누가 누구와 싸우는지 잠깐 보여 준 뒤 시계를 푼다(그동안 소리를 미리 만든다)
  if (m === 'random') { clk.intro = true; showIntro(); playIntroSound(); }
  if (clk.manual || clk.hidden || clk.intro) clk.pausedAt = clk.t0;
  dirty = true;
  if (prefs.sound) requestPcm(cur);
  if (!clk.pausedAt) startAudio();
}
const INTRO_MS = 2500;
let introTimer = 0, introStart = 0;
function showIntro() {
  for (const side of ['a', 'b']) {
    const el = document.querySelector(`#intro .who.${side}`), s = picks[side];
    drawTile(el.querySelector('canvas'), s.color, s.ability);
    el.querySelector('b').textContent = s.color; el.querySelector('b').style.color = COLORS[s.color];
    el.querySelector('small').textContent = ABILITIES[s.ability].label;
  }
  // 바탕은 두 팀 색 반반. 처음부터 다 보이게 바로 띄운다
  const box = $('intro'); box.style.setProperty('--ia', COLORS[picks.a.color]); box.style.setProperty('--ib', COLORS[picks.b.color]);
  box.hidden = false;
  // 긴 이름(WATERMELON 등)은 카드 안에 들어올 때까지 글씨를 줄인다
  box.querySelectorAll('.who b').forEach((b) => {
    b.style.fontSize = ''; b.style.lineHeight = ''; let px = parseFloat(getComputedStyle(b).fontSize); const max = b.parentElement.clientWidth;
    b.style.lineHeight = `${px}px`; // 줄 높이는 원래 크기로 고정해 두 카드 높이를 같게 둔다
    while (b.scrollWidth > max && px > 14) { px -= 2; b.style.fontSize = `${px}px`; }
  });
  introStart = wall();
  introTimer = setTimeout(() => { introTimer = 0; endIntro(true); }, INTRO_MS);
}
// go: 소개를 끝내고 대결을 시작한다(false면 덮개만 치운다)
function endIntro(go) {
  const early = !!introTimer; // 2.5초를 다 채우지 않고 끝냄(눌러서 넘김·홈·오류)
  clearTimeout(introTimer); introTimer = 0;
  $('intro').hidden = true;
  if (early) stopIntroSound(); // 다 채우면 소개 곡의 끝 울림은 대결 소리 위로 자연히 사라지게 둔다
  if (!clk.intro) return;
  clk.intro = false;
  if (go) { resumeClock(); if (!clk.pausedAt) startAudio(); }
}
$('intro').addEventListener('click', () => { haptic(); endIntro(true); });
function next() { if (mode === 'random') picks = randomPicks(); startPlay(paramsFrom(picks), mode); }
canvas.addEventListener('click', () => { if (cur?.sess.game.over && $('menu').hidden) { haptic(); next(); } });
// 메뉴: 열면 멈추고, 닫으면 이어진다
function openMenu() { clk.manual = true; pauseClock(); stopAudio(); clearTimeout(nextTimer); nextTimer = 0; paintLobby(); $('menu').hidden = false; }
function closeMenu() { $('menu').hidden = true; clk.manual = false; resumeClock(); startAudio(); }
$('bMenu').onclick = () => { haptic(); openMenu(); };
$('bResume').onclick = () => { haptic(); closeMenu(); };
$('menu').addEventListener('click', (e) => { if (e.target.id === 'menu') { haptic(); closeMenu(); } });
$('bNext').onclick = () => { haptic('go'); $('menu').hidden = true; clk.manual = false; next(); };
$('bHome').onclick = () => { haptic(); $('menu').hidden = true; clk.manual = false; clearTimeout(nextTimer); nextTimer = 0; endIntro(false); stopAudio(); pauseClock(); show('lobby'); };
$('bHaptic2').onclick = () => { prefs.haptic = !prefs.haptic; savePrefs(); haptic(); paintLobby(); };

// ---- 한 루프 ----
// 다음 프레임 예약을 먼저 해서, 그리기 오류가 나도 루프가 죽지 않는다
function frame() {
  requestAnimationFrame(frame);
  if (screen !== 'play' || !cur) return;
  try {
    const t = Math.min(now(), cur.prep.duration);
    if (!clk.pausedAt || dirty) { const d0 = performance.now(); cur.sess.draw(t); dirty = false; bench?.frame(performance.now() - d0); }
    if (t >= cur.prep.duration && !clk.pausedAt && !nextTimer) nextTimer = setTimeout(() => { nextTimer = 0; if (screen === 'play') next(); }, AUTO_NEXT * 1000);
  } catch (e) { recover(e); }
}
// 오류가 나면 멈춘 화면 대신 처음 화면으로 돌아간다(저장은 건드리지 않음). 덮개는 모두 닫고 시계를 푼다
function recover(e) {
  console.error('[colorwar] recover', e?.message || e);
  try {
    clearTimeout(nextTimer); nextTimer = 0; endIntro(false); stopAudio(); cur = null;
    clk.manual = false; clk.pausedAt = 0; $('menu').hidden = true; setSettings(false);
    show('lobby');
  } catch { /* 다음 프레임 */ }
}
window.addEventListener('error', (e) => recover(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => recover(e.reason));

// 멈춤 단추: 대결 배너 오른쪽 끝 옆에 맞춘다(app 배치는 캔버스 x 1005, y 74 / 웹 desk 배치는 캔버스 오른쪽 위 구석 x 1870, y 50)
function placeMenuBtn() {
  // offset 값은 화면 전환 중의 scale(.97)에 영향받지 않는다(getBoundingClientRect는 받는다)
  const k = canvas.offsetWidth / canvas.width, box = $('bMenu').parentElement;
  if (!k) return;
  const [mx, my] = canvas.width === 1920 ? [1870, 50] : [1005, 74], h = $('bMenu').offsetWidth / 2 || 17;
  box.style.left = `${canvas.offsetLeft + mx * k - h}px`; box.style.top = `${canvas.offsetTop + my * k - h}px`;
}
addEventListener('resize', () => { if (screen === 'play') placeMenuBtn(); });
// 웹판(html.web)의 넓은 가로 화면에서만 desk 배치를 쓴다. 앱은 항상 app 배치
const layoutFor = () => (document.documentElement.classList.contains('web') && matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches ? 'desk' : 'app');
// 데스크톱 미리보기: 폰 틀이 창 높이에 맞게 줄어든다
const fit = () => document.documentElement.style.setProperty('--fit', Math.min(1, (innerHeight - 48) / 844, (innerWidth - 48) / 390));
addEventListener('resize', fit); fit();

$('ver').textContent = `v${APP_VERSION}`;
show('lobby');
requestAnimationFrame(() => { frame(); $('loading').classList.add('gone'); setTimeout(() => { $('loading').remove(); initAds(); }, 400); });
// 측정용 빌드(npm run app -- --bench)에서만: 무거운 대결 후반 20초씩 프레임을 재서 console에 남긴다
let bench = null;
if (window.CW_BENCH) {
  const PAIRS = [['laser', 'plague'], ['mirror', 'splitter'], ['pulse', 'meteor'], ['orbit', 'chain']];
  const out = [];
  let i = -1, frames = [], draws = [], last = 0, t0 = 0;
  const run = () => {
    i++;
    if (i >= PAIRS.length) { console.log('[cwbench] DONE ' + JSON.stringify(out)); bench = null; return; }
    picks = { a: { color: 'EMBER', ability: PAIRS[i][0] }, b: { color: 'LAGOON', ability: PAIRS[i][1] } };
    startPlay(paramsFrom(picks), 'fixed');
    clk.t0 = wall() - 30; frames = []; draws = []; last = 0; t0 = performance.now();
  };
  bench = {
    frame(ms) {
      const n = performance.now();
      if (n - t0 > 2500) { if (last) frames.push(n - last); draws.push(ms); }
      last = n;
      if (n - t0 > 22500) {
        const sf = [...frames].sort((x, y) => x - y), sd = [...draws].sort((x, y) => x - y), avg = frames.reduce((x, y) => x + y, 0) / frames.length;
        const r = { pair: PAIRS[i].join('/'), fps: +(1000 / avg).toFixed(1), p99ms: +sf[Math.floor(sf.length * 0.99)].toFixed(1), maxms: +sf[sf.length - 1].toFixed(1), over50: sf.filter((x) => x > 50).length, drawAvg: +(sd.reduce((x, y) => x + y, 0) / sd.length).toFixed(1), drawP99: +sd[Math.floor(sd.length * 0.99)].toFixed(1), agents: cur.sess.game.agents.length };
        out.push(r); console.log('[cwbench] ' + JSON.stringify(r)); run();
      }
    },
  };
  setTimeout(run, 1500);
}
// 스토어 화면 촬영용(브라우저 주소에 ?dev가 있을 때만): 원하는 대결을 원하는 시점에서 멈춰 보인다
if (new URLSearchParams(location.search).has('dev')) {
  window.cwDev = {
    match(a, b, seed, t, time = 60) { picks = { a, b }; prefs.time = time; startPlay({ ...paramsFrom(picks), seed }, 'fixed'); clk.t0 = wall() - t; clk.manual = true; clk.pausedAt = wall(); stopAudio(); for (let k = 0; k <= t; k += 1 / 30) cur.sess.draw(k); dirty = true; }, // 실제 재생처럼 프레임을 차례로 그려 효과가 제때 사라지게 한다
    lobby(a, b) { picks = { a, b }; show('lobby'); },
    intro(a, b) { picks = { a, b }; startPlay(paramsFrom(picks), 'random'); }, // 랜덤 대결 소개 화면 확인용
    frame(t) { cur.sess.draw(t); }, // 미리보기 영상: 정해진 시각의 화면을 그린다
    picker(a, b, s) { picks = { a, b }; openPicker(s); },
  };
}
window.cwApp = { state: () => ({ screen, picks, t: now(), over: cur?.sess.game.over, paused: !!clk.pausedAt, time: prefs.time, audioReady: !!cur?.pcm, playing: !!src }) };
