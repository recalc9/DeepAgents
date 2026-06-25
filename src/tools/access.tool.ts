/**
 * Access 工具 — hash_identify / wordlist_gen / hash_crack / pass_spray
 *
 * 凭证攻击工具。全部需审批，沙盒模式执行。
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { tool } from "@openai/agents";
import { z } from "zod";
import { formatError } from "../core/agent-helpers.js";

const execAsync = promisify(exec);
const MAX_OUTPUT = 50 * 1024;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[TRUNCATED ${text.length - maxLen} bytes]`;
}

export const hashIdentifyTool = tool({
  name: "hash_identify",
  description: "识别哈希类型（MD5/SHA1/SHA256/bcrypt/NTLM 等）。",
  parameters: z.object({
    hash: z.string().describe("待识别的哈希值"),
  }),
  execute: async ({ hash }) => {
    // 基于长度和前缀的启发式识别
    const len = hash.length;
    const patterns: Array<{ name: string; regex: RegExp; len: number }> = [
      { name: "MD5", regex: /^[a-f0-9]{32}$/i, len: 32 },
      { name: "SHA1", regex: /^[a-f0-9]{40}$/i, len: 40 },
      { name: "SHA256", regex: /^[a-f0-9]{64}$/i, len: 64 },
      { name: "SHA512", regex: /^[a-f0-9]{128}$/i, len: 128 },
      { name: "NTLM", regex: /^[a-f0-9]{32}$/i, len: 32 },
      { name: "bcrypt", regex: /^\$2[aby]\$\d+\$/, len: 60 },
      { name: "SHA256crypt", regex: /^\$5\$/, len: -1 },
      { name: "SHA512crypt", regex: /^\$6\$/, len: -1 },
      { name: "MySQL", regex: /^\*[a-f0-9]{40}$/i, len: 41 },
      { name: "LM", regex: /^[a-f0-9]{32}$/i, len: 32 },
    ];
    const matches = patterns.filter(p => p.regex.test(hash) && (p.len < 0 || len === p.len));
    if (matches.length === 0) return `未知哈希类型 (长度: ${len})。尝试: https://hashes.com/en/decrypt/hash`;

    return `### 哈希识别\n长度: ${len}\n可能的类型:\n${matches.map(m => `- ${m.name}`).join("\n")}\n\nJohn mode: ${matches.map(m => `--format=${m.name}`).join(" 或 ")}`;
  },
});

export const wordlistGenTool = tool({
  name: "wordlist_gen",
  description:
    "生成词表（基于关键词组合、常见模式）。" +
    "【使用场景】为密码破解准备字典。",
  parameters: z.object({
    keywords: z.string().describe("逗号分隔的关键词，如 'admin,company,2024'"),
    pattern: z.string().optional().describe("附加模式: seasons, years, common_suffix"),
  }),
  execute: async ({ keywords, pattern }) => {
    const words = keywords.split(",").map(w => w.trim()).filter(Boolean);
    const suffixes = pattern === "years" ? ["2020","2021","2022","2023","2024","2025","2026","!","@","#","123"] :
      pattern === "seasons" ? ["Spring","Summer","Fall","Winter","2024","2025","!"] :
        pattern === "common_suffix" ? ["123","1234","12345","!","@","#","admin","root"] :
          ["123","!","@"];

    const combinations: string[] = [];
    for (const w of words) {
      combinations.push(w);
      for (const s of suffixes) {
        combinations.push(w + s);
        combinations.push(w.charAt(0).toUpperCase() + w.slice(1) + s);
      }
    }

    // 大写首字母变体
    for (const w of words) {
      combinations.push(w.charAt(0).toUpperCase() + w.slice(1));
    }

    const unique = [...new Set(combinations)].slice(0, 200);
    return `生成 ${unique.length} 个候选 (${words.length} 关键词 × ${suffixes.length} 后缀):\n${unique.join("\n")}\n\n提示: 保存为文件: file_write wordlist.txt`;
  },
});

export const hashCrackTool = tool({
  name: "hash_crack",
  description:
    "哈希破解（john/hashcat wrapper）。沙盒内执行。" +
    "⚠ 仅授权测试使用，需人工确认。",
  parameters: z.object({
    hash: z.string().describe("待破解的哈希值"),
    wordlistPath: z.string().optional().describe("词表路径（不填则使用 rockyou）"),
    type: z.string().optional().describe("哈希类型 (ntlm/md5/sha256)，不填则自动识别"),
  }),
  needsApproval: true,
  execute: async ({ hash, wordlistPath, type }) => {
    try {
      const hashType = type ?? "auto";
      const wordlist = wordlistPath ?? "/usr/share/wordlists/rockyou.txt";
      const cmd = `echo '${hash}' | hashcat -m 0 -a 0 --potfile-disable -O /dev/stdin ${wordlist} 2>/dev/null | head -5 || echo "NO_HASHCAT"`;
      const { stdout } = await execAsync(cmd, { timeout: 60_000, maxBuffer: MAX_OUTPUT });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_HASHCAT")) return "[WARN] hashcat 未安装。安装: apt install hashcat";
      return output.includes(":") ? `✓ 破解成功:\n${output}` : `未破解。\n${output}`;
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});

export const passSprayTool = tool({
  name: "pass_spray",
  description:
    "密码喷洒 — 单个密码尝试多个账户（hydra wrapper）。" +
    "⚠ 未经授权使用违法，需人工确认。",
  parameters: z.object({
    target: z.string().describe("目标服务地址"),
    service: z.string().default("ssh").describe("服务: ssh/ftp/rdp/http"),
    userlist: z.string().describe("用户名列表文件路径"),
    password: z.string().describe("尝试的密码"),
    port: z.number().optional().describe("服务端口"),
  }),
  needsApproval: true,
  execute: async ({ target, service, userlist, password, port }) => {
    try {
      const portFlag = port ? `-s ${port}` : "";
      const cmd = `hydra -L ${userlist} -p '${password}' ${portFlag} ${target} ${service} 2>/dev/null | head -20 || echo "NO_HYDRA"`;
      const { stdout } = await execAsync(cmd, { timeout: 120_000, maxBuffer: MAX_OUTPUT });
      const output = truncate(stdout, MAX_OUTPUT);
      if (output.includes("NO_HYDRA")) return "[WARN] hydra 未安装。安装: apt install hydra";
      return output.includes("login:") || output.includes("password:") ? `⚠ 发现有效凭证:\n${output}` : `未发现有效凭证:\n${output}`;
    } catch (err) {
      return `[ERROR] ${formatError(err)}`;
    }
  },
});
