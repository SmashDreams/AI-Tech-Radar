const { requestJson, requestText } = require("./httpClient");

const AI_TERMS = [
  "AI",
  "artificial intelligence",
  "LLM",
  "large language model",
  "agent",
  "multimodal",
  "diffusion",
  "robotics",
  "inference",
  "reasoning"
];

const VENDOR_FEEDS = [
  { source: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { source: "Anthropic", url: "https://www.anthropic.com/news/rss.xml" },
  { source: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  { source: "Meta AI", url: "https://ai.meta.com/blog/rss/" },
  { source: "Microsoft AI", url: "https://blogs.microsoft.com/ai/feed/" }
];

async function collectLatestItems({ limit = 20, githubToken = "", rankingMode = "balanced" } = {}) {
  const tasks = [
    fetchArxiv(),
    fetchGithub(githubToken),
    fetchHackerNews(),
    ...VENDOR_FEEDS.map(fetchFeed)
  ];

  const settled = await Promise.allSettled(tasks);
  const candidates = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return rankAndDedupe(candidates, rankingMode).slice(0, limit);
}

async function fetchArxiv() {
  const query = [
    "cat:cs.AI",
    "cat:cs.LG",
    "cat:cs.CL",
    "cat:cs.CV",
    "all:%22large language model%22",
    "all:%22AI agent%22"
  ].join("+OR+");
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=30&sortBy=submittedDate&sortOrder=descending`;
  const xml = await fetchText(url);
  return parseXmlEntries(xml, "arXiv").map((item) => ({
    ...item,
    type: "paper",
    impact: 7
  }));
}

async function fetchGithub(githubToken) {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10);
  const query = encodeURIComponent(`(LLM OR AI OR "machine learning" OR agent) created:>${since} stars:>80`);
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=30`;
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "ai-tech-radar"
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const json = await requestJson(url, { headers });
  return (json.items || []).map((repo) => ({
    id: `github:${repo.full_name}`,
    title: repo.full_name,
    url: repo.html_url,
    source: "GitHub",
    type: "github",
    publishedAt: repo.created_at || repo.updated_at,
    description: repo.description || "",
    signals: `${repo.stargazers_count || 0} stars, ${repo.forks_count || 0} forks`,
    popularity: Math.log10((repo.stargazers_count || 1) + (repo.forks_count || 0) * 3),
    impact: Math.min(10, 5 + Math.log10((repo.stargazers_count || 1)))
  }));
}

async function fetchHackerNews() {
  const query = encodeURIComponent("(AI OR LLM OR OpenAI OR Anthropic OR model OR agent)");
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&hitsPerPage=30`;
  const json = await requestJson(url);
  return (json.hits || [])
    .filter((hit) => hit.url)
    .map((hit) => ({
      id: `hn:${hit.objectID}`,
      title: hit.title,
      url: hit.url,
      source: "Hacker News",
      type: "community",
      publishedAt: hit.created_at,
      description: hit.story_text || "",
      signals: `${hit.points || 0} points, ${hit.num_comments || 0} comments`,
      popularity: Math.log10((hit.points || 1) + (hit.num_comments || 0) * 3),
      impact: Math.min(10, 4 + Math.log10((hit.points || 1) + (hit.num_comments || 0) * 2))
    }));
}

async function fetchFeed(feed) {
  const xml = await fetchText(feed.url);
  return parseXmlEntries(xml, feed.source).map((item) => ({
    ...item,
    type: "model-release",
    impact: 8
  }));
}

async function fetchText(url, options) {
  return requestText(url, options);
}

function parseXmlEntries(xml, source) {
  const blocks = xml.match(/<entry[\s\S]*?<\/entry>|<item[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block, index) => {
    const title = cleanXml(firstTag(block, "title"));
    const url = cleanXml(firstTag(block, "link")) || linkHref(block);
    const description = cleanXml(firstTag(block, "summary") || firstTag(block, "description") || firstTag(block, "content:encoded"));
    const publishedAt = cleanXml(firstTag(block, "published") || firstTag(block, "updated") || firstTag(block, "pubDate"));
    return {
      id: `${source}:${url || title || index}`,
      title,
      url,
      source,
      publishedAt,
      description,
      signals: source,
      popularity: 1,
      impact: 5
    };
  }).filter((item) => item.title && item.url && looksAiRelated(item));
}

function firstTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? match[1] : "";
}

function linkHref(xml) {
  const match = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

function cleanXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function looksAiRelated(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return AI_TERMS.some((term) => text.includes(term.toLowerCase()));
}

function rankAndDedupe(items, rankingMode = "balanced") {
  const seen = new Set();
  const now = Date.now();
  return items
    .filter((item) => item.title && item.url)
    .map((item) => {
      const ageHours = Math.max(1, (now - Date.parse(item.publishedAt || now)) / 36e5);
      const recency = Math.max(0, 10 - Math.log2(ageHours));
      const impact = item.impact || 5;
      const popularity = item.popularity || 1;
      const score = scoreItem({ impact, popularity, recency }, rankingMode);
      return {
        ...item,
        recency: Number(recency.toFixed(2)),
        popularity: Number(popularity.toFixed(2)),
        score: Number(score.toFixed(2))
      };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = normalizeKey(item.url || item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function scoreItem({ impact, popularity, recency }, rankingMode) {
  if (rankingMode === "latest") {
    return recency * 1.2 + impact * 0.5 + popularity * 0.2;
  }
  if (rankingMode === "hot") {
    return impact * 0.8 + popularity * 1.4 + recency * 0.2;
  }
  return impact * 0.8 + popularity * 0.7 + recency * 0.7;
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
}

module.exports = { collectLatestItems };
