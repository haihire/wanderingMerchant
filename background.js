// background.js (Manifest V3 Service Worker)
const API_BASE = "https://api.korlark.com/lostark/merchant/reports";
const STORAGE_KEY_NOTIFY = "notifyEnabled";
const STORAGE_KEY_LAST_SCHEDULED_MS = "lastScheduledStart";
const ALARM_NAME = "period-start-check";

const TIME_PERIODS = [
  { start: { h: 4, m: 0 }, end: { h: 9, m: 30 }, name: "04:00~09:30" },
  { start: { h: 10, m: 0 }, end: { h: 15, m: 30 }, name: "10:00~15:30" },
  { start: { h: 16, m: 0 }, end: { h: 21, m: 30 }, name: "16:00~21:30" },
  {
    start: { h: 22, m: 0 },
    end: { h: 3, m: 30, nextDay: true },
    name: "22:00~03:30",
  },
];

let merchantDataCache = null;
function pad2(n) {
  return String(n).padStart(2, "0");
}

async function getMerchantData() {
  if (merchantDataCache) return merchantDataCache;
  const url = chrome.runtime.getURL("MerchantList.json");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load MerchantList.json");
  merchantDataCache = await res.json();
  return merchantDataCache;
}

function findItemInMerchantData(merchantData, itemId) {
  if (!merchantData) return null;
  const regions = merchantData?.initialData?.scheme?.regions || [];
  for (const region of regions) {
    for (const item of region.items || []) {
      if (item.id === itemId)
        return { ...item, regionName: region.name, npcName: region.npcName };
    }
  }
  return null;
}

async function fetchMerchant({
  server = 3,
  before = new Date().toISOString(),
} = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set("server", String(server));
  url.searchParams.set("before", before);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
  }
  return res.json();
}

async function getLegendaryCardsNow() {
  const data = await fetchMerchant({
    server: 3,
    before: new Date().toISOString(),
  });
  const merchantData = await getMerchantData();
  const reports =
    Array.isArray(data) && data[0]?.reports ? data[0].reports : [];
  const hits = [];
  for (const report of reports) {
    for (const itemId of report.itemIds || []) {
      const found = findItemInMerchantData(merchantData, itemId);
      if (found && found.type === 1 && found.grade === 4) {
        hits.push({
          ...found,
          regionId: report.regionId,
          reportId: report.id,
          createdAt: report.createdAt,
        });
      }
    }
  }
  return hits;
}

function getNextStartFromNow() {
  const now = new Date();
  let nextDate = null;
  TIME_PERIODS.forEach((p) => {
    const t = new Date(now);
    t.setHours(p.start.h, p.start.m, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    if (!nextDate || t < nextDate) nextDate = t;
  });
  return nextDate;
}

function tagKeyForEpoch(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}_${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function scheduleNextPeriodAlarm() {
  const date = getNextStartFromNow();
  const when = date.getTime();
  const st = await chrome.storage.local.get(STORAGE_KEY_LAST_SCHEDULED_MS);
  if (st[STORAGE_KEY_LAST_SCHEDULED_MS] === when) return;
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { when });
  await chrome.storage.local.set({ [STORAGE_KEY_LAST_SCHEDULED_MS]: when });
  await chrome.storage.local.remove(`notified:${tagKeyForEpoch(when)}`);
}

function notifyOnce({
  title,
  message,
  tagKey,
  iconUrl = "icons/icon_128.png",
}) {
  const key = `notified:${tagKey}`;
  chrome.storage.local.get(key, (st) => {
    if (st[key] === true) return;
    chrome.notifications.create(
      {
        type: "basic",
        iconUrl,
        title,
        message,
        priority: 2,
      },
      () => chrome.storage.local.set({ [key]: true })
    );
  });
}

async function isNotifyOn() {
  const st = await chrome.storage.local.get(STORAGE_KEY_NOTIFY);
  return st[STORAGE_KEY_NOTIFY] !== false; // 기본 ON
}

/* 알람 핸들러 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("Alarm fired:", alarm.name, new Date());
  if (alarm.name !== ALARM_NAME) return;
  if (!(await isNotifyOn())) return;

  try {
    const hits = await getLegendaryCardsNow();
    if (hits.length > 0) {
      const first = hits[0];
      const title = "🃏 전설 카드 출현!";
      const msg = [
        first.name
          ? `${first.name}${first.setName ? ` / ${first.setName}` : ""}`
          : "전설 카드",
        first.regionName ? `지역: ${first.regionName}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const st = await chrome.storage.local.get(STORAGE_KEY_LAST_SCHEDULED_MS);
      const tagKey = st[STORAGE_KEY_LAST_SCHEDULED_MS]
        ? tagKeyForEpoch(st[STORAGE_KEY_LAST_SCHEDULED_MS])
        : `now_${Date.now()}`;
      notifyOnce({ title, message: msg, tagKey });
    }
  } catch (e) {
    // console.warn("legend check failed:", e);
  } finally {
    if (await isNotifyOn()) await scheduleNextPeriodAlarm();
  }
});

/* 스위치 변경 반영 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (STORAGE_KEY_NOTIFY in changes) {
    const enabled = changes[STORAGE_KEY_NOTIFY].newValue !== false;
    if (enabled) await scheduleNextPeriodAlarm();
    else await chrome.alarms.clear(ALARM_NAME);
  }
});

/* 설치/시작 */
chrome.runtime.onInstalled.addListener(async () => {
  const st = await chrome.storage.local.get(STORAGE_KEY_NOTIFY);
  if (typeof st[STORAGE_KEY_NOTIFY] === "undefined") {
    await chrome.storage.local.set({ [STORAGE_KEY_NOTIFY]: true });
  }
  if (await isNotifyOn()) await scheduleNextPeriodAlarm();
});
chrome.runtime.onStartup.addListener(async () => {
  if (await isNotifyOn()) await scheduleNextPeriodAlarm();
});
