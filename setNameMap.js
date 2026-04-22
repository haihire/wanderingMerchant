const SET_NAME_ENTRIES = [
  [
    "세구빛",
    ["샨디", "아제나&이난나", "니나브", "카단", "바훈투르", "실리안", "웨이"],
  ],
  [
    "암구빛",
    ["발탄", "일리아칸", "비아키스", "아브렐슈드", "카멘", "쿠크세이튼"],
  ],
  [
    "암바절",
    ["베아트리스", "에스더 루테란", "웨이", "에버그레이스", "페데리코", "미한"],
  ],
  ["토바절", ["가디언 루", "파한", "호동", "객주도사", "월향도사", "수령도사"]],
  [
    "화구빛",
    [
      "샨디",
      "일리아칸",
      "에스더 시엔",
      "부활하는 카제로스",
      "춤추는 쿠크세이튼",
      "교활한 카마인",
    ],
  ],
  [
    "토구빛",
    [
      "가디언 루",
      "에버그레이스",
      "니나브",
      "심연의 방랑자",
      "각성한 진저웨일",
      "유적을 찾은 카단",
    ],
  ],
  [
    "뇌구빛",
    [
      "발탄",
      "에키드나",
      "에스더 루테란",
      "악몽의 아브렐슈드",
      "라제니스를 이끄는 니나브",
      "절망의 카멘",
    ],
  ],
  [
    "토바절",
    [
      "진저웨일",
      "광기를 잃은 쿠크세이튼",
      "찢겨진 발탄",
      "피요르긴을 휘두르는 바훈투르",
      "모르페",
      "악몽의 헬카서스",
    ],
  ],
  [
    "뇌바절",
    [
      "데런 아만",
      "폭풍의 베히모스",
      "전장을 지배하는 아제나",
      "도철을 다루는 웨이",
      "칠흑의 숭배자 킬리네사",
      "타무트",
    ],
  ],
];

function normalizeName(name) {
  return String(name || "")
    .replaceAll(/\s+/g, "")
    .replaceAll(",", "");
}

const ITEM_TO_SET_NAMES = (() => {
  const map = new Map();

  for (const [setName, itemNames] of SET_NAME_ENTRIES) {
    for (const itemName of itemNames) {
      const key = normalizeName(itemName);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, new Set());
      }
      map.get(key).add(setName);
    }
  }

  return map;
})();

export const SET_NAME_TYPES = (() => {
  const set = new Set();
  for (const [setName] of SET_NAME_ENTRIES) {
    set.add(setName);
  }
  return Array.from(set);
})();

export function resolveSetNamesByItemName(itemName) {
  const key = normalizeName(itemName);
  if (!key) return "";

  const setNames = ITEM_TO_SET_NAMES.get(key);
  if (!setNames || setNames.size === 0) return "";

  return Array.from(setNames).join(",");
}
