// functions.js
import {
  API_BASE,
  $btn,
  $list,
  $serverList,
  Storage,
  STORAGE_KEY_NOTIFY,
  STORAGE_KEY_SELECTED_CARDS,
  SERVER_NAMES,
} from "./env.js";
import { resolveSetNamesByItemName } from "./setNameMap.js";
// 변경상수들은 여기서
let merchantDataCache = null;
let beforeReportIds = null;
let currentServer = 3;
let selectedCardIds = [];
let activeTab = "all"; // 'all' | 'favorites'
let _lastFilteredItems = [];
let allCardItems = [];
export { currentServer };
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

/** 모든 type=1 카드 로드 (자동완성용) */
async function loadAllCardItems() {
  if (allCardItems.length > 0) return allCardItems;
  let data;
  try {
    const res = await fetch("MerchantList.json");
    data = await res.json();
  } catch (err) {
    console.error("MerchantList.json 로드 실패", err);
    return [];
  }
  const regions = data.initialData?.scheme?.regions || [];
  const seen = new Set();
  for (const region of regions) {
    for (const item of region.items || []) {
      if (item.type === 1 && !seen.has(item.name)) {
        seen.add(item.name);
        const setName = resolveSetNamesByItemName(item.name);
        allCardItems.push({ id: item.id, name: item.name, setName });
      }
    }
  }
  return allCardItems;
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
        const setName = item.setName || resolveSetNamesByItemName(item.name);
        return {
          ...item,
          setName,
          regionName: region.name,
          npcName: region.npcName,
        };
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

function getCardSelectionKey(item) {
  return String(item?.id ?? "");
}

function isCardSelected(item) {
  const key = getCardSelectionKey(item);
  return key ? selectedCardIds.includes(key) : false;
}

function setCardSelected(item, selected) {
  const key = getCardSelectionKey(item);
  if (!key) return;
  if (selected) {
    if (!selectedCardIds.includes(key)) {
      selectedCardIds = [...selectedCardIds, key];
    }
  } else {
    selectedCardIds = selectedCardIds.filter((id) => id !== key);
  }
}

function selectedCardsKey(server) {
  return `${STORAGE_KEY_SELECTED_CARDS}_${server}`;
}

function saveSelectedCards() {
  return new Promise((resolve) => {
    Storage.set(
      { [selectedCardsKey(currentServer)]: selectedCardIds },
      resolve,
    );
  });
}

function updateSelectedCardCount(count) {
  const $cnt = document.querySelector(".fav-count");
  if ($cnt) $cnt.textContent = String(count);
}

export function initSetNameFilter() {}

function sortCardsBySelection(items) {
  return [...items].sort((a, b) => {
    const aSelected = isCardSelected(a);
    const bSelected = isCardSelected(b);
    if (aSelected !== bSelected) return aSelected ? -1 : 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });
}

function applySearchAndTab(items) {
  if (activeTab === "favorites") {
    return items.filter((item) => isCardSelected(item));
  }
  return items;
}

function groupAndSortItems(items) {
  const cards = sortCardsBySelection(items.filter((i) => i.type === 1));
  const daily = sortCardsBySelection(items.filter((i) => i.type === 3));
  const quest = sortCardsBySelection(items.filter((i) => i.type === 2));
  const etc = sortCardsBySelection(
    items.filter((i) => i.type !== 1 && i.type !== 2 && i.type !== 3),
  );
  return [...cards, ...daily, ...quest, ...etc];
}

function renderCardItems(filteredItems) {
  _lastFilteredItems = filteredItems;
  const displayItems = applySearchAndTab(filteredItems);
  const orderedItems = groupAndSortItems(displayItems);

  updateSelectedCardCount(selectedCardIds.length);
  $list.innerHTML = "";

  if (orderedItems.length === 0) {
    const msg =
      activeTab === "favorites" && selectedCardIds.length === 0
        ? "즐겨찾기한 아이템이 없습니다"
        : "현재 해당 아이템이 없습니다";
    $list.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  for (let i = 0; i < orderedItems.length; i++) {
    const item = orderedItems[i];
    const selected = isCardSelected(item);
    const typeLabel =
      item.type === 1
        ? "카드"
        : item.type === 2
          ? "퀘스트"
          : item.type === 3
            ? "내실"
            : "";
    const card = document.createElement("button");
    card.type = "button";
    card.className = `card ${i}${selected ? " is-selected" : ""}`;
    card.setAttribute("aria-pressed", selected ? "true" : "false");
    card.innerHTML = `
      <div class="card-content">
        <div class="card-top-row">
          ${
            item.name
              ? `<div class="card-name">${escapeHtml(item.name)}${
                  item.setName ? ` / ${escapeHtml(item.setName)}` : ""
                }</div>`
              : ""
          }
          <div class="card-badges">
            ${typeLabel ? `<span class="card-type-badge type-${item.type}">${typeLabel}</span>` : ""}
            ${selected ? '<span class="card-selected-badge">⭐</span>' : ""}
          </div>
        </div>
        ${
          item.regionName
            ? `<div class="card-region">${escapeHtml(item.regionName)}</div>`
            : ""
        }
      </div>
    `;

    card.addEventListener("click", async () => {
      setCardSelected(item, !isCardSelected(item));
      await saveSelectedCards();
      renderCardItems(_lastFilteredItems);
    });

    $list.appendChild(card);
  }
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

  // 종료 시각 표시
  const $endTime = document.getElementById("sessionEndTime");
  if ($endTime) {
    if (currentSession?.endTime) {
      const end = new Date(currentSession.endTime);
      const hh = String(end.getHours()).padStart(2, "0");
      const mm = String(end.getMinutes()).padStart(2, "0");
      $endTime.textContent = `~${hh}:${mm}`;
    } else {
      $endTime.textContent = "";
    }
  }

  //reports
  if (!reports || reports.length === 0) {
    $list.innerHTML = `<div class="empty-state">현재 데이터를 수집중입니다.</div>`;
    return;
  }
  beforeReportIds = reportIds;
  // 전설 카드 또는 세트 매칭 카드 필터링
  const merchantData = await getMerchantData(merchantDataCache);
  const requireItems = [];

  for (const report of reports) {
    const itemIds =
      typeof report.itemIds === "string"
        ? report.itemIds.split(" ").filter(Boolean)
        : report.itemIds || [];
    for (const itemId of itemIds) {
      const found = findItemInMerchantData(merchantData, itemId);
      if (found) {
        requireItems.push({
          ...found,
          regionId: report.regionId,
          reportId: report.id,
          createdAt: report.createdAt,
        });
      }
    }
  }

  const filteredItems = requireItems;

  if (filteredItems.length === 0) {
    $list.innerHTML = `<div class="empty-state">현재 아이템이 없습니다</div>`;
    return;
  }

  renderCardItems(filteredItems);
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
  const key = selectedCardsKey(currentServer);
  Storage.get(key, (st) => {
    const saved = st[key];
    selectedCardIds = Array.isArray(saved)
      ? saved.map((v) => String(v)).filter(Boolean)
      : [];
    updateSelectedCardCount(selectedCardIds.length);
    refreshNow();
  });
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

export function initSearch() {
  const $input = document.getElementById("cardSearch");
  const $dropdown = document.getElementById("searchDropdown");
  if (!$input || !$dropdown) return;

  async function renderSearchDropdown() {
    const q = $input.value.trim().toLowerCase();
    const cards = await loadAllCardItems();
    const filtered = q
      ? cards.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.setName && c.setName.toLowerCase().includes(q)),
        )
      : cards;
    if (filtered.length === 0) {
      $dropdown.style.display = "none";
      return;
    }
    $dropdown.innerHTML = filtered
      .map((c) => {
        const isFav = selectedCardIds.includes(String(c.id));
        return `<div class="search-drop-item${isFav ? " is-fav" : ""}" data-id="${escapeHtml(c.id)}">
          <span class="drop-item-name">${escapeHtml(c.name)}</span>
          ${c.setName ? `<span class="drop-item-set">${escapeHtml(c.setName)}</span>` : ""}
          <span class="drop-item-badge">${isFav ? "⭐" : "+"}</span>
        </div>`;
      })
      .join("");
    $dropdown.style.display = "block";
    $dropdown.querySelectorAll(".search-drop-item").forEach((el) => {
      el.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        const id = String(el.dataset.id);
        const isFav = selectedCardIds.includes(id);
        if (isFav) {
          selectedCardIds = selectedCardIds.filter((v) => v !== id);
        } else {
          selectedCardIds = [...selectedCardIds, id];
        }
        await saveSelectedCards();
        updateSelectedCardCount(selectedCardIds.length);
        renderCardItems(_lastFilteredItems);
        renderSearchDropdown();
        renderFavoritesDropdownContent();
      });
    });
  }

  $input.addEventListener("focus", renderSearchDropdown);
  $input.addEventListener("input", renderSearchDropdown);
  $input.addEventListener("blur", () => {
    setTimeout(() => {
      $dropdown.style.display = "none";
    }, 150);
  });
}

function renderFavoritesDropdownContent() {
  const $drop = document.getElementById("favoritesDropdown");
  if (!$drop || $drop.style.display === "none") return;
  loadAllCardItems().then((cards) => {
    if (selectedCardIds.length === 0) {
      $drop.innerHTML = '<div class="fav-drop-empty">즐겨찾기가 없습니다</div>';
      return;
    }
    $drop.innerHTML = selectedCardIds
      .map((id) => {
        const card = cards.find((c) => String(c.id) === id);
        const name = card ? escapeHtml(card.name) : id;
        return `<div class="fav-drop-item" data-id="${id}"><span>${name}</span><button class="fav-remove">✕</button></div>`;
      })
      .join("");
    $drop.querySelectorAll(".fav-remove").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = String(btn.closest(".fav-drop-item").dataset.id);
        selectedCardIds = selectedCardIds.filter((v) => v !== id);
        await saveSelectedCards();
        updateSelectedCardCount(selectedCardIds.length);
        renderCardItems(_lastFilteredItems);
        renderFavoritesDropdownContent();
      });
    });
  });
}

export function initFavoritesDropdown() {
  const $btn = document.getElementById("btnFavorites");
  const $drop = document.getElementById("favoritesDropdown");
  if (!$btn || !$drop) return;
  $btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = $drop.style.display !== "none";
    $drop.style.display = isOpen ? "none" : "block";
    if (!isOpen) renderFavoritesDropdownContent();
  });
  document.addEventListener("click", (e) => {
    if (!$btn.contains(e.target) && !$drop.contains(e.target)) {
      $drop.style.display = "none";
    }
  });
}

export function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab || "all";
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      renderCardItems(_lastFilteredItems);
    });
  });
}

export function init() {
  initSetNameFilter();
  initSearch();
  initTabs();
  initFavoritesDropdown();
  const _initKey = selectedCardsKey(currentServer);
  Storage.get(_initKey, (st) => {
    const saved = st[_initKey];
    selectedCardIds = Array.isArray(saved)
      ? saved.map((v) => String(v)).filter(Boolean)
      : [];
    updateSelectedCardCount(selectedCardIds.length);
    if (selectedCardIds.length > 0) {
      activeTab = "favorites";
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.tab === "favorites");
      });
    }
  });
  $list.innerHTML = "";
  setInterval(refreshNow, 1 * 60 * 1000);
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
