import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"
import {fileReadTool} from "../tools/file.tool.js"
import {sqlQueryTool} from "../tools/db.tool.js"
import {EditorImpl} from "../core/code-editor.js"
import {applyPatchTool} from "@openai/agents"
import type {PromptResolver} from "../core/prompt-resolver.js"


export function createCodeAgent(resolver: PromptResolver): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();

    const editor = new EditorImpl(process.cwd());
    const patchTool = applyPatchTool({ editor });
    const tools = [fileReadTool, patchTool, sqlQueryTool];

    return new Agent<AppContext,"text">({
        name: "codeAgent",
        handoffDescription: "编程专家，负责代码编写、审查、文件编辑和代码相关的数据查询",
        instructions: async (runContext, agent) => {
            const ctx = runContext.context as AppContext;
            return resolver.loadAndResolve("code", {
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