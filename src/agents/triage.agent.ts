import {Agent} from "@openai/agents";
import {container} from "../core/container.js";
import {createMathAgent,createHistoryAgent,createChatAgent} from "./index.js";

export function createTriageAgent(): Agent {
    const math = createMathAgent();
    const history = createHistoryAgent();
    const chat = createChatAgent();

    const model = container.getDeepSeekModel();
    const agent = Agent.create({
        name: "triageAgent",
        instructions: "你负责对用户的问题进行分类和分流，判断问题的类型并将其分配给合适的处理模块",
        tools: [],
        handoffs: [math, history, chat],
        model: model,
    });
    return agent;
}