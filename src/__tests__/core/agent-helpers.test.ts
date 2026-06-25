import { describe, it, expect } from "vitest";
import { getAppContext, buildPromptVars, formatError } from "../../core/agent-helpers.js";

describe("agent-helpers", () => {
  // ── getAppContext ──

  it("从 RunContext 提取 AppContext", () => {
    const fakeCtx = { userId: "u1", sessionId: "s1" };
    const rc = { context: fakeCtx } as any;
    expect(getAppContext(rc)).toBe(fakeCtx);
  });

  // ── buildPromptVars ──

  it("构建基础变量", () => {
    const appCtx: any = { userId: "user-123" };
    const buildCtx: any = { workspaceRoot: "/workspace", extraPromptVars: {} };
    const vars = buildPromptVars(appCtx, [], buildCtx);
    expect(vars.user_id).toBe("user-123");
    expect(vars.workspace).toBe("/workspace");
    expect(vars.tool_list).toBe("");
  });

  it("tool_list 正确拼接", () => {
    const appCtx: any = { userId: "u" };
    const buildCtx: any = { workspaceRoot: ".", extraPromptVars: {} };
    const tools = [
      { name: "file_read" } as any,
      { type: "apply_patch" } as any,
    ];
    const vars = buildPromptVars(appCtx, tools, buildCtx);
    expect(vars.tool_list).toContain("file_read");
    expect(vars.tool_list).toContain("apply_patch");
  });

  it("extra 变量合并", () => {
    const appCtx: any = { userId: "u" };
    const buildCtx: any = { workspaceRoot: ".", extraPromptVars: { sandbox_mode: "true" } };
    const vars = buildPromptVars(appCtx, [], buildCtx);
    expect(vars.sandbox_mode).toBe("true");
  });

  it("extra 参数覆盖默认值", () => {
    const appCtx: any = { userId: "u" };
    const buildCtx: any = { workspaceRoot: ".", extraPromptVars: {} };
    const vars = buildPromptVars(appCtx, [], buildCtx, { user_id: "override" });
    expect(vars.user_id).toBe("override");
  });

  // ── formatError ──

  it("Error 实例提取 message", () => {
    expect(formatError(new Error("test error"))).toBe("test error");
  });

  it("字符串直接返回", () => {
    expect(formatError("something wrong")).toBe("something wrong");
  });

  it("非 Error 对象用 String() 转换", () => {
    expect(formatError(404)).toBe("404");
    expect(formatError({})).toBe("[object Object]");
  });
});
