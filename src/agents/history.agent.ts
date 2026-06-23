import {Agent} from "@openai/agents";
import {container} from "../core/container.js";
import type {AppContext,ChildAgent} from "../core/agent-context.js"
import {historyFunFactTool} from "../tools/index.js";

//使用工厂模式创建agent
export function createHistoryAgent(): ChildAgent {
    const model = container.getDeepSeekModel();
    const agent = new Agent<AppContext, "text">({
        name: "historyAgent",
        instructions:"你负责解答历史相关问题，清晰阐述重大历史事件及其背景，不懂退回分诊",
        tools: [historyFunFactTool],
        handoffs: [],
        model: model,
    });
    return agent;
}