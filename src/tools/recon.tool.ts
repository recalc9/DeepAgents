/**
 * Recon 工具 — port_scan / dns_enum / whois_lookup / ssl_inspect / subdomain_enum
 *
 * 信息收集阶段工具，基于 CLI 命令封装。
 * 所有主动扫描类操作需要审批。
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const execAsync = promisify(exec);
const MAX_OUTPUT = 50 * 1024;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
}

export const portScanTool = tool({
  name: "port_scan",
  description:
    "TCP 端口扫描。使用 nmap 进行服务探测和版本检测。" +
    "【使用场景】信息收集阶段，发现目标开放端口与服务。" +
    "⚠ 仅在授权目标上使用。",
  parameters: z.object({
    target: z.string().describe("目标 IP/域名，如 192.168.1.1 或 example.com"),
    ports: z.string().default("1-1000").describe("端口范围，如 22,80,443 或 1-1000"),
    options: z.string().default("-sV").describe("nmap 选项，默认 -sV(版本检测)"),
  }),
  needsApproval: true,
  execute: async ({ target, ports, options }) => {
    try {
      const cmd = `nmap ${options} -p ${ports} ${target} 2>/dev/null || echo "NO_NMAP"`;
      const { stdout } = await execAsync(cmd, { timeout: 120_000, maxBuffer: MAX_OUTPUT });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_NMAP")) return "[ERROR] nmap 未安装。安装: apt install nmap / brew install nmap";
      return `nmap ${target}:\n${output}`;
    } catch (err) {
      return `[ERROR] 扫描失败: ${formatError(err)}`;
    }
  },
});

export const dnsEnumTool = tool({
  name: "dns_enum",
  description:
    "DNS 枚举：查询 A/AAAA/MX/NS/TXT 记录，尝试区域传输。" +
    "【使用场景】信息收集阶段，枚举目标域名信息。",
  parameters: z.object({
    domain: z.string().describe("目标域名"),
    recordType: z.string().default("ANY").describe("记录类型: A/AAAA/MX/NS/TXT/ANY"),
  }),
  execute: async ({ domain, recordType }) => {
    try {
      const { stdout: digOut } = await execAsync(
        `dig +short ${recordType} ${domain} 2>/dev/null || nslookup -type=${recordType} ${domain} 2>/dev/null || echo "NO_DNS_TOOL"`,
        { timeout: 15_000, maxBuffer: MAX_OUTPUT }
      );
      let output = truncate(digOut, MAX_OUTPUT);
      if (output.includes("NO_DNS_TOOL")) return "[WARN] dig/nslookup 未安装";

      // 尝试区域传输
      let zoneOutput = "";
      try {
        const { stdout: nsOut } = await execAsync(`dig +short NS ${domain}`, { timeout: 10_000 });
        const ns = nsOut.trim().split("\n").filter(Boolean);
        for (const n of ns.slice(0, 3)) {
          try {
            const { stdout: axfr } = await execAsync(`dig @${n.trim()} ${domain} AXFR +time=5`, { timeout: 10_000 });
            if (axfr.trim()) zoneOutput += `\n[AXFR from ${n.trim()}]:\n${axfr}`;
          } catch { /* zone transfer denied — 正常 */ }
        }
      } catch { /* ns lookup failed */ }

      // WHOIS 补充
      let whoisOut = "";
      try {
        const { stdout: w } = await execAsync(`whois ${domain} 2>/dev/null | head -30`, { timeout: 10_000 });
        whoisOut = truncate(w, 2000);
      } catch { /* */ }

      return `### DNS 记录 (${domain})\n${output}${zoneOutput || "\n(区域传输被拒或不可用)"}\n\n### WHOIS 摘要\n${whoisOut || "(whois 不可用)"}`;
    } catch (err) {
      return `[ERROR] DNS 枚举失败: ${formatError(err)}`;
    }
  },
});

export const whoisTool = tool({
  name: "whois_lookup",
  description: "WHOIS 查询域名或 IP 的注册信息。",
  parameters: z.object({
    target: z.string().describe("域名或 IP"),
  }),
  execute: async ({ target }) => {
    try {
      const { stdout } = await execAsync(`whois ${target} 2>/dev/null | head -50 || echo "NO_WHOIS"`, { timeout: 15_000, maxBuffer: MAX_OUTPUT });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_WHOIS")) return "[WARN] whois 未安装。";
      return output;
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});

export const sslInspectTool = tool({
  name: "ssl_inspect",
  description: "SSL/TLS 证书检查，获取证书链、有效期、SAN、Cipher 套件。",
  parameters: z.object({
    host: z.string().describe("目标域名"),
    port: z.number().default(443).describe("端口"),
  }),
  execute: async ({ host, port }) => {
    try {
      const { stdout } = await execAsync(
        `echo | openssl s_client -connect ${host}:${port} -servername ${host} 2>/dev/null | openssl x509 -noout -text | head -60 || echo "NO_OPENSSL"`,
        { timeout: 15_000, maxBuffer: MAX_OUTPUT }
      );
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_OPENSSL")) return "[WARN] openssl 未安装";

      // 提取关键字段
      const subject = output.match(/Subject:\s*(.+)/)?.[1] ?? "N/A";
      const issuer = output.match(/Issuer:\s*(.+)/)?.[1] ?? "N/A";
      const notBefore = output.match(/Not Before:\s*(.+)/)?.[1] ?? "N/A";
      const notAfter = output.match(/Not After\s*:\s*(.+)/)?.[1] ?? "N/A";
      const sans = output.match(/DNS:([^\s,]+)/g)?.map(s => s.replace("DNS:", "")) ?? [];

      return `### SSL 证书: ${host}:${port}\nSubject: ${subject}\nIssuer: ${issuer}\n有效期: ${notBefore} → ${notAfter}\nSANs: ${sans.join(", ") || "无"}\n\n### 完整证书\n${output}`;
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});

export const subdomainEnumTool = tool({
  name: "subdomain_enum",
  description: "子域名枚举（基于证书透明度日志 crt.sh）。",
  parameters: z.object({
    domain: z.string().describe("根域名，如 example.com"),
  }),
  execute: async ({ domain }) => {
    try {
      // crt.sh — 免费，无需 API Key
      const resp = await fetch(`https://crt.sh/?q=%.${domain}&output=json`);
      if (!resp.ok) return "[WARN] crt.sh 不可达";
      const data = await resp.json() as Array<{ name_value: string }>;
      const names = [...new Set(data.flatMap(item => item.name_value.split("\n")))]
        .filter(n => n && !n.includes("*"))
        .sort()
        .slice(0, 100);
      return names.length > 0
        ? `发现 ${names.length} 个子域名:\n${names.join("\n")}`
        : `未通过 crt.sh 找到 ${domain} 的子域名。`;
    } catch (err) {
      return `[ERROR] 子域名枚举失败: ${formatError(err)}`;
    }
  },
});
