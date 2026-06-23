import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext,ChildAgent} from "../core/agent-context.js"

export function createGeneralAgent(): ChildAgent {
    const model = container.getDeepSeekModel();

    return new Agent({
        name: "generalAgent",
        instructions: `你负责解答各种问题，提供相关信息和建议，不懂退回分诊`,
        handoffs: [],
        tools: [],
        model: model,
    });
}