import {Agent} from "@openai/agents";
import {container} from "../core/container.js";

export function createMathAgent(): Agent {
    const model = container.getDeepSeekModel();
    const agent = new Agent({
        name: "mathAgent",
        instructions: "你负责解答数学相关问题，提供详细的解题步骤和解释",
        tools: [],
        model: model,
    });
    return agent;
}