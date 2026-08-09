/**
 * IndexedDB 存储层
 * ------------------------------------------------------------
 * - faultDataStore   导入的故障知识条目
 * - historyStore     诊断历史记录（全量持久化）
 * - fileStore        导入文件元数据（用于去重和追溯）
 */
(() => {
  "use strict";

  const DB_NAME = "fault-diagnosis-db";
  const DB_VERSION = 1;
  const STORES = {
    faultData: "faultDataStore",
    history: "historyStore",
    files: "fileStore"
  };

  /* ---------- 数据库打开 ---------- */
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORES.faultData)) {
          db.createObjectStore(STORES.faultData, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.history)) {
          const historyStore = db.createObjectStore(STORES.history, { keyPath: "id", autoIncrement: true });
          historyStore.createIndex("createdAt", "createdAt", { unique: false });
          historyStore.createIndex("deviceType", "deviceType", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.files)) {
          db.createObjectStore(STORES.files, { keyPath: "fileName" });
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  function withStore(storeName, mode) {
    return openDB().then(db => {
      const tx = db.transaction(storeName, mode);
      return tx.objectStore(storeName);
    });
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  /* ---------- 故障数据操作 ---------- */
  const faultData = {
    /** 批量保存导入的故障条目 */
    async saveAll(entries) {
      const store = await withStore(STORES.faultData, "readwrite");
      let saved = 0;
      for (const entry of entries) {
        try {
          await promisify(store.put(entry));
          saved++;
        } catch (e) {
          console.warn(`[db] 保存条目 "${entry.id}" 失败:`, e);
        }
      }
      return saved;
    },

    /** 获取所有导入的故障条目 */
    async getAll() {
      const store = await withStore(STORES.faultData, "readonly");
      return promisify(store.getAll());
    },

    /** 删除指定条目 */
    async remove(id) {
      const store = await withStore(STORES.faultData, "readwrite");
      return promisify(store.delete(id));
    },

    /** 清空所有导入数据 */
    async clearAll() {
      const store = await withStore(STORES.faultData, "readwrite");
      return promisify(store.clear());
    },

    /** 获取导入条目数量 */
    async count() {
      const store = await withStore(STORES.faultData, "readonly");
      return promisify(store.count());
    }
  };

  /* ---------- 历史记录操作 ---------- */
  const history = {
    /** 保存诊断记录 */
    async save(record) {
      const store = await withStore(STORES.history, "readwrite");
      return promisify(store.add({
        input: record.input,
        deviceType: record.deviceType || "",
        faultId: record.faultId,
        title: record.title,
        severity: record.severity || "",
        matchedKeywords: record.matchedKeywords || [],
        score: record.score || 0,
        causes: record.causes || [],
        solutions: record.solutions || [],
        createdAt: new Date().toISOString()
      }));
    },

    /** 分页获取历史记录 */
    async getList(limit = 20, offset = 0) {
      const store = await withStore(STORES.history, "readonly");
      const index = store.index("createdAt");
      const results = [];
      let skipped = 0;

      return new Promise((resolve, reject) => {
        const request = index.openCursor(null, "prev");
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) return resolve(results);
          if (skipped < offset) { skipped++; cursor.continue(); return; }
          results.push(cursor.value);
          if (results.length >= limit) return resolve(results);
          cursor.continue();
        };
        request.onerror = (event) => reject(event.target.error);
      });
    },

    /** 搜索历史记录 */
    async search(query, limit = 50) {
      const normalizedQuery = String(query || "").toLowerCase().replace(/\s+/g, "");
      if (!normalizedQuery) return history.getList(limit, 0);

      const store = await withStore(STORES.history, "readonly");
      const all = await promisify(store.getAll());
      return all
        .filter(record => {
          const haystack = [
            record.input, record.title, record.deviceType,
            ...(record.matchedKeywords || [])
          ].join(" ").toLowerCase();
          return haystack.includes(normalizedQuery);
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    },

    /** 删除单条记录 */
    async remove(id) {
      const store = await withStore(STORES.history, "readwrite");
      return promisify(store.delete(id));
    },

    /** 清空全部历史 */
    async clearAll() {
      const store = await withStore(STORES.history, "readwrite");
      return promisify(store.clear());
    },

    /** 历史总数 */
    async count() {
      const store = await withStore(STORES.history, "readonly");
      return promisify(store.count());
    },

    /** 导出全部历史为 JSON 数组 */
    async exportAll() {
      const store = await withStore(STORES.history, "readonly");
      return promisify(store.getAll());
    }
  };

  /* ---------- 文件元数据操作 ---------- */
  const files = {
    async mark(fileName) {
      const store = await withStore(STORES.files, "readwrite");
      return promisify(store.put({ fileName, importedAt: new Date().toISOString() }));
    },
    async getImported() {
      const store = await withStore(STORES.files, "readonly");
      return promisify(store.getAll());
    },
    async clearAll() {
      const store = await withStore(STORES.files, "readwrite");
      return promisify(store.clear());
    }
  };

  /* ---------- 暴露到全局 ---------- */
  window.FaultDB = { faultData, history, files, openDB };
})();
