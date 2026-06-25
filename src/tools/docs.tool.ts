/**
 * Docs 工具 — docs_readme / docs_api / docs_changelog
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const execAsync = promisify(exec);

export const docsReadmeTool = tool({
  name: "docs_readme",
  description:
    "分析项目结构并生成/更新 README.md。" +
    "【使用场景】初始化项目文档或更新已有 README。",
  parameters: z.object({
    overwrite: z.boolean().default(false).describe("是否覆盖已有 README（false 则只预览不写入）"),
  }),
  execute: async ({ overwrite }) => {
    try {
      // 收集项目信息
      const pkg = JSON.parse(await readFile("package.json", "utf-8").catch(() => "{}"));
      const hasTsConfig = await readFile("tsconfig.json", "utf-8").then(() => true, () => false);

      const srcFiles: string[] = [];
      try {
        const { readdir } = await import("node:fs/promises");
        const dirs = ["src", "lib", "app"] as const;
        for (const d of dirs) {
          const entries = await readdir(d, { recursive: true }).catch(() => []);
          for (const e of entries) {
            if (typeof e === "string" && e.endsWith(".ts") && !e.endsWith(".d.ts")) {
              srcFiles.push(`${d}/${e}`);
            }
          }
        }
      } catch { /* ignore */ }

      const readme = [
        `# ${pkg.name ?? "project"}`,
        "",
        `${pkg.description ?? "项目描述"}`,
        "",
        "## 安装",
        "```bash",
        "npm install",
        "```",
        "",
        "## 使用",
        "```bash",
        pkg.scripts?.dev ? `npm run dev` : pkg.scripts?.start ? "npm start" : "node dist/index.js",
        "```",
        "",
        "## 脚本",
        ...(pkg.scripts
          ? ["| 命令 | 说明 |", "|------|------|",
             ...Object.entries(pkg.scripts as Record<string, string>).map(([k, v]) => `| \`${k}\` | ${v} |`),
            ]
          : []),
        "",
        hasTsConfig ? "## 技术栈\n\nTypeScript" : "",
        srcFiles.length > 0 ? `\n## 项目结构\n\n- ${srcFiles.slice(0, 30).join("\n- ")}\n${srcFiles.length > 30 ? `\n... 共 ${srcFiles.length} 个文件` : ""}` : "",
        "",
        "## 许可证",
        pkg.license ?? "ISC",
      ].join("\n");

      if (overwrite) {
        await writeFile("README.md", readme, "utf-8");
        return `✓ README.md 已生成 (${readme.length} 字符)`;
      }
      return `预览 README.md (使用 overwrite: true 写入文件):\n\n${readme}`;
    } catch (err) {
      return `[ERROR] 生成失败: ${formatError(err)}`;
    }
  },
});

export const docsApiTool = tool({
  name: "docs_api",
  description:
    "扫描 TypeScript 源文件的导出函数/类/接口，生成 API 文档。" +
    "【使用场景】为库或模块生成 API 参考文档。",
  parameters: z.object({
    path: z.string().default("src").describe("要扫描的目录或文件路径"),
  }),
  execute: async ({ path: scanPath }) => {
    try {
      const { readdir, stat } = await import("node:fs/promises");
      const entries = await readdir(scanPath, { recursive: true }).catch(() => []);
      const tsFiles: string[] = [];

      for (const entry of entries) {
        if (typeof entry === "string" && entry.endsWith(".ts")) {
          tsFiles.push(`${scanPath}/${entry}`);
        }
      }

      if (tsFiles.length === 0) {
        return `在 ${scanPath} 中未找到 TypeScript 文件。`;
      }

      let doc = `# API 文档 (${tsFiles.length} 个文件)\n\n`;

      for (const file of tsFiles.slice(0, 20)) {
        const content = await readFile(file, "utf-8");

        // 提取 export 声明
        const exports = content.match(/export\s+(async\s+)?(function|class|const|let|var|interface|type|enum)\s+(\w+)/g);
        if (!exports || exports.length === 0) continue;

        doc += `## \`${file}\`\n\n`;

        for (const exp of exports) {
          const match = exp.match(/export\s+(async\s+)?(\w+)\s+(\w+)/);
          if (!match) continue;
          const [, , kind, name] = match;
          doc += `- **${name}** — \`${kind}\`\n`;
        }
        doc += "\n";
      }

      if (tsFiles.length > 20) {
        doc += `... 还有 ${tsFiles.length - 20} 个文件未扫描（限制 20 个）\n`;
      }

      return doc;
    } catch (err) {
      return `[ERROR] 扫描失败: ${formatError(err)}`;
    }
  },
});

export const docsChangelogTool = tool({
  name: "docs_changelog",
  description:
    "解析 git log 并生成 CHANGELOG.md（约定式提交格式）。" +
    "【使用场景】发布新版本时自动生成变更日志。",
  parameters: z.object({
    since: z.string().optional().describe("起始标签或提交哈希（留空则显示最近 20 条提交）"),
    overwrite: z.boolean().default(false).describe("是否写入 CHANGELOG.md"),
  }),
  execute: async ({ since, overwrite }) => {
    try {
      const range = since ? `${since}..HEAD` : "-20";
      const { stdout } = await execAsync(
        `git log ${range} --format="%s|%h|%an|%ai"`,
        { maxBuffer: 100 * 1024 },
      );

      const commits = stdout.trim().split("\n").filter(Boolean);
      if (commits.length === 0) return "未找到提交记录。";

      const categories: Record<string, string[]> = {
        "feat": [],
        "fix": [],
        "chore": [],
        "refactor": [],
        "docs": [],
        "test": [],
        "other": [],
      };

      for (const line of commits) {
        const [msg, hash, author, date] = line.split("|");
        const prefix = (msg ?? "").match(/^(\w+):/)?.[1]?.toLowerCase() ?? "other";
        const cat = categories[prefix] ? prefix : "other";
        categories[cat]!.push(`- ${msg} (${hash} by ${author}, ${date?.substring(0, 10)})`);
      }

      let changelog = "# CHANGELOG\n\n";
      for (const [cat, entries] of Object.entries(categories)) {
        if (entries.length === 0) continue;
        changelog += `## ${cat}\n${entries.join("\n")}\n\n`;
      }

      if (overwrite) {
        await writeFile("CHANGELOG.md", changelog, "utf-8");
        return `✓ CHANGELOG.md 已生成 (${commits.length} 条提交)`;
      }
      return `预览 CHANGELOG (使用 overwrite: true 写入):\n\n${changelog}`;
    } catch (err) {
      return `[ERROR] 生成失败: ${formatError(err)}`;
    }
  },
});
