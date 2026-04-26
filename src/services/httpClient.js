const http = require("node:http");
const https = require("node:https");

function requestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "http:" ? http : https;
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Length"]) {
      headers["Content-Length"] = Buffer.byteLength(options.body);
    }
    const request = transport.request(target, {
      method: options.method || "GET",
      headers
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const nextUrl = new URL(response.headers.location, target).toString();
        response.resume();
        requestText(nextUrl, options).then(resolve, reject);
        return;
      }

      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = chunks.join("");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${response.statusCode} ${response.statusMessage}: ${body.slice(0, 180)}`));
          return;
        }
        resolve(body);
      });
    });

    request.setTimeout(options.timeout || 20000, () => {
      request.destroy(new Error(`Request timed out: ${url}`));
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function requestJson(url, options = {}) {
  const text = await requestText(url, options);
  return JSON.parse(text);
}

module.exports = { requestText, requestJson };
