// 테마: 판과 화면 바탕의 분위기(바탕색, 빈 칸, 경계선). 팀 색(colors.js)과 따로 논다.
// 새 테마는 아래 THEMES에 한 덩어리를 추가하면 끝이다. 두 개 이상이 되면 설정 화면에 테마 줄이 저절로 나타난다.
// 넣기 전에 npm test(값 형식·글자 대비 검사)를 돌린다. 배너·카드의 어두운 글자는 팀 색 위에 있어 테마와 무관하다.
//
//   bg      화면·판 바탕(#rrggbb). 대결 끝 어둡게·메뉴 막도 이 색을 쓴다
//   tile    카드·단추 바탕(#rrggbb)
//   ink     바탕 위 글자·아이콘(#rrggbb)
//   empty   주인 없는 칸의 색 [r, g, b](0~255). 칸 밝기(DIM)를 곱해 그린다
//   line    다른 색끼리 맞닿은 경계선 [r, g, b]
//   lock    굳은 칸 경계선 [r, g, b]
//   label   설정 화면에 보이는 이름 { ko, en }
export const THEMES = {
  night: {
    label: { ko: '밤', en: 'Night' },
    bg: '#04040a', tile: '#10101a', ink: '#f4f4f8',
    empty: [20, 20, 28], line: [245, 245, 250], lock: [235, 245, 255],
  },
};

export const DEFAULT_THEME = 'night';
export const themeOf = (key) => THEMES[key] || THEMES[DEFAULT_THEME];
