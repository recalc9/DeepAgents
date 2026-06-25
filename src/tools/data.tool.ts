/**
 * Data 工具 — json_query / csv_read / csv_write / yaml_read / yaml_write
 *
 * 零依赖：手写 JSON path 解析 + CSV/YAML 序列化
 */
import { readFile, writeFile } from "node:fs/promises";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError, queryJson } from "../core/agent-helpers.js";

export const jsonQueryTool = tool({
  name: "json_query",
  description:
    "用路径表达式查询 JSON 文件中的值。" +
    "【语法】$.users[0].name 或 $.data.items[*].id" +
    "【使用场景】从 API 响应或配置文件中提取特定字段。",
  parameters: z.object({
    filePath: z.string().describe("JSON 文件路径"),
    path: z.string().describe("查询路径，如 $.users[0].name 或 $.data[*].id"),
  }),
  execute: async ({ filePath, path }) => {
    try {
      const content = await readFile(filePath, "utf-8");
      const obj = JSON.parse(content);
      const result = queryJson(obj, path);
      return (result === undefined || result === null)
        ? `查询路径 "${path}" 返回空值`
        : JSON.stringify(result, null, 2);
    } catch (err) {
      return `[ERROR] JSON 查询失败: ${formatError(err)}`;
    }
  },
});

// ────────── CSV ──────────

export const csvReadTool = tool({
  name: "csv_read",
  description:
    "读取 CSV 文件并解析为 JSON 数组。" +
    "【使用场景】查看表格数据、导入数据分析。",
  parameters: z.object({
    filePath: z.string().describe("CSV 文件路径"),
    delimiter: z.string().default(",").describe("分隔符"),
    limit: z.number().default(100).describe("最大行数"),
  }),
  execute: async ({ filePath, delimiter, limit }) => {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      if (lines.length < 2) return "[WARN] CSV 文件为空或只有表头。";

      const headers = lines[0]!.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));

      const rows = lines.slice(1, limit + 1).map((line, i) => {
        const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, j) => { row[h] = cols[j] ?? ""; });
        return row;
      });

      const summary = rows.length < lines.length - 1
        ? `\n(显示前 ${rows.length} 行，共 ${lines.length - 1} 行)`
        : "";

      return JSON.stringify(rows, null, 2) + summary;
    } catch (err) {
      return `[ERROR] CSV 读取失败: ${formatError(err)}`;
    }
  },
});

export const csvWriteTool = tool({
  name: "csv_write",
  description:
    "将 JSON 数组写入为 CSV 文件。" +
    "【使用场景】导出查询结果、转换数据格式。",
  parameters: z.object({
    filePath: z.string().describe("目标 CSV 文件路径"),
    data: z.string().describe("JSON 数组字符串，如 '[{\"name\":\"Alice\",\"age\":30}]'"),
  }),
  execute: async ({ filePath, data }) => {
    try {
      const rows = JSON.parse(data);
      if (!Array.isArray(rows) || rows.length === 0) {
        return "[ERROR] 数据必须是非空数组。";
      }

      const headers = Object.keys(rows[0]!);
      const csv = [
        headers.join(","),
        ...rows.map(row => headers.map(h => {
          const val = String(row[h] ?? "").replace(/"/g, '""');
          return val.includes(",") || val.includes('"') ? `"${val}"` : val;
        }).join(",")),
      ].join("\n");

      await writeFile(filePath, csv, "utf-8");
      return `✓ 已写入 ${rows.length} 行 → ${filePath} (${headers.length} 列: ${headers.join(", ")})`;
    } catch (err) {
      return `[ERROR] CSV 写入失败: ${formatError(err)}`;
    }
  },
});

// ────────── YAML (简化版：JSON 对象的超集) ──────────

function jsonToYaml(obj: any, indent = ""): string {
  if (obj == null) return "null";
  if (typeof obj === "string") {
    if (obj.includes("\n") || obj.includes(":")) return `|\n${indent}  ${obj.replace(/\n/g, `\n${indent}  `)}`;
    return obj;
  }
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    return obj.map(item => `${indent}- ${jsonToYaml(item, indent + "  ").trimStart()}`).join("\n");
  }
  if (typeof obj === "object") {
    return Object.entries(obj)
      .map(([k, v]) => `${indent}${k}: ${jsonToYaml(v, indent + "  ")}`)
      .join("\n");
  }
  return String(obj);
}

function yamlToJson(yaml: string): any {
  // 简化解析：只处理简单 key: value 形式（嵌套由 JSON 处理）
  const lines = yaml.split("\n").filter(l => !l.trim().startsWith("#") && l.trim());
  const result: Record<string, any> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.substring(0, colonIdx).trim();
    let value = line.substring(colonIdx + 1).trim();
    // 尝试解析为 JSON 类型
    if (value === "true") value = "true";
    if (value === "false") value = "false";
    if (value === "null") value = "null";
    result[key] = value;
  }
  return result;
}

export const yamlReadTool = tool({
  name: "yaml_read",
  description:
    "读取 YAML 文件并转换为 JSON 对象。" +
    "【使用场景】查看配置文件、读取 CI/CD 配置。",
  parameters: z.object({
    filePath: z.string().describe("YAML 文件路径"),
  }),
  execute: async ({ filePath }) => {
    try {
      const content = await readFile(filePath, "utf-8");
      const obj = yamlToJson(content);
      return JSON.stringify(obj, null, 2);
    } catch (err) {
      return `[ERROR] YAML 读取失败: ${formatError(err)}`;
    }
  },
});

export const yamlWriteTool = tool({
  name: "yaml_write",
  description:
    "将 JSON 对象写入为 YAML 文件。" +
    "【使用场景】生成配置文件。",
  parameters: z.object({
    filePath: z.string().describe("目标 YAML 文件路径"),
    data: z.string().describe("JSON 对象字符串"),
  }),
  execute: async ({ filePath, data }) => {
    try {
      const obj = JSON.parse(data);
      const yaml = jsonToYaml(obj);
      await writeFile(filePath, yaml, "utf-8");
      return `✓ 已写入 YAML → ${filePath}`;
    } catch (err) {
      return `[ERROR] YAML 写入失败: ${formatError(err)}`;
    }
  },
});
