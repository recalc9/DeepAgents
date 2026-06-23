import type { Agent } from "@openai/agents";

export interface BaseContext {
    // 这里可以定义一些通用的上下文属性
    userId?: string;
    sessionId?: string;
    isAdmin?: boolean;
    isProUser?: boolean;

    log:(level:"info" | "warn" | "error", message: string,meta?: Record<string, any>) => void;
}

export interface AppContext extends BaseContext {
    readFile:(filePath: string) => Promise<string>;
    writeFile:(filePath: string, content: string) => Promise<void>;
    queryDB:<T>(sql: string) => Promise<T[]>;
    webSearch:(keyword: string) => Promise<string[]>;
}

// 普通子Agent：new Agent<输出, 上下文>
// 普通子Agent：new Agent 专用，<上下文, 输出>
export type ChildAgent = Agent<AppContext, "text">;
// Agent.create 生成的分诊Agent固定上下文unknown
export type RawTriageAgent = Agent<unknown, "text">;