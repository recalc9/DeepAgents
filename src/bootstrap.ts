import type { ChildAgent, RawTriageAgent } from "./core/agent-context";

import {
  createTriageAgent,
  createCodeAgent,
  createSearchAgent,
  createDBAgent,
  createGeneralAgent,
  createHistoryAgent
} from "./agents/index.js";
// 全部改成局部变量，不在顶层直接实例
let codeAgent: ChildAgent | null = null;
let searchAgent: ChildAgent | null = null;
let dbAgent: ChildAgent | null = null;
let generalAgent: ChildAgent | null = null;
let triageAgent: RawTriageAgent | null = null;
let historyAgent: ChildAgent | null = null;

// 统一初始化方法，等DeepSeek加载完再调用
export function setupAgents() {
  codeAgent = createCodeAgent();
  searchAgent = createSearchAgent();
  dbAgent = createDBAgent();
  generalAgent = createGeneralAgent();
  triageAgent = createTriageAgent();
  historyAgent = createHistoryAgent();

  // 绑定handoffs
  triageAgent.handoffs = [
    codeAgent as RawTriageAgent,
    searchAgent as RawTriageAgent,
    dbAgent as RawTriageAgent,
    generalAgent as RawTriageAgent,
    historyAgent as RawTriageAgent
  ];

  codeAgent.handoffs.push(searchAgent);
  searchAgent.handoffs.push(codeAgent);
  dbAgent.handoffs.push(searchAgent);
  historyAgent.handoffs.push(searchAgent);
}

export function getRootTriage(): RawTriageAgent {
  if (!triageAgent) throw new Error("请先执行 setupAgents()");
  return triageAgent;
}