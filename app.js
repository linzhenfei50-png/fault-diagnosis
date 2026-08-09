(() => {
  "use strict";

  /* ================================================================
   *  全局状态
   * ================================================================ */
  const builtInDB = Array.isArray(window.FAULT_DATABASE) ? window.FAULT_DATABASE : [];
  let importedEntries = [];
  let mergedDatabase = [...builtInDB];

  const PAGINATE = { history: 12, historyOffset: 0, historyTotal: 0 };
  let pendingImportEntries = [];   // 待确认导入的条目
  let currentPanel = "diagnose";

  /* ================================================================
   *  DOM 引用
   * ================================================================ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    // 导航
    navItems: $$(".nav-item"),
    panels: $$(".panel"),

    // 诊断
    deviceType: $("#deviceType"),
    symptomInput: $("#symptomInput"),
    charCount: $("#charCount"),
    diagnoseButton: $("#diagnoseButton"),
    clearHistoryButton: $("#clearHistoryButton"),
    quickExamples: $("#quickExamples"),
    emptyState: $("#emptyState"),
    resultSection: $("#resultSection"),
    dataStatus: $("#dataStatus"),
    resultTitle: $("#resultTitle"),
    resultSummary: $("#resultSummary"),
    severityBadge: $("#severityBadge"),
    shutdownBadge: $("#shutdownBadge"),
    timeBadge: $("#timeBadge"),
    matchScore: $("#matchScore"),
    matchExplanation: $("#matchExplanation"),
    causeList: $("#causeList"),
    solutionList: $("#solutionList"),
    diagramFlow: $("#diagramFlow"),
    safetyText: $("#safetyText"),
    historyList: $("#historyList"),

    // 历史面板
    historySearch: $("#historySearch"),
    historyDeviceFilter: $("#historyDeviceFilter"),
    fullHistoryList: $("#fullHistoryList"),
    historyCount: $("#historyCount"),
    historyPagination: $("#historyPagination"),
    exportHistoryBtn: $("#exportHistoryBtn"),
    clearAllHistoryBtn: $("#clearAllHistoryBtn"),

    // 知识库
    knowledgeStatus: $("#knowledgeStatus"),
    knowledgeSearch: $("#knowledgeSearch"),
    knowledgeList: $("#knowledgeList"),
    clearImportedBtn: $("#clearImportedBtn"),

    // 导入
    importDropzone: $("#importDropzone"),
    selectFolderBtn: $("#selectFolderBtn"),
    selectFilesBtn: $("#selectFilesBtn"),
    folderInput: $("#folderInput"),
    filesInput: $("#filesInput"),
    importPreview: $("#importPreview"),
    importFileList: $("#importFileList"),
    cancelImportBtn: $("#cancelImportBtn"),
    confirmImportBtn: $("#confirmImportBtn"),
    importSummary: $("#importSummary"),
    importResult: $("#importResult"),
    clearImportHistoryBtn: $("#clearImportHistoryBtn"),
    importedFilesList: $("#importedFilesList"),
    importDialog: $("#importDialog"),
    importDialogBody: $("#importDialogBody"),
    closeImportDialog: $("#closeImportDialog"),
  };

  /* ================================================================
   *  工具函数
   * ================================================================ */
  const normalizeText = (value) =>
    String(value || "").toLowerCase().replace(/[\s，。；、,.!?！？：:（）()\-_/]/g, "");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
  }

  function severityColor(severity) {
    if (severity === "高") return "#e34b4b";
    if (severity === "中") return "#e69a13";
    return "#14a673";
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  /* ================================================================
   *  数据库初始化 & 合并
   * ================================================================ */
  async function loadImportedData() {
    try {
      importedEntries = await window.FaultDB.faultData.getAll();
    } catch (e) {
      console.warn("[app] 读取导入数据失败:", e);
      importedEntries = [];
    }
    mergeDatabase();
  }

  function mergeDatabase() {
    // 导入条目优先覆盖同 id 的内置条目
    const map = new Map();
    builtInDB.forEach(e => map.set(e.id, e));
    importedEntries.forEach(e => map.set(e.id, e));
    mergedDatabase = [...map.values()];
  }

  /* ================================================================
   *  面板导航
   * ================================================================ */
  function switchPanel(name) {
    currentPanel = name;
    els.navItems.forEach(item => {
      item.classList.toggle("active", item.dataset.panel === name);
    });
    els.panels.forEach(p => p.classList.remove("active"));
    const target = $("#panel" + name.charAt(0).toUpperCase() + name.slice(1));
    if (target) target.classList.add("active");

    if (name === "history") renderFullHistory();
    if (name === "knowledge") renderKnowledgeList();
    if (name === "import") { renderImportedFiles(); els.importResult.classList.add("hidden"); }
  }

  els.navItems.forEach(item => {
    item.addEventListener("click", () => switchPanel(item.dataset.panel));
  });

  /* ================================================================
   *  诊断引擎
   * ================================================================ */
  function initializeDeviceTypes() {
    const types = [...new Set(mergedDatabase.map(item => item.deviceType).filter(Boolean))];
    const opts = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

    // 更新诊断面板下拉
    els.deviceType.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
    els.deviceType.insertAdjacentHTML("beforeend", opts);

    // 更新历史面板筛选下拉
    els.historyDeviceFilter.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
    els.historyDeviceFilter.insertAdjacentHTML("beforeend", opts);
  }

  let _examplesListenerBound = false;

  function renderExamples() {
    const examples = mergedDatabase.slice(0, 4).map(item => item.symptoms?.[0]).filter(Boolean);
    els.quickExamples.innerHTML = examples
      .map(e => `<button type="button" class="example-chip" data-example="${escapeHtml(e)}">${escapeHtml(e)}</button>`)
      .join("");
  }

  function initializeExamples() {
    renderExamples();
    if (_examplesListenerBound) return;
    _examplesListenerBound = true;
    els.quickExamples.addEventListener("click", event => {
      const btn = event.target.closest("[data-example]");
      if (!btn) return;
      els.symptomInput.value = btn.dataset.example;
      els.charCount.textContent = String(els.symptomInput.value.length);
      els.symptomInput.focus();
    });
  }

  function scoreFault(item, input, selectedType) {
    const normalizedInput = normalizeText(input);
    const typeMatches = selectedType && item.deviceType === selectedType;
    let score = typeMatches ? 26 : 0;
    const matchedKeywords = [];

    const allKeywords = [
      ...(item.keywords || []),
      ...(item.symptoms || []),
      item.deviceType,
      item.title
    ].filter(Boolean);

    allKeywords.forEach((keyword, index) => {
      const nk = normalizeText(keyword);
      if (!nk) return;
      if (normalizedInput.includes(nk)) {
        score += index < (item.keywords || []).length ? 12 : 8;
        matchedKeywords.push(keyword);
        return;
      }
      if (nk.length >= 4) {
        const unique = [...new Set(nk)];
        const hits = unique.filter(c => normalizedInput.includes(c)).length;
        const cov = hits / unique.length;
        if (cov >= 0.55) score += Math.round(cov * 7);
      }
    });

    return { item, rawScore: score, matchedKeywords: [...new Set(matchedKeywords)] };
  }

  function diagnose() {
    const input = els.symptomInput.value.trim();
    const selectedType = els.deviceType.value;

    if (!input) {
      els.symptomInput.focus();
      els.symptomInput.setAttribute("aria-invalid", "true");
      els.dataStatus.textContent = "请先输入故障现象";
      els.dataStatus.style.color = "#e34b4b";
      els.dataStatus.style.background = "#fff0f0";
      return;
    }

    els.symptomInput.removeAttribute("aria-invalid");
    resetDataStatus();

    const scored = mergedDatabase
      .filter(item => !selectedType || item.deviceType === selectedType)
      .map(item => scoreFault(item, input, selectedType))
      .sort((a, b) => b.rawScore - a.rawScore);

    if (!scored.length) {
      showNoMatch("当前设备类型下没有可用诊断数据。请在 data/faults.js 中新增或通过导入功能添加知识条目。");
      return;
    }

    const best = scored[0];
    const displayScore = Math.max(38, Math.min(98, 42 + best.rawScore));
    renderResult(best.item, displayScore, best.matchedKeywords, input);
    saveHistory(input, best.item, displayScore, best.matchedKeywords);
    renderRecentHistory();
  }

  function showNoMatch(message) {
    els.emptyState.classList.remove("hidden");
    els.resultSection.classList.add("hidden");
    els.emptyState.querySelector("h2").textContent = "未找到可用方案";
    els.emptyState.querySelector("p").textContent = message;
  }

  function renderResult(item, score, matchedKeywords, input) {
    els.emptyState.classList.add("hidden");
    els.resultSection.classList.remove("hidden");

    els.resultTitle.textContent = item.title;
    els.resultSummary.textContent = item.summary;
    els.severityBadge.textContent = `严重等级：${item.severity || "未定义"}`;
    els.severityBadge.style.background = severityColor(item.severity);
    els.shutdownBadge.textContent = item.shutdownRequired ? "建议停机" : "可在安全条件下继续排查";
    els.timeBadge.textContent = `预计：${item.estimatedTime || "未定义"}`;
    els.matchScore.textContent = `${score}%`;
    els.matchExplanation.textContent = matchedKeywords.length
      ? `已匹配关键词：${matchedKeywords.slice(0, 5).join("、")}`
      : `已根据设备类型和描述相似度匹配。建议人工复核。`;

    els.causeList.innerHTML = (item.causes || []).map(cause => `
      <div class="cause-item">
        <div class="cause-top">
          <strong>${escapeHtml(cause.name)}</strong>
          <span>${Number(cause.probability) || 0}%</span>
        </div>
        <div class="progress"><div style="width:${Math.min(100, Math.max(0, Number(cause.probability) || 0))}%"></div></div>
        <p>${escapeHtml(cause.evidence || "")}</p>
      </div>
    `).join("") || `<p class="history-empty">尚未配置原因分析。</p>`;

    els.solutionList.innerHTML = (item.solutions || []).map((solution, index) => `
      <div class="solution-item">
        <span class="step-number">${index + 1}</span>
        <div>
          <h3>${escapeHtml(solution.action)}</h3>
          <p>${escapeHtml(solution.detail || "")}</p>
          <div class="solution-meta">
            ${(solution.tools || []).map(tool => `<span>工具：${escapeHtml(tool)}</span>`).join("")}
            ${solution.duration ? `<span>耗时：${escapeHtml(solution.duration)}</span>` : ""}
          </div>
        </div>
      </div>
    `).join("") || `<p class="history-empty">尚未配置解决措施。</p>`;

    els.diagramFlow.innerHTML = (item.diagram || []).flatMap((node, index, array) => {
      const html = `<div class="flow-node"><strong>${index + 1}. ${escapeHtml(node.title)}</strong><p>${escapeHtml(node.description || "")}</p></div>`;
      return index < array.length - 1 ? [html, `<div class="flow-arrow" aria-hidden="true">→</div>`] : [html];
    }).join("") || `<p class="history-empty">尚未配置排查流程图。</p>`;

    els.safetyText.textContent = item.safety || "请遵守设备制造商和现场安全规程。";
    els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ================================================================
   *  历史记录 (IndexedDB)
   * ================================================================ */
  async function saveHistory(input, item, score, matchedKeywords) {
    try {
      await window.FaultDB.history.save({
        input,
        deviceType: item.deviceType || "",
        faultId: item.id,
        title: item.title,
        severity: item.severity || "",
        matchedKeywords,
        score,
        causes: item.causes || [],
        solutions: item.solutions || [],
      });
    } catch (e) {
      console.warn("[app] 保存历史失败:", e);
    }
  }

  async function renderRecentHistory() {
    try {
      const records = await window.FaultDB.history.getList(8, 0);
      if (!records.length) {
        els.historyList.innerHTML = `<p class="history-empty">暂无本地诊断记录。</p>`;
        return;
      }
      els.historyList.innerHTML = records.map((record, i) => `
        <div class="history-item">
          <button type="button" data-history-id="${record.id}">
            <strong>${escapeHtml(record.input)}</strong><br />
            <small>${escapeHtml(record.title)}</small>
          </button>
          <small>${formatDate(record.createdAt)}</small>
        </div>
      `).join("");
    } catch (e) {
      els.historyList.innerHTML = `<p class="history-empty">读取历史失败。</p>`;
    }
  }

  async function renderFullHistory(searchQuery, deviceFilter) {
    try {
      let records;
      if (searchQuery) {
        records = await window.FaultDB.history.search(searchQuery, 200);
      } else {
        const total = await window.FaultDB.history.count();
        PAGINATE.historyTotal = total;
        records = await window.FaultDB.history.getList(PAGINATE.history, PAGINATE.historyOffset);
      }

      if (deviceFilter) {
        records = records.filter(r => r.deviceType === deviceFilter);
      }

      els.historyCount.textContent = searchQuery
        ? `找到 ${records.length} 条`
        : `共 ${PAGINATE.historyTotal} 条，显示 ${PAGINATE.historyOffset + 1}-${PAGINATE.historyOffset + records.length}`;

      if (!records.length) {
        els.fullHistoryList.innerHTML = `<p class="history-empty">暂无匹配的诊断记录。</p>`;
        els.historyPagination.innerHTML = "";
        return;
      }

      els.fullHistoryList.innerHTML = records.map(record => `
        <div class="full-history-item" data-history-id="${record.id}">
          <div class="fhi-main">
            <div class="fhi-header">
              <strong>${escapeHtml(record.input)}</strong>
              <span class="badge" style="background:${severityColor(record.severity)}; font-size:11px;">${escapeHtml(record.severity || "?")}</span>
            </div>
            <p class="fhi-title">${escapeHtml(record.title)}</p>
            <div class="fhi-meta">
              <span>设备：${escapeHtml(record.deviceType || "—")}</span>
              <span>匹配度：${record.score || 0}%</span>
              <span>${formatDate(record.createdAt)}</span>
            </div>
            <div class="fhi-keywords">
              ${(record.matchedKeywords || []).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join("")}
            </div>
          </div>
          <div class="fhi-actions">
            <button class="text-button fhi-view" data-view-id="${record.id}">查看详情</button>
            <button class="text-button fhi-delete" data-del-id="${record.id}" style="color:var(--danger);">删除</button>
          </div>
        </div>
      `).join("");

      // 分页按钮
      if (!searchQuery && PAGINATE.historyTotal > PAGINATE.history) {
        const totalPages = Math.ceil(PAGINATE.historyTotal / PAGINATE.history);
        const currentPage = Math.floor(PAGINATE.historyOffset / PAGINATE.history) + 1;
        els.historyPagination.innerHTML = `
          <button class="page-btn" ${PAGINATE.historyOffset === 0 ? "disabled" : ""} data-page="prev">上一页</button>
          <span>第 ${currentPage}/${totalPages} 页</span>
          <button class="page-btn" ${PAGINATE.historyOffset + PAGINATE.history >= PAGINATE.historyTotal ? "disabled" : ""} data-page="next">下一页</button>
        `;
      } else {
        els.historyPagination.innerHTML = "";
      }
    } catch (e) {
      console.error("[app] 渲染历史失败:", e);
      els.fullHistoryList.innerHTML = `<p class="history-empty">读取历史失败：${e.message}</p>`;
    }
  }

  /* ================================================================
   *  知识库管理
   * ================================================================ */
  async function renderKnowledgeList(filterText) {
    try {
      const imported = await window.FaultDB.faultData.getAll();
      const totalBuiltIn = builtInDB.length;
      const totalImported = imported.length;
      els.knowledgeStatus.textContent = `内置 ${totalBuiltIn} 条 + 导入 ${totalImported} 条 = 合计 ${mergedDatabase.length} 条`;
      els.knowledgeStatus.style.color = "#14a673";
      els.knowledgeStatus.style.background = "#eafaf4";

      let list = mergedDatabase;
      if (filterText) {
        const q = filterText.toLowerCase();
        list = list.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.deviceType.toLowerCase().includes(q) ||
          (e.keywords || []).some(k => k.toLowerCase().includes(q))
        );
      }

      const isImported = (id) => imported.some(e => e.id === id);

      els.knowledgeList.innerHTML = list.map(entry => `
        <div class="knowledge-card ${isImported(entry.id) ? "imported" : "built-in"}">
          <div class="kn-header">
            <strong>${escapeHtml(entry.title)}</strong>
            <span class="kn-badge ${isImported(entry.id) ? "kn-imported" : "kn-builtin"}">
              ${isImported(entry.id) ? "导入" : "内置"}
            </span>
          </div>
          <div class="kn-meta">
            <span>设备：${escapeHtml(entry.deviceType)}</span>
            <span>等级：${escapeHtml(entry.severity || "—")}</span>
            <span>关键词：${(entry.keywords || []).slice(0, 4).join("、")}</span>
          </div>
          <p class="kn-summary">${escapeHtml(entry.summary || "")}</p>
          ${isImported(entry.id) ? `<button class="text-button kn-delete" data-kn-id="${escapeHtml(entry.id)}" style="color:var(--danger); font-size:12px;">删除此条</button>` : ""}
        </div>
      `).join("") || `<p class="history-empty">暂无匹配的知识条目。</p>`;
    } catch (e) {
      els.knowledgeList.innerHTML = `<p class="history-empty">读取知识库失败。</p>`;
    }
  }

  /* ================================================================
   *  文件夹/文件导入
   * ================================================================ */
  function validateFaultEntry(obj) {
    if (!obj || typeof obj !== "object") return { valid: false, reason: "不是有效对象" };
    if (!obj.id || !obj.title) return { valid: false, reason: `缺少 id 或 title 字段` };
    if (!Array.isArray(obj.keywords)) return { valid: false, reason: `"${obj.id}": keywords 必须是数组` };
    return {
      valid: true,
      entry: {
        id: obj.id,
        deviceType: obj.deviceType || "通用",
        title: obj.title,
        symptoms: Array.isArray(obj.symptoms) ? obj.symptoms : [],
        keywords: obj.keywords,
        summary: obj.summary || "",
        severity: obj.severity || "中",
        shutdownRequired: Boolean(obj.shutdownRequired),
        estimatedTime: obj.estimatedTime || "",
        causes: Array.isArray(obj.causes) ? obj.causes : [],
        solutions: Array.isArray(obj.solutions) ? obj.solutions : [],
        diagram: Array.isArray(obj.diagram) ? obj.diagram : [],
        safety: obj.safety || ""
      }
    };
  }

  function parseFileContent(text, fileName) {
    const entries = [];
    const errors = [];

    try {
      const parsed = JSON.parse(text);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      candidates.forEach((item, i) => {
        const result = validateFaultEntry(item);
        if (result.valid) {
          entries.push(result.entry);
        } else {
          errors.push(`[${fileName}] 第 ${i + 1} 条: ${result.reason}`);
        }
      });
    } catch (e) {
      errors.push(`[${fileName}] JSON 解析失败: ${e.message}`);
    }

    return { entries, errors };
  }

  async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, "UTF-8");
    });
  }

  async function scanFiles(fileList) {
    const allEntries = [];
    const allErrors = [];
    const fileNames = [];

    for (const file of fileList) {
      // 只处理 JSON 文件
      if (!file.name.toLowerCase().endsWith(".json")) continue;
      if (file.size > 10 * 1024 * 1024) {
        allErrors.push(`[${file.name}] 文件过大 (>10MB)，已跳过`);
        continue;
      }

      fileNames.push({ name: file.name, size: file.size });
      try {
        const text = await readFileAsText(file);
        const { entries, errors } = parseFileContent(text, file.name);
        allEntries.push(...entries);
        allErrors.push(...errors);
      } catch (e) {
        allErrors.push(`[${file.name}] 读取失败: ${e.message}`);
      }
    }

    return { entries: allEntries, errors: allErrors, fileNames };
  }

  function showImportPreview(entries, errors, fileNames) {
    pendingImportEntries = entries;

    els.importFileList.innerHTML = fileNames.map(f => `
      <div class="import-file-item">
        <span class="file-icon">📄</span>
        <span>${escapeHtml(f.name)}</span>
        <small>${(f.size / 1024).toFixed(1)} KB</small>
      </div>
    `).join("");

    if (errors.length) {
      els.importFileList.insertAdjacentHTML("beforeend", `
        <div class="import-errors">
          <strong>⚠️ 解析警告：</strong>
          ${errors.map(e => `<p>${escapeHtml(e)}</p>`).join("")}
        </div>
      `);
    }

    const newIds = entries.map(e => e.id);
    const duplicateIds = newIds.filter((id, i) => newIds.indexOf(id) !== i);
    const conflictWithBuiltIn = entries.filter(e => builtInDB.some(b => b.id === e.id));

    let summaryParts = [`共解析 ${entries.length} 条有效故障条目`];
    if (conflictWithBuiltIn.length) {
      summaryParts.push(`${conflictWithBuiltIn.length} 条与内置条目 ID 重复（将覆盖内置条目）`);
    }
    if (duplicateIds.length) {
      summaryParts.push(`${duplicateIds.length} 个条目 ID 在导入批次内重复（后者覆盖前者）`);
    }

    els.importSummary.textContent = summaryParts.join("；") + "。";
    els.importPreview.classList.remove("hidden");
    els.importResult.classList.add("hidden");
  }

  async function confirmImport() {
    if (!pendingImportEntries.length) return;

    try {
      const saved = await window.FaultDB.faultData.saveAll(pendingImportEntries);

      // 记录已导入文件
      for (const f of [...els.importFileList.querySelectorAll(".import-file-item")]) {
        const nameEl = f.querySelector("span:not(.file-icon)");
        if (nameEl) {
          await window.FaultDB.files.mark(nameEl.textContent).catch(() => {});
        }
      }

      // 刷新数据
      await loadImportedData();
      initializeDeviceTypes();
      initializeExamples();
      resetDataStatus();

      // 显示结果
      els.importResult.classList.remove("hidden");
      els.importResult.innerHTML = `
        <div class="import-success">
          <span class="import-check">✅</span>
          <div>
            <strong>导入成功</strong>
            <p>已导入 ${saved} 条故障知识，知识库已更新。可通过「知识库管理」查看全部条目。</p>
          </div>
        </div>
      `;

      els.importPreview.classList.add("hidden");
      pendingImportEntries = [];
      renderImportedFiles();
      els.importResult.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      els.importResult.classList.remove("hidden");
      els.importResult.innerHTML = `
        <div class="import-failed">
          <span>❌</span>
          <div>
            <strong>导入失败</strong>
            <p>${escapeHtml(e.message)}</p>
          </div>
        </div>
      `;
    }
  }

  async function renderImportedFiles() {
    try {
      const fileList = await window.FaultDB.files.getImported();
      if (!fileList.length) {
        els.importedFilesList.innerHTML = `<p class="history-empty">暂无导入记录。</p>`;
        return;
      }
      els.importedFilesList.innerHTML = fileList.map(f => `
        <div class="imported-file-row">
          <span>📄 ${escapeHtml(f.fileName)}</span>
          <small>${formatDate(f.importedAt)}</small>
        </div>
      `).join("");
    } catch (e) {
      els.importedFilesList.innerHTML = `<p class="history-empty">读取导入记录失败。</p>`;
    }
  }

  function triggerFolderSelect() {
    els.folderInput.click();
  }

  function triggerFileSelect() {
    els.filesInput.click();
  }

  async function handleFileInputChange(event) {
    const files = event.target.files;
    if (!files || !files.length) return;

    const { entries, errors, fileNames } = await scanFiles(files);

    if (!entries.length && !errors.length) {
      els.importResult.classList.remove("hidden");
      els.importResult.innerHTML = `<p class="history-empty">未在所选文件/文件夹中发现可解析的 JSON 故障条目。</p>`;
      els.importPreview.classList.add("hidden");
      return;
    }

    showImportPreview(entries, errors, fileNames);
    els.importPreview.scrollIntoView({ behavior: "smooth" });
    event.target.value = "";
  }

  /* ================================================================
   *  导出历史
   * ================================================================ */
  async function exportHistory() {
    try {
      const all = await window.FaultDB.history.exportAll();
      if (!all.length) {
        alert("暂无历史记录可导出。");
        return;
      }
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fault-diagnosis-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("导出失败：" + e.message);
    }
  }

  /* ================================================================
   *  拖拽支持
   * ================================================================ */
  function setupDragDrop() {
    const dropzone = els.importDropzone;
    if (!dropzone) return;

    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, () => dropzone.classList.remove("dragover"));
    });

    dropzone.addEventListener("drop", async (e) => {
      e.preventDefault();
      const items = e.dataTransfer?.items;
      if (!items) return;

      const files = [];
      await collectFilesFromDataTransfer(items, files);

      if (!files.length) return;

      const { entries, errors, fileNames } = await scanFiles(files);
      if (!entries.length && !errors.length) {
        els.importResult.classList.remove("hidden");
        els.importResult.innerHTML = `<p class="history-empty">未在拖拽的文件中发现可解析的 JSON 故障条目。</p>`;
        return;
      }
      showImportPreview(entries, errors, fileNames);
      els.importPreview.scrollIntoView({ behavior: "smooth" });
    });
  }

  async function collectFilesFromDataTransfer(items, outFiles) {
    const entries = [];
    for (const item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
    }
    await traverseEntries(entries, outFiles);
  }

  async function traverseEntries(entries, outFiles) {
    for (const entry of entries) {
      if (entry.isFile) {
        outFiles.push(await entryToFile(entry));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const children = await readAllEntries(reader);
        await traverseEntries(children, outFiles);
      }
    }
  }

  function readAllEntries(reader) {
    return new Promise((resolve) => {
      const all = [];
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (entries.length) { all.push(...entries); readBatch(); }
          else resolve(all);
        });
      };
      readBatch();
    });
  }

  function entryToFile(entry) {
    return new Promise((resolve) => {
      entry.file(resolve);
    });
  }

  /* ================================================================
   *  事件绑定
   * ================================================================ */
  els.symptomInput.addEventListener("input", () => {
    els.charCount.textContent = String(els.symptomInput.value.length);
  });

  els.symptomInput.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") diagnose();
  });

  els.diagnoseButton.addEventListener("click", diagnose);

  // 最近诊断 - 点击回填
  els.historyList.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-history-id]");
    if (!btn) return;
    const id = Number(btn.dataset.historyId);
    try {
      const all = await window.FaultDB.history.getList(200, 0);
      const record = all.find(r => r.id === id);
      if (!record) return;
      els.symptomInput.value = record.input;
      els.charCount.textContent = String(record.input.length);
      if (record.deviceType) els.deviceType.value = record.deviceType;
      const item = mergedDatabase.find(e => e.id === record.faultId);
      if (item) {
        renderResult(item, record.score || 96, record.matchedKeywords || [], record.input);
      } else {
        diagnose();
      }
    } catch (e) { /* ignore */ }
  });

  // 清空最近记录
  els.clearHistoryButton.addEventListener("click", async () => {
    if (confirm("确定清空全部诊断历史？此操作不可恢复。")) {
      await window.FaultDB.history.clearAll();
      await renderRecentHistory();
      if (currentPanel === "history") await renderFullHistory();
    }
  });

  // 全历史面板 - 搜索
  els.historySearch.addEventListener("input", debounce(async () => {
    PAGINATE.historyOffset = 0;
    await renderFullHistory(
      els.historySearch.value.trim(),
      els.historyDeviceFilter.value
    );
  }, 300));

  // 全历史面板 - 设备筛选
  els.historyDeviceFilter.addEventListener("change", async () => {
    PAGINATE.historyOffset = 0;
    await renderFullHistory(
      els.historySearch.value.trim(),
      els.historyDeviceFilter.value
    );
  });

  // 全历史面板 - 分页
  els.historyPagination.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.page === "prev") {
      PAGINATE.historyOffset = Math.max(0, PAGINATE.historyOffset - PAGINATE.history);
    } else {
      PAGINATE.historyOffset = Math.min(
        PAGINATE.historyTotal - PAGINATE.history,
        PAGINATE.historyOffset + PAGINATE.history
      );
    }
    await renderFullHistory(
      els.historySearch.value.trim(),
      els.historyDeviceFilter.value
    );
  });

  // 全历史面板 - 查看详情 / 删除
  els.fullHistoryList.addEventListener("click", async (event) => {
    const viewBtn = event.target.closest("[data-view-id]");
    const delBtn = event.target.closest("[data-del-id]");

    if (viewBtn) {
      const id = Number(viewBtn.dataset.viewId);
      try {
        const all = await window.FaultDB.history.getList(200, 0);
        const record = all.find(r => r.id === id);
        if (!record) return;
        switchPanel("diagnose");
        els.symptomInput.value = record.input;
        els.charCount.textContent = String(record.input.length);
        if (record.deviceType) els.deviceType.value = record.deviceType;
        const item = mergedDatabase.find(e => e.id === record.faultId);
        if (item) {
          renderResult(item, record.score || 96, record.matchedKeywords || [], record.input);
        } else {
          diagnose();
        }
      } catch (e) { /* ignore */ }
    }

    if (delBtn) {
      const id = Number(delBtn.dataset.delId);
      if (confirm("确定删除这条诊断记录？")) {
        await window.FaultDB.history.remove(id);
        await renderFullHistory(
          els.historySearch.value.trim(),
          els.historyDeviceFilter.value
        );
        await renderRecentHistory();
      }
    }
  });

  // 清空全部历史
  els.clearAllHistoryBtn.addEventListener("click", async () => {
    if (confirm("确定清空全部诊断历史？此操作不可恢复。")) {
      await window.FaultDB.history.clearAll();
      await renderFullHistory();
      await renderRecentHistory();
    }
  });

  // 导出历史
  els.exportHistoryBtn.addEventListener("click", exportHistory);

  // 知识库 - 搜索
  els.knowledgeSearch.addEventListener("input", debounce(() => {
    renderKnowledgeList(els.knowledgeSearch.value.trim());
  }, 300));

  // 知识库 - 删除导入条目
  els.knowledgeList.addEventListener("click", async (event) => {
    const delBtn = event.target.closest("[data-kn-id]");
    if (!delBtn) return;
    const id = delBtn.dataset.knId;
    if (confirm(`确定删除导入的知识条目 "${id}"？`)) {
      await window.FaultDB.faultData.remove(id);
      await loadImportedData();
      initializeDeviceTypes();
      initializeExamples();
      resetDataStatus();
      await renderKnowledgeList(els.knowledgeSearch.value.trim());
    }
  });

  // 清空全部导入数据
  els.clearImportedBtn.addEventListener("click", async () => {
    if (confirm("确定清空所有导入的故障知识条目？内置条目不受影响。")) {
      await window.FaultDB.faultData.clearAll();
      await window.FaultDB.files.clearAll();
      await loadImportedData();
      initializeDeviceTypes();
      initializeExamples();
      resetDataStatus();
      await renderKnowledgeList(els.knowledgeSearch.value.trim());
    }
  });

  // 导入 - 选择文件夹
  els.selectFolderBtn.addEventListener("click", triggerFolderSelect);
  els.folderInput.addEventListener("change", handleFileInputChange);

  // 导入 - 选择文件
  els.selectFilesBtn.addEventListener("click", triggerFileSelect);
  els.filesInput.addEventListener("change", handleFileInputChange);

  // 导入 - 确认 / 取消
  els.confirmImportBtn.addEventListener("click", confirmImport);
  els.cancelImportBtn.addEventListener("click", () => {
    els.importPreview.classList.add("hidden");
    pendingImportEntries = [];
  });

  // 导入 - 清空导入记录
  els.clearImportHistoryBtn.addEventListener("click", async () => {
    await window.FaultDB.files.clearAll();
    await renderImportedFiles();
  });

  /* ================================================================
   *  启动
   * ================================================================ */
  function resetDataStatus() {
    els.dataStatus.textContent = `知识库已加载 ${mergedDatabase.length} 条`;
    els.dataStatus.style.color = "#14a673";
    els.dataStatus.style.background = "#eafaf4";
  }

  async function init() {
    // 加载 IndexedDB 中的导入数据
    await loadImportedData();

    if (!mergedDatabase.length) {
      els.dataStatus.textContent = "未读取到故障数据";
      els.dataStatus.style.color = "#e34b4b";
      els.dataStatus.style.background = "#fff0f0";
    } else {
      initializeDeviceTypes();
      initializeExamples();
      resetDataStatus();
    }

    await renderRecentHistory();
    setupDragDrop();

    // 预先加载导入文件列表
    if (els.importedFilesList) await renderImportedFiles();
  }

  init();
})();
