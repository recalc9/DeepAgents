import { OpenAI } from "openai";
import { OpenAIChatCompletionsModel } from "@openai/agents";
declare class AgentContainer {
    private deepseekClient;
    private dsModel;
    setDeepSeekClient(client: OpenAI): void;
    getDeepSeekClient(): OpenAI;
    setDeepSeekModel(model: OpenAIChatCompletionsModel): void;
    getDeepSeekModel(): OpenAIChatCompletionsModel;
}
export declare const container: AgentContainer;
export {};
//# sourceMappingURL=container.d.ts.map