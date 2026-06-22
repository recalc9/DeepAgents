import {OpenAI} from "openai";
import {OpenAIChatCompletionsModel} from "@openai/agents";
import {container} from "../core/container.js";

export function initDeepSeek() {
    // 环境校验（仅在入口加载dotenv后执行，不会提前读取env）
    if(!process.env.DEEPSEEK_API_KEY){
        throw new Error("DEEPSEEK_API_KEY is not set");
    }
    if(!process.env.DEEPSEEK_BASE_URL){
        throw new Error("DEEPSEEK_BASE_URL is not set");
    }
    // 初始化 DeepSeek 客户端并注册到容器
    const deepseekClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL,
    });
    container.setDeepSeekClient(deepseekClient);
    // 初始化 DeepSeek 模型并注册到容器
    const modelName = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
    const dsModel = new OpenAIChatCompletionsModel(deepseekClient, modelName);
    container.setDeepSeekModel(dsModel);
}