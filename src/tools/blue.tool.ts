/**
 * Blue 工具 — vuln_scan / dep_audit / secret_scan / yara_scan / sigma_validate
 *
 * 蓝队防御/检测工具。基于 CLI 命令封装。
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const execAsync = promisify(exec);
const MAX_OUTPUT = 50 * 1024;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
}

export const vulnScanTool = tool({
  name: "vuln_scan",
  description:
    "漏洞扫描（nuclei wrapper）。使用 YAML 模板对目标进行自动化漏洞检测。" +
    "【使用场景】蓝队验证目标是否存在已知漏洞。",
  parameters: z.object({
    target: z.string().describe("目标 URL/IP"),
    severity: z.string().default("medium,high,critical").describe("严重级别过滤"),
  }),
  needsApproval: true,
  execute: async ({ target, severity }) => {
    try {
      const cmd = `nuclei -u ${target} -severity ${severity} -silent 2>/dev/null | head -50 || echo "NO_NUCLEI"`;
      const { stdout } = await execAsync(cmd, { timeout: 120_000, maxBuffer: MAX_OUTPUT * 2 });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_NUCLEI")) return "[WARN] nuclei 未安装。安装: go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest";
      return output.trim() || "未发现匹配的漏洞。";
    } catch (err) {
      return `[ERROR] 扫描失败: ${formatError(err)}`;
    }
  },
});

export const depAuditTool = tool({
  name: "dep_audit",
  description:
    "依赖漏洞审计。检查 package.json / requirements.txt 中已知 CVE。" +
    "【使用场景】供应链安全审查。",
  parameters: z.object({
    path: z.string().default(".").describe("项目目录"),
    type: z.enum(["npm", "pip", "auto"]).default("auto").describe("包管理器类型"),
  }),
  execute: async ({ path: scanPath, type }) => {
    try {
      let cmd = "";
      if (type === "npm" || type === "auto") cmd = `cd ${scanPath} && (npm audit --json 2>/dev/null | head -100 || echo 'NPM_FAIL')`;
      if (type === "pip" || (type === "auto" && cmd.includes("NPM_FAIL"))) cmd = `cd ${scanPath} && (pip-audit 2>/dev/null || safety check 2>/dev/null || echo 'PIP_NO_AUDIT')`;

      const { stdout } = await execAsync(cmd || "echo NO_PKG", { timeout: 60_000, maxBuffer: MAX_OUTPUT, cwd: process.cwd() });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_PKG") || output.includes("PIP_NO_AUDIT")) return "[WARN] 未检测到可审计的依赖。安装: pip install pip-audit 或 safety";
      return output.includes("vulnerabilit") || output.includes("high") || output.includes("critical")
        ? `⚠ 发现漏洞:\n${output}`
        : `✓ 未发现已知漏洞。\n${output}`;
    } catch (err: any) {
      const output = truncate(err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return output.includes("vulnerabilit") || output.includes("high") || output.includes("critical")
        ? `⚠ 发现漏洞:\n${output}`
        : `依赖审计结果:\n${output}`;
    }
  },
});

export const secretScanTool = tool({
  name: "secret_scan",
  description:
    "扫描代码中的密钥泄露（gitleaks / truffleHog wrapper）。" +
    "【使用场景】检查是否有 API Key、密码、Token 被提交到代码库。",
  parameters: z.object({
    path: z.string().default(".").describe("扫描的目录"),
  }),
  execute: async ({ path: scanPath }) => {
    try {
      const cmd = `cd ${scanPath} && (gitleaks detect --no-git -v 2>/dev/null | head -50 || trufflehog filesystem . --json 2>/dev/null | head -20 || echo "NO_SECRET_SCANNER")`;
      const { stdout } = await execAsync(cmd, { timeout: 60_000, maxBuffer: MAX_OUTPUT, cwd: process.cwd() });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_SECRET_SCANNER")) return "[WARN] gitleaks/truffleHog 未安装。安装: brew install gitleaks 或 pip install trufflehog";
      return output.trim() || "✓ 未发现密钥泄露。";
    } catch (err: any) {
      // gitleaks detect 发现密钥时返回 exit code 1
      const output = truncate(err?.stdout ?? err?.stderr ?? formatError(err), MAX_OUTPUT);
      return output.trim() ? `⚠ 发现疑似密钥:\n${output}` : "✓ 未发现密钥泄露。";
    }
  },
});

export const yaraScanTool = tool({
  name: "yara_scan",
  description:
    "YARA 规则扫描 — 用自定义规则匹配文件/进程。" +
    "【使用场景】恶意软件检测、IOC 匹配。",
  parameters: z.object({
    rulePath: z.string().describe("YARA 规则文件路径，如 rules/malware.yar"),
    target: z.string().describe("扫描目标文件或目录"),
  }),
  needsApproval: false,
  execute: async ({ rulePath, target }) => {
    try {
      const { stdout } = await execAsync(`yara ${rulePath} ${target} 2>/dev/null | head -50 || echo "NO_YARA"`, { timeout: 30_000, maxBuffer: MAX_OUTPUT });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_YARA")) return "[WARN] yara 未安装。安装: apt install yara / brew install yara";
      return output.trim() || "✓ 无规则命中。";
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});

export const sigmaValidateTool = tool({
  name: "sigma_validate",
  description:
    "SIGMA 规则语法验证。" +
    "【使用场景】编写检测规则后验证格式是否正确。",
  parameters: z.object({
    rulePath: z.string().describe("SIGMA 规则文件路径"),
  }),
  execute: async ({ rulePath }) => {
    try {
      const content = await readFile(rulePath, "utf-8").catch(() => "");
      if (!content) return `[ERROR] 文件不存在: ${rulePath}`;

      try {
        const yaml = JSON.parse(JSON.stringify(
          content.split("\n").filter(l => !l.trim().startsWith("#")).join("\n")
        ));

        let report = "### SIGMA 规则检查\n";
        report += `文件: ${rulePath}\n`;

        // 基本字段检查
        const hasTitle = /^title\s*:/m.test(content);
        const hasId = /^id\s*:/m.test(content);
        const hasStatus = /^status\s*:/m.test(content);
        const hasLevel = /^level\s*:/m.test(content);
        const hasDetection = /^detection\s*:/m.test(content);
        const hasLogsource = /^logsource\s*:/m.test(content);

        report += `title: ${hasTitle ? "✓" : "✗ 缺失"}\n`;
        report += `id: ${hasId ? "✓" : "✗ 缺失"}\n`;
        report += `status: ${hasStatus ? "✓" : "✗ 缺失"}\n`;
        report += `level: ${hasLevel ? "✓" : "✗ 缺失"}\n`;
        report += `logsource: ${hasLogsource ? "✓" : "✗ 缺失"}\n`;
        report += `detection: ${hasDetection ? "✓" : "✗ 缺失"}\n`;

        const allOk = hasTitle && hasId && hasStatus && hasLevel && hasDetection && hasLogsource;
        report += `\n${allOk ? "✓ 规则基本字段完整" : "⚠ 请补齐缺失字段"}`;

        return report;
      } catch {
        return "⚠ YAML 语法错误，请检查缩进和格式。";
      }
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});

export const iocCheckTool = tool({
  name: "ioc_check",
  description:
    "IOC 查询 — 在威胁情报源中查找 IP/域名/哈希。" +
    "【使用场景】告警分析、事件响应。",
  parameters: z.object({
    ioc: z.string().describe("IOC: IP、域名 或 文件哈希(SHA256)"),
  }),
  execute: async ({ ioc }) => {
    // VirusTotal 免费 API + AbuseIPDB + URLhaus
    const results: string[] = [];

    // AbuseIPDB (只查 IP)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ioc)) {
      try {
        const resp = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ioc}&maxAgeInDays=90`, {
          headers: { Key: process.env.ABUSEIPDB_KEY ?? "", Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const data = await resp.json() as any;
          results.push(`AbuseIPDB: 置信度 ${data?.data?.abuseConfidenceScore ?? "?"}%, 报告数 ${data?.data?.totalReports ?? "?"}`);
        }
      } catch { results.push("AbuseIPDB: 不可达 (或 Key 未设置)"); }
    }

    // URLhaus (查恶意 URL)
    try {
      const resp = await fetch(`https://urlhaus-api.abuse.ch/v1/url/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `url=${encodeURIComponent(ioc)}`,
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data?.query_status === "ok") results.push(`URLhaus: ${data?.url_status ?? "unknown"}`);
      }
    } catch { /* URLhaus optional */ }

    return results.length > 0
      ? `### IOC: ${ioc}\n${results.join("\n")}`
      : `### IOC: ${ioc}\n(未在免费源中找到匹配 — 建议手动查询 VirusTotal)`;
  },
});
