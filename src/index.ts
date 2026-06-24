// src/index.ts
// 入口文件
// 1. 禁用 OpenAI Agents 的追踪功能
// 2. 加载环境变量
process.env.OPENAI_AGENTS_DISABLE_TRACING = "1";
import dotenv from 'dotenv';
dotenv.config();    
// 3. 导入所需模块
import { run ,setTracingDisabled} from '@openai/agents';
import {initDeepSeek} from "./clients/deepseek.client.js";
import {createTriageAgent} from "./agents/index.js"
// 改为从 bootstrap 获取完整绑定好 handoffs 的分诊实例
// 导入上下文类型
import type { AppContext } from "./core/agent-context.js";
setTracingDisabled(true);
// 初始化 DeepSeek 客户端
initDeepSeek();
 // 初始化所有子Agent并绑定handoffs
// 构造测试用上下文（完整满足 AppContext 接口，补齐所有方法）
function buildTestContext(): AppContext {
  return {
    userId: "test-user-001",
    sessionId: "test-sess-" + Date.now(),
    isAdmin: true,
    isProUser: true,
    log: (level, message, meta) => {
      console.log(`[${level}] ${message}`, meta ?? "");
    },
    readFile: async () => "",
    writeFile: async () => {},
    queryDB: async <T>() => [] as T[],
    webSearch: async () => []
  };
}

// 测试运行
async function main() {
  // 获取已经绑定所有子Agent的完整分诊
  const triageAgent = createTriageAgent();
  const ctx = buildTestContext();

  // run 必须传入第三个参数 { context }，泛型指定上下文 AppContext
  const result = await run(
    triageAgent,
    '你能做什么？',
    { context: ctx }
  );
  console.log("输出结果：", result.finalOutput);
}

// 运行主函数
main().catch(console.error);