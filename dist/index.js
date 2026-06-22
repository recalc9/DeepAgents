// src/index.ts
// 入口文件
// 1. 禁用 OpenAI Agents 的追踪功能
// 2. 加载环境变量
process.env.OPENAI_AGENTS_DISABLE_TRACING = "1";
import dotenv from 'dotenv';
dotenv.config();
// 3. 导入所需模块
import { run, setTracingDisabled } from '@openai/agents';
import { initDeepSeek } from "./clients/deepseek.client.js";
import { createHistoryAgent } from "./agents/index.js";
setTracingDisabled(true);
// 初始化 DeepSeek 客户端
initDeepSeek();
// 创建历史问答 Agent
const historyAgent = createHistoryAgent();
// 测试运行
async function main() {
    const result = await run(historyAgent, 'What is the capital of France?');
    console.log(result.finalOutput);
}
// 运行主函数
main().catch(console.error);
//# sourceMappingURL=index.js.map