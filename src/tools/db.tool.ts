/**
 * 数据库工具 — sql_query（只读 SELECT）与 sql_execute（写操作，需审批）
 */
import { tool } from "@openai/agents";
import { z } from "zod";
import type { AppContext } from "../core/agent-context.js";
import { formatError } from "../core/agent-helpers.js";

export const sqlQueryTool = tool({
  name: "sql_query",
  description:
    "执行只读 SQL 查询（SELECT）。" +
    "【使用场景】查询表数据、统计汇总、查看表结构、分析数据关系时使用。" +
    "【注意】仅支持 SELECT 语句，写入操作请使用 sql_execute。" +
    "【限制】每次仅执行一条 SQL。结果以 JSON 数组格式返回。",
  parameters: z.object({
    sql: z
      .string()
      .min(1)
      .describe("一条完整的 SELECT SQL 查询语句。示例: \"SELECT * FROM users WHERE age > 18 LIMIT 10\""),
  }),
  execute: async ({ sql }, runContext) => {
    const ctx = runContext?.context as AppContext | undefined;
    if (!ctx) return "[ERROR] AppContext 不可用，无法执行查询。";

    try {
      const rows = await ctx.queryDB<Record<string, unknown>>(sql);
      if (rows.length === 0) {
        return "[OK] 查询成功，但未返回任何行（空结果集）。";
      }
      return JSON.stringify(rows, null, 2);
    } catch (err) {
      return `[ERROR] SQL 查询失败: ${formatError(err)}`;
    }
  },
});

export const sqlExecuteTool = tool({
  name: "sql_execute",
  description:
    "执行写入 SQL 语句（INSERT/UPDATE/DELETE/CREATE/ALTER）。" +
    "【使用场景】创建表、插入数据、更新记录、删除数据、修改表结构时使用。" +
    "【注意】DROP/TRUNCATE 已被禁止。此操作需要人工确认！" +
    "【限制】每次仅执行一条 SQL。返回受影响的行数。",
  parameters: z.object({
    sql: z
      .string()
      .min(1)
      .describe("一条完整的 INSERT/UPDATE/DELETE/CREATE/ALTER SQL 语句。示例: \"CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)\""),
  }),
  /** 每次写操作需人工确认 */
  needsApproval: true,
  execute: async ({ sql }, runContext) => {
    const ctx = runContext?.context as AppContext | undefined;
    if (!ctx) return "[ERROR] AppContext 不可用，无法执行 SQL。";

    try {
      const result = await ctx.executeSQL(sql);
      return `[OK] SQL 执行成功。受影响行数: ${result.rowCount}`;
    } catch (err) {
      return `[ERROR] SQL 执行失败: ${formatError(err)}`;
    }
  },
});
