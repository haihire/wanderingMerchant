// functions.js
import {
  API_BASE,
  $btn,
  $list,
  $serverList,
  $time,
  SERVER_NAMES,
  Storage,
  STORAGE_KEY_NOTIFY,
  TIME_PERIODS,
  WAITING_PERIODS,
} from "./env.js";
// 변경상수들은 여기서
let merchantDataCache = null;
let beforeReportIds = null;
let currentServer = 3;
export { currentServer };
/** 시간을 초로 변환 */
export function timeToSeconds(h, m, s = 0) {
  return h * 3600 + m * 60 + s;
}
/** 현재 시간이 어느 구간에 속하는지 확인 */
export function getCurrentTimeInfo(now) {
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
export function tick() {
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
export function updateProgressDisplay(timeInfo) {
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
/** MerchantList.json 로드 */
export async function getMerchantData() {
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

//중요한 갱신 부분
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
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export async function renderList(data) {
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
  const merchantData = await getMerchantData(merchantDataCache);
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
export async function refreshNow() {
  const orig = $btn?.querySelector(".refresh-text")?.textContent || "갱신";
  if ($btn) {
    $btn.disabled = true;
    $btn.classList.add("loading");
    const span = $btn.querySelector(".refresh-text");
    if (span) span.textContent = "로딩";
  }

  try {
    const now = new Date();
    const timeInfo = getCurrentTimeInfo(now);

    if (timeInfo && timeInfo.type === "waiting") {
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

export function setServerAndRefresh(server) {
  currentServer = server;
  document.getElementById("currentServerName").textContent =
    SERVER_NAMES[currentServer];
  refreshNow();
}

export function openServerList() {
  if (
    $serverList.style.display === "none" ||
    $serverList.style.display === ""
  ) {
    $serverList.style.display = "block";
  } else {
    $serverList.style.display = "none";
  }
}

export function init() {
  setInterval(tick, 16); // 60fps로 더 자주 호출
  tick();
  $list.innerHTML = "";
  // 서버명은 setServerAndRefresh에서 이미 표시됨
  // refreshNow(); // 중복 호출 제거
  /** 주기적 호출 */
  setInterval(refreshNow, 1 * 60 * 1000); // 1분마다 호출
}

/* ===== 알림 ON/OFF 토글 ===== */
export function initNotifyToggle() {
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
