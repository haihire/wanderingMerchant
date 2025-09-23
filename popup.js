// popup.js
let merchantDataCache = null;

/* ===== 확장/웹 공통 스토리지 shim ===== */
const IS_EXT = typeof chrome !== "undefined" && chrome?.storage?.local;
const Storage = {
  get(key, cb) {
    // Extension context: use chrome.storage.local; Web context: localStorage
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

const $time = document.getElementById("currentTime");
const $btn = document.getElementById("btnRefresh");
const $list = document.getElementById("list");

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

/** 현재 시간이 어느 구간에 속하는지 확인 */
function getCurrentTimeInfo(now) {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotalMinutes = timeToMinutes(currentHour, currentMinute);

  // 활동 구간 체크
  for (let i = 0; i < TIME_PERIODS.length; i++) {
    const period = TIME_PERIODS[i];
    const startMinutes = timeToMinutes(period.start.h, period.start.m);
    const endMinutes = timeToMinutes(period.end.h, period.end.m);
    const wrapsNextDay = !!(period?.nextDay || period?.end?.nextDay);

    if (wrapsNextDay) {
      if (
        currentTotalMinutes >= startMinutes ||
        currentTotalMinutes <= endMinutes
      ) {
        const totalDuration = 24 * 60 - startMinutes + endMinutes;
        const elapsed =
          currentTotalMinutes >= startMinutes
            ? currentTotalMinutes - startMinutes
            : 24 * 60 - startMinutes + currentTotalMinutes;
        const progress = Math.min((elapsed / totalDuration) * 100, 100);
        const remaining = Math.max(totalDuration - elapsed, 0);

        const nextHour = TIME_PERIODS[0].start.h;
        const nextMinute = TIME_PERIODS[0].start.m;

        return {
          type: "active",
          period,
          progress,
          remainingMinutes: remaining,
          totalMinutes: totalDuration,
          nextSpawn: { h: nextHour, m: nextMinute },
        };
      }
    } else {
      if (
        currentTotalMinutes >= startMinutes &&
        currentTotalMinutes <= endMinutes
      ) {
        const totalDuration = endMinutes - startMinutes;
        const elapsed = currentTotalMinutes - startMinutes;
        const progress = Math.min((elapsed / totalDuration) * 100, 100);
        const remaining = Math.max(totalDuration - elapsed, 0);

        const nextIdx = (i + 1) % TIME_PERIODS.length;
        const nextHour = TIME_PERIODS[nextIdx].start.h;
        const nextMinute = TIME_PERIODS[nextIdx].start.m;

        return {
          type: "active",
          period,
          progress,
          remainingMinutes: remaining,
          totalMinutes: totalDuration,
          nextSpawn: { h: nextHour, m: nextMinute },
        };
      }
    }
  }

  // 대기 구간 체크
  for (let i = 0; i < WAITING_PERIODS.length; i++) {
    const period = WAITING_PERIODS[i];
    const startMinutes = timeToMinutes(period.start.h, period.start.m);
    const endMinutes = timeToMinutes(period.end.h, period.end.m);

    if (
      currentTotalMinutes >= startMinutes &&
      currentTotalMinutes <= endMinutes
    ) {
      const totalDuration = endMinutes - startMinutes; // 30
      const elapsed = currentTotalMinutes - startMinutes;
      const progress = Math.min((elapsed / totalDuration) * 100, 100);
      const remaining = Math.max(totalDuration - elapsed, 0);

      const nextHour = period.end.h;
      const nextMinute = period.end.m;

      return {
        type: "waiting",
        period,
        progress,
        remainingMinutes: remaining,
        totalMinutes: totalDuration,
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
  const { type, progress, remainingMinutes, nextSpawn } = timeInfo;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  const timeRemaining =
    hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;

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
    1
  )}%"></div>
        <div class="progress-text">${progress.toFixed(1)}%</div>
      </div>
    </div>
  `;
}
setInterval(tick, 1000);
tick();

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

/** 리스트 렌더 */
async function renderList(data) {
  $list.innerHTML = "";

  // 대기 구간이면 안내만
  const nowInfo = getCurrentTimeInfo(new Date());
  if (nowInfo && nowInfo.type === "waiting") {
    $list.innerHTML = `<div class="empty-state">현재는 다음 상인을 기다리고 있습니다</div>`;
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    $list.innerHTML = `<div class="empty-state">데이터를 찾을 수 없습니다 잠시 후 다시 시도해주세요</div>`;
    return;
  }

  const currentTime = new Date();

  let reports = null;
  // data 배열을 순회하며 현재 시간이 startTime과 endTime 사이에 있는지 확인
  for (let i = 0; i < data.length; i++) {
    const startTime = new Date(data[i].startTime);
    const endTime = new Date(data[i].endTime);

    // 현재 시간이 시작 시간과 종료 시간 사이에 있는지 확인
    if (currentTime >= startTime && currentTime <= endTime) {
      reports = data[i].reports || null;
    }
  }

  //reports
  if (!reports || reports.length === 0) {
    $list.innerHTML = `<div class="empty-state">현재 데이터를 수집중입니다.</div>`;
    return;
  }

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
      <div>
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

  try {
    const data = await fetchMerchant({
      server: 3,
      before: new Date().toISOString(),
    });
    await renderList(data);
  } catch (e) {
    console.error(e);
    $list.innerHTML = `<div class="error-state">⚠️ 에러 발생: ${escapeHtml(
      String(e.message || e)
    )}</div>`;
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
refreshNow();

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
document.addEventListener("DOMContentLoaded", initNotifyToggle);
