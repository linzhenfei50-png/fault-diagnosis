(() => {
  "use strict";

  const database = Array.isArray(window.FAULT_DATABASE) ? window.FAULT_DATABASE : [];
  const HISTORY_KEY = "fault-diagnosis-history-v1";

  const elements = {
    deviceType: document.querySelector("#deviceType"),
    symptomInput: document.querySelector("#symptomInput"),
    charCount: document.querySelector("#charCount"),
    diagnoseButton: document.querySelector("#diagnoseButton"),
    clearHistoryButton: document.querySelector("#clearHistoryButton"),
    quickExamples: document.querySelector("#quickExamples"),
    emptyState: document.querySelector("#emptyState"),
    resultSection: document.querySelector("#resultSection"),
    dataStatus: document.querySelector("#dataStatus"),
    resultTitle: document.querySelector("#resultTitle"),
    resultSummary: document.querySelector("#resultSummary"),
    severityBadge: document.querySelector("#severityBadge"),
    shutdownBadge: document.querySelector("#shutdownBadge"),
    timeBadge: document.querySelector("#timeBadge"),
    matchScore: document.querySelector("#matchScore"),
    matchExplanation: document.querySelector("#matchExplanation"),
    causeList: document.querySelector("#causeList"),
    solutionList: document.querySelector("#solutionList"),
    diagramFlow: document.querySelector("#diagramFlow"),
    safetyText: document.querySelector("#safetyText"),
    historyList: document.querySelector("#historyList")
  };

  const normalizeText = (value) => String(value || "").toLowerCase().replace(/[\s，。；、,.!?！？：:（）()\-_/]/g, "");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function initializeDeviceTypes() {
    const types = [...new Set(database.map(item => item.deviceType).filter(Boolean))];
    elements.deviceType.insertAdjacentHTML(
      "beforeend",
      types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")
    );
  }

  function initializeExamples() {
    const examples = database.slice(0, 4).map(item => item.symptoms?.[0]).filter(Boolean);
    elements.quickExamples.innerHTML = examples
      .map(example => `<button type="button" class="example-chip" data-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`)
      .join("");

    elements.quickExamples.addEventListener("click", event => {
      const button = event.target.closest("[data-example]");
      if (!button) return;
      elements.symptomInput.value = button.dataset.example;
      elements.charCount.textContent = String(elements.symptomInput.value.length);
      elements.symptomInput.focus();
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
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) return;

      if (normalizedInput.includes(normalizedKeyword)) {
        score += index < (item.keywords || []).length ? 12 : 8;
        matchedKeywords.push(keyword);
        return;
      }

      // 对较长描述做字符覆盖率补分，适合中文无分词场景。
      if (normalizedKeyword.length >= 4) {
        const uniqueChars = [...new Set(normalizedKeyword)];
        const hitCount = uniqueChars.filter(char => normalizedInput.includes(char)).length;
        const coverage = hitCount / uniqueChars.length;
        if (coverage >= 0.55) score += Math.round(coverage * 7);
      }
    });

    return {
      item,
      rawScore: score,
      matchedKeywords: [...new Set(matchedKeywords)]
    };
  }

  function diagnose() {
    const input = elements.symptomInput.value.trim();
    const selectedType = elements.deviceType.value;

    if (!input) {
      elements.symptomInput.focus();
      elements.symptomInput.setAttribute("aria-invalid", "true");
      elements.dataStatus.textContent = "请先输入故障现象";
      elements.dataStatus.style.color = "#e34b4b";
      elements.dataStatus.style.background = "#fff0f0";
      return;
    }

    elements.symptomInput.removeAttribute("aria-invalid");
    resetDataStatus();

    const scored = database
      .filter(item => !selectedType || item.deviceType === selectedType)
      .map(item => scoreFault(item, input, selectedType))
      .sort((a, b) => b.rawScore - a.rawScore);

    if (!scored.length) {
      showNoMatch("当前设备类型下没有可用诊断数据。请在 data/faults.js 中新增知识条目。");
      return;
    }

    const best = scored[0];
    const displayScore = Math.max(38, Math.min(98, 42 + best.rawScore));
    renderResult(best.item, displayScore, best.matchedKeywords, input);
    saveHistory(input, best.item);
    renderHistory();
  }

  function showNoMatch(message) {
    elements.emptyState.classList.remove("hidden");
    elements.resultSection.classList.add("hidden");
    elements.emptyState.querySelector("h2").textContent = "未找到可用方案";
    elements.emptyState.querySelector("p").textContent = message;
  }

  function renderResult(item, score, matchedKeywords, input) {
    elements.emptyState.classList.add("hidden");
    elements.resultSection.classList.remove("hidden");

    elements.resultTitle.textContent = item.title;
    elements.resultSummary.textContent = item.summary;
    elements.severityBadge.textContent = `严重等级：${item.severity || "未定义"}`;
    elements.severityBadge.style.background = severityColor(item.severity);
    elements.shutdownBadge.textContent = item.shutdownRequired ? "建议停机" : "可在安全条件下继续排查";
    elements.timeBadge.textContent = `预计：${item.estimatedTime || "未定义"}`;
    elements.matchScore.textContent = `${score}%`;
    elements.matchExplanation.textContent = matchedKeywords.length
      ? `已匹配关键词：${matchedKeywords.slice(0, 5).join("、")}`
      : `已根据设备类型和描述相似度匹配。建议人工复核。`;

    elements.causeList.innerHTML = (item.causes || []).map(cause => `
      <div class="cause-item">
        <div class="cause-top">
          <strong>${escapeHtml(cause.name)}</strong>
          <span>${Number(cause.probability) || 0}%</span>
        </div>
        <div class="progress"><div style="width:${Math.min(100, Math.max(0, Number(cause.probability) || 0))}%"></div></div>
        <p>${escapeHtml(cause.evidence || "")}</p>
      </div>
    `).join("") || `<p class="history-empty">尚未配置原因分析。</p>`;

    elements.solutionList.innerHTML = (item.solutions || []).map((solution, index) => `
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

    elements.diagramFlow.innerHTML = (item.diagram || []).flatMap((node, index, array) => {
      const nodeHtml = `
        <div class="flow-node">
          <strong>${index + 1}. ${escapeHtml(node.title)}</strong>
          <p>${escapeHtml(node.description || "")}</p>
        </div>`;
      return index < array.length - 1 ? [nodeHtml, `<div class="flow-arrow" aria-hidden="true">→</div>`] : [nodeHtml];
    }).join("") || `<p class="history-empty">尚未配置排查流程图。</p>`;

    elements.safetyText.textContent = item.safety || "请遵守设备制造商和现场安全规程。";
    elements.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function severityColor(severity) {
    if (severity === "高") return "#e34b4b";
    if (severity === "中") return "#e69a13";
    return "#14a673";
  }

  function getHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveHistory(input, item) {
    const history = getHistory();
    history.unshift({
      input,
      faultId: item.id,
      title: item.title,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  }

  function renderHistory() {
    const history = getHistory();
    if (!history.length) {
      elements.historyList.innerHTML = `<p class="history-empty">暂无本地诊断记录。</p>`;
      return;
    }

    elements.historyList.innerHTML = history.map((record, index) => `
      <div class="history-item">
        <button type="button" data-history-index="${index}">
          <strong>${escapeHtml(record.input)}</strong><br />
          <small>${escapeHtml(record.title)}</small>
        </button>
        <small>${formatDate(record.createdAt)}</small>
      </div>
    `).join("");
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
  }

  function resetDataStatus() {
    elements.dataStatus.textContent = `知识库已加载 ${database.length} 条`;
    elements.dataStatus.style.color = "#14a673";
    elements.dataStatus.style.background = "#eafaf4";
  }

  elements.symptomInput.addEventListener("input", () => {
    elements.charCount.textContent = String(elements.symptomInput.value.length);
  });

  elements.symptomInput.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") diagnose();
  });

  elements.diagnoseButton.addEventListener("click", diagnose);

  elements.clearHistoryButton.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  elements.historyList.addEventListener("click", event => {
    const button = event.target.closest("[data-history-index]");
    if (!button) return;
    const history = getHistory();
    const record = history[Number(button.dataset.historyIndex)];
    if (!record) return;
    elements.symptomInput.value = record.input;
    elements.charCount.textContent = String(record.input.length);
    const item = database.find(entry => entry.id === record.faultId);
    if (item) {
      elements.deviceType.value = item.deviceType || "";
      renderResult(item, 96, item.keywords || [], record.input);
    } else {
      diagnose();
    }
  });

  if (!database.length) {
    elements.dataStatus.textContent = "未读取到故障数据";
    elements.dataStatus.style.color = "#e34b4b";
    elements.dataStatus.style.background = "#fff0f0";
  } else {
    initializeDeviceTypes();
    initializeExamples();
    resetDataStatus();
  }
  renderHistory();
})();
