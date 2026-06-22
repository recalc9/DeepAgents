import { OpenAI } from "openai";
import { OpenAIChatCompletionsModel, setDefaultModelProvider } from "@openai/agents";
class AgentContainer {
    constructor() {
        // DeepSeek 资源
        this.deepseekClient = null;
        this.dsModel = null;
        // ========== 预留其他服务商（直接复制扩展） ==========
        // private openaiClient: OpenAI | null = null;
        // setOpenAIClient() {}
        // getOpenAIClient() {}
        // private qwenChatModel: OpenAIChatCompletionsModel | null = null;
    }
    // ========== DeepSeek 相关 ==========
    setDeepSeekClient(client) {
        this.deepseekClient = client;
    }
    getDeepSeekClient() {
        if (!this.deepseekClient) {
            throw new Error("请先设置 DeepSeek 客户端");
        }
        return this.deepseekClient;
    }
    setDeepSeekModel(model) {
        this.dsModel = model;
    }
    getDeepSeekModel() {
        if (!this.dsModel) {
            throw new Error("请先设置 DeepSeek 模型");
        }
        return this.dsModel;
    }
}
export const container = new AgentContainer();
//# sourceMappingURL=container.js.map