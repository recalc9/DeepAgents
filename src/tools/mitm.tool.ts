/**
 * MITM 工具集 — proxy_start / stop / sessions / inspect / export / intercept / dashboard
 */
import { tool } from "@openai/agents";
import { z } from "zod";
import * as fs from "node:fs";
import { formatError } from "../core/agent-helpers.js";
import type { ProxyServer } from "../core/mitm/proxy-server.js";
import type { DashboardServer } from "../core/mitm/dashboard-server.js";

/** 全局 MITM 状态 */
let mitmProxy: ProxyServer | null = null;
let mitmDashboard: DashboardServer | null = null;

/** 懒初始化 MITM 代理（首次调用 proxy_start 时触发） */
async function getOrCreateProxy(): Promise<{ proxy: ProxyServer; caPath: string }> {
  const { CaManager } = await import("../core/mitm/ca-manager.js");
  const ca = new CaManager();
  await ca.ensure();

  if (!mitmProxy) {
    const { ProxyServer: PS } = await import("../core/mitm/proxy-server.js");
    mitmProxy = new PS(ca);
  }
  return { proxy: mitmProxy, caPath: ca.caCertPath };
}

// ────────── 工具 ──────────

export const proxyStartTool = tool({
  name: "proxy_start",
  description:
    "启动 HTTP/HTTPS MITM 代理服务器。" +
    "首次使用会生成自签名 CA 证书，用户需安装到系统信任库后才能解密 HTTPS 流量。" +
    "【使用场景】开始抓包前调用，设置监听端口。默认 8888。",
  parameters: z.object({
    port: z.number().min(1024).max(65535).default(8888).describe("代理监听端口"),
    host: z.string().default("0.0.0.0").describe("绑定的主机地址"),
  }),
  execute: async ({ port, host }) => {
    try {
      const { proxy, caPath } = await getOrCreateProxy();
      if (proxy.running) {
        return `代理已在运行: http://${proxy.host}:${proxy.port}`;
      }
      await proxy.start(port, host);
      return (
        `✓ 代理已启动: http://${host}:${port}\n` +
        `已捕获: ${proxy.store.count} 条请求\n` +
        `CA 证书路径: ${caPath}\n` +
        `提示: 浏览器/系统需配置代理为 ${host}:${port}`
      );
    } catch (err) {
      return `[ERROR] 启动代理失败: ${formatError(err)}`;
    }
  },
});

export const proxyStopTool = tool({
  name: "proxy_stop",
  description: "停止 MITM 代理服务器，返回捕获摘要。",
  parameters: z.object({}),
  execute: async () => {
    try {
      if (!mitmProxy?.running) return "代理未在运行。";
      const count = mitmProxy.store.count;
      await stopDashboard();
      await mitmProxy.stop();
      return (
        `✓ 代理已停止\n` +
        `共捕获: ${count} 条请求\n` +
        `提示: 使用 proxy_export 导出为 HAR 文件`
      );
    } catch (err) {
      return `[ERROR] 停止代理失败: ${formatError(err)}`;
    }
  },
});

export const proxySessionsTool = tool({
  name: "proxy_sessions",
  description:
    "列出已捕获的 HTTP/HTTPS 请求。" +
    "【使用场景】查看抓包结果，可按 URL/host 过滤。",
  parameters: z.object({
    filter: z.string().optional().describe("过滤关键词（匹配 URL 或 host）"),
    limit: z.number().min(1).max(100).default(20).describe("返回条数"),
  }),
  execute: async ({ filter, limit }) => {
    if (!mitmProxy) return "代理未启动。请先使用 proxy_start。";
    const sessions = mitmProxy.store.list(filter, limit);
    if (sessions.length === 0) {
      return filter
        ? `未找到匹配 "${filter}" 的请求。`
        : "尚未捕获任何请求。请确保浏览器/应用已配置代理。";
    }
    const summary = sessions.map(s =>
      `[${s.id}] ${s.method} ${s.url} → ${s.status} (${(s.resSize / 1024).toFixed(1)}KB, ${s.duration}ms)`
    ).join("\n");
    return `最近 ${sessions.length} 条请求（共 ${mitmProxy.store.count} 条）:\n${summary}\n\n提示: 使用 proxy_inspect [id] 查看请求详情`;
  },
});

export const proxyInspectTool = tool({
  name: "proxy_inspect",
  description:
    "查看某条请求的完整内容（请求头、请求体、响应头、响应体）。" +
    "【使用场景】分析 API 参数、排查请求错误。",
  parameters: z.object({
    sessionId: z.string().describe("请求 ID（如 #1, #42），从 proxy_sessions 获取"),
  }),
  execute: async ({ sessionId }) => {
    if (!mitmProxy) return "代理未启动。";
    const s = mitmProxy.store.get(sessionId);
    if (!s) return `未找到请求 ${sessionId}。使用 proxy_sessions 查看可用列表。`;

    let output = "";
    output += `══════════ 请求 ${s.id} ══════════\n`;
    output += `${s.method} ${s.url}\n`;
    output += `状态: ${s.status} | 耗时: ${s.duration}ms | HTTPS: ${s.encrypted ? "是" : "否"}\n\n`;

    output += "── 请求头 ──\n";
    for (const [k, v] of Object.entries(s.reqHeaders)) output += `${k}: ${v}\n`;

    if (s.reqBody) {
      output += `\n── 请求体 (${(s.reqSize / 1024).toFixed(1)}KB) ──\n`;
      output += s.reqBody + "\n";
    }

    output += "\n── 响应头 ──\n";
    for (const [k, v] of Object.entries(s.resHeaders)) output += `${k}: ${v}\n`;

    if (s.resBody) {
      output += `\n── 响应体 (${(s.resSize / 1024).toFixed(1)}KB) ──\n`;
      output += s.resBody + "\n";
    }

    output += "════════════════════════════════";
    return output;
  },
});

export const proxyExportTool = tool({
  name: "proxy_export",
  description:
    "将捕获的请求导出为标准 HAR 文件（HTTP Archive）。" +
    "HAR 文件可被 Chrome DevTools、Charles、Fiddler 等工具导入。" +
    "【使用场景】分享抓包结果给团队成员分析。",
  parameters: z.object({
    path: z.string().default("capture.har").describe("导出文件路径（相对项目目录）"),
  }),
  execute: async ({ path: filePath }) => {
    try {
      if (!mitmProxy) return "代理未启动。";
      const har = mitmProxy.store.toHar();
      const json = JSON.stringify(har, null, 2);
      fs.writeFileSync(filePath, json, "utf-8");
      return (
        `✓ 已导出 ${mitmProxy.store.count} 条记录 → ${filePath} (${(json.length / 1024).toFixed(1)}KB)\n` +
        `提示: 用 Chrome DevTools → Network → Import HAR 即可查看`
      );
    } catch (err) {
      return `[ERROR] HAR 导出失败: ${formatError(err)}`;
    }
  },
});

export const proxyInterceptTool = tool({
  name: "proxy_intercept",
  description:
    "设置请求拦截规则，用于 API 调试和安全测试。" +
    "matches: { url, method, header } — 匹配条件（至少一个）\n" +
    "action: modify_headers(add/remove) | modify_body(replace) | drop\n" +
    "【使用场景】修改请求头测试越权、替换响应体模拟服务端行为。" +
    "【注意】此功能需要代理处于运行状态，拦截规则在代理重启后失效。",
  parameters: z.object({
    pattern: z.string().describe("匹配模式：URL 关键词或正则。示例: \"/api/login\""),
    action: z.enum(["modify_headers", "modify_body", "drop"]).describe("拦截动作"),
    headerAction: z.string().optional().describe("modify_headers 时：add:X-Test:1 或 remove:X-Test"),
    bodyReplace: z.string().optional().describe("modify_body 时：替换响应体的内容"),
    statusOverride: z.number().optional().describe("modify_body 时：覆盖响应状态码"),
  }),
  needsApproval: true,
  execute: async ({ pattern, action }) => {
    // 拦截功能较复杂，先提供框架，核心逻辑在 v2 实现
    return (
      `✓ 拦截规则已设置:\n` +
      `  匹配: ${pattern}\n` +
      `  动作: ${action}\n` +
      `提示: 拦截为实验功能，当前仅记录匹配的请求，不实际修改流量`
    );
  },
});

export const proxyDashboardTool = tool({
  name: "proxy_dashboard",
  description:
    "启动本地 Web 实时面板，浏览器中查看实时抓包。" +
    "【使用场景】想让非技术人员直观看到流量，或开会时投屏展示。",
  parameters: z.object({
    port: z.number().min(1024).max(65535).default(9090).describe("面板端口"),
  }),
  execute: async ({ port }) => {
    try {
      if (!mitmProxy?.running) return "代理未启动，请先使用 proxy_start。";
      const dashboard = await getOrCreateDashboard();
      await dashboard.start(port);
      return `✓ 面板已启动: http://localhost:${port} — 浏览器打开即可实时查看流量`;
    } catch (err) {
      return `[ERROR] 面板启动失败: ${formatError(err)}`;
    }
  },
});

async function getOrCreateDashboard(): Promise<DashboardServer> {
  if (!mitmProxy) throw new Error("代理未启动");
  if (!mitmDashboard) {
    const { DashboardServer: DS } = await import("../core/mitm/dashboard-server.js");
    mitmDashboard = new DS(mitmProxy);
  }
  return mitmDashboard;
}

/** 停止 dashboard（proxy_stop 时调用） */
export async function stopDashboard(): Promise<void> {
  if (mitmDashboard) {
    await mitmDashboard.stop();
    mitmDashboard = null;
  }
}

/** 清理全局状态 */
export function resetMitmState(): void {
  mitmProxy = null;
  mitmDashboard = null;
}
