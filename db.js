/**
 * API 数据层 — Cloudflare Workers + D1
 * ------------------------------------------------------------
 * 替代 IndexedDB，通过 HTTP API 与后端数据库通信，实现多人数据共享。
 *
 * 部署 Worker 后将下方的 API_BASE 替换为你的 Worker URL：
 *   https://fault-diagnosis-api.YOUR_SUBDOMAIN.workers.dev
 */
(() => {
  "use strict";

  // ======================================================================
  // CONFIG — change this to your deployed Worker URL
  // ======================================================================
  const API_BASE = "https://fault-diagnosis-d5fe6kc909f3385d.service.tcloudbase.com/api";

  // ======================================================================
  // Transport — thin fetch wrapper with error handling
  // ======================================================================

  /**
   * Call the backend API.
   * On network / CORS failure, returns `fallback` instead of throwing,
   * so the frontend degrades gracefully while the backend is being set up.
   */
  async function apiFetch(path, options = {}, fallback = undefined) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn(`[db] API ${options.method || "GET"} ${path} 失败:`, e.message);
      if (fallback !== undefined) return fallback;
      throw e;
    }
  }

  // ======================================================================
  // Fault data
  // ======================================================================

  const faultData = {
    /** 获取所有导入的故障条目 */
    async getAll() {
      return apiFetch("/faults", {}, []);
    },

    /** 批量保存导入的故障条目 → 返回保存数量 */
    async saveAll(entries) {
      if (!Array.isArray(entries) || !entries.length) return 0;
      const result = await apiFetch("/faults", {
        method: "POST",
        body: JSON.stringify(entries),
      }, { saved: 0 });
      return result.saved;
    },

    /** 删除指定条目 */
    async remove(id) {
      return apiFetch(`/faults/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    /** 清空所有导入数据 */
    async clearAll() {
      return apiFetch("/faults", { method: "DELETE" });
    },

    /** 获取导入条目数量 */
    async count() {
      // count is derived from getAll() — the Worker doesn't have a separate
      // count endpoint for faults, so fetch all and count.
      try {
        const all = await faultData.getAll();
        return all.length;
      } catch {
        return 0;
      }
    },
  };

  // ======================================================================
  // History
  // ======================================================================

  const history = {
    /** 保存诊断记录 */
    async save(record) {
      const result = await apiFetch("/history", {
        method: "POST",
        body: JSON.stringify(record),
      });
      return result?.id;
    },

    /** 分页获取历史记录（按时间倒序） */
    async getList(limit = 20, offset = 0) {
      return apiFetch(`/history?limit=${limit}&offset=${offset}`, {}, []);
    },

    /** 搜索历史记录 */
    async search(query, limit = 50) {
      const q = String(query || "").trim();
      if (!q) return history.getList(limit, 0);
      return apiFetch(
        `/history/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        {},
        []
      );
    },

    /** 删除单条记录 */
    async remove(id) {
      return apiFetch(`/history/${id}`, { method: "DELETE" });
    },

    /** 清空全部历史 */
    async clearAll() {
      return apiFetch("/history", { method: "DELETE" });
    },

    /** 历史总数 */
    async count() {
      const result = await apiFetch("/history/count", {}, { count: 0 });
      return result.count;
    },

    /** 导出全部历史为 JSON 数组 */
    async exportAll() {
      return apiFetch("/history/export", {}, []);
    },
  };

  // ======================================================================
  // Imported file tracking
  // ======================================================================

  const files = {
    /** 记录一个已导入的文件 */
    async mark(fileName) {
      return apiFetch("/files", {
        method: "POST",
        body: JSON.stringify({ fileName }),
      });
    },

    /** 获取所有已导入文件列表 */
    async getImported() {
      return apiFetch("/files", {}, []);
    },

    /** 清空导入记录 */
    async clearAll() {
      return apiFetch("/files", { method: "DELETE" });
    },
  };

  // ======================================================================
  // Expose
  // ======================================================================

  window.FaultDB = { faultData, history, files };
})();
