import { OpenAIChatCompletionsModel } from "@openai/agents";
import { OpenAI } from "openai";
let deepseekClient = null;
let dsModel = null;
export function initDeepSeek() {
    if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is not set");
    }
    if (!process.env.DEEPSEEK_BASE_URL) {
        throw new Error("DEEPSEEK_BASE_URL is not set");
    }
    deepseekClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL,
    });
    const modelName = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
    dsModel = new OpenAIChatCompletionsModel(deepseekClient, modelName);
}
export function getDeepSeekModel() {
    if (!dsModel) {
        throw new Error("请先调用 initDeepSeek() 初始化 DeepSeek 客户端");
    }
    return dsModel;
}
//# sourceMappingURL=client.js.map