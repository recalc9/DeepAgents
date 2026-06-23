import {Agent} from "@openai/agents";
import {container} from "../core/container.js";
import type {AppContext,RawTriageAgent} from "../core/agent-context.js"

export function createTriageAgent(): RawTriageAgent {
  const model = container.getDeepSeekModel();
  // 这里不写 <xx,xx> 泛型，不会触发 AgentOutputType 报错
  return Agent.create({
    name: "Triage Agent",
    model,
    instructions: `任务总调度：
1. 代码开发 → Code
2. 联网查文档 → Search
3. SQL数据库设计 → DB
4. 闲聊常识 → General
各专家无法处理时，引导用户回到总调度重新提问`,
    handoffs: []
  });
}