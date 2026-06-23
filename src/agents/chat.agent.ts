import {Agent} from "@openai/agents";
import {container} from "../core/container.js";

export function createChatAgent(): Agent {
    const model = container.getDeepSeekModel();
    const agent = new Agent({
        name: "chatAgent",
        instructions: "你负责与用户进行自然语言对话，提供有用的信息和建议",
        tools: [],
        model: model,
    });
    return agent;
}