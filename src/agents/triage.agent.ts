import {Agent, handoff} from "@openai/agents";
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"
import {PromptResolver} from "../core/prompt-resolver.js";
import {createCodeAgent,createDBAgent,createGeneralAgent,createSearchAgent} from "../agents/index.js";

export function createTriageAgent(): Agent<AppContext, "text"> {
  const model = container.getDeepSeekModel();

  // 创建 PromptResolver 并下发给所有子 Agent
  const resolver = new PromptResolver();
  const code = createCodeAgent(resolver);
  const db = createDBAgent(resolver);
  const general = createGeneralAgent(resolver);
  const search = createSearchAgent(resolver);

  const handoffs = [
    handoff(code),
    handoff(db),
    handoff(general),
    handoff(search),
  ];

  const triage = new Agent<AppContext, "text">({
    name: "Triage Agent",
    model,
    instructions: async (runContext, _agent) => {
      const ctx = runContext.context as AppContext;
      return resolver.loadAndResolve("triage", {
        user_id: ctx.userId ?? "unknown",
        tool_list: "handoff (transfer_to_*)",
        handoff_list: handoffs.map(h => h.agentName).join(", "),
      });
    },
    handoffs,
  });

  // 闭环：子 Agent 遇到超出能力范围的问题时，handoff 回分诊重新路由
  code.handoffs = [handoff(triage)];
  db.handoffs = [handoff(triage)];
  search.handoffs = [handoff(triage)];
  general.handoffs = [handoff(triage)];

  return triage;
}