import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext,ChildAgent} from "../core/agent-context.js"


export function createCodeAgent(): ChildAgent {
    const model = container.getDeepSeekModel();

    return new Agent({
        name: "codeAgent",
        instructions: `你负责解答编程相关问题，提供代码示例和解释,不懂退回分诊`,
        handoffs: [],
        tools: [],
        model: model,
    });
}