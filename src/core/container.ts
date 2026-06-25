import {OpenAI} from "openai";
import {OpenAIChatCompletionsModel} from "@openai/agents";
import type {Pool} from "pg";

class AgentContainer {
    // DeepSeek 资源
    private deepseekClient: OpenAI|null = null;
    private dsModel: OpenAIChatCompletionsModel|null = null;
    // PostgreSQL 资源
    private pgPool: Pool|null = null;

    // ========== DeepSeek 相关 ==========
    setDeepSeekClient(client: OpenAI) {
        this.deepseekClient = client;
    }
    getDeepSeekClient() {
        if(!this.deepseekClient){
            throw new Error("请先设置 DeepSeek 客户端");
        }
        return this.deepseekClient;
    }
    setDeepSeekModel(model: OpenAIChatCompletionsModel) {
        this.dsModel = model;
    }
    getDeepSeekModel() {
        if(!this.dsModel){
            throw new Error("请先设置 DeepSeek 模型");
        }
        return this.dsModel;
    }

    // ========== PostgreSQL 相关 ==========
    setPgPool(pool: Pool) {
        this.pgPool = pool;
    }
    getPgPool() {
        if(!this.pgPool){
            throw new Error("请先初始化 PostgreSQL 连接池");
        }
        return this.pgPool;
    }

    // ========== 预留其他服务商（直接复制扩展） ==========
    // private openaiClient: OpenAI | null = null;
    // setOpenAIClient() {}
    // getOpenAIClient() {}
    // private qwenChatModel: OpenAIChatCompletionsModel | null = null;
}
export const container = new AgentContainer();