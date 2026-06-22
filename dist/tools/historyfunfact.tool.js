import { tool } from "@openai/agents";
import { z } from "zod";
export const historyFunFactTool = tool({
    name: "history_fun_fact",
    description: "分享一则关于历史事件的趣味冷知识",
    parameters: z.object({}),
    execute: async () => {
        console.log("【工具触发】history_fun_fact 已执行");
        return '鲨鱼比树木出现得更早';
    },
});
//# sourceMappingURL=historyfunfact.tool.js.map