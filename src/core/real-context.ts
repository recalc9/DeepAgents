/**
 * buildRealContext — 构建注入真实实现的 AppContext
 *
 * 与 buildTestContext 的区别：
 *   - readFile / writeFile 走真实的 FileSystemService
 *   - queryDB / executeSQL 走真实的 PostgreSQL（需先调 initPostgres()）
 *   - log 输出到 stderr，避免干扰 Agent 文本输出
 *   - webSearch 暂为空桩（后续接入真实搜索）
 */
import type { Pool } from "pg";
import { FileSystemService } from "./filesystem.js";
import { container } from "./container.js";
import type { AppContext } from "./agent-context.js";

export interface RealContextOptions {
  userId?: string;
  sessionId?: string;
  isAdmin?: boolean;
  isProUser?: boolean;
  /** 文件系统工作根目录，默认当前工作目录 */
  workspaceRoot?: string;
  /** PostgreSQL 连接池（可选，不传则从 container 自动获取） */
  pool?: Pool;
}

/** 读 SQL 白名单 */
const READ_VERBS = /^\s*SELECT\b/i;
/** 写/DDL SQL 白名单 */
const WRITE_VERBS = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i;

export function buildRealContext(options: RealContextOptions = {}): AppContext {
  const fs = new FileSystemService(options.workspaceRoot ?? process.cwd());
  const getPool = (): Pool => options.pool ?? container.getPgPool();

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

    // ────────── 数据库（读写分离 + SQL 动词白名单）──────────
    queryDB: async <T>(sql: string): Promise<T[]> => {
      if (!READ_VERBS.test(sql)) {
        throw new Error(
          `queryDB 仅支持 SELECT 语句，收到: ${sql.substring(0, 50)}... ` +
          `写入操作请使用 executeSQL。`
        );
      }
      const pool = getPool();
      const result = await pool.query(sql);
      return result.rows as T[];
    },

    executeSQL: async (sql: string): Promise<{ rowCount: number }> => {
      if (!WRITE_VERBS.test(sql)) {
        throw new Error(
          `executeSQL 仅支持 INSERT/UPDATE/DELETE/DDL 语句，收到: ${sql.substring(0, 50)}... ` +
          `只读查询请使用 queryDB。`
        );
      }
      const pool = getPool();
      const result = await pool.query(sql);
      return { rowCount: result.rowCount ?? 0 };
    },

    // ────────── 搜索（留空桩，后续扩展）──────────
    webSearch: async (): Promise<string[]> => {
      throw new Error("webSearch 尚未接入真实搜索引擎");
    },
  };
}
