// src/index.ts
// 入口文件
// 1. 禁用 OpenAI Agents 的追踪功能
// 2. 加载环境变量
process.env.OPENAI_AGENTS_DISABLE_TRACING = "1";
import dotenv from 'dotenv';
dotenv.config();    
// 3. 导入所需模块
import { run ,setTracingDisabled} from '@openai/agents';
import { initDeepSeek } from "./clients/deepseek.client.js";
import { initPostgres, shutdownPgPool } from "./clients/postgres.client.js";
import { createTriageAgent } from "./agents/index.js"
import { buildRealContext } from "./core/real-context.js";
import { createSpinner } from "./core/spinner.js";
setTracingDisabled(true);
// 初始化 DeepSeek 客户端
initDeepSeek();
// 初始化 PostgreSQL 连接池
initPostgres();

// REPL 交互模式
import * as readline from "node:readline";

async function repl() {
  const triageAgent = createTriageAgent();
  const ctx = buildRealContext();

  // 创建 readline 接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  // 处理 Ctrl+C
  process.on("SIGINT", async () => {
    console.log("\n正在关闭...");
    await shutdownPgPool();
    rl.close();
    process.exit(0);
  });

  console.log("DeepAgent REPL 已启动。输入 /exit 或 /quit 退出，Ctrl+C 也可退出。");
  rl.prompt();

  // 逐行读取用户输入
  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      continue;
    }

    // 退出命令
    if (input === "/exit" || input === "/quit" || input === "exit" || input === "quit") {
      console.log("再见！");
      await shutdownPgPool();
      rl.close();
      break;
    }

    // 执行 Agent
    const spin = createSpinner("思考中…");
    spin.start();
    let startTime = Date.now();
    try {
      const result = await run(triageAgent, input, { context: ctx });
      spin.stop();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(result.finalOutput);
      console.log(`── ${elapsed}s ──`);
    } catch (err) {
      spin.stop();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] ${msg}`);
    }
    console.log(""); // 空行分隔
    rl.prompt();
  }

}

// 运行 REPL
repl().catch(console.error);