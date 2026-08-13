/**
 * CloudBase HTTP 云函数（Web 函数）— fault-diagnosis-api
 *
 * 数据层从 Cloudflare Workers + D1(SQLite) 迁移到腾讯云云开发(云函数 + NoSQL)。
 * 通过 scf_bootstrap 启动，监听 0.0.0.0:9000。
 *
 * 集合（对应原 3 张表）：
 *   fault_entries      — 导入的故障知识条目（业务 id 作为 _id）
 *   diagnosis_history  — 诊断历史
 *   imported_files     — 文件导入追踪
 */

'use strict';

const http = require('http');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: process.env.TCB_ENV_ID || 'fault-diagnosis-d5fe6kc909f3385d',
});
const db = app.database();
const _ = db.command;

const PORT = 9000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return { statusCode: status, data };
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function corsHeaders() {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** 去掉路径里可能被 HTTP 访问服务加上的前缀，统一成叶子路径 */
function normalizePath(url) {
  const path = url.split('?')[0] || '/';
  for (const prefix of ['/fault-diagnosis-api', '/api']) {
    if (path === prefix) return '/';
    if (path.startsWith(prefix + '/')) return path.slice(prefix.length);
  }
  return path;
}

function parseQuery(url) {
  const query = {};
  const qs = url.split('?')[1] || '';
  if (qs) {
    for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  }
  return query;
}

function parseBody(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => resolve(raw));
  });
}

/** NoSQL 文档 _id → 前端 id 字段 */
function mapFaultDoc(doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function mapHistoryDoc(doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function mapFileDoc(doc) {
  return { id: doc._id, fileName: doc.fileName, importedAt: doc.importedAt };
}

async function clearCollection(name) {
  await db.collection(name).where({ _id: _.exists(true) }).remove();
}

// ---------------------------------------------------------------------------
// Fault entries
// ---------------------------------------------------------------------------

async function listFaults() {
  const res = await db.collection('fault_entries').limit(1000).get();
  return json((res.data || []).map(mapFaultDoc));
}

async function saveFaults(entries) {
  if (!Array.isArray(entries)) return error('Expected an array of fault entries');

  for (const entry of entries) {
    const doc = {
      deviceType: entry.deviceType || '通用',
      title: entry.title,
      symptoms: entry.symptoms || [],
      keywords: entry.keywords || [],
      summary: entry.summary || '',
      severity: entry.severity || '中',
      shutdownRequired: Boolean(entry.shutdownRequired),
      estimatedTime: entry.estimatedTime || '',
      causes: entry.causes || [],
      solutions: entry.solutions || [],
      diagram: entry.diagram || [],
      safety: entry.safety || '',
      _images: entry._images || [],
      createdAt: entry.createdAt || new Date().toISOString(),
    };
    await db.collection('fault_entries').doc(String(entry.id)).set(doc);
  }
  return json({ saved: entries.length });
}

async function deleteFault(id) {
  await db.collection('fault_entries').doc(decodeURIComponent(id)).remove();
  return json({ success: true });
}

async function clearFaults() {
  await clearCollection('fault_entries');
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async function listHistory(query) {
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 20));
  const offset = Math.max(0, parseInt(query.offset) || 0);

  const res = await db.collection('diagnosis_history')
    .orderBy('createdAt', 'desc')
    .skip(offset)
    .limit(limit)
    .get();

  return json((res.data || []).map(mapHistoryDoc));
}

async function searchHistory(query) {
  const q = (query.q || '').toLowerCase().replace(/\s+/g, '');
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 50));

  if (!q) return listHistory(query);

  const res = await db.collection('diagnosis_history')
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();

  const filtered = (res.data || [])
    .filter((r) => {
      const haystack = [r.input, r.title, r.deviceType, (r.matchedKeywords || []).join(' ')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, limit);

  return json(filtered.map(mapHistoryDoc));
}

async function countHistory() {
  const res = await db.collection('diagnosis_history').count();
  return json({ count: res.total || 0 });
}

async function exportHistory() {
  const res = await db.collection('diagnosis_history')
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();
  return json((res.data || []).map(mapHistoryDoc));
}

async function saveHistory(record) {
  if (!record || typeof record !== 'object') return error('Expected a history record object');

  const res = await db.collection('diagnosis_history').add({
    input: record.input || '',
    deviceType: record.deviceType || '',
    faultId: record.faultId || '',
    title: record.title || '',
    severity: record.severity || '',
    matchedKeywords: record.matchedKeywords || [],
    score: record.score || 0,
    causes: record.causes || [],
    solutions: record.solutions || [],
    createdAt: new Date().toISOString(),
  });

  return json({ id: res.id || null });
}

async function deleteHistory(id) {
  await db.collection('diagnosis_history').doc(id).remove();
  return json({ success: true });
}

async function clearHistory() {
  await clearCollection('diagnosis_history');
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

async function listFiles() {
  const res = await db.collection('imported_files')
    .orderBy('importedAt', 'desc')
    .limit(1000)
    .get();
  return json((res.data || []).map(mapFileDoc));
}

async function markFile(body) {
  if (!body || !body.fileName) return error('Expected { fileName }');

  await db.collection('imported_files').add({
    fileName: body.fileName,
    importedAt: new Date().toISOString(),
  });

  return json({ success: true });
}

async function clearFiles() {
  await clearCollection('imported_files');
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Diagnosis & health
// ---------------------------------------------------------------------------

function serviceInfo() {
  return json({
    service: 'GPU 故障诊断 API',
    endpoints: {
      '/': 'GET 服务说明',
      '/health': 'GET 健康检查',
      '/diagnose': 'POST 发送诊断数据',
      '/api/faults': 'GET/POST/DELETE 故障知识库',
      '/api/history': 'GET/POST/DELETE 诊断历史',
      '/api/history/search': 'GET 搜索历史',
      '/api/history/count': 'GET 历史总数',
      '/api/history/export': 'GET 导出历史',
      '/api/files': 'GET/POST/DELETE 文件追踪',
    },
  });
}

function healthCheck() {
  return json({ status: 'ok', timestamp: new Date().toISOString() });
}

function diagnose(body) {
  if (!body || typeof body !== 'object') {
    return json({ error: '请求体格式错误，请发送有效的 JSON' }, 400);
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

  if (error_message) {
    const msg = error_message.toLowerCase();
    if (msg.includes('out of memory') || msg.includes('oom')) {
      diagnosis.analysis.push('检测到显存不足 (OOM) 错误');
      diagnosis.suggestions.push('尝试减小 batch size 或模型尺寸');
      diagnosis.suggestions.push('检查是否有其他进程占用显存');
    }
    if (msg.includes('cuda') || msg.includes('cudnn')) {
      diagnosis.analysis.push('检测到 CUDA 相关错误');
      diagnosis.suggestions.push('确认 CUDA 版本与驱动匹配');
      diagnosis.suggestions.push('尝试重新安装 CUDA 工具包');
    }
    if (msg.includes('timeout') || msg.includes('time out')) {
      diagnosis.analysis.push('检测到超时错误');
      diagnosis.suggestions.push('检查网络连接或增加超时时间');
    }
    if (msg.includes('permission') || msg.includes('access')) {
      diagnosis.analysis.push('检测到权限错误');
      diagnosis.suggestions.push('检查文件或目录权限设置');
    }
    if (msg.includes('not found') || msg.includes('no such')) {
      diagnosis.analysis.push('检测到文件或路径不存在');
      diagnosis.suggestions.push('检查文件路径是否正确');
    }
  }

  if (diagnosis.analysis.length === 0) {
    diagnosis.analysis.push('未识别到明确的错误模式，建议查看完整日志');
    diagnosis.suggestions.push('检查 GPU 驱动是否正常安装');
    diagnosis.suggestions.push('尝试重启服务或系统');
  }

  return json(diagnosis);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ROUTES = [
  { method: 'GET',    pattern: /^\/$/,                       handler: () => serviceInfo() },
  { method: 'GET',    pattern: /^\/health\/?$/,              handler: () => healthCheck() },
  { method: 'POST',   pattern: /^\/diagnose\/?$/,            handler: (body) => diagnose(body) },

  // Fault entries
  { method: 'GET',    pattern: /^\/faults\/?$/,              handler: () => listFaults() },
  { method: 'POST',   pattern: /^\/faults\/?$/,              handler: (body) => saveFaults(body) },
  { method: 'DELETE', pattern: /^\/faults\/?$/,              handler: () => clearFaults() },
  { method: 'DELETE', pattern: /^\/faults\/(.+)$/,           handler: (_, __, m) => deleteFault(m[1]) },

  // History
  { method: 'GET',    pattern: /^\/history\/search\/?$/,     handler: (_, q) => searchHistory(q) },
  { method: 'GET',    pattern: /^\/history\/count\/?$/,      handler: () => countHistory() },
  { method: 'GET',    pattern: /^\/history\/export\/?$/,     handler: () => exportHistory() },
  { method: 'GET',    pattern: /^\/history\/?$/,             handler: (_, q) => listHistory(q) },
  { method: 'POST',   pattern: /^\/history\/?$/,             handler: (body) => saveHistory(body) },
  { method: 'DELETE', pattern: /^\/history\/?$/,             handler: () => clearHistory() },
  { method: 'DELETE', pattern: /^\/history\/(.+)$/,          handler: (_, __, m) => deleteHistory(m[1]) },

  // Files
  { method: 'GET',    pattern: /^\/files\/?$/,               handler: () => listFiles() },
  { method: 'POST',   pattern: /^\/files\/?$/,               handler: (body) => markFile(body) },
  { method: 'DELETE', pattern: /^\/files\/?$/,               handler: () => clearFiles() },
];

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const method = (req.method || 'GET').toUpperCase();
  const path = normalizePath(req.url);
  const query = parseQuery(req.url);
  const cors = corsHeaders();

  console.log(`[cloudbase] ${method} ${path}`);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const rawBody = await readBody(req);
  const body = parseBody(rawBody);

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;

    try {
      const result = await route.handler(body, query, match);
      res.writeHead(result.statusCode ?? 200, {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(result.data));
      return;
    } catch (e) {
      console.error('[cloudbase]', e);
      res.writeHead(500, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message || 'Internal server error' }));
      return;
    }
  }

  res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cloudbase] listening on 0.0.0.0:${PORT}`);
});
