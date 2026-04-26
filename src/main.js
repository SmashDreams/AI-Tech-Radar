const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { collectLatestItems } = require("./services/sourceCollector");
const { summarizeItems } = require("./services/summarizer");

let mainWindow;
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

async function readConfig() {
  const defaults = {
    deepseekApiKey: cleanSecret(process.env.DEEPSEEK_API_KEY || ""),
    deepseekModel: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    githubToken: cleanSecret(process.env.GITHUB_TOKEN || ""),
    rankingMode: "balanced",
    theme: "aurora",
    hotCandidateLimit: 60,
    lastRefreshAt: ""
  };

  try {
    const raw = await fs.readFile(getConfigPath(), "utf8");
    return normalizeConfig({ ...defaults, ...JSON.parse(raw) });
  } catch {
    return normalizeConfig(defaults);
  }
}

async function writeConfig(nextConfig) {
  const current = await readConfig();
  const safeConfig = {
    ...current,
    ...nextConfig,
    deepseekApiKey: Object.hasOwn(nextConfig, "deepseekApiKey")
      ? cleanSecret(nextConfig.deepseekApiKey)
      : cleanSecret(current.deepseekApiKey),
    githubToken: Object.hasOwn(nextConfig, "githubToken")
      ? cleanSecret(nextConfig.githubToken)
      : cleanSecret(current.githubToken),
    rankingMode: ["hot", "latest", "balanced"].includes(nextConfig.rankingMode)
      ? nextConfig.rankingMode
      : current.rankingMode || "balanced",
    theme: ["aurora", "graphite", "paper", "midnight"].includes(nextConfig.theme)
      ? nextConfig.theme
      : current.theme || "aurora",
    hotCandidateLimit: normalizeHotCandidateLimit(
      Object.hasOwn(nextConfig, "hotCandidateLimit")
        ? nextConfig.hotCandidateLimit
        : current.hotCandidateLimit
    )
  };
  await fs.mkdir(path.dirname(getConfigPath()), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(safeConfig, null, 2));
  return safeConfig;
}

function publicConfig(config) {
  return {
    hasDeepSeekApiKey: Boolean(config.deepseekApiKey),
    deepseekModel: config.deepseekModel,
    hasGithubToken: Boolean(config.githubToken),
    rankingMode: config.rankingMode || "balanced",
    theme: config.theme || "aurora",
    hotCandidateLimit: normalizeHotCandidateLimit(config.hotCandidateLimit),
    lastRefreshAt: config.lastRefreshAt || ""
  };
}

function normalizeConfig(config) {
  return {
    ...config,
    deepseekApiKey: cleanSecret(config.deepseekApiKey || ""),
    githubToken: cleanSecret(config.githubToken || ""),
    deepseekModel: config.deepseekModel === "deepseek-4-flash"
      ? DEFAULT_DEEPSEEK_MODEL
      : config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
    hotCandidateLimit: normalizeHotCandidateLimit(config.hotCandidateLimit),
    lastRefreshAt: config.lastRefreshAt || ""
  };
}

function cleanSecret(value) {
  return String(value || "")
    .replace(/^Bearer\s+/i, "")
    .replace(/[\r\n\t]/g, "")
    .trim();
}

function normalizeHotCandidateLimit(value) {
  const limit = Number(value || 60);
  if (!Number.isFinite(limit)) return 60;
  return Math.min(100, Math.max(20, Math.round(limit)));
}

async function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f7f8f4",
    title: "AI Tech Radar",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("config:get", async () => publicConfig(await readConfig()));

ipcMain.handle("config:save", async (_event, configPatch) => {
  const saved = await writeConfig(configPatch);
  return publicConfig(saved);
});

ipcMain.handle("radar:refresh", async (_event, options = {}) => {
  const startedAt = new Date().toISOString();
  const config = await readConfig();
  const rankingMode = config.rankingMode || "balanced";

  if (rankingMode === "hot" && !config.deepseekApiKey) {
    throw new Error("最热模式需要先配置 DeepSeek API Key，因为需要让模型给候选信息打分。");
  }

  const hotCandidateLimit = normalizeHotCandidateLimit(config.hotCandidateLimit);
  const excludedIds = new Set(options.excludeIds || []);
  const rawItems = await collectLatestItems({
    limit: rankingMode === "hot" ? Math.min(120, hotCandidateLimit + excludedIds.size) : 20,
    githubToken: config.githubToken,
    rankingMode
  });
  const candidates = rankingMode === "hot"
    ? rawItems.filter((item) => !excludedIds.has(item.id) && !excludedIds.has(item.url)).slice(0, hotCandidateLimit)
    : rawItems;

  const summarized = await summarizeItems(candidates, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
    includeHeatScore: rankingMode === "hot"
  });

  const items = rankingMode === "hot"
    ? summarized
      .sort((a, b) => (b.aiHeatScore || 0) - (a.aiHeatScore || 0))
      .slice(0, 20)
    : summarized;
  const finishedAt = new Date().toISOString();
  await writeConfig({ lastRefreshAt: finishedAt });

  return {
    startedAt,
    finishedAt,
    items,
    config: publicConfig({ ...config, lastRefreshAt: finishedAt })
  };
});
