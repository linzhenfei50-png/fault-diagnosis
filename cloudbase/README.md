# CloudBase 后端

GPU 故障诊断后端，已从 Cloudflare Workers + D1 迁到腾讯云云开发（云函数 + NoSQL 文档库），国内直连免梯子。

## 部署信息

- 环境 ID：`fault-diagnosis-d5fe6kc909f3385d`（地域 ap-shanghai）
- HTTP 访问域名：`https://fault-diagnosis-d5fe6kc909f3385d.service.tcloudbase.com/api`
- 云函数：`fault-diagnosis-api`（Web 函数，Nodejs16.13，`scf_bootstrap` 启动 + 监听 `0.0.0.0:9000`）
- NoSQL 集合：`fault_entries` / `diagnosis_history` / `imported_files`

## 重新部署

```bash
cd cloudbase
tcb login --apiKeyId <SecretId> --apiKey <SecretKey>
tcb fn deploy fault-diagnosis-api --httpFn --force
```

> 注意：
> - 必须带 `--httpFn`（Web 函数），不要重复加 `--path`（HTTP 访问路由 `/api` 已存在）。
> - 若路由失效报 `FunctionType parameter is invalid`，用 `tcb routes edit` 把 `/api` 路由的 `upstreamResourceType` 改成 `WEB_SCF`。

## 集合（首次部署需先创建，本环境已创建、无需重复）

```bash
tcb db nosql execute -e fault-diagnosis-d5fe6kc909f3385d --command '[{"TableName":"fault_entries","CommandType":"COMMAND","Command":"{\"create\":\"fault_entries\"}"},{"TableName":"diagnosis_history","CommandType":"COMMAND","Command":"{\"create\":\"diagnosis_history\"}"},{"TableName":"imported_files","CommandType":"COMMAND","Command":"{\"create\":\"imported_files\"}"}]'
```

> Windows PowerShell 下 `--command`/`--data` 的 JSON 双引号会被剥掉，建议用 Node `spawnSync` 传参，或改用 WSL/Git Bash。
