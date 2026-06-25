import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"
import {sqlQueryTool, sqlExecuteTool} from "../tools/db.tool.js"
import type {PromptResolver} from "../core/prompt-resolver.js"


export function createDBAgent(resolver: PromptResolver): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();
    const tools = [sqlQueryTool, sqlExecuteTool];

    return new Agent<AppContext,"text">({
        name: "dbAgent",
        handoffDescription: "数据库专家，负责 SQL 查询、数据分析、建表优化等任务",
        instructions: async (runContext, _agent) => {
            const ctx = runContext.context as AppContext;
            return resolver.loadAndResolve("db", {
                user_id: ctx.userId ?? "unknown",
                tool_list: tools.map(t => t.name ?? t.type).join(", "),
            });
        },
        handoffs: [],
        tools,
        model: model,
    });
}