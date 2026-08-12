# 智能故障诊断系统

纯前端界面 + Cloudflare Workers 后端，实现多人共享的工业设备故障诊断平台。

## 架构

```
浏览器 (GitHub Pages)
  │
  ├──→ 诊断请求 ──→ DeepSeek API（直连，Key 硬编码在前端）
  │
  └──→ 数据 CRUD ──→ Cloudflare Worker ──→ D1 (SQLite)
       知识库/历史       边缘函数            云端数据库
```

- **AI 调用**：前端直接调用 DeepSeek，不使用后端代理
- **数据存储**：通过 Worker REST API 读写 D1 数据库，替代浏览器 IndexedDB

## 目录结构

```
fault-diagnosis-ui/
├── index.html              页面结构
├── styles.css              页面样式
├── app.js                  主逻辑（诊断、AI 调用、渲染）
├── db.js                   API 数据层（调用后端 Worker）
├── data/
│   └── faults.js           内置故障知识库（可编辑扩充）
├── worker/
│   ├── wrangler.toml       Cloudflare Worker 配置
│   ├── schema.sql          D1 数据库建表语句
│   └── src/
│       └── index.js        Worker 后端代码
└── README.md
```

## 快速开始（前端）

直接双击 `index.html` 用浏览器打开即可。或者：

```bash
python -m http.server 8080
# → http://localhost:8080
```

## 部署后端（Cloudflare Workers + D1）

### 前置条件

- Cloudflare 账号
- 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)：
  ```bash
  npm install -g wrangler
  wrangler login
  ```

### 步骤 1：创建 D1 数据库

```bash
cd worker
npx wrangler d1 create fault-diagnosis-db
```

复制输出的 `database_id`，填入 `wrangler.toml` 中的 `database_id` 字段。

### 步骤 2：初始化数据库表

```bash
npx wrangler d1 execute fault-diagnosis-db --file=./schema.sql
```

### 步骤 3：部署 Worker

```bash
npx wrangler deploy
```

部署成功后会得到 Worker URL，类似：
```
https://fault-diagnosis-api.YOUR_SUBDOMAIN.workers.dev
```

### 步骤 4：配置前端

1. 打开 [db.js](db.js)，将 `API_BASE` 替换为你的 Worker URL。
2. 打开 [app.js](app.js)，将 `DEFAULT_AI_CONFIG.apiKey` 替换为你的 DeepSeek API Key。

### 步骤 5：部署前端到 GitHub Pages

将整个项目（除 `worker/` 目录外）推送到 GitHub 仓库，开启 GitHub Pages 即可。

> ⚠️ **CORS 配置**：如果 GitHub Pages 域名和 Worker URL 不同，需在 `wrangler.toml` 中设置 `ALLOWED_ORIGIN` 为你的 GitHub Pages 域名。

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
- **安全建议**：如果对安全性要求较高，可将 Worker 改造为 AI 代理（添加 `/api/diagnose` 端点，Key 存在 Worker 环境变量中）

## 后续维护

### 扩充知识库

- 编辑 `data/faults.js` 添加内置条目（对所有人生效）
- 使用「导入数据」面板批量导入 JSON（存入 D1 数据库，对所有人生效）

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
