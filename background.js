// background.js (Manifest V3 Service Worker)
const API_BASE = "https://api.korlark.com/lostark/merchant/reports";
const STORAGE_KEY_NOTIFY = "notifyEnabled";
const ALARM_NAME = "period-start-check";

const POLLING_INTERVAL = 60 * 1000; // 1분 간격으로 확인
const MONITORING_DURATION = 5 * 60 * 1000; // 첫 데이터 발견 후 5분 동안만 추가 확인

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
  console.log(
    `[${new Date().toLocaleTimeString()}] API 호출: ${url.toString()}`
  );
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
  const currentTime = new Date();

  const currentSession = data.find((d) => {
    const startTime = new Date(d.startTime);
    const endTime = new Date(d.endTime);
    return currentTime >= startTime && currentTime <= endTime;
  });

  const reports = currentSession ? currentSession.reports : [];

  const hits = [];
  if (reports && reports.length > 0) {
    for (const report of reports) {
      for (const itemId of report.itemIds || []) {
        const found = findItemInMerchantData(merchantData, itemId);
        if (found && found.type === 1 && found.grade === 4) {
          hits.push({
            ...found,
            uniqueId: `${report.id}-${found.id}`,
            regionId: report.regionId,
            reportId: report.id,
            createdAt: report.createdAt,
          });
        }
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

async function scheduleNextPeriodAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  const date = getNextStartFromNow();
  const when = date.getTime();
  console.log(
    `[${new Date().toLocaleTimeString()}] 다음 알람 예약: ${date.toLocaleString()}`
  );
  chrome.alarms.create(ALARM_NAME, { when });
}

async function isNotifyOn() {
  const st = await chrome.storage.local.get(STORAGE_KEY_NOTIFY);
  return st[STORAGE_KEY_NOTIFY] !== false;
}

let pollingTimer = null;
let monitoringTimeoutTimer = null;
let notifiedCardIds = new Set();
let hasFoundInitialData = false;

/* 알람 핸들러 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log(
    `%c[${new Date().toLocaleTimeString()}] 알람 발생: ${alarm.name}`,
    "color: #28a745; font-weight: bold;"
  );

  if (!(await isNotifyOn())) {
    console.log(
      `[${new Date().toLocaleTimeString()}] 알림이 꺼져있어, 작업을 중단합니다.`
    );
    return;
  }

  console.log(
    `[${new Date().toLocaleTimeString()}] 새로운 시간대 시작. 상태를 초기화합니다.`
  );
  notifiedCardIds.clear();
  hasFoundInitialData = false;
  if (pollingTimer) clearInterval(pollingTimer);
  if (monitoringTimeoutTimer) clearTimeout(monitoringTimeoutTimer);

  await scheduleNextPeriodAlarm();

  console.log(
    `[${new Date().toLocaleTimeString()}] 서버 데이터 확인을 위한 폴링을 시작합니다. (1분 간격)`
  );

  const poll = async () => {
    console.log(
      `[${new Date().toLocaleTimeString()}] -> 폴링 실행: 서버에 전설 카드 데이터 요청...`
    );
    try {
      const allHits = await getLegendaryCardsNow();
      console.log(
        `[${new Date().toLocaleTimeString()}] <-- 데이터 수신. 총 ${
          allHits.length
        }개의 전설 카드 발견.`
      );

      if (!hasFoundInitialData && allHits.length > 0) {
        console.log(
          `%c[${new Date().toLocaleTimeString()}] 최초 데이터 발견! 지금부터 5분간 추가 데이터를 모니터링합니다.`,
          "color: orange; font-weight: bold;"
        );
        hasFoundInitialData = true;

        monitoringTimeoutTimer = setTimeout(() => {
          console.log(
            `[${new Date().toLocaleTimeString()}] 모니터링 시간(5분) 종료. 이번 시간대 폴링을 완전히 중단합니다.`
          );
          if (pollingTimer) clearInterval(pollingTimer);
          pollingTimer = null;
        }, MONITORING_DURATION);
      }

      const newHits = allHits.filter(
        (hit) => !notifiedCardIds.has(hit.uniqueId)
      );

      if (newHits.length > 0) {
        console.log(
          `%c[${new Date().toLocaleTimeString()}] *** 새로운 카드 ${
            newHits.length
          }개 발견! ***`,
          "color: #007bff; font-weight: bold;"
        );
        const title = "🃏 새로운 전설 카드 출현!";
        const msg = newHits
          .map((hit) => `${hit.name} - 지역: ${hit.regionName}`)
          .join("\n");

        console.log(
          `[${new Date().toLocaleTimeString()}] 알림 생성: ${msg.replace(
            "\n",
            " | "
          )}`
        );
        chrome.notifications.create(`notification_${Date.now()}`, {
          type: "basic",
          iconUrl: "icons/icon_128.png",
          title,
          message: msg,
          priority: 2,
        });

        newHits.forEach((hit) => notifiedCardIds.add(hit.uniqueId));
        console.log(
          `[${new Date().toLocaleTimeString()}] 알림 보낸 카드 ID 기록:`,
          newHits.map((h) => h.uniqueId)
        );
      }
    } catch (e) {
      console.warn("폴링 중 오류 발생:", e);
    }
  };

  poll();
  pollingTimer = setInterval(poll, POLLING_INTERVAL);
});

/* 스위치 변경 반영 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (STORAGE_KEY_NOTIFY in changes) {
    const enabled = changes[STORAGE_KEY_NOTIFY].newValue !== false;
    console.log(
      `[${new Date().toLocaleTimeString()}] 알림 설정 변경됨: ${
        enabled ? "ON" : "OFF"
      }`
    );
    if (enabled) {
      await scheduleNextPeriodAlarm();
    } else {
      await chrome.alarms.clear(ALARM_NAME);
      if (pollingTimer) clearInterval(pollingTimer);
      if (monitoringTimeoutTimer) clearTimeout(monitoringTimeoutTimer);
    }
  }
});

/* 설치/시작 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log(
    `[${new Date().toLocaleTimeString()}] 확장 프로그램 설치됨/업데이트됨.`
  );
  const st = await chrome.storage.local.get(STORAGE_KEY_NOTIFY);
  if (typeof st[STORAGE_KEY_NOTIFY] === "undefined") {
    await chrome.storage.local.set({ [STORAGE_KEY_NOTIFY]: true });
  }
  if (await isNotifyOn()) await scheduleNextPeriodAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log(`[${new Date().toLocaleTimeString()}] 브라우저 시작됨.`);
  if (await isNotifyOn()) await scheduleNextPeriodAlarm();
});
