/**
 * 通用 Agent 工厂 — 替代所有独立 agent 文件
 *
 * 所有叶子 Agent（code/db/general/search/triage/manager）
 * 行为一致：从 ctx 取工具 → 加载 prompt → 返回 Agent。
 * 差异仅由 config 中的 name/promptKey/tools 配置决定。
 */
import { Agent } from "@openai/agents";
import type { AppContext } from "../core/agent-context.js";
import type { AgentBuildContext } from "../harness/types.js";
import { getAppContext, buildPromptVars } from "../core/agent-helpers.js";

export function createAgent(ctx: AgentBuildContext): Agent<AppContext, "text"> {
  const tools = ctx.getTools();

  return new Agent<AppContext, "text">({
    name: ctx.agentName,
    instructions: async (runContext, _agent) =>
      ctx.resolver.loadAndResolve(
        ctx.promptKey,
        buildPromptVars(getAppContext(runContext), tools, ctx),
      ),
    handoffs: [],
    tools,
    model: ctx.model,
    outputGuardrails: ctx.getGuardrails(),
  });
}
