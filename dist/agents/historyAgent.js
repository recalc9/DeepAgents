import { Agent } from "@openai/agents";
import { getDeepSeekModel } from "../client.js";
import { historyFunFactTool } from "../tools/index.js";
const dsModel = getDeepSeekModel();
export const historyAgent = new Agent({
    name: 'DeepAgent',
    instructions: '你负责解答历史相关问题，清晰阐述重大历史事件及其背景',
    model: dsModel,
    tools: [historyFunFactTool],
});
//# sourceMappingURL=historyAgent.js.map