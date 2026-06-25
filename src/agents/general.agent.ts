import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"
import {fileReadTool} from "../tools/file.tool.js"
import type {PromptResolver} from "../core/prompt-resolver.js"

export function createGeneralAgent(resolver: PromptResolver): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();
    const tools = [fileReadTool];

    return new Agent<AppContext,"text">({
        name: "generalAgent",
        handoffDescription: "通用问答专家，处理不属于编程、数据库、搜索的各类问题",
        instructions: async (runContext, _agent) => {
            const ctx = runContext.context as AppContext;
            return resolver.loadAndResolve("general", {
                user_id: ctx.userId ?? "unknown",
                workspace: process.cwd(),
                tool_list: tools.map(t => t.name ?? t.type).join(", "),
            });
        },
        handoffs: [],
        tools,
        model: model,
    });
}