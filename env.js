//env.js

// DOM 요소 캐시
export let $time, $btn, $list, $serverList, $currentServerName;
export function cacheDom() {
  $time = document.getElementById("currentTime");
  $btn = document.getElementById("btnRefresh");
  $list = document.getElementById("list");
  $serverList = document.querySelector(".server-list");
  $currentServerName = document.getElementById("currentServerName");
}

// 환경 변수 및 상수 정의
export const API_BASE = "https://api.korlark.com/lostark/merchant/reports";
export const STORAGE_KEY_NOTIFY = "notifyEnabled";
export const STORAGE_KEY_SET_FILTERS = "setNameFilters";
export const STORAGE_KEY_SELECTED_CARDS = "selectedCards";

export const IS_EXT = typeof chrome !== "undefined" && chrome?.storage?.local;
export const Storage = {
  get(key, cb) {
    if (IS_EXT) return chrome.storage.local.get(key, cb);
    const v = localStorage.getItem(key);
    cb({ [key]: v === null ? true : JSON.parse(v) });
  },
  set(obj, cb) {
    if (IS_EXT) return chrome.storage.local.set(obj, cb);
    for (const k in obj) localStorage.setItem(k, JSON.stringify(obj[k]));
    cb && cb();
  },
};

/** 시간 구간 정의 */
export const TIME_PERIODS = [
  { start: { h: 4, m: 0 }, end: { h: 9, m: 30 }, name: "04:00~09:30" },
  { start: { h: 10, m: 0 }, end: { h: 15, m: 30 }, name: "10:00~15:30" },
  { start: { h: 16, m: 0 }, end: { h: 21, m: 30 }, name: "16:00~21:30" },
  {
    start: { h: 22, m: 0 },
    end: { h: 3, m: 30, nextDay: true },
    name: "22:00~03:30",
    nextDay: true,
  },
];
export const WAITING_PERIODS = [
  {
    start: { h: 9, m: 30 },
    end: { h: 10, m: 0 },
    name: "09:30~10:00 (다음 출현 대기)",
  },
  {
    start: { h: 15, m: 30 },
    end: { h: 16, m: 0 },
    name: "15:30~16:00 (다음 출현 대기)",
  },
  {
    start: { h: 21, m: 30 },
    end: { h: 22, m: 0 },
    name: "21:30~22:00 (다음 출현 대기)",
  },
  {
    start: { h: 3, m: 30 },
    end: { h: 4, m: 0 },
    name: "03:30~04:00 (다음 출현 대기)",
  },
];

export const SERVER_NAMES = {
  1: "루페온",
  6: "카마인",
  4: "아브렐슈드",
  3: "아만",
  5: "카단",
  2: "실리안",
  7: "카제로스",
  8: "니나브",
};
