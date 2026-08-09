/**
 * 故障知识库
 * ------------------------------------------------------------
 * 示例条目已清空。通过以下方式添加数据：
 *   1. 编辑此文件，按格式新增条目
 *   2. 在「导入数据」面板批量导入 JSON
 *   3. 在「导入数据」面板粘贴 JSON 文本
 *
 * 字段说明：
 * id               唯一编号，不可重复
 * deviceType       设备类型
 * title            诊断方案标题
 * symptoms         常见故障现象
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
window.FAULT_DATABASE = [];
