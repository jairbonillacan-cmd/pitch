import fs from "fs";

const raw = fs.readFileSync("C:/Users/jairb/.gemini/antigravity/brain/654789f9-4ce5-4569-b2bf-bf4d00ca1a95/.system_generated/steps/58/output.txt", "utf8");
const data = JSON.parse(raw);
const events = data.normalized_result.events.items;
const requests = events.filter(e => e.kind === "request");
const responses = events.filter(e => e.kind === "response");

console.log("Total requests:", requests.length);
const endpoints = new Map();
for (const req of requests) {
  const resp = responses.find(r => r.transaction_id === req.transaction_id);
  const status = resp ? resp.status : "unknown";
  endpoints.set(req.url.url, { method: req.method, status, resource_type: req.resource_type });
}

for (const [url, info] of endpoints.entries()) {
  if (info.resource_type === "fetch" || info.resource_type === "xhr" || url.includes("api")) {
    console.log(`[API] ${info.method} [${info.status}] ${url}`);
  }
}
