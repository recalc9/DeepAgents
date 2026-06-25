/**
 * 护栏定义 — Agent 级 + 工具级安全防线
 *
 * 三层护栏：
 *   Agent 输出护栏 → 敏感信息检测
 *   工具输入护栏 → 审批 + SQL 白名单（分别在各工具/context 中定义）
 */
import type { OutputGuardrail, OutputGuardrailFunctionArgs, GuardrailFunctionOutput } from "@openai/agents";

// ────────── 敏感信息模式 ──────────
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[A-Za-z0-9]{20,}/,             label: "API Key (sk-xxx)" },
  { pattern: /xai-[A-Za-z0-9]+/,                label: "xAI Key" },
  { pattern: /Bearer\s+[A-Za-z0-9\-_.]+=*/i,   label: "Bearer Token" },
  { pattern: /password\s*[:=]\s*\S+/i,          label: "明文密码" },
  { pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/,
                                                  label: "私钥" },
];

// ────────── Agent 输出护栏 ──────────

/** 检测 Agent 输出中是否包含 API Key / Token / 密码等敏感信息 */
export const secretsGuardrail: OutputGuardrail = {
  name: "secrets-detection",
  execute: async ({ agentOutput }: OutputGuardrailFunctionArgs): Promise<GuardrailFunctionOutput> => {
    const text = String(agentOutput ?? "");
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        return {
          tripwireTriggered: true,
          outputInfo: { reason: `检测到疑似敏感信息泄露 (${label})`, pattern: pattern.source },
        };
      }
    }
    return { tripwireTriggered: false, outputInfo: {} };
  },
};

