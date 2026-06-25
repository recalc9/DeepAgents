/**
 * Agent 工厂共享辅助函数
 */
import type { RunContext, Tool } from "@openai/agents";
import type { AppContext } from "./agent-context.js";
import type { AgentBuildContext } from "../harness/types.js";

/** 从 RunContext 安全提取 AppContext */
export function getAppContext(runContext: RunContext): AppContext {
  return runContext.context as AppContext;
}

/** 轻量级 JSON path 查询（供测试和 data.tool.ts 共用） */
export function queryJson(obj: unknown, path: string): unknown {
  const parts = path.replace(/^\$\.?/, "").split(/\.|\[|\]\.?|\]/).filter(Boolean);
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(part)) {
      cur = cur[parseInt(part, 10)];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

/** 构建 prompt 模板变量对象 */
export function buildPromptVars(
  ctx: AppContext,
  tools: Tool[],
  buildCtx: AgentBuildContext,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    user_id: ctx.userId ?? "unknown",
    workspace: buildCtx.workspaceRoot,
    tool_list: tools.map(t => (t as any).name ?? (t as any).type ?? "?").join(", "),
    ...buildCtx.extraPromptVars,
    ...extra,
  };
}

/** 统一错误消息提取 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
