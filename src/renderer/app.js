const state = {
  items: [],
  favorites: new Map(),
  filter: "all",
  view: "radar",
  config: null,
  loading: false
};

const feed = document.querySelector("#feed");
const favoriteCount = document.querySelector("#favoriteCount");
const statusText = document.querySelector("#statusText");
const itemCount = document.querySelector("#itemCount");
const rankingModeLabel = document.querySelector("#rankingModeLabel");
const modelName = document.querySelector("#modelName");
const lastRefresh = document.querySelector("#lastRefresh");
const refreshButton = document.querySelector("#refreshButton");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const apiKeyInput = document.querySelector("#apiKeyInput");
const apiKeyHint = document.querySelector("#apiKeyHint");
const modelInput = document.querySelector("#modelInput");
const githubTokenInput = document.querySelector("#githubTokenInput");
const rankingModeInput = document.querySelector("#rankingModeInput");
const hotCandidateLimitInput = document.querySelector("#hotCandidateLimitInput");
const themeInput = document.querySelector("#themeInput");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const cancelSettingsButton = document.querySelector("#cancelSettingsButton");

const typeLabels = {
  paper: "论文",
  github: "GitHub",
  "model-release": "模型/厂商",
  community: "社区"
};

const rankingLabels = {
  balanced: "均衡",
  latest: "最新",
  hot: "最热"
};

const themeLabels = {
  aurora: "极光蓝",
  graphite: "石墨灰",
  paper: "纸本暖白",
  midnight: "午夜紫"
};

async function init() {
  state.favorites = await loadFavorites();
  state.config = await window.techRadar.getConfig();
  renderConfig();
  bindEvents();
  statusText.textContent = "选择排序模式后点击刷新获取 AI 技术动态";
  feed.innerHTML = `<div class="empty">点击右上角“刷新”开始获取信息。最热模式会抓取自定义数量的候选，并要求配置 DeepSeek API Key。</div>`;
}

function bindEvents() {
  refreshButton.addEventListener("click", refresh);
  settingsButton.addEventListener("click", openSettings);
  settingsForm.addEventListener("submit", saveSettings);
  cancelSettingsButton.addEventListener("click", () => settingsDialog.close());
  feed.addEventListener("click", handleFeedClick);
  document.querySelectorAll("[data-view]").forEach((trigger) => {
    trigger.addEventListener("click", () => setView(trigger.dataset.view));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setView(trigger.dataset.view);
      }
    });
  });
  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
      renderFeed();
    });
  });
}

function setView(view) {
  state.view = view === "favorites" ? "favorites" : "radar";
  document.querySelectorAll(".view-button").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === state.view);
  });
  document.querySelector(".filters").hidden = state.view === "favorites";
  statusText.textContent = state.view === "favorites"
    ? "正在查看已收藏的 AI 技术消息"
    : "正在查看 AI 技术雷达";
  renderConfig();
  renderFeed();
}

async function refresh() {
  if (state.loading) return;
  if (state.config?.rankingMode === "hot" && !state.config?.hasDeepSeekApiKey) {
    statusText.textContent = "最热模式需要先在设置中填写 DeepSeek API Key";
    openSettings();
    return;
  }

  state.loading = true;
  refreshButton.disabled = true;
  const hotCandidateLimit = state.config?.hotCandidateLimit || 60;
  statusText.textContent = state.config?.rankingMode === "hot"
    ? `正在抓取 ${hotCandidateLimit} 条候选，并让 DeepSeek 逐条打分...`
    : "正在获取 AI 技术动态，并调用 DeepSeek 逐条总结...";
  feed.innerHTML = skeletons();

  try {
    const result = await window.techRadar.refresh({
      excludeIds: state.config?.rankingMode === "hot" ? favoriteIds() : []
    });
    state.items = result.items || [];
    state.config = result.config;
    lastRefresh.textContent = formatTime(result.finishedAt);
    statusText.textContent = state.config.hasDeepSeekApiKey
      ? "已完成最新技术动态总结"
      : "已获取信息；配置 DeepSeek API Key 后可生成摘要";
    renderConfig();
    renderFeed();
  } catch (error) {
    statusText.textContent = `刷新失败：${error.message}`;
    feed.innerHTML = `<div class="empty">网络或接口暂时不可用，请稍后重试。</div>`;
  } finally {
    state.loading = false;
    refreshButton.disabled = false;
  }
}

function openSettings() {
  apiKeyInput.value = "";
  githubTokenInput.value = "";
  apiKeyInput.placeholder = state.config?.hasDeepSeekApiKey ? "已保存，输入新 Key 可替换" : "sk-...";
  apiKeyHint.textContent = state.config?.hasDeepSeekApiKey
    ? "当前已有 API Key，留空会继续保留"
    : "尚未保存 API Key";
  modelInput.value = normalizeModelName(state.config?.deepseekModel || "deepseek-v4-flash");
  rankingModeInput.value = state.config?.rankingMode || "balanced";
  hotCandidateLimitInput.value = state.config?.hotCandidateLimit || 60;
  themeInput.value = state.config?.theme || "aurora";
  settingsDialog.showModal();
}

async function saveSettings(event) {
  event.preventDefault();
  saveSettingsButton.disabled = true;
  const patch = {
    deepseekModel: normalizeModelName(modelInput.value.trim() || "deepseek-v4-flash"),
    rankingMode: rankingModeInput.value,
    hotCandidateLimit: Number(hotCandidateLimitInput.value || 60),
    theme: themeInput.value
  };
  if (apiKeyInput.value.trim()) patch.deepseekApiKey = apiKeyInput.value.trim();
  if (githubTokenInput.value.trim()) patch.githubToken = githubTokenInput.value.trim();

  try {
    state.config = await window.techRadar.saveConfig(patch);
    statusText.textContent = state.config.hasDeepSeekApiKey
      ? "设置已保存，DeepSeek API Key 已就绪"
      : "设置已保存；最热模式仍需要 DeepSeek API Key";
    settingsDialog.close();
    renderConfig();
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function renderConfig() {
  const visibleCount = state.view === "favorites" ? state.favorites.size : state.items.length;
  itemCount.textContent = String(visibleCount);
  favoriteCount.textContent = String(state.favorites.size);
  document.body.dataset.theme = state.config?.theme || "aurora";
  rankingModeLabel.textContent = rankingLabels[state.config?.rankingMode] || "均衡";
  modelName.textContent = state.config?.hasDeepSeekApiKey
    ? state.config.deepseekModel
    : "未配置";
  lastRefresh.textContent = state.config?.lastRefreshAt
    ? formatTime(state.config.lastRefreshAt)
    : "尚未刷新";
}

function favoriteIds() {
  return Array.from(state.favorites.values()).flatMap((item) => {
    const ids = [itemId(item)];
    if (item.url) ids.push(item.url);
    return ids;
  });
}

function normalizeModelName(model) {
  return model === "deepseek-4-flash" ? "deepseek-v4-flash" : model;
}

function renderFeed() {
  if (state.view === "favorites") {
    const favorites = Array.from(state.favorites.values())
      .sort((a, b) => Date.parse(b.favoritedAt || 0) - Date.parse(a.favoritedAt || 0));
    itemCount.textContent = String(favorites.length);
    favoriteCount.textContent = String(favorites.length);

    if (!favorites.length) {
      feed.innerHTML = `<div class="empty">收藏库暂无内容。遇到值得继续跟进的消息时，点击卡片右上角的收藏即可保存。</div>`;
      return;
    }

    feed.innerHTML = favorites.map(renderCard).join("");
    return;
  }

  const items = state.filter === "all"
    ? state.items
    : state.items.filter((item) => item.type === state.filter);
  itemCount.textContent = String(items.length);
  favoriteCount.textContent = String(state.favorites.size);

  if (!items.length) {
    feed.innerHTML = `<div class="empty">当前分类暂无信息。</div>`;
    return;
  }

  feed.innerHTML = items.map(renderCard).join("");
}

function renderCard(item) {
  const takeaways = (item.takeaways || []).map((text) => `<li>${escapeHtml(text)}</li>`).join("");
  const id = itemId(item);
  const favorited = state.favorites.has(id);
  return `
    <article class="card">
      <div class="card-main">
        <div class="meta">
          <span class="tag">${typeLabels[item.type] || item.type}</span>
          <span>${escapeHtml(item.source || "未知来源")}</span>
          <span>${formatTime(item.publishedAt)}</span>
          <span>${scoreLabel(item)}</span>
        </div>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="summary">${escapeHtml(item.summary || item.description || "暂无摘要")}</p>
        ${takeaways ? `<ul>${takeaways}</ul>` : ""}
      </div>
      <aside>
        <button class="favorite-button ${favorited ? "saved" : ""}" data-action="favorite" data-id="${escapeAttribute(id)}" aria-pressed="${favorited}">
          ${favorited ? "已收藏" : "收藏"}
        </button>
        <p>${escapeHtml(item.signals || "")}</p>
        <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">打开原文</a>
      </aside>
    </article>
  `;
}

async function handleFeedClick(event) {
  const button = event.target.closest("[data-action='favorite']");
  if (!button) return;

  const id = button.dataset.id;
  const source = state.view === "favorites"
    ? state.favorites.get(id)
    : state.items.find((item) => itemId(item) === id);
  if (!source) return;

  if (state.favorites.has(id)) {
    await deleteFavorite(id);
    state.favorites.delete(id);
  } else {
    const favorite = {
      ...source,
      id,
      favoritedAt: new Date().toISOString()
    };
    await saveFavorite(favorite);
    state.favorites.set(id, favorite);
  }
  renderFeed();
}

function itemId(item) {
  return item.id || item.url || item.title;
}

function openFavoritesDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ai-tech-radar", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("favorites")) {
        db.createObjectStore("favorites", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFavorites() {
  const db = await openFavoritesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("favorites", "readonly");
    const request = transaction.objectStore("favorites").getAll();
    request.onsuccess = () => resolve(new Map(request.result.map((item) => [item.id, item])));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function saveFavorite(item) {
  const db = await openFavoritesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("favorites", "readwrite");
    transaction.objectStore("favorites").put(item);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteFavorite(id) {
  const db = await openFavoritesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("favorites", "readwrite");
    transaction.objectStore("favorites").delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function scoreLabel(item) {
  if (state.config?.rankingMode === "hot" && item.aiHeatScore) {
    return `DeepSeek 热度 ${Number(item.aiHeatScore).toFixed(0)}`;
  }
  return `score ${Number(item.score || 0).toFixed(1)}`;
}

function skeletons() {
  return Array.from({ length: 6 }, () => `
    <article class="card loading">
      <div class="line short"></div>
      <div class="line title"></div>
      <div class="line"></div>
      <div class="line"></div>
    </article>
  `).join("");
}

function formatTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

init();
