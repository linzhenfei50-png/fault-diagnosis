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
    emptyIcon: $("#emptyIcon"),
    emptyTitle: $("#emptyTitle"),
    emptyDesc: $("#emptyDesc"),
    resultSection: $("#resultSection"),
    dataStatus: $("#dataStatus"),
    btnText: document.querySelector("#diagnoseButton .btn-text"),
    btnSpinner: document.querySelector("#diagnoseButton .btn-spinner"),

    // 诊断报告
    dbMatchBadge: $("#dbMatchBadge"),
    resultTitle: $("#resultTitle"),
    resultSummary: $("#resultSummary"),
    severityBadge: $("#severityBadge"),
    shutdownBadge: $("#shutdownBadge"),
    timeBadge: $("#timeBadge"),
    identifySymptom: $("#identifySymptom"),
    identifyDevice: $("#identifyDevice"),
    identifyDbStatus: $("#identifyDbStatus"),
    identifyDbNote: $("#identifyDbNote"),
    stepCauses: $("#stepCauses"),
    causeProgress: $("#causeProgress"),
    causeCheckHint: $("#causeCheckHint"),
    rootCauseStep: $("#rootCauseStep"),
    stepRootCause: $("#stepRootCause"),
    rootCausePending: $("#rootCausePending"),
    stepGuidance: $("#stepGuidance"),
    safetyText: $("#safetyText"),
    causeDetailDialog: $("#causeDetailDialog"),
    causeDetailTitle: $("#causeDetailTitle"),
    causeDetailBody: $("#causeDetailBody"),
    closeCauseDetail: $("#closeCauseDetail"),
    historyList: $("#historyList"),

    // AI 设置
    aiStatus: $("#aiStatus"),
    apiSettingsBtn: $("#apiSettingsBtn"),
    apiSettings: $("#apiSettings"),
    closeApiSettings: $("#closeApiSettings"),
    apiKeyStatus: $("#apiKeyStatus"),
    apiKeyInput: $("#apiKeyInput"),
    changeApiKeyBtn: $("#changeApiKeyBtn"),
    apiKeyActions: $("#apiKeyActions"),
    saveApiKeyBtn: $("#saveApiKeyBtn"),
    cancelApiKeyBtn: $("#cancelApiKeyBtn"),
    clearApiKeyBtn: $("#clearApiKeyBtn"),
    testApiBtn: $("#testApiBtn"),

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
    importTabs: $$(".import-tab"),
    importTabPanels: $$(".import-tab-panel"),
    importDropzone: $("#importDropzone"),
    selectFolderBtn: $("#selectFolderBtn"),
    selectFilesBtn: $("#selectFilesBtn"),
    folderInput: $("#folderInput"),
    filesInput: $("#filesInput"),
    // 文字输入
    textImportInput: $("#textImportInput"),
    textCharCount: $("#textCharCount"),
    aiParseTextBtn: $("#aiParseTextBtn"),
    manualEntryBtn: $("#manualEntryBtn"),
    textEntryForm: $("#textEntryForm"),
    textEntrySource: $("#textEntrySource"),
    textEntryId: $("#textEntryId"),
    textEntryDevice: $("#textEntryDevice"),
    textEntryTitle: $("#textEntryTitle"),
    textEntrySymptoms: $("#textEntrySymptoms"),
    textEntryKeywords: $("#textEntryKeywords"),
    textEntrySummary: $("#textEntrySummary"),
    textEntrySeverity: $("#textEntrySeverity"),
    saveTextEntryBtn: $("#saveTextEntryBtn"),
    jsonPasteInput: $("#jsonPasteInput"),
    parseJsonBtn: $("#parseJsonBtn"),
    // 图片上传
    imageDropzone: $("#imageDropzone"),
    selectImagesBtn: $("#selectImagesBtn"),
    imageInput: $("#imageInput"),
    imagePreviewGrid: $("#imagePreviewGrid"),
    imageEntryForm: $("#imageEntryForm"),
    imageEntryId: $("#imageEntryId"),
    imageEntryDevice: $("#imageEntryDevice"),
    imageEntryTitle: $("#imageEntryTitle"),
    imageEntryDesc: $("#imageEntryDesc"),
    saveImageEntryBtn: $("#saveImageEntryBtn"),
    // 共用
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
   *  AI 配置管理
   * ================================================================ */
  const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
  const DEEPSEEK_MODEL = "deepseek-chat";
  const AI_CONFIG_KEY = "fault-diagnosis-ai-config-v1";

  const DEFAULT_AI_CONFIG = {
    // 🔑 在此处填入你的 DeepSeek API Key（替换下方占位符）
    //    前端 UI 只会显示后四位（••••xxxx），但浏览器 F12 能看到完整 Key。
    //    如果你希望更安全，可以改为后端代理方案（见 worker/ 目录）。
    apiKey: "sk-your-deepseek-api-key-here",
    model: DEEPSEEK_MODEL,
    enabled: true
  };

  function getAIConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(AI_CONFIG_KEY));
      if (saved && typeof saved.apiKey === "string" && saved.apiKey.startsWith("sk-")) {
        return { ...DEFAULT_AI_CONFIG, ...saved };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_AI_CONFIG };
  }

  function saveAIConfig(config) {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  }

  function updateAIStatus() {
    const config = getAIConfig();
    if (!config.apiKey || !config.apiKey.startsWith("sk-")) {
      els.aiStatus.textContent = "🤖 AI 未配置";
      els.aiStatus.className = "ai-status off";
    } else {
      els.aiStatus.textContent = "🤖 AI 就绪";
      els.aiStatus.className = "ai-status on";
    }
  }

  /* ================================================================
   *  DeepSeek API 调用（返回结构化 JSON）
   * ================================================================ */
  async function callDeepSeekDiagnose(symptom, deviceType, knowledgeContext) {
    const config = getAIConfig();
    if (!config.apiKey || !config.apiKey.startsWith("sk-")) {
      throw new Error("API Key 未配置");
    }

    const deviceInfo = deviceType ? `设备类型：${deviceType}` : "设备类型：未指定";
    const knowledgeText = knowledgeContext.length
      ? `\n【参考知识库】\n${knowledgeContext.map((k, i) => `${i + 1}. ${k.title}：${k.summary}\n   可能原因：${(k.causes || []).map(c => c.name).join("、")}\n   解决措施：${(k.solutions || []).map(s => s.action).join("、")}`).join("\n")}`
      : "";

    const systemPrompt = `你是一名资深的工业设备故障诊断专家，拥有20年现场运维经验。

请根据故障现象和参考知识库，采用"排除法"进行诊断推理，返回严格的 JSON：

{
  "title": "诊断标题",
  "summary": "诊断摘要（80-150字）",
  "severity": "高/中/低",
  "shutdownRequired": true或false,
  "estimatedTime": "预计处理时间",
  "databaseMatch": true或false（此故障类型在参考知识库中是否有匹配条目）,
  "databaseNote": "如果匹配：说明匹配到了什么；如果未匹配：说明这是新故障类型。20-40字",

  "causes": [
    { "name": "原因名称", "probability": 40, "evidence": "判断依据一句话" }
  ],

  "eliminations": [
    { "cause": "被排除的原因", "ruledOut": true, "reason": "排除依据", "evidence": "相关证据" },
    { "cause": "被确认的原因", "ruledOut": false, "reason": "确认依据", "evidence": "相关证据" }
  ],

  "rootCauses": [
    { "scenario": "具体故障场景描述", "detail": "详细的故障机理说明，讲清楚为什么会发生", "probability": 60 }
  ],

  "guidance": {
    "steps": ["排查步骤1", "排查步骤2", "排查步骤3"],
    "tools": ["所需工具"],
    "prevention": "预防再发生的建议"
  },

  "safety": "安全提示"
}

规则：
- causes 列出3-5个可能原因，probability 总和100
- eliminations 至少包含2个被排除项和1个确认项，体现排除推理过程
- rootCauses 给出1-3个最可能的根因，具体描述故障场景
- guidance.steps 给出3-5个可操作的排查/整改步骤
- 必须返回严格合法的 JSON，不要有注释或额外说明`;

    const userMessage = `${deviceInfo}\n【故障现象】${symptom}${knowledgeText}\n\n请按照系统提示的 JSON 格式返回诊断结果，采用排除法进行推理分析。只返回 JSON，不要包含 markdown 代码块标记。`;

    const response = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 2048,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${response.status}`;
      if (response.status === 401) throw new Error("API Key 无效，请检查设置");
      if (response.status === 402) throw new Error("API 余额不足，请充值");
      if (response.status === 429) throw new Error("请求过于频繁，请稍后再试");
      throw new Error(`API 错误：${msg}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回内容为空，请重试");

    // 尝试从可能的 markdown 代码块中提取 JSON
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) content = jsonMatch[1];
    content = content.trim();

    const result = JSON.parse(content);
    return {
      id: "ai-" + Date.now(),
      deviceType: deviceType || "通用",
      title: result.title || "故障诊断结果",
      symptoms: [symptom],
      keywords: result.causes?.map(c => c.name) || [],
      summary: result.summary || "",
      severity: result.severity || "中",
      shutdownRequired: Boolean(result.shutdownRequired),
      estimatedTime: result.estimatedTime || "",
      databaseMatch: Boolean(result.databaseMatch),
      databaseNote: result.databaseNote || "",
      causes: Array.isArray(result.causes) ? result.causes : [],
      eliminations: Array.isArray(result.eliminations) ? result.eliminations : [],
      rootCauses: Array.isArray(result.rootCauses) ? result.rootCauses : [],
      guidance: result.guidance || { steps: [], tools: [], prevention: "" },
      safety: result.safety || "",
      matchScore: result.matchScore || 85,
    };
  }

  /* ================================================================
   *  按钮 loading 态
   * ================================================================ */
  function setDiagnoseLoading(loading) {
    els.diagnoseButton.disabled = loading;
    if (loading) {
      els.btnText.classList.add("hidden");
      els.btnSpinner.classList.remove("hidden");
    } else {
      els.btnText.classList.remove("hidden");
      els.btnSpinner.classList.add("hidden");
    }
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

  async function diagnose() {
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
    resetCauseChecks();

    // ── 先用关键词匹配选出 top3 知识条目作为 AI 上下文 ──
    const scored = mergedDatabase
      .filter(item => !selectedType || item.deviceType === selectedType)
      .map(item => scoreFault(item, input, selectedType))
      .sort((a, b) => b.rawScore - a.rawScore);

    // ── 显示加载态 ──
    els.emptyState.classList.remove("hidden");
    els.resultSection.classList.add("hidden");
    els.emptyIcon.textContent = "⏳";
    els.emptyTitle.textContent = "AI 正在分析中…";
    els.emptyDesc.textContent = "正在调用 DeepSeek 大模型，结合知识库进行智能故障诊断，请稍候。";
    setDiagnoseLoading(true);

    const config = getAIConfig();
    let aiResult = null;
    let aiError = null;

    if (config.apiKey && config.apiKey.startsWith("sk-")) {
      try {
        const top3 = scored.slice(0, 3).map(s => s.item);
        aiResult = await callDeepSeekDiagnose(input, selectedType, top3);
      } catch (err) {
        aiError = err.message;
        console.warn("[app] AI 诊断失败:", err);
      }
    }

    setDiagnoseLoading(false);

    // ── 渲染结果 ──
    if (aiResult) {
      renderResult(aiResult, aiResult.matchScore || 85, aiResult.keywords || [], input, true);
      saveHistory(input, aiResult, aiResult.matchScore || 85, aiResult.keywords || []);
    } else if (scored.length) {
      const best = scored[0];
      const displayScore = Math.max(38, Math.min(98, 42 + best.rawScore));
      renderResult(best.item, displayScore, best.matchedKeywords, input, false);
      saveHistory(input, best.item, displayScore, best.matchedKeywords);
    } else {
      showNoMatch("当前设备类型下没有可用诊断数据。请在 data/faults.js 中新增或通过导入功能添加知识条目。");
      return;
    }

    els.emptyState.classList.add("hidden");
    els.resultSection.classList.remove("hidden");
    els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    renderRecentHistory();
    // 恢复 emptyState 默认文案
    els.emptyIcon.textContent = "⌁";
    els.emptyTitle.textContent = "等待输入故障现象";
    els.emptyDesc.textContent = "系统将调用 DeepSeek AI 结合本地知识库进行智能故障诊断。";
  }

  function showNoMatch(message) {
    els.emptyState.classList.remove("hidden");
    els.resultSection.classList.add("hidden");
    els.emptyIcon.textContent = "⌁";
    els.emptyTitle.textContent = "未找到可用方案";
    els.emptyDesc.textContent = message;
  }

  function renderResult(item, score, matchedKeywords, input, isAI = false) {
    els.emptyState.classList.add("hidden");
    els.resultSection.classList.remove("hidden");

    /* ---- 报告头部 ---- */
    els.resultTitle.textContent = item.title;
    els.resultSummary.textContent = item.summary;
    els.severityBadge.textContent = `严重等级：${item.severity || "未定义"}`;
    els.severityBadge.style.background = severityColor(item.severity);
    els.shutdownBadge.textContent = item.shutdownRequired ? "建议停机" : "可在安全条件下继续排查";
    els.timeBadge.textContent = `预计耗时：${item.estimatedTime || "未定义"}`;

    // 数据库匹配标签
    if (isAI && item.databaseMatch !== undefined) {
      if (item.databaseMatch) {
        els.dbMatchBadge.textContent = "已有记录";
        els.dbMatchBadge.className = "report-badge existing";
      } else {
        els.dbMatchBadge.textContent = "新故障类型";
        els.dbMatchBadge.className = "report-badge new";
      }
    } else {
      els.dbMatchBadge.textContent = isAI ? "AI 诊断" : "本地匹配";
      els.dbMatchBadge.className = "report-badge existing";
    }

    /* ---- 步骤1：故障识别 ---- */
    els.identifySymptom.textContent = input;
    els.identifyDevice.textContent = item.deviceType || "未指定";
    if (isAI && item.databaseNote) {
      els.identifyDbStatus.textContent = item.databaseMatch ? "✅ 数据库中已存在此故障类型" : "⚠️ 数据库中未记录此故障";
      els.identifyDbNote.className = item.databaseMatch ? "step-note match-found" : "step-note match-new";
      els.identifyDbNote.textContent = item.databaseNote;
      els.identifyDbNote.classList.remove("hidden");
    } else {
      els.identifyDbStatus.textContent = "本地知识库匹配";
      els.identifyDbNote.classList.add("hidden");
    }

    /* ---- 步骤2：可能原因排查（交互式）---- */
    const causes = item.causes || [];
    const elims = item.eliminations || [];
    // 把 AI 的 eliminations 合并到对应 cause 中
    const elimMap = new Map();
    elims.forEach(e => elimMap.set(e.cause, e));

    if (causes.length) {
      els.stepCauses.innerHTML = `<div class="cause-list-report">${causes.map((c, i) => {
        const elim = elimMap.get(c.name);
        return `
        <div class="cause-card interactive" data-cause-index="${i}" data-cause-name="${escapeHtml(c.name)}">
          <div class="cause-card-top">
            <div style="flex:1;min-width:0;">
              <button class="cause-detail-btn" data-cause-detail="${i}" title="点击查看排查指导">
                <strong>${escapeHtml(c.name)}</strong>
              </button>
              <span class="cause-prob-badge">${Number(c.probability) || 0}%</span>
            </div>
            <div class="cause-toggle-group">
              <button class="cause-toggle confirm" data-cause="${i}" data-mark="confirm" title="标记为确认原因">✅ 确认</button>
              <button class="cause-toggle ruleout" data-cause="${i}" data-mark="ruleout" title="标记为已排除">❌ 排除</button>
            </div>
          </div>
          <div class="progress"><div style="width:${Math.min(100, Math.max(0, Number(c.probability) || 0))}%"></div></div>
          <p>${escapeHtml(c.evidence || "")}</p>
          ${elim ? `<div class="cause-elim-hint">AI 分析：${elim.ruledOut ? '建议排除 — ' : '建议确认 — '}${escapeHtml(elim.reason)}</div>` : ""}
          <div class="cause-detail-panel hidden" id="causeDetailPanel${i}">
            <div class="cause-detail-inner">
              <strong>🔍 排查指导</strong>
              <p>${escapeHtml(elim?.evidence || c.evidence || "请根据现场情况逐一核实此原因。")}</p>
              <div class="cause-detail-actions">
                <button class="primary-button small" data-cause-mark="${i}" data-mark="confirm">✅ 确认为此原因</button>
                <button class="outline-button small" data-cause-mark="${i}" data-mark="ruleout">❌ 排除此原因</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join("")}</div>`;
      els.causeCheckHint.classList.remove("hidden");
      els.rootCausePending.classList.remove("hidden");
      updateCauseProgress(causes.length, 0);
    } else {
      els.stepCauses.innerHTML = `<p class="history-empty">暂无原因数据。</p>`;
      els.causeCheckHint.classList.add("hidden");
    }

    /* ---- 步骤3：根因定位（初始为待排查状态）---- */
    els.rootCauseStep.querySelector(".step-marker").textContent = "03";
    els.rootCausePending.classList.remove("hidden");
    els.stepRootCause.innerHTML = "";
    els.stepRootCause.appendChild(els.rootCausePending);

    /* ---- 步骤4：指导建议 ---- */
    const guidance = item.guidance || {};
    const gSteps = guidance.steps || [];
    if (gSteps.length) {
      els.stepGuidance.innerHTML = `
        <div class="guidance-steps">${gSteps.map((step, i) => `
          <div class="guidance-item">
            <span class="guidance-num">${i + 1}</span>
            <div><p>${escapeHtml(step)}</p></div>
          </div>
        `).join("")}</div>
        ${guidance.tools?.length ? `<div style="margin-top:10px;font-size:12px;color:var(--text-tertiary);">🔧 所需工具：${guidance.tools.map(t => escapeHtml(t)).join("、")}</div>` : ""}
        ${guidance.prevention ? `<div class="step-note match-found" style="margin-top:10px;">💡 预防建议：${escapeHtml(guidance.prevention)}</div>` : ""}
      `;
    } else {
      // fallback: use solutions
      const sols = item.solutions || [];
      els.stepGuidance.innerHTML = sols.length ? `
        <div class="guidance-steps">${sols.map((s, i) => `
          <div class="guidance-item">
            <span class="guidance-num">${i + 1}</span>
            <div>
              <p>${escapeHtml(s.action)}</p>
              <small>${escapeHtml(s.detail || "")}${s.duration ? ' · 耗时：' + escapeHtml(s.duration) : ''}</small>
            </div>
          </div>
        `).join("")}</div>
      ` : `<p class="history-empty">暂无指导建议。</p>`;
    }

    /* ---- 安全提示 ---- */
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

  // ── 原因排查交互 ──
  let causeChecks = {}; // { causeIndex: 'confirm' | 'ruleout' }

  function updateCauseProgress(total, checked) {
    els.causeProgress.textContent = `已排查 ${checked}/${total}`;
  }

  function resetCauseChecks() {
    causeChecks = {};
    els.causeProgress.textContent = "";
  }

  els.stepCauses.addEventListener("click", (event) => {
    // 点击原因标题 → 展开/收起排查指导面板
    const detailBtn = event.target.closest("[data-cause-detail]");
    if (detailBtn) {
      const idx = detailBtn.dataset.causeDetail;
      const panel = document.getElementById("causeDetailPanel" + idx);
      if (panel) panel.classList.toggle("hidden");
      return;
    }

    // 点击内联面板中的标记按钮
    const inlineMark = event.target.closest("[data-cause-mark]");
    if (inlineMark) {
      const idx = parseInt(inlineMark.dataset.causeMark);
      const mark = inlineMark.dataset.mark;
      applyCauseMark(idx, mark);
      return;
    }

    // 点击头部 ✅/❌ 切换按钮
    const toggle = event.target.closest("[data-cause]");
    if (toggle) {
      const idx = parseInt(toggle.dataset.cause);
      const mark = toggle.dataset.mark;
      applyCauseMark(idx, mark);
      return;
    }
  });

  function applyCauseMark(idx, mark) {
    causeChecks[idx] = mark;
    const cards = els.stepCauses.querySelectorAll(".cause-card.interactive");
    cards.forEach(card => {
      const cardIdx = parseInt(card.dataset.causeIndex);
      const confirmBtn = card.querySelector(".cause-toggle.confirm");
      const ruleoutBtn = card.querySelector(".cause-toggle.ruleout");

      if (cardIdx === idx) {
        card.classList.remove("marked-confirm", "marked-ruleout");
        card.classList.add(mark === "confirm" ? "marked-confirm" : "marked-ruleout");
        if (confirmBtn) confirmBtn.classList.toggle("active", mark === "confirm");
        if (ruleoutBtn) ruleoutBtn.classList.toggle("active", mark === "ruleout");
        // 收起排查面板
        const panel = document.getElementById("causeDetailPanel" + idx);
        if (panel) panel.classList.add("hidden");
      }
    });

    const total = cards.length;
    const checked = Object.keys(causeChecks).length;
    updateCauseProgress(total, checked);

    // 全部排查完毕 → 生成根因报告
    if (checked >= total) {
      generateRootCauseReport();
    }
  }

  function generateRootCauseReport() {
    const confirmedCauses = [];
    const ruledOutCauses = [];
    const cards = els.stepCauses.querySelectorAll(".cause-card.interactive");
    cards.forEach(card => {
      const name = card.dataset.causeName;
      const probEl = card.querySelector(".cause-prob-badge");
      const prob = probEl ? parseInt(probEl.textContent) || 0 : 0;
      const evidenceEl = card.querySelector("p");
      const evidence = evidenceEl ? evidenceEl.textContent : "";

      if (card.classList.contains("marked-confirm")) {
        confirmedCauses.push({ name, probability: prob, evidence });
      } else if (card.classList.contains("marked-ruleout")) {
        ruledOutCauses.push({ name, probability: prob, evidence });
      }
    });

    // 隐藏 pending 提示
    els.rootCausePending.classList.add("hidden");
    els.rootCauseStep.querySelector(".step-marker").textContent = "03";

    if (confirmedCauses.length) {
      // 生成根因报告
      const now = new Date().toLocaleString("zh-CN", { hour12: false });
      const primaryRoot = confirmedCauses.sort((a, b) => b.probability - a.probability)[0];

      els.stepRootCause.innerHTML = `
        <div class="root-cause-report">
          <div class="report-section">
            <strong>🎯 根因确认</strong>
            <div class="root-cause-list">
              ${confirmedCauses.map(rc => `
                <div class="root-cause-item">
                  <strong>${escapeHtml(rc.name)}</strong>
                  <p>${escapeHtml(rc.evidence)}</p>
                  <span class="root-cause-prob">可能性 ${rc.probability}%</span>
                </div>
              `).join("")}
            </div>
          </div>

          ${ruledOutCauses.length ? `
          <div class="report-section" style="margin-top:12px;">
            <strong>🔬 已排除原因</strong>
            <div class="elim-list">
              ${ruledOutCauses.map(e => `
                <div class="elim-item ruled-out">
                  <span class="elim-icon">✗</span>
                  <span>${escapeHtml(e.name)}</span>
                </div>
              `).join("")}
            </div>
          </div>` : ""}

          <div class="report-section" style="margin-top:12px;">
            <strong>📋 排查总结</strong>
            <div class="report-summary-card">
              <p>本次共排查 <strong>${cards.length}</strong> 个可能原因，确认 <strong>${confirmedCauses.length}</strong> 个根因，排除 <strong>${ruledOutCauses.length}</strong> 个原因。</p>
              <p>最终根因：<strong>${escapeHtml(primaryRoot?.name || "待定")}</strong></p>
              <p class="report-meta">报告生成时间：${now}</p>
            </div>
          </div>

          <div class="report-section" style="margin-top:12px;">
            <strong>💡 改进建议</strong>
            <div class="step-note match-found">
              <p style="margin:0;">针对根因 <strong>${escapeHtml(primaryRoot?.name || "上述原因")}</strong>，建议：</p>
              <ul style="margin:6px 0 0 18px; font-size:13px; line-height:1.7;">
                <li>制定针对性的预防性维护计划，定期检查相关部件</li>
                <li>将此次故障案例补充到知识库中，便于后续快速定位</li>
                <li>对相关操作人员进行针对性培训，避免类似误操作</li>
                <li>考虑增加相应的监测/保护措施，提前预警</li>
              </ul>
            </div>
          </div>
        </div>
      `;
    } else {
      // 全部排除但没有确认项
      els.stepRootCause.innerHTML = `
        <div class="root-cause-report">
          <div class="report-section">
            <strong>⚠️ 未找到明确根因</strong>
            <p style="color:var(--text-secondary); font-size:13px;">所有可能原因均已被排除。建议重新评估故障现象，或补充更多现场信息后再次诊断。</p>
          </div>
        </div>
      `;
    }
  }

  // ── 关闭原因详情对话框 ──
  els.closeCauseDetail.addEventListener("click", () => {
    els.causeDetailDialog.close();
  });
  els.causeDetailDialog.addEventListener("click", (e) => {
    if (e.target === els.causeDetailDialog) els.causeDetailDialog.close();
  });

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
        const fromAI = record.faultId && record.faultId.startsWith("ai-");
        renderResult(item, record.score || 96, record.matchedKeywords || [], record.input, fromAI);
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
          const fromAI = record.faultId && record.faultId.startsWith("ai-");
          renderResult(item, record.score || 96, record.matchedKeywords || [], record.input, fromAI);
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

  // ── 导入 Tab 切换 ──
  els.importTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      els.importTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      els.importTabPanels.forEach(p => p.classList.remove("active"));
      const panel = document.getElementById("tab" + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if (panel) panel.classList.add("active");
    });
  });

  // ── 文字导入 ──
  els.textImportInput.addEventListener("input", () => {
    els.textCharCount.textContent = els.textImportInput.value.length + " 字符";
  });

  /** 填充文本条目表单 */
  function fillTextEntryForm(data) {
    els.textEntryId.value = data.id || "entry-" + Date.now();
    els.textEntryDevice.value = data.deviceType || "";
    els.textEntryTitle.value = data.title || "";
    els.textEntrySymptoms.value = (data.symptoms || []).join("；") || "";
    els.textEntryKeywords.value = (data.keywords || []).join("，");
    els.textEntrySummary.value = data.summary || "";
    els.textEntrySeverity.value = data.severity || "中";
    els.textEntryForm.classList.remove("hidden");
  }

  /** 从表单收集条目数据 */
  function collectTextEntry() {
    return {
      id: els.textEntryId.value.trim(),
      deviceType: els.textEntryDevice.value.trim() || "通用",
      title: els.textEntryTitle.value.trim(),
      symptoms: els.textEntrySymptoms.value.trim().split(/[；;，,、]/).map(s => s.trim()).filter(Boolean),
      keywords: els.textEntryKeywords.value.trim().split(/[，,、]/).map(s => s.trim()).filter(Boolean),
      summary: els.textEntrySummary.value.trim(),
      severity: els.textEntrySeverity.value,
      shutdownRequired: els.textEntrySeverity.value === "高",
      estimatedTime: "",
      causes: [],
      solutions: [],
      diagram: [],
      safety: ""
    };
  }

  // AI 智能解析
  els.aiParseTextBtn.addEventListener("click", async () => {
    const text = els.textImportInput.value.trim();
    if (!text) { alert("请先输入故障描述文本"); return; }

    const config = getAIConfig();
    if (!config.apiKey || !config.apiKey.startsWith("sk-")) {
      alert("请先在顶部 ⚙ 设置中配置 DeepSeek API Key，才能使用 AI 解析功能。");
      return;
    }

    els.aiParseTextBtn.textContent = "⏳ AI 解析中…";
    els.aiParseTextBtn.disabled = true;

    try {
      const response = await fetch(DEEPSEEK_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "system",
              content: `你是一个工业设备故障数据录入助手。从用户输入的故障描述文本中提取关键信息，返回严格 JSON：

{
  "id": "唯一英文ID，如 rs485-resistor-burn",
  "deviceType": "设备类型，如 通讯电路板",
  "title": "故障标题，20字以内",
  "symptoms": ["故障现象1", "故障现象2"],
  "keywords": ["关键词1", "关键词2"],
  "summary": "诊断摘要，80-150字",
  "severity": "高/中/低",
  "shutdownRequired": true或false,
  "causes": [{"name": "原因", "probability": 40, "evidence": "依据"}],
  "solutions": [{"action": "措施", "detail": "说明", "tools": ["工具"], "duration": "耗时"}],
  "diagram": [{"title": "步骤", "description": "说明"}],
  "safety": "安全提示"
}

只返回JSON，不要markdown标记。`
            },
            { role: "user", content: text }
          ],
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || "HTTP " + response.status);
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || "";
      // 提取 JSON
      const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (m) content = m[1];
      const parsed = JSON.parse(content.trim());

      fillTextEntryForm(parsed);
      els.textEntrySource.textContent = "🤖 由 AI 自动解析生成";
      els.textEntryForm.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      alert("AI 解析失败：" + e.message + "\n\n请尝试手动填写或检查网络。");
    }

    els.aiParseTextBtn.textContent = "🤖 AI 智能解析";
    els.aiParseTextBtn.disabled = false;
  });

  // 手动填写
  els.manualEntryBtn.addEventListener("click", () => {
    const text = els.textImportInput.value.trim();
    fillTextEntryForm({
      id: "entry-" + Date.now(),
      deviceType: "",
      title: "",
      symptoms: text ? [text] : [],
      keywords: [],
      summary: text || "",
      severity: "中",
      causes: [],
      solutions: [],
      diagram: [],
      safety: ""
    });
    els.textEntrySource.textContent = "✏️ 手动填写";
    els.textEntryForm.classList.remove("hidden");
    els.textEntryForm.scrollIntoView({ behavior: "smooth" });
  });

  // 保存文本条目
  els.saveTextEntryBtn.addEventListener("click", async () => {
    const entry = collectTextEntry();
    if (!entry.id || !entry.title) { alert("请至少填写故障 ID 和标题"); return; }
    if (entry.summary.length < 10) { alert("诊断摘要至少需要 10 个字符"); return; }

    try {
      await window.FaultDB.faultData.saveAll([entry]);
      await window.FaultDB.files.mark(entry.id + " (文字输入)");
      await loadImportedData();
      initializeDeviceTypes();
      initializeExamples();
      resetDataStatus();

      els.importResult.classList.remove("hidden");
      els.importResult.innerHTML = `
        <div class="import-success">
          <span class="import-check">✅</span>
          <div><strong>条目已保存</strong><p>故障条目 "${escapeHtml(entry.title)}" 已加入知识库。</p></div>
        </div>`;
      els.importResult.scrollIntoView({ behavior: "smooth" });

      // 重置表单
      els.textEntryForm.classList.add("hidden");
      els.textEntryId.value = ""; els.textEntryDevice.value = "";
      els.textEntryTitle.value = ""; els.textEntrySymptoms.value = "";
      els.textEntryKeywords.value = ""; els.textEntrySummary.value = "";
      renderImportedFiles();
    } catch (e) {
      alert("保存失败：" + e.message);
    }
  });

  // JSON 直接粘贴（兼容高级用户）
  els.parseJsonBtn.addEventListener("click", () => {
    const text = els.jsonPasteInput.value.trim();
    if (!text) { alert("请先粘贴 JSON 数据"); return; }
    const { entries, errors } = parseFileContent(text, "JSON粘贴");
    if (!entries.length) {
      alert("解析失败：" + (errors[0] || "无法解析"));
      return;
    }
    const fileNames = [{ name: "JSON 粘贴 (" + entries.length + " 条)", size: new Blob([text]).size }];
    showImportPreview(entries, errors, fileNames);
    els.importPreview.scrollIntoView({ behavior: "smooth" });
  });

  // ── 图片上传 ──
  let pendingImages = [];

  els.selectImagesBtn.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", handleImageSelect);

  function handleImageSelect(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { alert(`图片 "${file.name}" 超过 5MB，已跳过`); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        pendingImages.push({ name: file.name, dataUrl: reader.result, size: file.size });
        renderImagePreviews();
      };
      reader.readAsDataURL(file);
    }
    event.target.value = "";
  }

  function renderImagePreviews() {
    els.imagePreviewGrid.innerHTML = pendingImages.map((img, i) => `
      <div class="image-preview-item${i === pendingImages.length - 1 && !els.imageEntryId.value ? ' selected' : ''}" data-img-index="${i}">
        <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />
        <button class="img-remove" data-img-remove="${i}" title="移除">×</button>
      </div>
    `).join("");

    if (pendingImages.length && !els.imageEntryId.value) {
      // 自动弹出录入表单
      els.imageEntryForm.classList.remove("hidden");
      const lastName = pendingImages[pendingImages.length - 1].name.replace(/\.[^.]+$/, "");
      els.imageEntryId.value = "img-" + Date.now();
      els.imageEntryTitle.placeholder = `如：${lastName}相关故障`;
    }

    // 点击图片选中
    els.imagePreviewGrid.querySelectorAll(".image-preview-item").forEach(item => {
      item.addEventListener("click", (e) => {
        if (e.target.closest("[data-img-remove]")) return;
        els.imagePreviewGrid.querySelectorAll(".image-preview-item").forEach(i => i.classList.remove("selected"));
        item.classList.add("selected");
        els.imageEntryForm.classList.remove("hidden");
      });
    });

    // 移除按钮
    els.imagePreviewGrid.querySelectorAll("[data-img-remove]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.imgRemove);
        pendingImages.splice(idx, 1);
        renderImagePreviews();
        if (!pendingImages.length) els.imageEntryForm.classList.add("hidden");
      });
    });
  }

  els.saveImageEntryBtn.addEventListener("click", async () => {
    const id = els.imageEntryId.value.trim();
    const title = els.imageEntryTitle.value.trim();
    if (!id || !title) { alert("请填写故障 ID 和标题"); return; }

    const entry = {
      id,
      deviceType: els.imageEntryDevice.value.trim() || "通用",
      title,
      symptoms: [els.imageEntryDesc.value.trim() || title],
      keywords: [title, els.imageEntryDevice.value.trim()].filter(Boolean),
      summary: els.imageEntryDesc.value.trim() || title,
      severity: "中",
      shutdownRequired: false,
      estimatedTime: "",
      causes: [],
      solutions: [],
      diagram: [],
      safety: "",
      // 附加图片数据
      _images: pendingImages.map(img => ({ name: img.name, dataUrl: img.dataUrl }))
    };

    try {
      await window.FaultDB.faultData.saveAll([entry]);
      await window.FaultDB.files.mark(id + " (图片导入)");
      await loadImportedData();
      initializeDeviceTypes();
      initializeExamples();
      resetDataStatus();

      els.importResult.classList.remove("hidden");
      els.importResult.innerHTML = `
        <div class="import-success">
          <span class="import-check">✅</span>
          <div><strong>图片条目已保存</strong><p>故障条目 "${escapeHtml(title)}" 已加入知识库，包含 ${pendingImages.length} 张参考图片。</p></div>
        </div>`;
      els.importResult.scrollIntoView({ behavior: "smooth" });

      // 重置
      pendingImages = [];
      els.imagePreviewGrid.innerHTML = "";
      els.imageEntryForm.classList.add("hidden");
      els.imageEntryId.value = "";
      els.imageEntryDevice.value = "";
      els.imageEntryTitle.value = "";
      els.imageEntryDesc.value = "";
      renderImportedFiles();
    } catch (e) {
      alert("保存失败：" + e.message);
    }
  });

  // 图片拖拽
  if (els.imageDropzone) {
    ["dragenter", "dragover"].forEach(evt => {
      els.imageDropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.imageDropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(evt => {
      els.imageDropzone.addEventListener(evt, () => els.imageDropzone.classList.remove("dragover"));
    });
    els.imageDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      const imageFiles = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/"));
      if (imageFiles.length) {
        handleImageSelect({ target: { files: imageFiles } });
      }
    });
  }

  // ── 清空导入记录 ──
  els.clearImportHistoryBtn.addEventListener("click", async () => {
    await window.FaultDB.files.clearAll();
    await renderImportedFiles();
  });

  // ── API 设置 ──
  function refreshApiKeyUI() {
    const config = getAIConfig();
    const hasKey = config.apiKey && config.apiKey.startsWith("sk-");
    if (hasKey) {
      els.apiKeyStatus.textContent = "••••" + config.apiKey.slice(-4);
      els.apiKeyStatus.className = "api-key-status configured";
      els.changeApiKeyBtn.textContent = "更换 Key";
    } else {
      els.apiKeyStatus.textContent = "未配置";
      els.apiKeyStatus.className = "api-key-status empty";
      els.changeApiKeyBtn.textContent = "设置 Key";
    }
    els.apiKeyInput.classList.add("hidden");
    els.apiKeyActions.classList.add("hidden");
    els.apiKeyInput.value = "";
  }

  els.apiSettingsBtn.addEventListener("click", () => {
    els.apiSettings.classList.toggle("hidden");
    if (!els.apiSettings.classList.contains("hidden")) {
      refreshApiKeyUI();
      els.apiSettings.scrollIntoView({ behavior: "smooth" });
    }
  });

  els.closeApiSettings.addEventListener("click", () => {
    els.apiSettings.classList.add("hidden");
    els.apiKeyInput.classList.add("hidden");
    els.apiKeyActions.classList.add("hidden");
  });

  els.changeApiKeyBtn.addEventListener("click", () => {
    els.apiKeyInput.classList.remove("hidden");
    els.apiKeyActions.classList.remove("hidden");
    els.apiKeyInput.value = "";
    els.apiKeyInput.focus();
  });

  els.cancelApiKeyBtn.addEventListener("click", () => {
    els.apiKeyInput.classList.add("hidden");
    els.apiKeyActions.classList.add("hidden");
    els.apiKeyInput.value = "";
  });

  els.saveApiKeyBtn.addEventListener("click", () => {
    const apiKey = els.apiKeyInput.value.trim();
    if (!apiKey) { alert("请输入 API Key"); return; }
    if (!apiKey.startsWith("sk-")) { alert("API Key 格式不正确，应以 sk- 开头"); return; }
    const config = getAIConfig();
    config.apiKey = apiKey;
    saveAIConfig(config);
    updateAIStatus();
    refreshApiKeyUI();
  });

  els.clearApiKeyBtn.addEventListener("click", () => {
    if (!confirm("确定清除已保存的 API Key？清除后 AI 诊断将不可用。")) return;
    const config = getAIConfig();
    config.apiKey = "";
    saveAIConfig(config);
    updateAIStatus();
    refreshApiKeyUI();
  });

  els.testApiBtn.addEventListener("click", async () => {
    const config = getAIConfig();
    const apiKey = config.apiKey;
    if (!apiKey || !apiKey.startsWith("sk-")) { alert("请先设置有效的 API Key"); return; }

    els.testApiBtn.textContent = "测试中…";
    els.testApiBtn.disabled = true;
    try {
      const response = await fetch(DEEPSEEK_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: [{ role: "user", content: "回复：ok" }], max_tokens: 10, temperature: 0 })
      });
      if (response.ok) {
        alert("✅ API 连接成功！DeepSeek 已就绪。");
        updateAIStatus();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(`❌ 连接失败：${err.error?.message || "HTTP " + response.status}`);
      }
    } catch (e) {
      alert(`❌ 网络错误：${e.message}`);
    }
    els.testApiBtn.textContent = "测试连接";
    els.testApiBtn.disabled = false;
  });

  // 点击 AI 状态标签也可打开设置
  els.aiStatus.addEventListener("click", () => {
    els.apiSettings.classList.toggle("hidden");
    if (!els.apiSettings.classList.contains("hidden")) {
      refreshApiKeyUI();
    }
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

    // 初始化 AI 状态
    updateAIStatus();

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
