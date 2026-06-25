/**
 * PostgreSQL 客户端初始化模块
 *
 * 对标 deepseek.client.ts：从环境变量读取配置 → 创建 pg.Pool → 注册到 container。
 * 支持独立变量 (PGHOST/PGPORT/...) 或单连接字符串 (DATABASE_URL)。
 */
import pg from "pg";
import { container } from "../core/container.js";

export function initPostgres(): void {
  const { Pool } = pg;

  let pool: pg.Pool;

  // 优先使用 DATABASE_URL，否则组合独立变量
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  } else {
    const host = process.env.PGHOST ?? "localhost";
    const port = parseInt(process.env.PGPORT ?? "5432", 10);
    const database = process.env.PGDATABASE ?? "deepagent";
    const user = process.env.PGUSER ?? "postgres";

    if (!process.env.PGPASSWORD) {
      throw new Error(
        "PGPASSWORD 未设置。请在 .env 中设置 PGPASSWORD 或 DATABASE_URL。"
      );
    }

    pool = new Pool({
      host,
      port,
      database,
      user,
      password: process.env.PGPASSWORD,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  // 注册到全局容器
  container.setPgPool(pool);
  console.log(`[initPostgres] 连接池已创建 → ${pool.options.database ?? "(DATABASE_URL)"}`);
}

/** 优雅关闭连接池 */
export async function shutdownPgPool(): Promise<void> {
  try {
    const pool = container.getPgPool();
    await pool.end();
    console.log("[shutdownPgPool] PostgreSQL 连接池已关闭");
  } catch {
    // 连接池可能未初始化，忽略
  }
}
