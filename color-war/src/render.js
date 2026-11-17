// 캔버스 렌더러: 어두운 네온 톤의 액자형 판 + 모양 있는 유닛·궤적·빔 + 카드형 HUD. 1080x1920 세로 영상 기준.
import { ABILITIES, COLORS, LOCK_SECONDS } from './sim.js';
import { themeOf } from './themes.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const FONT = '"Avenir Next Condensed", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
// 판·배너·능력 패널 배치. video: 1080x1920 영상. app: 폰 화면용으로 좌우 여백을 줄이고 위 빈 띠를 없앤다(오른쪽 위는 멈춤 단추 자리)
const LAYOUTS = {
  video: { PX: 70, PY: 262, PW: 940, by0: 104, by1: 232, bl: 30, br: 1050, sideX: [50, 570], sideW: 460, height: 1920 },
  app: { PX: 18, PY: 166, PW: 1044, by0: 10, by1: 138, bl: 18, br: 930, sideX: [22, 558], sideW: 500, sideK: 1.45 },
  // desk: 웹 가로 화면(1920x1080). 눕힌 판(403x313)을 창 높이만큼 가운데에, 이름·점수·능력은 판 양옆 좁은 기둥에(위 배너 없음)
  desk: { PX: 290, PY: 24, PW: 1339, sideX: [24, 1653], sideW: 243, width: 1920, height: 1080, columns: true },
};

export const SHAPES = {
  triangle: [[1, 0], [-0.7, 0.75], [-0.7, -0.75]],
  dart: [[1.2, 0], [-0.8, 0.7], [-0.35, 0], [-0.8, -0.7]],
  diamond: [[1, 0], [0, 0.7], [-1, 0], [0, -0.7]],
  chevron: [[1, 0], [-0.6, 0.9], [-0.2, 0], [-0.6, -0.9]],
  pentagon: Array.from({ length: 5 }, (_, i) => [Math.cos((i * 2 * Math.PI) / 5), Math.sin((i * 2 * Math.PI) / 5)]),
  star: Array.from({ length: 8 }, (_, i) => { const r = i % 2 ? 0.45 : 1, a = (i * Math.PI) / 4; return [r * Math.cos(a), r * Math.sin(a)]; }),
  hexagon: Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]),
  ring: Array.from({ length: 14 }, (_, i) => [Math.cos((i * 2 * Math.PI) / 14), Math.sin((i * 2 * Math.PI) / 14)]),
  bolt: [[1, 0.2], [0.1, 0.2], [0.35, 0.9], [-1, -0.2], [-0.1, -0.2], [-0.35, -0.9]],
  cross: [[1, 0.3], [0.3, 0.3], [0.3, 1], [-0.3, 1], [-0.3, 0.3], [-1, 0.3], [-1, -0.3], [-0.3, -0.3], [-0.3, -1], [0.3, -1], [0.3, -0.3], [1, -0.3]],
  arrow: [[1, 0], [0.1, 0.85], [0.1, 0.35], [-1, 0.35], [-1, -0.35], [0.1, -0.35], [0.1, -0.85]],
  drop: [[1, 0], [0.2, 0.6], [-0.5, 0.65], [-0.9, 0.3], [-1, 0], [-0.9, -0.3], [-0.5, -0.65], [0.2, -0.6]],
  spore: Array.from({ length: 16 }, (_, i) => { const r = i % 2 ? 0.55 : 1, a = (i * Math.PI) / 8; return [r * Math.cos(a), r * Math.sin(a)]; }),
  crescent: [...Array.from({ length: 13 }, (_, i) => { const a = 0.8 + (i * (2 * Math.PI - 1.6)) / 12; return [Math.cos(a), Math.sin(a)]; }), ...Array.from({ length: 9 }, (_, i) => { const a = 2 * Math.PI - 1.24 - (i * (2 * Math.PI - 2.48)) / 8; return [0.45 + 0.758 * Math.cos(a), 0.758 * Math.sin(a)]; })],
  shield: [[-0.85, -0.9], [0, -0.72], [0.85, -0.9], [0.85, 0.05], [0.62, 0.5], [0, 1], [-0.62, 0.5], [-0.85, 0.05]].map(([x, y]) => [x * Math.cos(0.5) - y * Math.sin(0.5), x * Math.sin(0.5) + y * Math.cos(0.5)]),
  bowtie: [[-1, -0.85], [0, -0.18], [1, -0.85], [1, 0.85], [0, 0.18], [-1, 0.85]],
};

export function polygon(ctx, shape, x, y, ang, size) {
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.beginPath();
  SHAPES[shape].forEach(([px, py], i) => {
    const X = x + (px * c - py * s) * size, Y = y + (px * s + py * c) * size;
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  });
  ctx.closePath();
}

// 칸 모양: 씨앗 점의 보로노이 다각형(판 사각형으로 자름). 변마다 맞닿은 칸 번호(-1은 판 테두리)를 붙인다.
// 판(map)마다 한 번만 만든다. 대결 계산의 픽셀 칸(labels)도 같은 씨앗 점으로 나눈 것이라 경계가 겹친다.
export function cellShapes(map) {
  if (map.shapes) return map.shapes;
  const { W, H, N, sx, sy } = map, polys = [], edges = [];
  for (let i = 0; i < N; i++) {
    let P = [[0, 0, -1], [W, 0, -1], [W, H, -1], [0, H, -1]]; // [x, y, 이 점에서 시작하는 변의 이웃]
    for (let j = 0; j < N && P.length; j++) {
      if (j === i) continue;
      const nx = sx[j] - sx[i], ny = sy[j] - sy[i], c = (sx[j] ** 2 + sy[j] ** 2 - sx[i] ** 2 - sy[i] ** 2) / 2;
      const side = (p) => nx * p[0] + ny * p[1] - c; // <= 0 이면 i 쪽
      if (P.every((p) => side(p) <= 0)) continue;
      const out = [];
      for (let k = 0; k < P.length; k++) {
        const A = P[k], B = P[(k + 1) % P.length], da = side(A), db = side(B);
        const cut = () => { const t = da / (da - db); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; };
        if (da <= 0 && db <= 0) out.push(A);
        else if (da <= 0) { out.push(A); out.push([...cut(), j]); }
        else if (db <= 0) out.push([...cut(), A[2]]);
      }
      P = out;
    }
    polys.push(P);
    for (let k = 0; k < P.length; k++) {
      const A = P[k], B = P[(k + 1) % P.length];
      if (A[2] > i) edges.push({ a: i, b: A[2], x1: A[0], y1: A[1], x2: B[0], y2: B[1] });
    }
  }
  return (map.shapes = { polys, edges });
}

export function createRenderer(canvas, game, opts = {}) {
  const { map, cfg } = game;
  const { W, H, N } = map;
  // overlay: 맥 화면 덮개. 캔버스 전체가 판이고(판 비율 = 화면 비율), 칸은 반투명, 배너는 위 가운데에 작게
  const LY = opts.layout === 'overlay' ? { PX: 0, PY: 0, PW: canvas.width, width: canvas.width, height: canvas.height, overlay: true } : LAYOUTS[opts.layout] || LAYOUTS.video, { PX, PY, PW } = LY;
  const SC = PW / W, PH = Math.round(H * SC);
  // app 배치는 능력 패널 아래까지만 캔버스를 쓴다
  const height = LY.height || PY + PH + 34 + 200 * (LY.sideK || 1);
  if (canvas.height !== height) canvas.height = height;
  const width = LY.width || 1080;
  if (canvas.width !== width) canvas.width = width;
  const ctx = canvas.getContext('2d');
  const TH = themeOf(opts.theme), BG = hex(TH.bg); // 테마: 바탕·빈 칸·경계선(themes.js)
  const col = [TH.empty, hex(COLORS[cfg.a.color]), hex(COLORS[cfg.b.color])];
  const hexc = [null, COLORS[cfg.a.color], COLORS[cfg.b.color]];
  const prevOwner = Uint8Array.from(game.owner);
  const flash = new Float32Array(N);
  const cellRgb = new Float32Array(N * 3);
  const beams = [], rings = [], trails = new Map();
  const FLASH = 0.25, DIM = 0.27;
  let now = 0;

  function ingest(events) {
    for (const e of events) {
      if (e.type === 'beam') beams.push(e);
      else if (e.type === 'wave') rings.push({ ...e, r0: 6, r1: e.r, dur: 0.5 });
      else if (e.type === 'blast') rings.push({ ...e, r0: 4, r1: e.r + 8, dur: 0.35 });
      else if (e.type === 'lock') rings.push({ ...e, r0: 4, r1: 22, dur: 0.5, lock: true });
    }
  }

  function paintBase() {
    const t = now, owner = game.owner, locked = game.locked;
    for (let i = 0; i < N; i++) {
      if (owner[i] !== prevOwner[i]) { prevOwner[i] = owner[i]; flash[i] = t; }
      const o = owner[i], c = col[o];
      let b;
      if (locked[i]) b = 0.9;
      else if (game.shieldUntil && game.shieldUntil[i] > t) b = 0.78;
      else if (game.since[i] > 0 && o) { const k = Math.min(1, (t - game.since[i]) / LOCK_SECONDS); b = DIM + (0.95 - DIM) * (1 - k) ** 1.6; }
      else b = DIM;
      const f = flash[i] ? 1 - (t - flash[i]) / FLASH : 0;
      if (LY.overlay) {
        // 덮개: 차지한 칸은 불투명한 선명한 색(막 뺏은 칸·굳은 칸이 조금 더 밝다), 빈 칸은 완전 투명
        const k = 0.82 + 0.18 * Math.max(0, Math.min(1, (b - DIM) / (0.95 - DIM)));
        let r = c[0] * k, g = c[1] * k, bl = c[2] * k;
        if (f > 0) { r += (255 - r) * f * 0.6; g += (255 - g) * f * 0.6; bl += (255 - bl) * f * 0.6; }
        cellRgb[i * 3] = r; cellRgb[i * 3 + 1] = g; cellRgb[i * 3 + 2] = bl;
        continue;
      }
      let r = c[0] * b, g = c[1] * b, bl = c[2] * b;
      if (f > 0) { r += (255 - r) * f * 0.75; g += (255 - g) * f * 0.75; bl += (255 - bl) * f * 0.75; }
      cellRgb[i * 3] = r; cellRgb[i * 3 + 1] = g; cellRgb[i * 3 + 2] = bl;
    }
    drawCells();
  }

  // 칸을 다각형으로 그린다(유닛·궤적과 같은 해상도로 선명하게). 경계 색:
  // 다른 색끼리 흰 선, 같은 색끼리 칸 색보다 조금 다른 선, 굳은 칸은 밝은 선, 방패 칸은 색을 섞은 밝은 선
  const shapes = cellShapes(map);
  const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
  function drawCells() {
    const owner = game.owner, locked = game.locked, shield = game.shieldUntil;
    ctx.save(); ctx.translate(PX, PY); ctx.scale(SC, PH / H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      if (LY.overlay && !owner[i]) continue;
      const P = shapes.polys[i]; if (P.length < 3) continue;
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
      for (let k = 1; k < P.length; k++) ctx.lineTo(P[k][0], P[k][1]);
      ctx.closePath();
      ctx.fillStyle = rgb(cellRgb[i * 3], cellRgb[i * 3 + 1], cellRgb[i * 3 + 2]); ctx.fill();
    }
    const white = new Path2D(), light = new Path2D(), shieldP = [null, new Path2D(), new Path2D()], same = new Map();
    for (const e of shapes.edges) {
      const oa = owner[e.a], ob = owner[e.b];
      let path;
      if (oa !== ob) path = white;
      else if (LY.overlay) { if (!oa) continue; }
      else if (locked[e.a] || locked[e.b]) path = light;
      else if (shield && (shield[e.a] > now || shield[e.b] > now)) path = shieldP[oa];
      if (!path) { path = same.get(e.a); if (!path) same.set(e.a, (path = new Path2D())); }
      path.moveTo(e.x1, e.y1); path.lineTo(e.x2, e.y2);
    }
    for (const [i, path] of same) {
      const r = cellRgb[i * 3], g = cellRgb[i * 3 + 1], b = cellRgb[i * 3 + 2], c = col[owner[i]];
      ctx.strokeStyle = LY.overlay ? rgb(r * 0.72, g * 0.72, b * 0.72) : rgb(r * 0.55 + c[0] * 0.2, g * 0.55 + c[1] * 0.2, b * 0.55 + c[2] * 0.2);
      ctx.stroke(path);
    }
    for (const t of [1, 2]) { const c = col[t]; ctx.strokeStyle = rgb(c[0] * 0.4 + 150, c[1] * 0.4 + 150, c[2] * 0.4 + 150); ctx.stroke(shieldP[t]); }
    ctx.strokeStyle = rgb(...TH.lock); ctx.stroke(light);
    ctx.strokeStyle = LY.overlay ? 'rgb(250,250,252)' : rgb(...TH.line); ctx.stroke(white);
    ctx.restore();
  }

  function drawEffects() {
    const t = now;
    ctx.save();
    ctx.beginPath(); ctx.rect(PX, PY, PW, PH); ctx.clip();
    ctx.translate(PX, PY);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 궤적
    for (const a of game.agents) {
      if (a.kind === 'mine' || a.kind === 'ring' || a.kind === 'germ') continue;
      let tr = trails.get(a);
      if (a.blinkT && tr && a.blinkT > (tr.at || 0)) { tr.length = 0; tr.at = a.blinkT; }
      if (!tr) { tr = []; trails.set(a, tr); }
      tr.push({ x: a.x * SC, y: a.y * SC, t });
      const ttl = a.kind === 'mini' || a.kind === 'moon' ? 0.35 : game.teams[a.team].ability === 'ricochet' ? 3.2 : 0.9;
      while (tr.length && t - tr[0].t > ttl) tr.shift();
      for (let i = 1; i < tr.length; i++) {
        const al = 1 - (t - tr[i].t) / ttl;
        ctx.strokeStyle = hexc[a.team]; ctx.globalAlpha = Math.max(0, al) * (a.kind === 'mini' ? 0.5 : 0.85);
        ctx.lineWidth = a.kind === 'mini' ? 3 : 6;
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const k of trails.keys()) if (!game.agents.includes(k)) trails.delete(k);
    // 빔
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i], a = 1 - (t - b.t) / (b.thin ? 0.3 : 0.5);
      if (a <= 0) { beams.splice(i, 1); continue; }
      ctx.beginPath();
      b.pts.forEach(([x, y], k) => {
        if (!k) return ctx.moveTo(x * SC, y * SC);
        if (b.zig) { const [px, py] = b.pts[k - 1]; const mx = (px + x) / 2, my = (py + y) / 2, j = ((k * 37) % 7 - 3) * 2.2; ctx.lineTo((mx - (y - py) / 10 * j / 3) * SC, (my + (x - px) / 10 * j / 3) * SC); }
        ctx.lineTo(x * SC, y * SC);
      });
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`; ctx.lineWidth = (b.thin ? 2.5 : 7) * a + 1.5;
      ctx.shadowColor = hexc[b.team]; ctx.shadowBlur = b.thin ? 8 : 26 * a; ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // 파문
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], k = Math.max(0, (t - r.t) / r.dur); // 이벤트가 화면 시각보다 한 틱 앞설 수 있다
      if (k >= 1) { rings.splice(i, 1); continue; }
      const rad = (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 2)) * SC;
      ctx.beginPath(); ctx.arc(r.x * SC, r.y * SC, rad, 0, 6.283);
      ctx.strokeStyle = r.lock ? `rgba(255,255,255,${0.6 * (1 - k)})` : hexc[r.team]; ctx.globalAlpha = r.lock ? 1 : 0.9 * (1 - k);
      ctx.lineWidth = (r.lock ? 4 : 7) * (1 - k) + 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 유닛
    for (const a of game.agents) {
      if (a.kind === 'ring') {
        ctx.beginPath(); ctx.arc(a.x * SC, a.y * SC, Math.max(1, a.r * SC), 0, 6.283);
        ctx.strokeStyle = hexc[a.team]; ctx.lineWidth = 8; ctx.shadowColor = hexc[a.team]; ctx.shadowBlur = 20; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.stroke();
        continue;
      }
      if (a.kind === 'germ') {
        const k = 1 - a.life / a.maxLife;
        ctx.beginPath(); ctx.arc(a.x * SC, a.y * SC, 5 + 6 * k, 0, 6.283); ctx.fillStyle = '#fff'; ctx.globalAlpha = 1 - 0.6 * k; ctx.fill(); ctx.globalAlpha = 1;
        continue;
      }
      if (a.kind === 'mine') {
        const k = 1 - a.life / a.maxLife, X = a.x * SC, Y = a.y * SC;
        ctx.beginPath(); ctx.arc(X, Y, a.r * SC * k, 0, 6.283); ctx.strokeStyle = hexc[a.team]; ctx.globalAlpha = 0.5 + 0.5 * k; ctx.lineWidth = 3; ctx.stroke();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(X, Y, a.meteor ? 6 + 10 * (1 - k) : 8, 0, 6.283); ctx.fillStyle = '#fff'; ctx.fill();
        continue;
      }
      const main = a.kind === 'main', shape = ABILITIES[game.teams[a.team].ability].icon;
      const size = main || a.kind === 'twin' ? 30 : a.kind === 'moon' ? 13 : 15, X = a.x * SC, Y = a.y * SC;
      ctx.shadowColor = hexc[a.team]; ctx.shadowBlur = main ? 34 : 14;
      polygon(ctx, shape, X, Y, a.ang, size);
      ctx.fillStyle = hexc[a.team]; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = main ? 4 : 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.restore();
  }

  const roundRect = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const fit = (text, maxW, size, weight = 800) => {
    let s = size; ctx.font = `${weight} ${s}px ${FONT}`;
    while (ctx.measureText(text).width > maxW && s > 12) { s -= 1; ctx.font = `${weight} ${s}px ${FONT}`; }
  };

  // 위: 대각선으로 갈라진 대결 배너(이름·셀 수). 아래: 능력 설명·수치·잠금 진행.
  function drawBanner() {
    const A = cfg.a, B = cfg.b, y0 = LY.overlay ? 0 : LY.by0, y1 = LY.overlay ? 128 : LY.by1, bl = LY.overlay ? 0 : LY.bl, br = LY.overlay ? 1060 : LY.br, sx = (bl + br) / 2, sl = 44, nameW = sx - bl - 210;
    ctx.beginPath(); ctx.moveTo(bl, y0); ctx.lineTo(sx + sl, y0); ctx.lineTo(sx - sl, y1); ctx.lineTo(bl, y1); ctx.closePath();
    ctx.fillStyle = hexc[1]; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx + sl + 8, y0); ctx.lineTo(br, y0); ctx.lineTo(br, y1); ctx.lineTo(sx - sl + 8, y1); ctx.closePath();
    ctx.fillStyle = hexc[2]; ctx.fill();
    ctx.textBaseline = 'alphabetic';
    const n = game.ownedN;
    ctx.fillStyle = '#05050a';
    ctx.textAlign = 'left'; fit(A.color, nameW, 62, 900); ctx.fillText(A.color, bl + 28, y0 + 66);
    ctx.font = `700 26px ${FONT}`; ctx.fillText(ABILITIES[A.ability].label.toUpperCase(), bl + 30, y0 + 106);
    ctx.textAlign = 'right'; fit(B.color, nameW, 62, 900); ctx.fillText(B.color, br - 28, y0 + 66);
    ctx.font = `700 26px ${FONT}`; ctx.fillText(ABILITIES[B.ability].label.toUpperCase(), br - 30, y0 + 106);
    ctx.font = `900 74px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(String(n[1]), sx - 62, y0 + 102);
    ctx.textAlign = 'left'; ctx.fillText(String(n[2]), sx + 62, y0 + 102);
    if (LY.overlay) return;
    // 판 위쪽에 붙은 점령 줄(글자 없음)
    const bw = PW, tot = map.N;
    ctx.fillStyle = hexc[1]; ctx.fillRect(PX, PY - 14, bw * (n[1] / tot), 10);
    ctx.fillStyle = hexc[2]; ctx.fillRect(PX + bw * (1 - n[2] / tot), PY - 14, bw * (n[2] / tot), 10);
  }

  // 능력 패널. app 배치에서는 폰 글씨가 작지 않게 sideK배로 키운다
  function drawSide(X, team, who) {
    const K = LY.sideK || 1; ctx.save(); ctx.translate(X, LY.sideY ?? PY + PH + 34); ctx.scale(K, K);
    const color = hexc[team], ab = ABILITIES[who.ability], w = LY.sideW / K, x = 0, y = 0;
    ctx.beginPath(); ctx.arc(x + 44, y + 50, 40, 0, 6.283); ctx.fillStyle = `rgba(${col[team].map((v) => v * 0.3).join(',')},1)`; ctx.fill();
    polygon(ctx, ab.icon, x + 44, y + 50, -0.6, 24); ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `800 34px ${FONT}`; ctx.fillText(ab.label.toUpperCase(), x + 100, y + 38);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; fit(ab.text, w - 100, 24, 600); ctx.fillText(ab.text, x + 100, y + 72);
    ctx.fillStyle = color; fit(game.hud(team), w - 100, 46, 900); ctx.fillText(game.hud(team), x + 100, y + 126);
    const T = game.lockTarget, k = Math.min(1, game.lockedN[team] / T);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y + 150, w, 12);
    ctx.fillStyle = color; ctx.fillRect(x, y + 150, w * k, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `700 22px ${FONT}`; ctx.fillText(`LOCKED ${game.lockedN[team]} / ${T}`, x, y + 188);
    ctx.restore();
  }

  // desk 기둥(좁음): 위는 색 면(이름·능력·셀 수), 가운데는 유닛 타일, 아래는 능력 설명·수치·잠금 진행. 맨 위 72px은 멈춤 단추 자리
  function drawColumn(X, team, who, right) {
    const w = LY.sideW, color = hexc[team], ab = ABILITIES[who.ability], n = game.ownedN[team], top = 96;
    const tx = right ? X + w - 20 : X + 20, al = right ? 'right' : 'left';
    ctx.fillStyle = color; ctx.fillRect(X, top, w, 214);
    ctx.fillStyle = '#05050a'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = al;
    fit(who.color, w - 40, 58, 900); ctx.fillText(who.color, tx, top + 62);
    ctx.font = `700 26px ${FONT}`; ctx.fillText(ab.label.toUpperCase(), tx, top + 98);
    ctx.font = `900 100px ${FONT}`; ctx.fillText(String(n), tx, top + 196);
    // 유닛 타일: 시작 화면 카드와 같은 재료(어두운 색 면 + 빛나는 유닛 모양)
    const ty0 = top + 246;
    roundRect(X, ty0, w, w, 26); ctx.fillStyle = `rgba(${col[team].map((v) => v * 0.28).join(',')},1)`; ctx.fill();
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 36;
    polygon(ctx, ab.icon, X + w / 2, ty0 + w / 2, -0.6 + (right ? Math.PI : 0), 74); ctx.fillStyle = color; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
    let y = ty0 + w + 50;
    ctx.textAlign = al; ctx.fillStyle = 'rgba(255,255,255,0.7)'; fit(ab.text, w, 24, 600); ctx.fillText(ab.text, right ? X + w : X, y);
    y += 62; ctx.fillStyle = color; fit(game.hud(team), w, 50, 900); ctx.fillText(game.hud(team), right ? X + w : X, y);
    const T = game.lockTarget, k = Math.min(1, game.lockedN[team] / T);
    y += 30; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(X, y, w, 12);
    ctx.fillStyle = color; ctx.fillRect(right ? X + w * (1 - k) : X, y, w * k, 12);
    y += 46; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `700 24px ${FONT}`; ctx.fillText(`LOCKED ${game.lockedN[team]} / ${T}`, right ? X + w : X, y);
  }

  function drawHud() {
    if (LY.overlay) {
      // 위 가운데 작은 배너(메뉴 막대 아래). 배너는 1060x128 기준으로 그려 줄인다
      const s = Math.min(0.55, canvas.width / 2400), bwid = 1060 * s;
      ctx.save(); ctx.translate((canvas.width - bwid) / 2, (opts.top ?? 44)); ctx.scale(s, s); drawBanner(); ctx.restore();
      return;
    }
    if (LY.columns) {
      const n = game.ownedN, tot = map.N;
      ctx.fillStyle = hexc[1]; ctx.fillRect(PX, PY - 14, PW * (n[1] / tot), 10);
      ctx.fillStyle = hexc[2]; ctx.fillRect(PX + PW * (1 - n[2] / tot), PY - 14, PW * (n[2] / tot), 10);
      const g = ctx.createLinearGradient(PX, 0, PX + PW, 0); g.addColorStop(0, hexc[1]); g.addColorStop(1, hexc[2]);
      ctx.lineWidth = 4; ctx.strokeStyle = g; ctx.globalAlpha = 0.7; ctx.strokeRect(PX - 2, PY - 2, PW + 4, PH + 4); ctx.globalAlpha = 1;
      drawColumn(LY.sideX[0], 1, cfg.a, false); drawColumn(LY.sideX[1], 2, cfg.b, true);
      return;
    }
    drawBanner();
    // 판 테두리
    const g = ctx.createLinearGradient(PX, 0, PX + PW, 0); g.addColorStop(0, hexc[1]); g.addColorStop(1, hexc[2]);
    ctx.lineWidth = 4; ctx.strokeStyle = g; ctx.globalAlpha = 0.7; ctx.strokeRect(PX - 2, PY - 2, PW + 4, PH + 4); ctx.globalAlpha = 1;
    drawSide(LY.sideX[0], 1, cfg.a); drawSide(LY.sideX[1], 2, cfg.b);
    if (opts.layout !== 'app' && opts.layout !== 'desk') { ctx.textAlign = 'center'; ctx.font = `600 26px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(opts.footer ?? `seed ${cfg.seedLabel ?? ''}`, 540, PY + PH + 290); }
  }

  function drawEnd() {
    if (!game.over) return;
    const w = game.winner, color = hexc[w], name = w === 1 ? cfg.a.color : cfg.b.color;
    const k = Math.min(1, (now - game.endT) / 0.35);
    ctx.fillStyle = `rgba(${BG},${(LY.overlay ? 0.45 : 0.62) * k})`; ctx.fillRect(PX, PY, PW, PH);
    ctx.save(); ctx.translate(PX + PW / 2, PY + PH / 2 - 30); const s = (0.8 + 0.2 * k) * Math.min(1, PW / 940); ctx.scale(s, s); ctx.globalAlpha = k;
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = `900 150px ${FONT}`; ctx.shadowColor = color; ctx.shadowBlur = 40;
    ctx.fillText(name, 0, 0); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = `800 80px ${FONT}`; ctx.fillText('WINS', 0, 92);
    const why = { wipe: 'WIPED THE OTHER COLOR OUT', lock: `LOCKED ${game.lockedN[w]} CELLS`, time: 'MOST CELLS WHEN TIME RAN OUT' }[game.reason];
    ctx.font = `700 40px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(why, 0, 160);
    ctx.restore();
  }

  return {
    ingest,
    draw(t = game.t) {
      now = t;
      if (LY.overlay) ctx.clearRect(0, 0, canvas.width, canvas.height);
      else { ctx.fillStyle = TH.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      paintBase(); drawEffects(); drawHud(); drawEnd();
    },
  };
}
