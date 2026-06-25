import type { Agent } from "@openai/agents";
/**
 * 通用上下文基类 - 保留原有设计
 * 适用于所有 Agent 共享的身份/会话信息
 */
export interface BaseContext {
    // 这里可以定义一些通用的上下文属性
    userId?: string;
    sessionId?: string;
    isAdmin?: boolean;
    isProUser?: boolean;

    log:(level:"info" | "warn" | "error", message: string,meta?: Record<string, any>) => void;
}
/**
 * 应用上下文 - 保留原有全部字段和方法签名
 * 仅删除了 ChildAgent / RawTriageAgent 两个冗余类型别名
 */
export interface AppContext extends BaseContext {
    readFile:(filePath: string) => Promise<string>;
    writeFile:(filePath: string, content: string) => Promise<void>;
    /** 只读 SQL 查询（仅允许 SELECT） */
    queryDB:<T>(sql: string) => Promise<T[]>;
    /** 写入/DDL SQL（INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE） */
    executeSQL:(sql: string) => Promise<{ rowCount: number }>;
    webSearch:(keyword: string) => Promise<string[]>;
}

export type {Agent};