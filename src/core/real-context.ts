/**
 * buildRealContext — 构建注入真实实现的 AppContext
 */
import type { Pool } from "pg";
import { FileSystemService } from "./filesystem.js";
import { container } from "./container.js";
import type { AppContext } from "./agent-context.js";
import { searchDuckDuckGo } from "./web-service.js";

export interface RealContextOptions {
  userId?: string;
  sessionId?: string;
  isAdmin?: boolean;
  isProUser?: boolean;
  workspaceRoot?: string;
  pool?: Pool;
}

/** 读 SQL 白名单 */
const READ_VERBS = /^\s*SELECT\b/i;
/** 写/DDL SQL 白名单（DROP/TRUNCATE 已移除） */
const WRITE_VERBS = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i;

export function buildRealContext(options: RealContextOptions = {}): AppContext {
  const fs = new FileSystemService(options.workspaceRoot ?? process.cwd());
  const pgPool = options.pool ?? container.getPgPool();

  return {
    userId: options.userId ?? "default-user",
    sessionId: options.sessionId ?? `sess-${Date.now()}`,
    isAdmin: options.isAdmin ?? true,
    isProUser: options.isProUser ?? true,

    log: (level, message, meta) => {
      const ts = new Date().toISOString();
      process.stderr.write(`[${ts}] [${level}] ${message} ${meta ? JSON.stringify(meta) : ""}\n`);
    },

    readFile: (filePath: string) => fs.readFile(filePath),
    writeFile: (filePath: string, content: string) => fs.writeFile(filePath, content),

    queryDB: async <T>(sql: string): Promise<T[]> => {
      if (!READ_VERBS.test(sql)) {
        throw new Error(
          `queryDB 仅支持 SELECT 语句，收到: ${sql.substring(0, 50)}...`
        );
      }
      const result = await pgPool.query(sql);
      return result.rows as T[];
    },

    executeSQL: async (sql: string): Promise<{ rowCount: number }> => {
      if (!WRITE_VERBS.test(sql)) {
        throw new Error(
          `executeSQL 仅支持 INSERT/UPDATE/DELETE/CREATE/ALTER，收到: ${sql.substring(0, 50)}...`
        );
      }
      const result = await pgPool.query(sql);
      return { rowCount: result.rowCount ?? 0 };
    },

    webSearch: async (keyword: string): Promise<string[]> => {
      const results = await searchDuckDuckGo(keyword, 5);
      return results.map(r => r.url);
    },
  };
}
