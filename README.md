# 智能故障诊断前端框架

这是一个纯 HTML、CSS、JavaScript 的故障诊断界面，不需要 Node.js、数据库或安装依赖。

## 运行方式

直接双击 `index.html`，使用现代浏览器打开即可。

如果浏览器对本地脚本有限制，也可以在项目目录运行：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 后续只需要修改哪里

主要编辑：

```text
data/faults.js
```

复制已有故障对象，修改以下字段：

```js
{
  id: "唯一编号",
  deviceType: "设备类型",
  title: "方案标题",
  symptoms: ["故障现象1", "故障现象2"],
  keywords: ["匹配关键词1", "匹配关键词2"],
  summary: "诊断摘要",
  severity: "高",
  shutdownRequired: true,
  estimatedTime: "30 分钟",
  causes: [
    {
      name: "故障原因",
      probability: 60,
      evidence: "判断依据"
    }
  ],
  solutions: [
    {
      action: "处理步骤",
      detail: "具体操作说明",
      tools: ["万用表"],
      duration: "10 分钟"
    }
  ],
  diagram: [
    {
      title: "流程节点名称",
      description: "节点说明"
    }
  ],
  safety: "安全提示"
}
```

## 目录结构

```text
fault-diagnosis-ui/
├── index.html          页面结构
├── styles.css         页面样式
├── app.js             查询、匹配、渲染和历史记录逻辑
├── data/
│   └── faults.js      需要维护的故障知识库
└── README.md          使用说明
```

## 当前功能

- 根据设备类型和故障关键词匹配方案
- 展示原因概率、判断依据和处理步骤
- 自动生成横向排查流程图
- 保存最近 8 条诊断记录到浏览器本地
- 响应式布局，支持桌面端和平板/手机
- 不依赖后端，可作为后续 Vue、React 或接口版的原型

## 注意事项

该项目中的匹配算法是前端关键词规则，不是 AI 模型。数据量较大后，建议把 `diagnose()` 改为调用后端接口，并由后端完成全文检索、向量检索或大模型分析。
