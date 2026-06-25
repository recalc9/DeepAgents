/**
 * bootstrap — 统一启动入口
 *
 * 初始化基础设施（DeepSeek + PostgreSQL）→ 装配 Agent 拓扑 → 返回 Runtime
 */
import { setTracingDisabled } from "@openai/agents";
import { initDeepSeek } from "./clients/deepseek.client.js";
import { initPostgres, shutdownPgPool } from "./clients/postgres.client.js";
import { AgentRuntime } from "./harness/runtime.js";

export async function bootstrap(workspaceRoot?: string): Promise<AgentRuntime> {
  setTracingDisabled(true);
  initDeepSeek();
  initPostgres();

  const runtime = new AgentRuntime();
  await runtime.init(workspaceRoot);

  process.on("exit", () => {
    shutdownPgPool().catch(() => {});
    runtime.shutdown().catch(() => {});
  });

  return runtime;
}
