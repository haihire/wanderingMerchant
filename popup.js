// popup.js

// 페이지가 확장 프로그램 팝업으로 실행되었는지 확인
if (window.location.protocol === "chrome-extension:") {
  document.body.classList.add("is-extension");
}

let merchantDataCache = null;

/* ===== 확장/웹 공통 스토리지 shim ===== */
const IS_EXT = typeof chrome !== "undefined" && chrome?.storage?.local;
const Storage = {
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
let currentServer = 3;
if (IS_EXT) {
  chrome.storage?.local?.get("currentServer", (st) => {
    if (st && st.currentServer) {
      currentServer = st.currentServer;
      document.getElementById("currentServerName").textContent =
        SERVER_NAMES[currentServer];
      refreshNow();
    }
  });
} else {
  const lsServer = localStorage.getItem("currentServer");
  if (lsServer) {
    currentServer = parseInt(lsServer, 10);
    document.getElementById("currentServerName").textContent =
      SERVER_NAMES[currentServer];
    refreshNow();
  }
}

//크롬이 아니라면
const $time = document.getElementById("currentTime");
const $btn = document.getElementById("btnRefresh");
const $list = document.getElementById("list");

const $serverList = document.querySelector(".server-list");
const $currentServerName = document.getElementById("currentServerName");
const SERVER_NAMES = {
  1: "루페온",
  6: "카마인",
  4: "아브렐슈드",
  3: "아만",
  5: "카단",
  2: "실리안",
  7: "카제로스",
  8: "니나브",
};
/** 시간 구간 정의 */
const TIME_PERIODS = [
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

const WAITING_PERIODS = [
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

/** 시간을 분으로 변환 */
function timeToMinutes(h, m) {
  return h * 60 + m;
}
/** 시간을 초로 변환 */
function timeToSeconds(h, m, s = 0) {
  return h * 3600 + m * 60 + s;
}

/** 현재 시간이 어느 구간에 속하는지 확인 */
function getCurrentTimeInfo(now) {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();
  const currentTotalSeconds = timeToSeconds(
    currentHour,
    currentMinute,
    currentSecond
  );

  // 활동 구간 체크
  for (let i = 0; i < TIME_PERIODS.length; i++) {
    const period = TIME_PERIODS[i];
    const startSeconds = timeToSeconds(period.start.h, period.start.m);
    const endSeconds = timeToSeconds(period.end.h, period.end.m);
    const wrapsNextDay = !!(period?.nextDay || period?.end?.nextDay);

    if (wrapsNextDay) {
      if (
        currentTotalSeconds >= startSeconds ||
        currentTotalSeconds <= endSeconds
      ) {
        const totalDuration = 24 * 3600 - startSeconds + endSeconds;
        const elapsed =
          currentTotalSeconds >= startSeconds
            ? currentTotalSeconds - startSeconds
            : 24 * 3600 - startSeconds + currentTotalSeconds;
        const progress = Math.min((elapsed / totalDuration) * 100, 100);
        const remaining = Math.max(totalDuration - elapsed, 0);

        const nextHour = TIME_PERIODS[0].start.h;
        const nextMinute = TIME_PERIODS[0].start.m;

        return {
          type: "active",
          period,
          progress,
          remainingSeconds: remaining,
          totalSeconds: totalDuration,
          nextSpawn: { h: nextHour, m: nextMinute },
        };
      }
    } else {
      if (
        currentTotalSeconds >= startSeconds &&
        currentTotalSeconds <= endSeconds
      ) {
        const totalDuration = endSeconds - startSeconds;
        const elapsed = currentTotalSeconds - startSeconds;
        const progress = Math.min((elapsed / totalDuration) * 100, 100);
        const remaining = Math.max(totalDuration - elapsed, 0);

        const nextIdx = (i + 1) % TIME_PERIODS.length;
        const nextHour = TIME_PERIODS[nextIdx].start.h;
        const nextMinute = TIME_PERIODS[nextIdx].start.m;

        return {
          type: "active",
          period,
          progress,
          remainingSeconds: remaining,
          totalSeconds: totalDuration,
          nextSpawn: { h: nextHour, m: nextMinute },
        };
      }
    }
  }

  // 대기 구간 체크
  for (let i = 0; i < WAITING_PERIODS.length; i++) {
    const period = WAITING_PERIODS[i];
    const startSeconds = timeToSeconds(period.start.h, period.start.m);
    const endSeconds = timeToSeconds(period.end.h, period.end.m);

    if (
      currentTotalSeconds >= startSeconds &&
      currentTotalSeconds <= endSeconds
    ) {
      const totalDuration = endSeconds - startSeconds;
      const elapsed = currentTotalSeconds - startSeconds;
      const progress = Math.min((elapsed / totalDuration) * 100, 100);
      const remaining = Math.max(totalDuration - elapsed, 0);

      const nextHour = period.end.h;
      const nextMinute = period.end.m;

      return {
        type: "waiting",
        period,
        progress,
        remainingSeconds: remaining,
        totalSeconds: totalDuration,
        nextSpawn: { h: nextHour, m: nextMinute },
      };
    }
  }

  return null;
}

/** 현재시간과 프로그레스 바 표시 */
function tick() {
  const now = new Date();
  const timeInfo = getCurrentTimeInfo(now);

  if (timeInfo) {
    updateProgressDisplay(timeInfo);
  } else {
    const pad = (n) => String(n).padStart(2, "0");
    $time.innerHTML = `<div class="time-display">${pad(now.getHours())}:${pad(
      now.getMinutes()
    )}:${pad(now.getSeconds())}</div>`;
  }
}

/** 프로그레스 바 UI 업데이트 */
function updateProgressDisplay(timeInfo) {
  const { type, progress, remainingSeconds, nextSpawn } = timeInfo;
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  const timeRemaining =
    hours > 0
      ? `${hours}시간 ${minutes}분 ${seconds}초`
      : minutes > 0
      ? `${minutes}분 ${seconds}초`
      : `${seconds}초`;

  const progressBarClass =
    type === "waiting" ? "progress-waiting" : "progress-active";

  const pad = (n) => String(n).padStart(2, "0");
  const nextHour = nextSpawn ? pad(nextSpawn.h) : "--";
  const nextMinute = nextSpawn ? pad(nextSpawn.m) : "00";

  $time.innerHTML = `
    <div class="progress-container">
      <div class="progress-info">
        <div class="time-remaining">다음 출현 예정: ${nextHour}시${
    nextMinute !== "00" ? nextMinute + "분" : ""
  }</div>
        <div class="time-remaining">${
          type === "waiting" ? "다음 구매 시간" : "남은 구매 시간"
        }: ${timeRemaining}</div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${progressBarClass}" style="width: ${progress.toFixed(
    2
  )}%"></div>
        <div class="progress-text">${progress.toFixed(2)}%</div>
      </div>
    </div>
  `;
}

/* ===== 데이터 로딩/렌더 ===== */
const API_BASE = "https://api.korlark.com/lostark/merchant/reports";

/** MerchantList.json 로드 */
async function getMerchantData() {
  if (merchantDataCache) return merchantDataCache;
  try {
    const response = await fetch("./MerchantList.json");
    if (!response.ok)
      throw new Error(`Failed to load MerchantList data: ${response.status}`);
    merchantDataCache = await response.json();
    return merchantDataCache;
  } catch (e) {
    console.error("Error loading MerchantList data:", e);
    return null;
  }
}

/** API 호출: server=3, before=now(UTC) */
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

/** MerchantList.json에서 itemId 매칭 */
function findItemInMerchantData(merchantData, itemId) {
  if (!merchantData) return null;
  const regions = merchantData.initialData?.scheme?.regions || [];
  for (const region of regions) {
    for (const item of region.items || []) {
      if (item.id === itemId) {
        return { ...item, regionName: region.name, npcName: region.npcName };
      }
    }
  }
  return null;
}

let beforeReportIds = null;
/** 리스트 렌더 */
async function renderList(data) {
  if (!Array.isArray(data) || data.length === 0) {
    $list.innerHTML = `<div class="empty-state">데이터를 찾을 수 없습니다 잠시 후 다시 시도해주세요</div>`;
    return;
  }

  const currentTime = new Date();
  const currentSession = data.find((session) => {
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);
    return currentTime >= startTime && currentTime <= endTime;
  });

  const reports = currentSession ? currentSession.reports : null;
  const reportIds = reports ? reports.map((r) => r.id).join(",") : "";
  if (beforeReportIds === reportIds) return;
  //reports
  if (!reports || reports.length === 0) {
    $list.innerHTML = `<div class="empty-state">현재 데이터를 수집중입니다.</div>`;
    return;
  }
  beforeReportIds = reportIds;
  // 전설 카드 필터링
  const merchantData = await getMerchantData();
  const requireItems = [];

  for (const report of reports) {
    for (const itemId of report.itemIds || []) {
      const found = findItemInMerchantData(merchantData, itemId);
      if (found && found.type === 1 && found.grade === 4) {
        requireItems.push({
          ...found,
          regionId: report.regionId,
          reportId: report.id,
          createdAt: report.createdAt,
        });
      }
    }
  }

  if (requireItems.length === 0) {
    $list.innerHTML = `<div class="empty-state">현재 전설 카드가 출현하지 않았습니다</div>`;
    return;
  }

  for (let i = 0; i < requireItems.length; i++) {
    const item = requireItems[i];
    const card = document.createElement("div");
    card.className = "card " + i;
    card.innerHTML = `
      <div class="card-content">
        ${
          item.name
            ? `<div class="card-name">${escapeHtml(item.name)}${
                item.setName ? ` / ${escapeHtml(item.setName)}` : ""
              }</div>`
            : ""
        }
        ${
          item.regionName
            ? `<div class="card-region">${escapeHtml(item.regionName)}</div>`
            : ""
        }
      </div>
    `;
    $list.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function refreshNow() {
  const orig = $btn?.querySelector(".refresh-text")?.textContent || "갱신";
  if ($btn) {
    $btn.disabled = true;
    $btn.classList.add("loading");
    const span = $btn.querySelector(".refresh-text");
    if (span) span.textContent = "로딩";
  }

  const now = new Date();
  const timeInfo = getCurrentTimeInfo(now);

  try {
    if (timeInfo.type === "waiting") {
      $list.innerHTML = `<div class="empty-state">현재는 다음 상인을 기다리고 있습니다</div>`;
      return;
    }
    const data = await fetchMerchant({
      server: currentServer,
      before: new Date().toISOString(),
    });
    await renderList(data);
  } catch (e) {
    console.error(e);
    $list.innerHTML = "";
  } finally {
    if ($btn) {
      $btn.disabled = false;
      $btn.classList.remove("loading");
      const span = $btn.querySelector(".refresh-text");
      if (span) span.textContent = orig;
    }
  }
}

if ($btn) $btn.addEventListener("click", refreshNow);
function openServerList() {
  if (
    $serverList.style.display === "none" ||
    $serverList.style.display === ""
  ) {
    $serverList.style.display = "block";
  } else {
    $serverList.style.display = "none";
  }
}
if ($currentServerName && $serverList) {
  $currentServerName.addEventListener("click", openServerList);
  $serverList.style.display = "none";
}
function init() {
  setInterval(tick, 16); // 60fps로 더 자주 호출
  tick();
  $list.innerHTML = "";
  document.getElementById("currentServerName").textContent =
    SERVER_NAMES[currentServer];
  refreshNow();
  /** 주기적 호출 */
  setInterval(refreshNow, 1 * 60 * 1000); // 1분마다 호출
}
init();
/* ===== 알림 ON/OFF 토글 ===== */
const STORAGE_KEY_NOTIFY = "notifyEnabled";
function initNotifyToggle() {
  const $toggle = document.getElementById("toggleNotify");
  if (!$toggle) return;

  Storage.get(STORAGE_KEY_NOTIFY, (st) => {
    const enabled = st[STORAGE_KEY_NOTIFY];
    $toggle.checked = enabled !== false; // 기본 ON
  });

  $toggle.addEventListener("change", (e) => {
    Storage.set({ [STORAGE_KEY_NOTIFY]: !!e.target.checked });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initNotifyToggle();
  const serverList = document.querySelector(".server-list");
  if (serverList) {
    serverList.querySelectorAll("div").forEach(function (div) {
      div.addEventListener("click", function () {
        if (parseInt(div.id, 10) === currentServer) {
          serverList.style.display = "none";
          return;
        }
        $list.innerHTML = "";
        currentServer = parseInt(div.id, 10);
        document.getElementById("currentServerName").textContent =
          SERVER_NAMES[currentServer];
        if (IS_EXT) {
          chrome.storage?.local?.set({ currentServer });
        } else {
          localStorage.setItem("currentServer", currentServer);
        }

        serverList.style.display = "none";
        refreshNow();
      });
    });
  }
});
