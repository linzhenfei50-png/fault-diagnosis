/**
 * 故障知识库
 * ------------------------------------------------------------
 * 后续维护时，复制一个对象并修改其中字段即可。
 *
 * 字段说明：
 * id               唯一编号，不可重复
 * deviceType       设备类型
 * title            诊断方案标题
 * symptoms         常见故障现象，用于展示和匹配
 * keywords         关键词，越贴近用户输入越容易匹配
 * summary          诊断摘要
 * severity         严重等级：低 / 中 / 高
 * shutdownRequired 是否建议停机
 * estimatedTime    预计处理时间
 * causes           原因数组，probability 建议总和为 100
 * solutions        解决措施数组
 * diagram          排查流程节点
 * safety           安全提示
 */
window.FAULT_DATABASE = [
  {
    id: "motor-no-rotation",
    deviceType: "电机",
    title: "电机通电后不转或保护跳闸",
    symptoms: [
      "电机启动后有嗡嗡声，但转轴不转",
      "运行数秒后热继电器或保护器跳闸",
      "电机无法正常启动"
    ],
    keywords: ["电机", "不转", "嗡嗡声", "跳闸", "保护器", "启动失败", "转轴"],
    summary: "优先检查三相电源缺相、机械卡滞、启动回路和负载状态。继续强行启动可能造成绕组过热。",
    severity: "高",
    shutdownRequired: true,
    estimatedTime: "30–60 分钟",
    causes: [
      {
        name: "三相电源缺相或电压异常",
        probability: 45,
        evidence: "电机只发出嗡鸣声且无法建立正常转矩。"
      },
      {
        name: "轴承、负载或传动机构卡滞",
        probability: 30,
        evidence: "转轴不能转动，启动电流持续偏高并触发保护。"
      },
      {
        name: "接触器、热继电器或启动回路异常",
        probability: 15,
        evidence: "接触器触点损坏会造成缺相或接触电阻增大。"
      },
      {
        name: "电机绕组损坏",
        probability: 10,
        evidence: "绕组断路、短路或绝缘下降均可能导致启动失败。"
      }
    ],
    solutions: [
      {
        action: "切断电源并执行上锁挂牌",
        detail: "确认主电源断开并验电，禁止在带电状态下拆线检查。",
        tools: ["验电笔", "绝缘手套"],
        duration: "5 分钟"
      },
      {
        action: "测量三相输入电压",
        detail: "检查各相之间电压是否平衡，同时检查熔断器、断路器和接触器触点。",
        tools: ["万用表"],
        duration: "10 分钟"
      },
      {
        action: "检查转轴和负载是否卡滞",
        detail: "断电后脱开负载，手动盘车。若阻力明显，应检查轴承、联轴器和传动机构。",
        tools: ["常用拆装工具"],
        duration: "10–20 分钟"
      },
      {
        action: "检查绕组和绝缘",
        detail: "测量三相绕组电阻是否平衡，并使用兆欧表检查对地绝缘。",
        tools: ["万用表", "兆欧表"],
        duration: "15 分钟"
      }
    ],
    diagram: [
      { title: "断电确认", description: "停机、断电、验电并挂牌" },
      { title: "检查三相电压", description: "确认无缺相和严重不平衡" },
      { title: "手动盘车", description: "判断转轴或负载是否卡滞" },
      { title: "检查启动回路", description: "检查接触器、热继电器和端子" },
      { title: "测量绕组", description: "检查电阻平衡和绝缘性能" }
    ],
    safety: "涉及旋转设备和三相电源。所有测量、拆线和盘车操作必须由具备资质的人员执行；发现焦味、冒烟或绝缘损坏时应停止送电。"
  },
  {
    id: "plc-output-no-action",
    deviceType: "PLC",
    title: "PLC 有输出指示但执行机构不动作",
    symptoms: [
      "PLC 输出灯亮，但电磁阀不动作",
      "程序显示输出正常，现场设备没有响应"
    ],
    keywords: ["PLC", "输出灯", "电磁阀", "不动作", "无响应", "执行机构"],
    summary: "PLC 逻辑可能正常，故障更可能位于输出端子、外部电源、继电器、电磁阀线圈或现场接线。",
    severity: "中",
    shutdownRequired: false,
    estimatedTime: "20–45 分钟",
    causes: [
      { name: "输出公共端或外部电源异常", probability: 35, evidence: "PLC 指示灯只代表逻辑输出成立，不代表外部回路已形成。" },
      { name: "中间继电器或端子接触不良", probability: 30, evidence: "继电器触点烧蚀、松动或端子断线会中断负载回路。" },
      { name: "电磁阀线圈损坏", probability: 25, evidence: "线圈断路或烧毁后即使收到控制电压也不会动作。" },
      { name: "PLC 输出点损坏", probability: 10, evidence: "晶体管或继电器输出元件可能失效。" }
    ],
    solutions: [
      { action: "核对输出回路电源", detail: "测量 PLC 输出公共端和负载侧电源是否符合设计值。", tools: ["万用表", "电气图纸"], duration: "10 分钟" },
      { action: "沿回路逐点测量", detail: "从 PLC 端子、中间继电器、接线端子到电磁阀逐点测量电压。", tools: ["万用表"], duration: "10–20 分钟" },
      { action: "检查线圈阻值", detail: "断电后测量电磁阀线圈阻值，确认是否断路或短路。", tools: ["万用表"], duration: "5 分钟" },
      { action: "替换测试输出点", detail: "在程序和电气条件允许时，临时切换到备用输出点验证。", tools: ["编程软件"], duration: "10 分钟" }
    ],
    diagram: [
      { title: "确认逻辑输出", description: "监控程序与输出指示状态" },
      { title: "测公共端电源", description: "确认输出模块供电正常" },
      { title: "测输出端电压", description: "判断 PLC 输出元件是否工作" },
      { title: "检查继电器与接线", description: "排除触点和端子故障" },
      { title: "检查负载线圈", description: "测阻值并进行替换验证" }
    ],
    safety: "测量带电控制回路时应使用合适量程和绝缘表笔。禁止为了测试而绕过安全联锁、急停或保护回路。"
  },
  {
    id: "compressor-high-temperature",
    deviceType: "空压机",
    title: "空压机运行温度过高",
    symptoms: [
      "空压机运行一段时间后高温报警",
      "排气温度持续升高并停机"
    ],
    keywords: ["空压机", "高温", "温度高", "排气温度", "报警", "停机"],
    summary: "重点检查冷却系统、润滑油、环境通风、温度传感器和主机运行负载。",
    severity: "高",
    shutdownRequired: true,
    estimatedTime: "30–90 分钟",
    causes: [
      { name: "冷却器脏堵或风扇异常", probability: 40, evidence: "散热能力不足会导致排气温度持续上升。" },
      { name: "润滑油不足或油品失效", probability: 30, evidence: "润滑与换热性能下降会使主机温度升高。" },
      { name: "环境通风不良", probability: 15, evidence: "机房热空气循环会明显降低冷却效率。" },
      { name: "温度传感器误报", probability: 15, evidence: "传感器漂移、松动或线缆异常可能造成虚假高温。" }
    ],
    solutions: [
      { action: "停机并等待设备降温", detail: "不要立即打开高温油路或冷却系统。", tools: ["红外测温仪"], duration: "视温度而定" },
      { action: "清洁冷却器并检查风扇", detail: "清除翅片和滤网上的灰尘，确认风扇转向和转速正常。", tools: ["压缩空气", "毛刷"], duration: "20–40 分钟" },
      { action: "检查润滑油液位和状态", detail: "按厂家要求补充或更换适配油品，并检查油过滤器。", tools: ["厂家指定油品"], duration: "15–30 分钟" },
      { action: "核对实际温度与传感器读数", detail: "使用独立测温设备对比显示温度，判断是否存在传感器偏差。", tools: ["红外测温仪", "万用表"], duration: "10 分钟" }
    ],
    diagram: [
      { title: "停机降温", description: "确认设备达到安全检查温度" },
      { title: "检查环境通风", description: "排除热风回流和进风受阻" },
      { title: "检查冷却器", description: "清洁翅片、滤网并检查风扇" },
      { title: "检查润滑系统", description: "核对液位、油质与过滤器" },
      { title: "校验温度信号", description: "对比实际温度与显示值" }
    ],
    safety: "高温设备存在烫伤和高压油气喷出风险。必须停机、泄压并充分冷却后再进行拆检。"
  }
];
