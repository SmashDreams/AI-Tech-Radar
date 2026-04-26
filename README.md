# AI Tech Radar

![Version](https://img.shields.io/badge/version-v1.0.0-256f8f)
![Electron](https://img.shields.io/badge/Electron-desktop-47848f)
![DeepSeek](https://img.shields.io/badge/DeepSeek-summary%20%26%20scoring-4b6bfb)
![License](https://img.shields.io/badge/license-unset-lightgrey)

AI Tech Radar 是一个桌面端 AI 技术情报工具，用来追踪 AI 领域的重要论文、热门 GitHub 项目、厂商发布和技术社区消息。它不会在启动时自动刷新，用户点击“刷新”后才会抓取数据，并可调用 DeepSeek 对每条消息生成中文摘要。

当前版本：`v1.0.0`

Made by **SmashDreams**

## Highlights

- 桌面端应用，基于 Electron，不是网页前端。
- 支持三种刷新策略：`最新`、`最热`、`均衡`。
- 支持 DeepSeek 单条消息总结。
- `最热` 模式会让 DeepSeek 对候选消息打 `0-100` 热度分。
- 支持本地收藏库，收藏后下次打开仍可查看。
- `最热` 模式会排除已收藏内容，避免重复进入候选评分。
- 支持 4 套配色方案：极光蓝、石墨灰、纸本暖白、午夜紫。
- 记录上次刷新时间。

## Quick Start

```powershell
npm.cmd install
npm.cmd start
```

如果 PowerShell 禁止直接运行 `npm`，请使用 `npm.cmd`。

其他平台通常可以使用：

```bash
npm install
npm start
```

## Requirements

- Node.js
- npm
- DeepSeek API Key，可选但推荐
- GitHub Token，可选，用于提高 GitHub API 限流额度

## Configuration

首次打开应用后，在右上角“设置”中填写：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| DeepSeek API Key | 空 | 用于摘要与最热模式评分 |
| DeepSeek 模型 | `deepseek-v4-flash` | 可改为 DeepSeek 官方支持的模型名 |
| 排序模式 | `均衡` | 可选 `最新`、`最热`、`均衡` |
| 最热候选条数 | `60` | 范围 `20-100`，仅影响最热模式 |
| 配色方案 | `极光蓝` | 可选极光蓝、石墨灰、纸本暖白、午夜紫 |

也可以使用环境变量启动：

```powershell
$env:DEEPSEEK_API_KEY="你的 key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
$env:GITHUB_TOKEN="可选 GitHub token"
npm.cmd start
```

API Key 保存时会自动清理 `Bearer ` 前缀、换行、Tab 和前后空格，避免请求头报错。

## Data Sources

应用不是用浏览器自动化爬页面，而是优先使用公开 API、RSS、Atom 和结构化接口抓取数据。

| 类型 | 技术/接口 | 说明 |
| --- | --- | --- |
| 论文 | arXiv API | 使用 `https://export.arxiv.org/api/query` 抓取 AI、ML、NLP、CV、LLM 相关论文 |
| GitHub 项目 | GitHub Search API | 使用 `https://api.github.com/search/repositories` 搜索近期创建且有 star 门槛的 AI 项目 |
| 技术社区 | Hacker News Algolia API | 使用 `https://hn.algolia.com/api/v1/search_by_date` 搜索 AI、LLM、模型、agent 等关键词 |
| 厂商发布 | RSS / Atom | 抓取 OpenAI、Anthropic、Google AI、Meta AI、Microsoft AI 等公开 feed |
| AI 分析 | DeepSeek Chat Completions API | 对消息生成中文摘要、关注点；最热模式下额外生成热度分 |

相关实现：

- `src/services/sourceCollector.js`：数据抓取、本地去重和排序
- `src/services/httpClient.js`：Node `http` / `https` 请求封装
- `src/services/summarizer.js`：DeepSeek 总结与热度评分

## Modes

三种模式是“刷新策略”，不是前端分类筛选。

### 最新

固定获取 20 条数据，更偏向最近发布的信息。

当前本地排序公式：

```js
score = recency * 1.2 + impact * 0.5 + popularity * 0.2;
```

适合快速查看最近发生了什么。

### 均衡

固定获取 20 条数据，同时考虑发布时间、来源影响力和社区热度。

当前本地排序公式：

```js
score = impact * 0.8 + popularity * 0.7 + recency * 0.7;
```

这是默认模式，适合日常查看。

### 最热

先抓取候选，再让 DeepSeek 逐条评分，最后展示前 20 条。

流程：

1. 按设置中的“最热候选条数”抓取候选，默认 60。
2. 排除已收藏的消息。
3. 对每条候选调用 DeepSeek。
4. DeepSeek 返回中文摘要、关注点和 `heatScore`。
5. 按 `heatScore` 从高到低排序。
6. 展示前 20 条。

最热模式必须配置 DeepSeek API Key，否则不会刷新。

## Tuning

### 在应用中调整

普通用户推荐直接在右上角“设置”里调整：

- `排序模式`：最新、最热、均衡
- `最热候选条数`：20 到 100
- `DeepSeek 模型`：默认 `deepseek-v4-flash`
- `配色方案`

`最热候选条数` 越大，覆盖面越广，但 DeepSeek API 调用次数也越多。

### 调整抓取来源和关键词

修改：

```text
src/services/sourceCollector.js
```

常见位置：

- `AI_TERMS`：控制 RSS/Atom 内容是否算 AI 相关。
- `VENDOR_FEEDS`：控制厂商 feed 来源。
- `fetchArxiv()`：控制 arXiv 查询分类和关键词。
- `fetchGithub()`：控制 GitHub 搜索条件，例如创建时间、star 门槛、关键词。
- `fetchHackerNews()`：控制 HN 搜索关键词。

### 调整三种模式权重

本地排序公式在：

```text
src/services/sourceCollector.js
```

函数：

```js
function scoreItem({ impact, popularity, recency }, rankingMode) {
  if (rankingMode === "latest") {
    return recency * 1.2 + impact * 0.5 + popularity * 0.2;
  }
  if (rankingMode === "hot") {
    return impact * 0.8 + popularity * 1.4 + recency * 0.2;
  }
  return impact * 0.8 + popularity * 0.7 + recency * 0.7;
}
```

字段含义：

- `recency`：时间新鲜度，越新越高。
- `impact`：基础影响力，来自来源类型或 star/讨论量。
- `popularity`：社区热度，例如 GitHub stars/forks、HN points/comments。

### 调整 DeepSeek 评分提示词

DeepSeek 的总结和热度评分提示词在：

```text
src/services/summarizer.js
```

如果希望最热模式更偏“工程实用性”“投资价值”“论文影响力”或“开源项目潜力”，可以修改 `summarizeOne()` 中的 prompt 和 `heatScore` 说明。

## Deduplication And Favorites

抓取阶段会根据 URL 或标题归一化去重，避免同一条内容在同次刷新中重复出现。

收藏库使用 IndexedDB 保存完整消息对象，包括：

- 标题
- 来源
- 类型
- 原文链接
- 发布时间
- 原始描述
- DeepSeek 摘要
- DeepSeek 关注点
- 最热模式下的 `aiHeatScore`
- 收藏时间

最热模式刷新时，应用会把收藏库中的 ID 和 URL 传给主进程，主进程会在送入 DeepSeek 评分前排除这些内容。

## Project Structure

```text
src/
  main.js                    Electron 主进程、配置读写、刷新入口
  preload.js                 IPC 安全桥接
  services/
    httpClient.js            Node http/https 请求封装
    sourceCollector.js       数据源抓取、本地去重和排序
    summarizer.js            DeepSeek 总结与热度评分
  renderer/
    index.html               桌面应用界面结构
    app.js                   前端交互、设置、收藏库、视图切换
    styles.css               主题与布局样式
scripts/
  start-electron.js          启动 Electron，并清理影响开发模式的环境变量
```

## Release

`v1.0.0` 是当前第一个稳定源码版本。源码方式运行：

```bash
npm install
npm start
```

生成 Windows 可运行 exe 目录：

```powershell
npm.cmd run dist
```

产物会输出到：

```text
release/
```

默认命令会生成：

```text
release/win-unpacked/AI Tech Radar.exe
```

发布给他人时，需要把整个 `win-unpacked` 文件夹一起压缩分发，不能只复制单个 exe。

如果需要生成安装版和便携版 exe，可以运行：

```powershell
npm.cmd run dist:installer
```

安装版会额外下载 NSIS 构建工具，网络不稳定时可能失败。`release/` 已在 `.gitignore` 中，不会被提交到仓库。

## Notes

- 最热模式会消耗较多 DeepSeek API 调用，候选条数越高成本越高。
- GitHub 匿名接口有较低限流；如果频繁刷新，建议配置 `GITHUB_TOKEN`。
- 应用启动不会自动刷新，需要手动点击“刷新”。
- 最热模式下，已收藏内容不会再次进入候选评分。
- API Key、收藏库和设置都保存在用户本机，不会随仓库上传。
