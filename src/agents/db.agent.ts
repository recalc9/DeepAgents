import {Agent} from "@openai/agents"
import {container} from "../core/container.js";
import type {AppContext} from "../core/agent-context.js"


export function createDBAgent(): Agent<AppContext,"text"> {
    const model = container.getDeepSeekModel();

    return new Agent<AppContext,"text">({
        name: "dbAgent",
        instructions: `你负责解答数据库相关问题，提供SQL查询、建表、优化建议等，不懂退回分诊`,
        handoffs: [],
        tools: [],
        model: model,
    });
}