// 색 전쟁 시뮬레이션 코어. DOM 없이 동작하며 시드가 같으면 결과가 같다.
export const TICK = 1 / 60;
export const MAX_TIME = 60;
export const LOCK_SECONDS = 15;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ABILITIES = {
  ricochet: { label: 'Rebound', text: '+7 PX REACH PER HIT', icon: 'triangle' },
  splitter: { label: 'Swarm', text: 'NEW PIECE EVERY 12 HITS', icon: 'pentagon' },
  wave: { label: 'Tide', text: 'FLOOD GROWS PER HIT', icon: 'chevron' },
  laser: { label: 'Prism', text: '+2 RAYS PER HIT', icon: 'diamond' },
  spiral: { label: 'Vortex', text: 'SPINS FASTER WHEN BEHIND', icon: 'star' },
  hunter: { label: 'Comet', text: '+1.5 PX BLAST PER HIT', icon: 'dart' },
  orbit: { label: 'Orbit', text: '+1 MOON EVERY 3 HITS', icon: 'hexagon' },
  chain: { label: 'Chain', text: '+2 JUMPS EVERY 7 HITS', icon: 'bolt' },
  seeder: { label: 'Seeder', text: '+1.35 PX BURST PER HIT', icon: 'cross' },
  pulse: { label: 'Pulse', text: '+2.6 PX RING PER HIT', icon: 'ring' },
  dash: { label: 'Dash', text: '+0.42 PX WIDTH PER HIT', icon: 'arrow' },
  meteor: { label: 'Meteor', text: '+1 METEOR EVERY 4 HITS', icon: 'drop' },
  plague: { label: 'Plague', text: '+1 SPREAD EVERY 4 HITS', icon: 'spore' },
  blink: { label: 'Blink', text: '+1.35 PX LANDING PER HIT', icon: 'crescent' },
  bastion: { label: 'Bastion', text: '+1.8 PX SHIELD PER HIT', icon: 'shield' },
  mirror: { label: 'Mirror', text: '+0.78 PX TWIN WIDTH PER HIT', icon: 'bowtie' },
};

export { COLORS } from './colors.js';

// 보로노이 지도: 사이트를 고르게 뿌리고 Lloyd 완화 후 픽셀별 셀 번호를 만든다.
export function buildMap(seed, W = 313, H = 403, N = 170) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let sx = new Float32Array(N), sy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let bx = 0, by = 0, bd = -1;
    for (let k = 0; k < 8; k++) {
      const x = rng() * W, y = rng() * H;
      let nd = Infinity;
      for (let j = 0; j < i; j++) { const d = (sx[j] - x) ** 2 + (sy[j] - y) ** 2; if (d < nd) nd = d; }
      if (nd > bd) { bd = nd; bx = x; by = y; }
    }
    sx[i] = bx; sy[i] = by;
  }
  const labels = new Uint16Array(W * H);
  const label = () => {
    const bs = 24, bw = Math.ceil(W / bs), bh = Math.ceil(H / bs);
    const buckets = Array.from({ length: bw * bh }, () => []);
    for (let i = 0; i < N; i++) buckets[Math.min(bh - 1, (sy[i] / bs) | 0) * bw + Math.min(bw - 1, (sx[i] / bs) | 0)].push(i);
    for (let y = 0; y < H; y++) {
      const by = Math.min(bh - 1, (y / bs) | 0);
      for (let x = 0; x < W; x++) {
        const bx = Math.min(bw - 1, (x / bs) | 0);
        let best = -1, bd = Infinity;
        for (let r = 0; r < Math.max(bw, bh); r++) {
          for (let yy = by - r; yy <= by + r; yy++) {
            if (yy < 0 || yy >= bh) continue;
            for (let xx = bx - r; xx <= bx + r; xx++) {
              if (xx < 0 || xx >= bw) continue;
              if (r > 0 && Math.abs(yy - by) !== r && Math.abs(xx - bx) !== r) continue;
              for (const i of buckets[yy * bw + xx]) {
                const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
                if (d < bd) { bd = d; best = i; }
              }
            }
          }
          if (best >= 0 && Math.sqrt(bd) <= r * bs) break;
        }
        labels[y * W + x] = best;
      }
    }
  };
  for (let it = 0; it < 2; it++) {
    label();
    const cx = new Float64Array(N), cy = new Float64Array(N), cn = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = labels[y * W + x]; cx[l] += x; cy[l] += y; cn[l]++; }
    for (let i = 0; i < N; i++) if (cn[i] > 0) { sx[i] = cx[i] / cn[i]; sy[i] = cy[i] / cn[i]; }
  }
  label();
  const area = new Int32Array(N), cx = new Float32Array(N), cy = new Float32Array(N);
  const nb = Array.from({ length: N }, () => new Set());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = labels[y * W + x]; area[l]++; cx[l] += x; cy[l] += y;
    if (x + 1 < W) { const r = labels[y * W + x + 1]; if (r !== l) { nb[l].add(r); nb[r].add(l); } }
    if (y + 1 < H) { const d = labels[(y + 1) * W + x]; if (d !== l) { nb[l].add(d); nb[d].add(l); } }
  }
  for (let i = 0; i < N; i++) { cx[i] /= Math.max(1, area[i]); cy[i] /= Math.max(1, area[i]); }
  return { W, H, N, labels, area, cx, cy, nb: nb.map((s) => [...s]), totalArea: W * H };
}

const SPEED = { ricochet: 86, splitter: 66, wave: 70, laser: 70, spiral: 74, hunter: 112, orbit: 70, chain: 72, seeder: 72, pulse: 66, dash: 80, meteor: 70, plague: 70, blink: 66, bastion: 78, mirror: 74 };
// 맞지 않아도 일정 간격마다 발동하는 능력(멀리서 땅을 먹어 유닛이 새 셀에 잘 닿지 않는 능력)
const IDLE_FIRE = new Set(['laser', 'wave', 'orbit', 'chain', 'seeder', 'pulse', 'meteor', 'dash', 'plague', 'blink', 'bastion', 'mirror']);
const WANDER = new Set(['laser', 'wave', 'splitter', 'chain', 'seeder', 'pulse', 'meteor', 'plague', 'blink', 'bastion', 'mirror']);
const CAP = { minis: 12 };

export function createGame(map, cfg, seed) {
  const { W, H, N, labels, area, cx, cy, nb } = map;
  const rng = mulberry32(seed);
  const owner = new Uint8Array(N), since = new Float32Array(N), locked = new Uint8Array(N), earned = new Uint8Array(N), shieldUntil = new Float32Array(N);
  const owned = [0, 0, 0], lockedArea = [0, 0, 0], start = [0, 0, 0];
  const ownedN = [0, 0, 0], lockedN = [0, 0, 0];
  for (let i = 0; i < N; i++) { owner[i] = cx[i] < W / 2 ? 1 : 2; owned[owner[i]] += area[i]; ownedN[owner[i]]++; }
  start[1] = owned[1]; start[2] = owned[2];
  const lockTarget = Math.ceil(N * (cfg.lockWin ?? 0.55));
  const g = {
    map, cfg, rng, owner, since, locked, shieldUntil, owned, lockedArea, ownedN, lockedN, start, lockTarget, t: 0, tick: 0,
    events: [], agents: [], over: false, winner: 0, reason: '',
    teams: [null, { ability: cfg.a.ability, fires: 0 }, { ability: cfg.b.ability, fires: 0 }],
  };
  const spawn = (team, kind, x, y, ang, life) => {
    const a = { team, kind, x, y, ang, life, maxLife: life, nextAbility: 0, turn: 0, retarget: 0, tgt: -1, cr: 0, cth: rng() * 6.28, ccx: x, ccy: y };
    g.agents.push(a); return a;
  };
  spawn(1, 'main', W * 0.25, H * (0.4 + rng() * 0.2), (rng() - 0.5) * 1.2, Infinity);
  spawn(2, 'main', W * 0.75, H * (0.4 + rng() * 0.2), Math.PI + (rng() - 0.5) * 1.2, Infinity);
  const cellAt = (x, y) => labels[Math.max(0, Math.min(H - 1, y | 0)) * W + Math.max(0, Math.min(W - 1, x | 0))];
  let tickCaps = [0, 0, 0], capX = [0, 0, 0], capY = [0, 0, 0];

  // 성장 규칙: 능력마다 발동 횟수(fires)에 따라 세진다. HUD 카드가 같은 값을 보여 준다.
  const P = {
    ricochet: (f) => ({ len: Math.min(2500, 70 + 7 * f) }),
    splitter: (f) => ({ pieces: 1 + Math.floor(f / 12) }),
    laser: (f) => ({ rays: Math.min(50, 12 + Math.floor(f * 2.2)) }),
    wave: (f) => ({ cells: Math.min(220, 6 + Math.floor(f * 0.35)) }),
    hunter: (f) => ({ r: Math.min(95, 13 + 1.5 * f) }),
    spiral: (f) => ({ extra: 0.4 * f }),
    orbit: (f) => ({ moons: Math.min(14, 3 + Math.floor(f / 3)), r: Math.min(120, 40 + 0.8 * f) }),
    chain: (f) => ({ jumps: Math.min(30, 2 + Math.floor(f / 3.5)) }),
    seeder: (f) => ({ r: Math.min(100, 20 + 1.35 * f) }),
    pulse: (f) => ({ r: Math.min(230, 40 + 2.6 * f) }),
    dash: (f) => ({ dur: 0.6, w: Math.min(60, 14 + 0.42 * f) }),
    meteor: (f) => ({ count: Math.min(14, 2 + Math.floor(f / 4)) }),
    plague: (f) => ({ hops: Math.min(20, 2 + Math.floor(f / 4)) }),
    blink: (f) => ({ r: Math.min(85, 20 + 1.35 * f) }),
    bastion: (f) => ({ r: Math.min(130, 26 + 1.8 * f) }),
    mirror: (f) => ({ w: Math.min(65, 17 + 0.78 * f) }),
  };
  g.hud = (team) => {
    const ab = g.teams[team].ability, f = g.teams[team].fires, p = P[ab](f);
    const loss = Math.max(0, Math.min(1, 1 - owned[team] / start[team]));
    switch (ab) {
      case 'ricochet': return `REACH ${Math.round(p.len)}PX`;
      case 'splitter': return `PIECES ${1 + g.agents.filter((a) => a.team === team && a.kind === 'mini').length}`;
      case 'orbit': return `MOONS ${p.moons}`;
      case 'chain': return `JUMPS ${p.jumps}`;
      case 'seeder': return `BURST ${Math.round(p.r)}PX`;
      case 'pulse': return `RING ${Math.round(p.r)}PX`;
      case 'dash': return `WIDTH ${Math.round(p.w)}PX`;
      case 'meteor': return `METEORS ${p.count}`;
      case 'plague': return `SPREAD ${p.hops}`;
      case 'blink': return `LANDING ${Math.round(p.r)}PX`;
      case 'bastion': return `SHIELD ${Math.round(p.r)}PX`;
      case 'mirror': return `TWIN ${Math.round(p.w)}PX`;
      case 'laser': return `RAYS ${p.rays}`;
      case 'wave': return `TIDE ${p.cells} CELLS`;
      case 'hunter': return `BLAST ${Math.round(p.r)}PX`;
      default: return `SPEED x${(3.0 + 3.3 * loss).toFixed(1)}`;
    }
  };

  function take(team, ci) {
    if (owner[ci] === team || locked[ci] || shieldUntil[ci] > g.t) return false;
    const old = owner[ci];
    owned[old] -= area[ci]; owned[team] += area[ci]; ownedN[old]--; ownedN[team]++;
    owner[ci] = team; since[ci] = g.t; earned[ci] = 1;
    tickCaps[team]++; capX[team] = cx[ci]; capY[team] = cy[ci];
    return true;
  }
  function ray(team, x, y, ang, len, bounces, wide = false) {
    const pts = [[x, y]]; let hit = 0, dx = Math.cos(ang), dy = Math.sin(ang), left = len;
    while (left > 0) {
      x += dx * 2; y += dy * 2; left -= 2;
      if (x < 0 || x >= W) { dx = -dx; x = Math.max(0, Math.min(W - 0.01, x)); if (bounces-- <= 0) break; pts.push([x, y]); }
      if (y < 0 || y >= H) { dy = -dy; y = Math.max(0, Math.min(H - 0.01, y)); if (bounces-- <= 0) break; pts.push([x, y]); }
      const c = cellAt(x, y);
      if (take(team, c)) {
        hit++;
        if (wide) { let k = 0; for (const n of nb[c]) if (k < 3 && owner[n] !== team && !locked[n]) { take(team, n); k++; } }
      }
    }
    pts.push([x, y]);
    g.events.push({ type: 'beam', team, pts, t: g.t, thin: len < 150 });
    return hit;
  }
  function enemyNearest(team, x, y) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (owner[i] === team || locked[i]) continue;
      const d = (cx[i] - x) ** 2 + (cy[i] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  for (const a of g.agents) if (g.teams[a.team].ability === 'spiral') { const t = enemyNearest(a.team, a.x, a.y); a.ccx = cx[t]; a.ccy = cy[t]; a.cr = 0; }

  function fire(a, hitCell, why) {
    const tm = g.teams[a.team], ab = tm.ability;
    const p = P[ab](tm.fires);
    if (ab === 'ricochet') {
      a.nextAbility = g.t + 0.3;
      ray(a.team, a.x, a.y, a.ang + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.9), p.len, 2 + Math.min(12, Math.floor(p.len / 220)));
    } else if (ab === 'laser') {
      a.nextAbility = g.t + 0.12;
      const spread = Math.min(6.2, 0.5 + 0.1 * p.rays);
      for (let k = 0; k < p.rays; k++) ray(a.team, a.x, a.y, a.ang + (p.rays === 1 ? 0 : (k / (p.rays - 1) - 0.5) * spread), 110, 0);
    } else if (ab === 'splitter') {
      a.nextAbility = g.t + 0.45;
      const alive = g.agents.filter((m) => m.team === a.team && m.kind === 'mini').length;
      for (let k = 0; k < p.pieces && alive + k < CAP.minis; k++) spawn(a.team, 'mini', a.x, a.y, rng() * 6.283, 7);
    } else if (ab === 'wave') {
      a.nextAbility = g.t + 0.25;
      const seen = new Set([hitCell]); let frontier = [hitCell], took = 0;
      while (frontier.length && took < p.cells) {
        const nxt = [];
        for (const c of frontier) for (const n of nb[c]) {
          if (seen.has(n)) continue; seen.add(n);
          if (owner[n] !== a.team && !locked[n] && took < p.cells) { take(a.team, n); took++; nxt.push(n); }
        }
        frontier = nxt;
      }
      g.events.push({ type: 'wave', team: a.team, x: a.x, y: a.y, t: g.t, r: 18 + 4 * Math.sqrt(p.cells) });
    } else if (ab === 'hunter') {
      a.nextAbility = g.t + 0.35;
      for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < p.r * p.r) take(a.team, i);
      g.events.push({ type: 'blast', team: a.team, x: a.x, y: a.y, r: p.r, t: g.t });
    } else if (ab === 'spiral') a.nextAbility = g.t + 0.3;
    else if (ab === 'orbit') {
      a.nextAbility = g.t + 0.4;
      const have = g.agents.filter((m) => m.team === a.team && m.kind === 'moon').length;
      for (let k = have; k < p.moons; k++) { const m = spawn(a.team, 'moon', a.x, a.y, 0, Infinity); m.host = a; m.cth = (k / p.moons) * 6.283; }
    } else if (ab === 'chain') {
      a.nextAbility = g.t + 0.45;
      const pts = [[a.x, a.y]]; let x = a.x, y = a.y;
      for (let k = 0; k < p.jumps; k++) {
        const c = enemyNearest(a.team, x, y);
        if (c < 0 || (cx[c] - x) ** 2 + (cy[c] - y) ** 2 > 70 * 70) break;
        take(a.team, c); x = cx[c]; y = cy[c]; pts.push([x, y]);
      }
      if (pts.length > 1) g.events.push({ type: 'beam', team: a.team, pts, t: g.t, thin: true, zig: true });
    } else if (ab === 'seeder') {
      a.nextAbility = g.t + 0.25;
      const c = enemyNearest(a.team, a.x, a.y);
      const m = spawn(a.team, 'mine', c >= 0 ? cx[c] : a.x, c >= 0 ? cy[c] : a.y, 0, 1.0); m.r = p.r;
    } else if (ab === 'pulse') {
      a.nextAbility = g.t + 0.7;
      const m = spawn(a.team, 'ring', a.x, a.y, 0, 0.7); m.r = 0; m.rmax = p.r;
    } else if (ab === 'dash') {
      a.nextAbility = g.t + 0.25;
      if (g.t >= (a.dashUntil || 0)) { const c = enemyNearest(a.team, a.x, a.y); if (c >= 0) a.ang = Math.atan2(cy[c] - a.y, cx[c] - a.x); }
      a.dashUntil = Math.max(a.dashUntil || 0, g.t + p.dur);
    } else if (ab === 'meteor') {
      a.nextAbility = g.t + 0.4;
      const near = [];
      for (let i = 0; i < N; i++) if (owner[i] !== a.team && !locked[i] && (cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < 160 * 160) near.push(i);
      for (let k = 0; k < p.count && near.length; k++) {
        const c = near[Math.floor(rng() * near.length)];
        const x = cx[c], y = cy[c];
        const m = spawn(a.team, 'mine', x, y, 0, 0.5 + rng() * 0.3); m.r = 22; m.meteor = true;
      }
    }
    else if (ab === 'plague') {
      a.nextAbility = g.t + 0.35;
      const c = owner[hitCell] === a.team ? enemyNearest(a.team, a.x, a.y) : hitCell;
      if (c >= 0) { take(a.team, c); const m = spawn(a.team, 'germ', cx[c], cy[c], 0, 0.25); m.cell = c; m.hops = p.hops; }
    } else if (ab === 'blink') {
      a.nextAbility = g.t + 0.5;
      const near = [];
      for (let i = 0; i < N; i++) if (owner[i] !== a.team && !locked[i] && (cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < 200 * 200) near.push(i);
      if (near.length) {
        const c = near[Math.floor(rng() * near.length)];
        g.events.push({ type: 'blast', team: a.team, x: a.x, y: a.y, r: 8, t: g.t });
        a.x = cx[c]; a.y = cy[c]; a.blinkT = g.t;
        for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < p.r * p.r) take(a.team, i);
        g.events.push({ type: 'blast', team: a.team, x: a.x, y: a.y, r: p.r, t: g.t });
      }
    } else if (ab === 'bastion') {
      a.nextAbility = g.t + 0.6;
      for (let i = 0; i < N; i++) { const d = (cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2; if (d < p.r * p.r * 0.49) take(a.team, i); }
      for (let i = 0; i < N; i++) if (owner[i] === a.team && (cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < p.r * p.r) shieldUntil[i] = g.t + 3;
      g.events.push({ type: 'wave', team: a.team, x: a.x, y: a.y, t: g.t, r: p.r });
    } else if (ab === 'mirror') {
      a.nextAbility = g.t + 0.5;
      if (!g.agents.some((m) => m.team === a.team && m.kind === 'twin')) { const m = spawn(a.team, 'twin', W - a.x, H - a.y, a.ang + Math.PI, Infinity); m.host = a; }
    }
    tm.fires++;
  }
  function onHit(a, hitCell) {
    if (a.kind !== 'main' || g.t < a.nextAbility) return;
    fire(a, hitCell);
  }
  function moveAgent(a) {
    const ab = g.teams[a.team].ability;
    if (a.kind === 'mine' || a.kind === 'germ') return;
    if (a.kind === 'twin') { const h = a.host; a.x = Math.max(0, Math.min(W - 0.01, W - h.x)); a.y = Math.max(0, Math.min(H - 0.01, H - h.y)); a.ang = h.ang + Math.PI; return; }
    if (a.kind === 'moon') {
      const h = a.host, p = P.orbit(g.teams[a.team].fires);
      a.cth += 2.4 * TICK; a.ang = a.cth + Math.PI / 2;
      a.x = Math.max(0, Math.min(W - 0.01, h.x + Math.cos(a.cth) * p.r)); a.y = Math.max(0, Math.min(H - 0.01, h.y + Math.sin(a.cth) * p.r));
      return;
    }
    if (a.kind === 'ring') {
      const r0 = a.r; a.r = a.rmax * (1 - a.life / a.maxLife);
      for (let i = 0; i < N; i++) { const d = Math.hypot(cx[i] - a.x, cy[i] - a.y); if (d >= r0 - 2 && d < a.r) take(a.team, i); }
      return;
    }
    let sp = a.kind === 'mini' ? 64 : SPEED[ab];
    if (a.kind === 'main' && ab === 'dash' && g.t < (a.dashUntil || 0)) {
      sp *= 3; const w = P.dash(g.teams[a.team].fires).w;
      for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < w * w) take(a.team, i);
    }
    if (a.kind === 'main') {
      if (WANDER.has(ab)) {
        a.turn += (rng() - 0.5) * 6 * TICK; a.turn *= 0.98;
        a.ang += a.turn * TICK * 4;
      } else if (ab === 'hunter' || ab === 'orbit') {
        if (g.t >= a.retarget) { a.tgt = enemyNearest(a.team, a.x, a.y); a.retarget = g.t + 0.25; }
        if (a.tgt >= 0) {
          let d = Math.atan2(cy[a.tgt] - a.y, cx[a.tgt] - a.x) - a.ang;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          a.ang += Math.max(-3.5 * TICK, Math.min(3.5 * TICK, d));
        }
      } else if (ab === 'spiral') {
        const loss = Math.max(0, Math.min(1, 1 - owned[a.team] / g.start[a.team]));
        sp *= 3.0 + 3.3 * loss;
        a.cth += (sp / Math.max(14, a.cr + 14)) * TICK;
        a.cr += 11 * TICK * (sp / 100);
        if (g.t >= a.retarget) { a.tgt = enemyNearest(a.team, a.ccx, a.ccy); a.retarget = g.t + 0.4; }
        if (a.tgt >= 0) {
          const d = Math.hypot(cx[a.tgt] - a.ccx, cy[a.tgt] - a.ccy) || 1;
          a.ccx += ((cx[a.tgt] - a.ccx) / d) * 55 * (sp / 100) * TICK; a.ccy += ((cy[a.tgt] - a.ccy) / d) * 55 * (sp / 100) * TICK;
        }
        if (a.cr > 55) a.cr = 6;
        a.ang = a.cth + Math.PI / 2;
        a.x = Math.max(0, Math.min(W - 0.01, a.ccx + Math.cos(a.cth) * a.cr));
        a.y = Math.max(0, Math.min(H - 0.01, a.ccy + Math.sin(a.cth) * a.cr));
        return;
      }
    }
    a.x += Math.cos(a.ang) * sp * TICK; a.y += Math.sin(a.ang) * sp * TICK;
    let bounced = false;
    if (a.x < 0) { a.x = -a.x; a.ang = Math.PI - a.ang; bounced = true; }
    else if (a.x >= W) { a.x = 2 * W - a.x - 0.02; a.ang = Math.PI - a.ang; bounced = true; }
    if (a.y < 0) { a.y = -a.y; a.ang = -a.ang; bounced = true; }
    else if (a.y >= H) { a.y = 2 * H - a.y - 0.02; a.ang = -a.ang; bounced = true; }
    if (bounced && a.kind === 'main') {
      g.events.push({ type: 'bounce', team: a.team, x: a.x, y: a.y, t: g.t });
      if (ab === 'ricochet' && g.t >= a.nextAbility) fire(a, cellAt(a.x, a.y));
    }
  }
  // 최전선에서 lockDepth겹 안쪽에 있는 셀만 잠긴다(1: 이웃이 모두 같은 색, 2: 이웃의 이웃까지)
  const depth = cfg.lockDepth ?? 2;
  const deep = (i) => nb[i].every((j) => owner[j] === owner[i] && (depth < 2 || nb[j].every((k) => owner[k] === owner[i])));
  g.step = function () {
    if (g.over) return;
    g.events = [];
    tickCaps = [0, 0, 0];
    g.t += TICK; g.tick++;
    const order = g.tick % 2 ? [...g.agents].reverse() : [...g.agents]; // 먼저 움직이는 쪽이 유리하지 않게 번갈아
    for (const a of order) {
      moveAgent(a);
      const ci = cellAt(a.x, a.y);
      let hit = a.kind === 'mine' || a.kind === 'ring' || a.kind === 'germ' ? false : take(a.team, ci);
      if (a.kind === 'twin' || (a.kind === 'main' && g.teams[a.team].ability === 'mirror')) {
        const w = P.mirror(g.teams[a.team].fires).w;
        for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < w * w && take(a.team, i) && a.kind === 'main') hit = true;
      }
      if (a.kind === 'moon') for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < 100) take(a.team, i);
      if (a.kind === 'main' && g.teams[a.team].ability === 'spiral') {
        const tm = g.teams[a.team], R = 13 + P.spiral(tm.fires).extra + 12 * Math.max(0, Math.min(1, 1 - owned[a.team] / g.start[a.team]));
        for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < R * R && take(a.team, i)) hit = true;
      }
      if (hit) onHit(a, ci);
      else if (a.kind === 'main' && IDLE_FIRE.has(g.teams[a.team].ability) && g.t >= a.nextAbility + 0.45) fire(a, ci);
      a.life -= TICK;
      if (a.kind === 'germ' && a.life <= 0 && owner[a.cell] === a.team && a.hops > 0) {
        const opts = nb[a.cell].filter((j) => owner[j] !== a.team && !locked[j] && shieldUntil[j] <= g.t);
        if (opts.length && g.agents.filter((m) => m.kind === 'germ' && m.team === a.team).length < 120) {
          const j = opts[Math.floor(rng() * opts.length)];
          take(a.team, j); const m = spawn(a.team, 'germ', cx[j], cy[j], 0, 0.25); m.cell = j; m.hops = a.hops - 1;
          if (a.hops > 3 && opts.length > 1 && rng() < 0.35) { const k = opts.find((x) => x !== j); take(a.team, k); const m2 = spawn(a.team, 'germ', cx[k], cy[k], 0, 0.25); m2.cell = k; m2.hops = a.hops - 2; }
        }
      }
      if (a.kind === 'mine' && a.life <= 0) {
        for (let i = 0; i < N; i++) if ((cx[i] - a.x) ** 2 + (cy[i] - a.y) ** 2 < a.r * a.r) take(a.team, i);
        g.events.push({ type: 'blast', team: a.team, x: a.x, y: a.y, r: a.r, t: g.t });
      }
    }
    g.agents = g.agents.filter((a) => a.life > 0);
    for (const tm of [1, 2]) if (tickCaps[tm]) g.events.push({ type: 'cap', team: tm, n: tickCaps[tm], x: capX[tm], y: capY[tm], t: g.t });
    if (g.tick % 6 === 0) {
      let n = 0, lx = 0, ly = 0, lt = 0;
      for (let i = 0; i < N; i++) {
        if (earned[i] && owner[i] && !locked[i] && g.t - since[i] >= (cfg.lockSeconds ?? LOCK_SECONDS) && deep(i)) {
          locked[i] = 1; lockedArea[owner[i]] += area[i]; lockedN[owner[i]]++; n++; lx = cx[i]; ly = cy[i]; lt = owner[i];
        }
      }
      if (n) g.events.push({ type: 'lock', team: lt, n, x: lx, y: ly, t: g.t });
      for (const tm of [1, 2]) {
        if (ownedN[3 - tm] === 0) { finish(tm, 'wipe'); break; }
        if (lockedN[tm] >= lockTarget) { finish(tm, 'lock'); break; }
      }
      if (!g.over && g.t >= (cfg.maxTime ?? MAX_TIME)) {
        const w = ownedN[1] === ownedN[2] ? (lockedN[1] >= lockedN[2] ? 1 : 2) : ownedN[1] > ownedN[2] ? 1 : 2;
        finish(w, 'time');
      }
    }
  };
  function finish(w, why) { g.over = true; g.endT = g.t; g.winner = w; g.reason = why; g.events.push({ type: 'end', team: w, why, t: g.t }); }
  return g;
}

// 헤드리스로 끝까지 돌려 이벤트 기록과 결과를 돌려준다.
export function runMatch(map, cfg, seed, keepEvents = false) {
  const g = createGame(map, cfg, seed);
  const log = [];
  while (!g.over) { g.step(); if (keepEvents) for (const e of g.events) log.push(e); }
  return { winner: g.winner, reason: g.reason, time: g.t, owned: [...g.ownedN], locked: [...g.lockedN], fires: [g.teams[1].fires, g.teams[2].fires], log };
}
