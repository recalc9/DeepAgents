import {Agent} from "@openai/agents";
import {container} from "../core/container.js";
import type {AppContext,ChildAgent} from "../core/agent-context.js"

export function createSearchAgent(): ChildAgent {
    const model = container.getDeepSeekModel();

    return new Agent({
        name: "searchAgent",
        instructions: `你负责解答搜索相关问题，提供搜索结果和相关信息，不懂退回分诊`,
        handoffs: [],
        tools: [],
        model: model,
    });
}