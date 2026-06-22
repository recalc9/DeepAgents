import { Agent } from "@openai/agents";
import { container } from "../core/container.js";
import { historyFunFactTool } from "../tools/index.js";
//使用工厂模式创建agent
export function createHistoryAgent() {
    const model = container.getDeepSeekModel();
    const agent = new Agent({
        name: "historyAgent",
        instructions: "你负责解答历史相关问题，清晰阐述重大历史事件及其背景",
        tools: [historyFunFactTool],
        model: model,
    });
    return agent;
}
//# sourceMappingURL=history.agent.js.map