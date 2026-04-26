const { requestJson } = require("./httpClient");
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

async function summarizeItems(items, { apiKey, model, includeHeatScore = false }) {
  if (!apiKey) {
    return items.map((item) => ({
      ...item,
      summary: "未配置 DeepSeek API Key，暂时只展示原始信息。请在设置中填写 API Key 后刷新。",
      takeaways: []
    }));
  }

  const results = [];
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await summarizeOne(items[index], { apiKey, model, includeHeatScore });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function summarizeOne(item, { apiKey, model, includeHeatScore }) {
  const prompt = [
    "你是一名面向 AI 技术从业者的技术情报分析师。",
    "请用中文总结下面这条最新 AI 技术信息，要求：",
    "1. 用 2 到 3 句话说明它是什么。",
    "2. 给出 2 个最值得关注的技术或产业影响点。",
    includeHeatScore
      ? "3. 给出 0 到 100 的热度分，综合判断技术影响力、产业影响力、社区关注度和信息可信度。"
      : "3. 不要夸张，不要编造原文没有的信息。",
    includeHeatScore ? "4. 不要夸张，不要编造原文没有的信息。" : "",
    "",
    `标题：${item.title}`,
    `来源：${item.source}`,
    `类型：${item.type}`,
    `时间：${item.publishedAt || "未知"}`,
    `热度信号：${item.signals || "未知"}`,
    `链接：${item.url}`,
    `摘要/描述：${item.description || "无"}`
  ].join("\n");

  try {
    const data = await requestDeepSeek({
      apiKey,
      model,
      body: buildSummaryRequest({ model, prompt, includeHeatScore })
    });

    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      ...item,
      summary: parsed.summary || "DeepSeek 返回了空摘要。",
      takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 2) : [],
      aiHeatScore: normalizeHeatScore(parsed.heatScore)
    };
  } catch (error) {
    return {
      ...item,
      summary: `DeepSeek 总结失败：${friendlyDeepSeekError(error.message)}`,
      takeaways: [],
      aiHeatScore: 0
    };
  }
}

async function requestDeepSeek({ apiKey, model, body }) {
  try {
    return await postDeepSeek({ apiKey, body });
  } catch (error) {
    if (isModelNotExist(error) && model !== DEFAULT_DEEPSEEK_MODEL) {
      return postDeepSeek({
        apiKey,
        body: { ...body, model: DEFAULT_DEEPSEEK_MODEL }
      });
    }
    throw error;
  }
}

function postDeepSeek({ apiKey, body }) {
  const cleanApiKey = cleanSecret(apiKey);
  if (!cleanApiKey) {
    throw new Error("DeepSeek API Key 为空，请在设置中填写。");
  }

  return requestJson("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanApiKey}`
    },
    body: JSON.stringify(body)
  });
}

function buildSummaryRequest({ model, prompt, includeHeatScore }) {
  return {
    model,
    temperature: 0.2,
    max_tokens: 420,
    messages: [
      {
        role: "system",
        content: includeHeatScore
          ? "你输出 JSON，格式为 {\"summary\":\"...\",\"takeaways\":[\"...\",\"...\"],\"heatScore\":85}。heatScore 必须是 0 到 100 的数字。"
          : "你输出 JSON，格式为 {\"summary\":\"...\",\"takeaways\":[\"...\",\"...\"]}。"
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  };
}

function isModelNotExist(error) {
  return String(error.message || error).includes("Model Not Exist");
}

function friendlyDeepSeekError(message) {
  if (String(message).includes("Model Not Exist")) {
    return `模型不存在，请在设置中使用 ${DEFAULT_DEEPSEEK_MODEL} 或 DeepSeek 官方支持的模型名。`;
  }
  return message;
}

function cleanSecret(value) {
  return String(value || "")
    .replace(/^Bearer\s+/i, "")
    .replace(/[\r\n\t]/g, "")
    .trim();
}

function normalizeHeatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

module.exports = { summarizeItems };
