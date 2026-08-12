/**
 * Cloudflare Worker — fault-diagnosis-api
 *
 * Serves as a shared data layer for the fault-diagnosis-ui frontend.
 * Replaces browser-local IndexedDB so multiple users see the same data.
 *
 * Deploy:  npx wrangler deploy
 * Schema:  npx wrangler d1 execute fault-diagnosis-db --file=./schema.sql
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard JSON response */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Error response */
function error(message, status = 400) {
  return json({ error: message }, status);
}

/**
 * CORS headers.
 * Set ALLOWED_ORIGIN in wrangler.toml [vars], or it falls back to "*".
 */
function corsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Parse JSON body safely */
async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Map a DB row (snake_case) to app-friendly camelCase */
function mapFaultRow(row) {
  return {
    id: row.id,
    deviceType: row.device_type,
    title: row.title,
    symptoms: safeJson(row.symptoms, []),
    keywords: safeJson(row.keywords, []),
    summary: row.summary,
    severity: row.severity,
    shutdownRequired: Boolean(row.shutdown_required),
    estimatedTime: row.estimated_time,
    causes: safeJson(row.causes, []),
    solutions: safeJson(row.solutions, []),
    diagram: safeJson(row.diagram, []),
    safety: row.safety,
    _images: safeJson(row.images, []),
    createdAt: row.created_at,
  };
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    input: row.input,
    deviceType: row.device_type,
    faultId: row.fault_id,
    title: row.title,
    severity: row.severity,
    matchedKeywords: safeJson(row.matched_keywords, []),
    score: row.score,
    causes: safeJson(row.causes, []),
    solutions: safeJson(row.solutions, []),
    createdAt: row.created_at,
  };
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function toSnakeFault(entry) {
  return {
    id: entry.id,
    device_type: entry.deviceType || "通用",
    title: entry.title,
    symptoms: JSON.stringify(entry.symptoms || []),
    keywords: JSON.stringify(entry.keywords || []),
    summary: entry.summary || "",
    severity: entry.severity || "中",
    shutdown_required: entry.shutdownRequired ? 1 : 0,
    estimated_time: entry.estimatedTime || "",
    causes: JSON.stringify(entry.causes || []),
    solutions: JSON.stringify(entry.solutions || []),
    diagram: JSON.stringify(entry.diagram || []),
    safety: entry.safety || "",
    images: JSON.stringify(entry._images || []),
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** GET /api/faults — list all imported fault entries */
async function listFaults(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM fault_entries ORDER BY created_at DESC"
  ).all();
  return json(results.map(mapFaultRow));
}

/** POST /api/faults — upsert entries */
async function saveFaults(request, env) {
  const body = await parseBody(request);
  if (!Array.isArray(body)) return error("Expected an array of fault entries");

  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO fault_entries
       (id, device_type, title, symptoms, keywords, summary, severity,
        shutdown_required, estimated_time, causes, solutions, diagram,
        safety, images)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`
  );

  // D1 batch limit is 100 statements per call — chunk if needed
  const BATCH_SIZE = 100;
  for (let i = 0; i < body.length; i += BATCH_SIZE) {
    const chunk = body.slice(i, i + BATCH_SIZE).map((entry) => {
      const s = toSnakeFault(entry);
      return stmt.bind(
        s.id, s.device_type, s.title, s.symptoms, s.keywords, s.summary,
        s.severity, s.shutdown_required, s.estimated_time, s.causes,
        s.solutions, s.diagram, s.safety, s.images
      );
    });
    await env.DB.batch(chunk);
  }
  return json({ saved: body.length });
}

/** DELETE /api/faults/:id */
async function deleteFault(id, env) {
  await env.DB.prepare("DELETE FROM fault_entries WHERE id = ?1")
    .bind(decodeURIComponent(id)).run();
  return json({ success: true });
}

/** DELETE /api/faults — clear all imported */
async function clearFaults(env) {
  await env.DB.prepare("DELETE FROM fault_entries").run();
  return json({ success: true });
}

/** GET /api/history — paginated list */
async function listHistory(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit")) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset")) || 0);

  const { results } = await env.DB.prepare(
    "SELECT * FROM diagnosis_history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
  ).bind(limit, offset).all();

  return json(results.map(mapHistoryRow));
}

/** GET /api/history/search?q=...&limit=... */
async function searchHistory(request, env) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").toLowerCase().replace(/\s+/g, "");
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit")) || 50));

  if (!q) return listHistory(request, env);

  // D1 has no full-text search; fetch all and filter server-side.
  // For small datasets this is fine.  Add FTS5 if the dataset grows.
  const { results } = await env.DB.prepare(
    "SELECT * FROM diagnosis_history ORDER BY created_at DESC LIMIT 500"
  ).all();

  const filtered = results
    .filter((r) => {
      const haystack = [r.input, r.title, r.device_type, r.matched_keywords]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, limit);

  return json(filtered.map(mapHistoryRow));
}

/** GET /api/history/count */
async function countHistory(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM diagnosis_history"
  ).first();
  return json({ count: row?.cnt ?? 0 });
}

/** GET /api/history/export */
async function exportHistory(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM diagnosis_history ORDER BY created_at DESC"
  ).all();
  return json(results.map(mapHistoryRow));
}

/** POST /api/history — save one record */
async function saveHistory(request, env) {
  const body = await parseBody(request);
  if (!body || typeof body !== "object") return error("Expected a history record object");

  const { meta } = await env.DB.prepare(
    `INSERT INTO diagnosis_history
       (input, device_type, fault_id, title, severity, matched_keywords,
        score, causes, solutions, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
  ).bind(
    body.input || "",
    body.deviceType || "",
    body.faultId || "",
    body.title || "",
    body.severity || "",
    JSON.stringify(body.matchedKeywords || []),
    body.score || 0,
    JSON.stringify(body.causes || []),
    JSON.stringify(body.solutions || []),
    new Date().toISOString()
  ).run();

  return json({ id: meta?.last_row_id ?? null });
}

/** DELETE /api/history/:id */
async function deleteHistory(id, env) {
  await env.DB.prepare("DELETE FROM diagnosis_history WHERE id = ?1")
    .bind(id).run();
  return json({ success: true });
}

/** DELETE /api/history */
async function clearHistory(env) {
  await env.DB.prepare("DELETE FROM diagnosis_history").run();
  return json({ success: true });
}

/** GET /api/files */
async function listFiles(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM imported_files ORDER BY imported_at DESC"
  ).all();
  return json(
    results.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      importedAt: r.imported_at,
    }))
  );
}

/** POST /api/files */
async function markFile(request, env) {
  const body = await parseBody(request);
  if (!body?.fileName) return error("Expected { fileName }");

  await env.DB.prepare(
    "INSERT OR REPLACE INTO imported_files (file_name, imported_at) VALUES (?1, ?2)"
  ).bind(body.fileName, new Date().toISOString()).run();

  return json({ success: true });
}

/** DELETE /api/files */
async function clearFiles(env) {
  await env.DB.prepare("DELETE FROM imported_files").run();
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Diagnosis & health routes (merged from lively-feather-c694)
// ---------------------------------------------------------------------------

/** GET / — service info */
function serviceInfo() {
  return json({
    service: "GPU 故障诊断 API",
    endpoints: {
      "/": "GET 服务说明",
      "/health": "GET 健康检查",
      "/diagnose": "POST 发送诊断数据",
      "/api/faults": "GET/POST/DELETE 故障知识库",
      "/api/history": "GET/POST/DELETE 诊断历史",
      "/api/history/search": "GET 搜索历史",
      "/api/history/count": "GET 历史总数",
      "/api/history/export": "GET 导出历史",
      "/api/files": "GET/POST/DELETE 文件追踪",
    },
  });
}

/** GET /health — health check */
function healthCheck() {
  return json({ status: "ok", timestamp: new Date().toISOString() });
}

/** POST /diagnose — GPU fault diagnosis */
async function diagnose(request) {
  if (request.method !== "POST") {
    return json({ error: "请使用 POST 方法" }, 405);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== "object") {
    return json({ error: "请求体格式错误，请发送有效的 JSON" }, 400);
  }

  const { error_message, logs, gpu_info } = body;

  const diagnosis = {
    received: {
      error_message: error_message || null,
      logs: logs || null,
      gpu_info: gpu_info || null,
    },
    analysis: [],
    suggestions: [],
    timestamp: new Date().toISOString(),
  };

  // 分析错误信息
  if (error_message) {
    const msg = error_message.toLowerCase();
    if (msg.includes("out of memory") || msg.includes("oom")) {
      diagnosis.analysis.push("检测到显存不足 (OOM) 错误");
      diagnosis.suggestions.push("尝试减小 batch size 或模型尺寸");
      diagnosis.suggestions.push("检查是否有其他进程占用显存");
    }
    if (msg.includes("cuda") || msg.includes("cudnn")) {
      diagnosis.analysis.push("检测到 CUDA 相关错误");
      diagnosis.suggestions.push("确认 CUDA 版本与驱动匹配");
      diagnosis.suggestions.push("尝试重新安装 CUDA 工具包");
    }
    if (msg.includes("timeout") || msg.includes("time out")) {
      diagnosis.analysis.push("检测到超时错误");
      diagnosis.suggestions.push("检查网络连接或增加超时时间");
    }
    if (msg.includes("permission") || msg.includes("access")) {
      diagnosis.analysis.push("检测到权限错误");
      diagnosis.suggestions.push("检查文件或目录权限设置");
    }
    if (msg.includes("not found") || msg.includes("no such")) {
      diagnosis.analysis.push("检测到文件或路径不存在");
      diagnosis.suggestions.push("检查文件路径是否正确");
    }
  }

  if (diagnosis.analysis.length === 0) {
    diagnosis.analysis.push("未识别到明确的错误模式，建议查看完整日志");
    diagnosis.suggestions.push("检查 GPU 驱动是否正常安装");
    diagnosis.suggestions.push("尝试重启服务或系统");
  }

  return json(diagnosis);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ROUTES = [
  // Service info & health
  { method: "GET",    pattern: /^\/$/,                         handler: () => serviceInfo() },
  { method: "GET",    pattern: /^\/health\/?$/,                handler: () => healthCheck() },
  { method: "POST",   pattern: /^\/diagnose\/?$/,              handler: (req) => diagnose(req) },
  { method: "OPTIONS",pattern: /^\/diagnose\/?$/,              handler: () => new Response(null, { status: 204 }) },

  // Fault entries
  { method: "GET",    pattern: /^\/api\/faults\/?$/,           handler: (_, __, env) => listFaults(env) },
  { method: "POST",   pattern: /^\/api\/faults\/?$/,           handler: (req, _, env) => saveFaults(req, env) },
  { method: "DELETE", pattern: /^\/api\/faults\/?$/,           handler: (_, __, env) => clearFaults(env) },
  { method: "DELETE", pattern: /^\/api\/faults\/(.+)$/,        handler: (_, m, env) => deleteFault(m[1], env) },

  // History
  { method: "GET",    pattern: /^\/api\/history\/search\/?$/,  handler: (req, _, env) => searchHistory(req, env) },
  { method: "GET",    pattern: /^\/api\/history\/count\/?$/,   handler: (_, __, env) => countHistory(env) },
  { method: "GET",    pattern: /^\/api\/history\/export\/?$/,  handler: (_, __, env) => exportHistory(env) },
  { method: "GET",    pattern: /^\/api\/history\/?$/,          handler: (req, _, env) => listHistory(req, env) },
  { method: "POST",   pattern: /^\/api\/history\/?$/,          handler: (req, _, env) => saveHistory(req, env) },
  { method: "DELETE", pattern: /^\/api\/history\/?$/,          handler: (_, __, env) => clearHistory(env) },
  { method: "DELETE", pattern: /^\/api\/history\/(\d+)$/,      handler: (_, m, env) => deleteHistory(parseInt(m[1]), env) },

  // Files
  { method: "GET",    pattern: /^\/api\/files\/?$/,            handler: (_, __, env) => listFiles(env) },
  { method: "POST",   pattern: /^\/api\/files\/?$/,            handler: (req, _, env) => markFile(req, env) },
  { method: "DELETE", pattern: /^\/api\/files\/?$/,            handler: (_, __, env) => clearFiles(env) },
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const hdrs = corsHeaders(env);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: hdrs });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Match route
    for (const route of ROUTES) {
      if (request.method !== route.method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      try {
        const response = await route.handler(request, match, env);
        // Attach CORS headers
        const body = response.body;
        const init = {
          status: response.status,
          headers: { ...Object.fromEntries(response.headers.entries()), ...hdrs },
        };
        return new Response(body, init);
      } catch (e) {
        console.error("[worker]", e);
        return error(e.message || "Internal server error", 500);
      }
    }

    // 404
    return new Response("Not Found", {
      status: 404,
      headers: { ...hdrs, "Content-Type": "text/plain" },
    });
  },
};
