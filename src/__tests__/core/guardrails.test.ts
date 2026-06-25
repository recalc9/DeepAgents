import { describe, it, expect } from "vitest";
import { secretsGuardrail } from "../../core/guardrails.js";

describe("secretsGuardrail", () => {
  it("正常文本不触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "The weather is nice today.",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(false);
  });

  it("检测到 OpenAI/DeepSeek API Key 应触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "My key is sk-abcdefghijklmnopqrstuvwxyz12345",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo.reason).toContain("API Key");
  });

  it("检测到 Bearer Token 应触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.dGVzdA.test==",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo.reason).toContain("Bearer");
  });

  it("检测到明文密码应触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "password: hunter2",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo.reason).toContain("密码");
  });

  it("检测到私钥应触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpA...",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo.reason).toContain("私钥");
  });

  it("空输出不触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(false);
  });

  it("xAI Key 应触发", async () => {
    const result = await secretsGuardrail.execute!({
      agent: {} as any,
      agentOutput: "use xai-abc123def456 for authentication",
      context: {} as any,
    });
    expect(result.tripwireTriggered).toBe(true);
  });
});
