import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"

export function createGeneralAgent(): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();

    return new Agent<AppContext,"text">({
        name: "generalAgent",
        instructions: `你负责解答各种问题，提供相关信息和建议，不懂退回分诊`,
        handoffs: [],
        tools: [],
        model: model,
    });
}