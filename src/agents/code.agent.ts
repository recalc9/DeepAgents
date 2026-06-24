import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"
import {fileReadTool} from "../tools/file.tool.js"


export function createCodeAgent(): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();

    return new Agent<AppContext,"text">({
        name: "codeAgent",
        instructions: `你负责解答编程相关问题，提供代码示例和解释,不懂退回分诊`,
        handoffs: [],
        tools: [fileReadTool],
        model: model,
    });
}