// 색 목록과 대결 짝 고르기. 어두운 판 위에서 보이고, 배너의 어두운 글자가 읽히는 밝기의 색만 둔다.
// 새 색 넣기: RAW에 `이름 rrggbb`를 아무 데나 쉼표로 추가 → npm test(밝기·중복·짝 수 검사) → 끝.
// 고르기 화면은 COLOR_ORDER(색상환 순서)로 저절로 정렬되고, 웹 설명의 색 개수도 저절로 바뀐다.
// 이름은 대문자 영어 한 단어(배너·카드에 그대로 보인다). 색을 빼면 그 색을 고른 저장값은 없으니 빼도 되지만, 이름을 바꾸지는 않는다.
const RAW = `
EMBER ff3a2e, CORAL ff6f61, SCARLET ff2449, CHERRY ff3366, ROSE ff5e9c, FLAMINGO ff8fb8, BUBBLEGUM ff7ad9,
HIBISCUS ff2e7e, WATERMELON ff4f6d, SALMON ff8a75, BLUSH ffa3b5, MARIGOLD ff8a1f, TANGERINE ff9f1c, PUMPKIN ff7518,
APRICOT ffb26b, PAPAYA ffa14a, COPPER e8833f, RUST ec5f30, SAFFRON ffd21f, LEMON fff44f, CANARY ffe94a, HONEY ffc43d,
MUSTARD e8b923, AMBER ffbf00, MOSS 8be31f, LIME b6f22e, CHARTREUSE c7f03a, KIWI 9ee35a, JADE 2fd18b, MINT 5ff5b0,
EMERALD 1fd16a, CLOVER 4ccf3a, PISTACHIO b5e48c, SAGE 9cc98a, FERN 5fbf4a, NEON 9dff00, ALGAE 4fd1a5, LAGOON 19d3f0,
TEAL 14c9b8, AQUA 3ff0e0, TURQUOISE 2de2c8, GLACIER 8fe3ff, SEAFOAM 6ff7d2, POOL 30c6ff, COBALT 3d86ff, SKY 59b8ff,
AZURE 3fa9ff, DENIM 5b8cff, CORNFLOWER 7a9dff, PERIWINKLE 9aa5ff, SAPPHIRE 4a78ff, ARCTIC 7fd4ff, AMETHYST 8b5cff,
ORCHID e02bff, LAVENDER b48cff, LILAC c9a2ff, GRAPE 9f4dff, IRIS 7f6bff, PLUM c45cd6, MAUVE d68fd6, FUCHSIA ff3fd1,
NEBULA b05cff, SILVER c8ccd6, SAND e8c88a, CARAMEL d9a066, ASH a9adb8, PEACH ffbe98, MANGO ffb627, OLIVE b8c43a,
PINE 3fbf7f, OCEAN 2f9bff, BERRY d6336c, CANDY ff66b3, SUNSET ff6b3d, LAVA ff4d1a, CLAY e07b5f, STORM 8fa3c2
`;

export const COLORS = Object.fromEntries(
  RAW.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [n, h] = x.split(/\s+/); return [n, '#' + h]; }),
);

const lab = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92));
  const X = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047, Y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, Z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
// 고르기 화면 순서: 빨강부터 색상환을 따라 돌고, 채도가 낮은 색(은색·모래 등)은 맨 끝에 밝기 순으로
export const COLOR_ORDER = Object.keys(COLORS).map((name) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(COLORS[name].slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let h = 0;
  if (c) h = mx === r ? ((g - b) / c + 6) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return { name, key: c / mx < 0.3 ? 100 + (1 - mx) : (h + 0.15) % 6 }; // 0.15: 분홍빛 빨강까지 빨강 무리 맨 앞에 둔다
}).sort((x, y) => x.key - y.key).map((x) => x.name);
export const colorDistance = (a, b) => { const p = lab(COLORS[a]), q = lab(COLORS[b]); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export const MIN_PAIR_DISTANCE = 55;

// 두 색이 판 위에서 구별될 만큼 다른 짝만 고른다. rnd는 0~1 난수 함수.
export function randomPair(rnd = Math.random) {
  const names = Object.keys(COLORS);
  for (;;) {
    const a = names[Math.floor(rnd() * names.length)], b = names[Math.floor(rnd() * names.length)];
    if (a !== b && colorDistance(a, b) >= MIN_PAIR_DISTANCE) return [a, b];
  }
}
