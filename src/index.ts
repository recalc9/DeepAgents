// 入口文件 — DeepAgent REPL
process.env.OPENAI_AGENTS_DISABLE_TRACING = "1";
import * as readline from "node:readline";
import dotenv from "dotenv";
dotenv.config();

import { run } from "@openai/agents";
import type { Agent, RunResult, StreamedRunResult } from "@openai/agents";
import { bootstrap } from "./bootstrap.js";
import { AgentRuntime } from "./harness/runtime.js";
import { buildRealContext } from "./core/real-context.js";
import { createSpinner } from "./core/spinner.js";
import type { AppContext } from "./core/agent-context.js";

// ────────── 命令注册表 ──────────

interface RepoCommand {
  name: string;
  aliases?: string[];
  desc: string;
  sandboxOnly?: boolean;
  normalOnly?: boolean;
}

function getCommands(inSandbox: boolean): RepoCommand[] {
  const status = inSandbox ? " (沙盒内不可用)" : "";
  return [
    { name: "/help",     aliases: ["/"],  desc: "显示可用命令" },
    { name: "/agents",   desc: "显示 Agent 拓扑" },
    { name: "/sandbox",  desc: "进入隔离沙盒模式 (Payload/Exp 安全执行)", normalOnly: true },
    { name: "/exit-sandbox", desc: "退出沙盒（变更丢弃）", sandboxOnly: true },
    { name: "/mcp",      aliases: ["/mcp list"], desc: "MCP 服务器状态" },
    { name: "/mcp connect", desc: "连接 MCP 服务器 [/mcp connect <name>]" },
    { name: "/mcp disconnect", desc: "断开 MCP 服务器 [/mcp disconnect <name>]" },
    { name: "/exit",     aliases: ["exit", "/quit", "quit"], desc: "退出 DeepAgent" },
  ].filter(c => {
    if (inSandbox && c.normalOnly) return false;
    if (!inSandbox && c.sandboxOnly) return false;
    return true;
  });
}

function makeCompleter(inSandbox: () => boolean): readline.Completer {
  return (line: string) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("/")) return [[], line];
    const cmds = getCommands(inSandbox());
    const candidates = cmds.flatMap(c => [c.name, ...(c.aliases ?? [])]);
    const hits = candidates.filter(c => c.startsWith(trimmed));
    if (hits.length === 1 && hits[0] === trimmed && !trimmed.endsWith(" ")) {
      return [[trimmed + " "], line];
    }
    return [hits.length ? hits : candidates, line];
  };
}

// ────────── 辅助 ──────────

function askLine(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

/** 流式事件 → spinner 文案 */
function handleStreamEvent(ev: any, spin: ReturnType<typeof createSpinner>) {
  if (ev.type === "agent_updated_stream_event") {
    spin.update(`${ev.agent.name} 正在思考…`);
  } else if (ev.type === "run_item_stream_event") {
    const n = ev.name;
    if (n === "tool_called") spin.update(`正在调用 ${ev.item.rawItem?.name ?? "?"}…`);
    else if (n === "tool_output") spin.update("处理结果中…");
    else if (n === "handoff_requested") spin.update("正在切换专家…");
    else if (n === "handoff_occurred") spin.update("专家已接手…");
    else if (n === "reasoning_item_created") spin.update("推理中…");
  }
}

async function runWithApproval(
  agent: Agent<AppContext, "text">,
  input: string,
  ctx: AppContext,
  rl: readline.Interface,
  spin: ReturnType<typeof createSpinner>,
): Promise<string | null> {
  try {
    const streamResult = await run(agent, input, { context: ctx, stream: true }) as StreamedRunResult<AppContext, any>;
    spin.start();

    for await (const ev of streamResult) handleStreamEvent(ev, spin);

    await streamResult.completed;
    spin.stop();

    let result = streamResult as unknown as RunResult<AppContext, any>;
    while (result.interruptions?.length) {
      for (const item of result.interruptions) {
        const toolName = item.name ?? "未知工具";
        const toolArgs = item.arguments ?? "";
        const preview = toolArgs.length > 200 ? toolArgs.substring(0, 200) + "…" : toolArgs;
        console.log(`\n⚠️  需要审批: ${toolName}`);
        console.log(`   参数: ${preview}`);

        const answer = await askLine(rl, "   确认执行? (y/n): ");
        if (answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes") {
          result.state.approve(item);
        } else {
          result.state.reject(item, { message: "用户拒绝了此操作" });
        }
      }
      spin.start();
      result = await run(agent, result.state, { context: ctx }) as RunResult<AppContext, any>;
      spin.stop();
    }

    return String(result.finalOutput ?? "");
  } catch (err) {
    spin.stop();
    throw err;
  }
}

// ────────── REPL ──────────

async function repl() {
  const runtime = await bootstrap();

  let ctx = buildRealContext();
  let inSandbox = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
    completer: makeCompleter(() => inSandbox),
  });

  process.on("SIGINT", async () => {
    console.log("\n👋 再见！");
    await runtime.shutdown();
    rl.close();
    process.exit(0);
  });

  // ── 辅助：打印命令帮助 ──
  function printCommands(sandbox: boolean) {
    const status = sandbox ? "🏖️  沙盒模式" : "🏠 常规模式";
    console.log(`\n  ${status}`);
    console.log("  ═══════════════════════════════════════");
    for (const cmd of getCommands(sandbox)) {
      const names = [cmd.name, ...(cmd.aliases ?? [])].join(", ");
      console.log(`  ${names.padEnd(26)} ${cmd.desc}`);
    }
    console.log("  ═══════════════════════════════════════");
    console.log("");
  }

  console.log("");
  console.log("  ╔══════════════════════════════════════════╗");
  console.log("  ║  🤖  DeepAgent  v1.0                    ║");
  console.log("  ║  Red/Blue Security Agent Platform       ║");
  console.log("  ║  powered by OpenAI Agents SDK           ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log("  ⚠  仅限授权安全测试与研究使用");
  console.log("  / 查看命令  |  /agents 查看拓扑  |  Tab 补全");
  console.log("");

  // 首次启动自动显示命令帮助
  printCommands(inSandbox);

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }

    // ── REPL 元命令 ──
    if (input === "/" || input === "/help") {
      printCommands(inSandbox);
      rl.prompt();
      continue;
    }

    if (input === "/agents") {
      console.log("");
      console.log("  🔴 红队 (Offensive)");
      console.log("  ─────────────────────────────────────────────");
      console.log("  recon      侦查专家   端口扫描/DNS/WHOIS/子域名");
      console.log("  access     凭证专家   哈希破解/词表/密码喷洒");
      console.log("  traffic    流量专家   MITM 代理/抓包/HAR 导出");
      console.log("  exploit    利用专家   Payload/Exp/提权/Shell");
      console.log("");
      console.log("  🔵 蓝队 (Defensive)");
      console.log("  ─────────────────────────────────────────────");
      console.log("  audit      审计专家   漏洞扫描/依赖审计/密钥检测");
      console.log("  detect     检测专家   YARA/SIGMA/IOC 查询");
      console.log("  intel-db   情报数据库  SQL 查询/威胁情报存储");
      console.log("");
      console.log("  ⚪ 指挥 (Command)");
      console.log("  ─────────────────────────────────────────────");
      console.log("  triage     作战指挥官 顶层任务分发");
      console.log("  mission    任务指挥官 红队任务编排 (asTool)");
      console.log("  intel-cache 情报缓存   TTPs/IOC 跨会话记忆");
      console.log("  general    通用问答   非安全类问题");
      console.log("");
      console.log("  提示: 直接描述任务，Ops Commander 自动路由到对应专家。");
      console.log("");
      rl.prompt();
      continue;
    }

    if (input === "/exit" || input === "/quit" || input === "exit" || input === "quit") {
      console.log("再见！");
      await runtime.shutdown();
      rl.close();
      break;
    }

    if (input.startsWith("/sandbox")) {
      if (inSandbox) { console.log("已在沙盒中，请先 /exit-sandbox"); rl.prompt(); continue; }
      const label = input.split(/\s+/)[1] || undefined;
      await runtime.enterSandbox(label);
      ctx = buildRealContext({ workspaceRoot: runtime.sandboxPath! });
      inSandbox = true;
      printCommands(true);
      console.log(`  📂 ${runtime.sandboxPath}`);
      rl.prompt();
      continue;
    }

    if (input === "/exit-sandbox") {
      if (!inSandbox) { console.log("当前不在沙盒中。"); rl.prompt(); continue; }
      await runtime.exitSandbox();
      ctx = buildRealContext();
      inSandbox = false;
      printCommands(false);
      rl.prompt();
      continue;
    }

    // ── MCP 命令 ──
    if (input === "/mcp" || input === "/mcp list") {
      console.log("");
      const status = await runtime.mcpRegistry.listStatus();
      if (status.length === 0) {
        console.log("  未配置 MCP 服务器。在 src/config.ts 中 mcpServerConfigs 添加配置。");
        console.log("  示例：filesystem、puppeteer、github 等 MCP 服务器。");
      } else {
        for (const s of status) {
          const icon = s.connected ? "✓" : "✗";
          const tools = s.connected ? ` (${s.toolCount} 工具)` : "";
          const err = s.error.trim() ? ` [错误: ${s.error}]` : "";
          console.log(`  ${icon} ${s.name} [${s.mode}]${tools}${err}`);
        }
      }
      console.log("");
      rl.prompt();
      continue;
    }

    if (input.startsWith("/mcp connect")) {
      const name = input.split(/\s+/)[2];
      try {
        if (name) {
          await runtime.mcpRegistry.connectByName(name);
          console.log(`[MCP] ${name} 已连接`);
        } else {
          await runtime.mcpRegistry.connectAuto();
          console.log("[MCP] 已连接所有 autoConnect 服务器");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MCP] 连接失败: ${msg}`);
      }
      rl.prompt();
      continue;
    }

    if (input.startsWith("/mcp disconnect")) {
      const name = input.split(/\s+/)[2];
      if (name) {
        await runtime.mcpRegistry.disconnectByName(name);
        console.log(`[MCP] ${name} 已断开`);
      } else {
        await runtime.mcpRegistry.disconnectAll();
        console.log("[MCP] 已断开所有 MCP 服务器");
      }
      rl.prompt();
      continue;
    }

    // ── 普通 Agent 对话 ──
    const spin = createSpinner("思考中…");
    const startTime = Date.now();

    try {
      const output = await runWithApproval(runtime.rootAgent, input, ctx, rl, spin);
      if (output !== null) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(output);
        console.log(`── ${elapsed}s ──`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] ${msg}`);
    }
    console.log("");
    rl.prompt();
  }
}

repl().catch(console.error);
