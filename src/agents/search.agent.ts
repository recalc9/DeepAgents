import {Agent} from "@openai/agents";
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"
import type {PromptResolver} from "../core/prompt-resolver.js"

export function createSearchAgent(resolver: PromptResolver): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();

    return new Agent<AppContext,"text">({
        name: "searchAgent",
        handoffDescription: "搜索和信息检索专家，处理外部知识检索请求",
        instructions: async (runContext, _agent) => {
            const ctx = runContext.context as AppContext;
            return resolver.loadAndResolve("search", {
                user_id: ctx.userId ?? "unknown",
            });
        },
        handoffs: [],
        tools: [],
        model: model,
    });
}