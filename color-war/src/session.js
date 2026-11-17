// 미리보기·내보내기·앱이 같이 쓰는 실행 코드: 시드로 판을 미리 돌리고, 화면용 세션을 만든다.
import { buildMap, createGame, runMatch } from './sim.js';
import { createRenderer } from './render.js';

export const FPS = 30, HOLD = 3;
export const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const maps = new Map();
// wide: 웹 가로 화면용으로 같은 넓이의 판을 눕힌다(403x313). 앱·영상은 세로 판(313x403)
const mapFor = (label, wide) => { const k = wide ? `${label}|wide` : label; if (!maps.has(k)) maps.set(k, wide ? buildMap(hash(label), 403, 313) : buildMap(hash(label))); return maps.get(k); };

export function makeConfig(o) {
  return { a: { color: o.colorA, ability: o.abilityA }, b: { color: o.colorB, ability: o.abilityB }, seedLabel: o.seed, lockWin: o.lockWin, maxTime: o.maxTime ? Number(o.maxTime) : undefined };
}

// 같은 시드면 같은 판이다. 먼저 끝까지 돌려 이벤트 기록·길이·소리를 만든다.
export function prepare(o) {
  const cfg = makeConfig(o), map = mapFor(o.seed, o.wide), seed = hash(o.seed + ':battle');
  const res = runMatch(map, cfg, seed, true);
  const duration = res.time + HOLD;
  return { cfg, map, seed, res, duration, frames: Math.ceil(duration * FPS), log: res.log };
}

export function makeSession(prep, canvas, opts) {
  const game = createGame(prep.map, prep.cfg, prep.seed);
  const r = createRenderer(canvas, game, opts);
  const advance = (target) => {
    let guard = 0;
    while (!game.over && game.t < target && guard++ < 240) { game.step(); r.ingest(game.events); }
    if (game.over && game.events.length) { r.ingest(game.events); game.events = []; }
  };
  return { game, draw: (t) => { advance(t); r.draw(t); } };
}

