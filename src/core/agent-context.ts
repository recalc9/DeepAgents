/**
 * AppContext — Agent 共享的领域操作接口
 *
 * 工具通过 runContext.context 访问此接口执行 I/O，
 * 而非直接调用 fs/pg/http，使工具可脱离真实环境测试。
 */
export interface AppContext {
    userId?: string;
    sessionId?: string;
    isAdmin?: boolean;
    isProUser?: boolean;
    log: (level: "info" | "warn" | "error", message: string, meta?: Record<string, any>) => void;

    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    /** 只读 SQL 查询（仅允许 SELECT） */
    queryDB: <T>(sql: string) => Promise<T[]>;
    /** 写入/DDL SQL */
    executeSQL: (sql: string) => Promise<{ rowCount: number }>;
    webSearch: (keyword: string) => Promise<string[]>;
}
