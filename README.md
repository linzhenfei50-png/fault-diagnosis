# 智能故障诊断系统

纯前端界面 + 腾讯云云开发（CloudBase）后端，实现多人共享的工业设备故障诊断平台。

## 架构

```
浏览器 (GitHub Pages)
  │
  ├──→ 诊断请求 ──→ DeepSeek API（直连，Key 硬编码在前端）
  │
  └──→ 数据 CRUD ──→ CloudBase 云函数 ──→ NoSQL 文档库
       知识库/历史         (Web 函数)         云端数据库
```

- **AI 调用**：前端直接调用 DeepSeek，不使用后端代理
- **数据存储**：通过云函数 REST API 读写 CloudBase NoSQL 数据库，替代浏览器 IndexedDB

## 目录结构

```
fault-diagnosis-ui/
├── index.html              页面结构
├── styles.css              页面样式
├── app.js                  主逻辑（诊断、AI 调用、渲染）
├── db.js                   API 数据层（调用云函数）
├── data/
│   └── faults.js           内置故障知识库（可编辑扩充）
├── cloudbase/
│   ├── cloudbaserc.json    云函数部署配置
│   ├── README.md           后端部署说明
│   └── functions/
│       └── fault-diagnosis-api/
│           ├── index.js    云函数后端代码（Web 函数）
│           ├── package.json
│           └── scf_bootstrap
└── README.md
```

## 快速开始（前端）

直接双击 `index.html` 用浏览器打开即可。或者：

```bash
python -m http.server 8080
# → http://localhost:8080
```

## 部署后端（腾讯云云开发 CloudBase）

后端已迁移到腾讯云云开发（云函数 + NoSQL），国内直连免梯子。详见 [cloudbase/README.md](cloudbase/README.md)。

要点：

- 环境 ID：`fault-diagnosis-d5fe6kc909f3385d`（地域 ap-shanghai）
- HTTP 访问域名：`https://fault-diagnosis-d5fe6kc909f3385d.service.tcloudbase.com/api`
- 云函数：`fault-diagnosis-api`（Web 函数，Nodejs16.13）
- NoSQL 集合：`fault_entries` / `diagnosis_history` / `imported_files`

重新部署：

```bash
cd cloudbase
tcb login --apiKeyId <SecretId> --apiKey <SecretKey>
tcb fn deploy fault-diagnosis-api --httpFn --force
```

## 部署前端到 GitHub Pages

将整个项目（`db.js`、`app.js`、`data/`、`index.html` 等）推送到 GitHub 仓库，开启 GitHub Pages 即可。

> ⚠️ **CORS**：后端已默认 `Access-Control-Allow-Origin: *`，无需额外配置；如需收紧，可在 `cloudbaserc.json` 的 `envVariables.ALLOWED_ORIGIN` 设为你的 GitHub Pages 域名。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/faults` | 获取所有导入的故障条目 |
| POST | `/api/faults` | 批量保存故障条目 |
| DELETE | `/api/faults` | 清空所有导入条目 |
| DELETE | `/api/faults/:id` | 删除指定条目 |
| GET | `/api/history?limit=&offset=` | 分页获取诊断历史 |
| GET | `/api/history/search?q=&limit=` | 搜索历史 |
| GET | `/api/history/count` | 历史总数 |
| GET | `/api/history/export` | 导出全部历史 |
| POST | `/api/history` | 保存一条诊断记录 |
| DELETE | `/api/history` | 清空历史 |
| DELETE | `/api/history/:id` | 删除一条记录 |
| GET | `/api/files` | 获取导入文件列表 |
| POST | `/api/files` | 标记文件已导入 |
| DELETE | `/api/files` | 清空导入记录 |

## API Key 说明

- **默认 Key**：硬编码在 `app.js` 的 `DEFAULT_AI_CONFIG.apiKey` 中，所有用户共享
- **个人 Key**：用户可在界面 ⚙ 设置中更换为自己的 Key（保存在浏览器 localStorage）
- **显示保护**：界面上只显示 `••••xxxx`（后四位），但在浏览器 F12 源码中可看到完整 Key
- **安全建议**：如果对安全性要求较高，可将云函数改造为 AI 代理（添加 `/api/diagnose` 端点，Key 存在云函数环境变量中）

## 后续维护

### 扩充知识库

- 编辑 `data/faults.js` 添加内置条目（对所有人生效）
- 使用「导入数据」面板批量导入 JSON（存入 CloudBase NoSQL 数据库，对所有人生效）

### 故障条目格式

```js
{
  id: "唯一编号",
  deviceType: "设备类型",
  title: "方案标题",
  symptoms: ["故障现象1"],
  keywords: ["关键词1", "关键词2"],
  summary: "诊断摘要",
  severity: "高",          // 高 / 中 / 低
  shutdownRequired: true,
  estimatedTime: "30 分钟",
  causes: [{ name: "原因", probability: 60, evidence: "依据" }],
  solutions: [{ action: "步骤", detail: "说明", tools: ["工具"], duration: "耗时" }],
  diagram: [{ title: "节点", description: "说明" }],
  safety: "安全提示"
}
```
