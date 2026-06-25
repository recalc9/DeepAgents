import { Agent } from "@openai/agents";
import type { AppContext } from "../core/agent-context.js";
import type { AgentBuildContext } from "../harness/types.js";
import { getAppContext, buildPromptVars } from "../core/agent-helpers.js";

export function createManagerAgent(ctx: AgentBuildContext): Agent<AppContext, "text"> {
  return new Agent<AppContext, "text">({
    name: ctx.agentName,
    instructions: async (runContext, _agent) =>
      ctx.resolver.loadAndResolve(
        ctx.promptKey,
        buildPromptVars(getAppContext(runContext), [], ctx),
      ),
    handoffs: [],
    tools: [],
    model: ctx.model,
    outputGuardrails: ctx.getGuardrails(),
  });
}
