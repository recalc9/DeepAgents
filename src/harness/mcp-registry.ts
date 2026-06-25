/**
 * McpRegistry — MCP 服务器注册表
 *
 * 管理 MCP 服务器的创建/连接/断开/状态查询。
 * SDK 已内置完整 MCP 支持（MCPServerStdio/StreamableHttp/SSE），
 * 此注册表负责声明式配置 → 运行时实例的生命周期。
 */
import { MCPServerStdio, MCPServerStreamableHttp, MCPServerSSE } from "@openai/agents";
import { connectMcpServers, type MCPServers } from "@openai/agents";
import type { MCPServer } from "@openai/agents";
import type { McpServerConfig, McpServerStatus } from "./types.js";

export class McpRegistry {
  private _configs: McpServerConfig[] = [];
  private _servers = new Map<string, MCPServer>();
  private _managed: MCPServers | null = null;
  private _connected = new Set<string>();

  /** 加载配置并创建 MCPServer 实例（不连接） */
  load(configs: McpServerConfig[], inSandbox: boolean): MCPServer[] {
    this._configs = configs.filter(c => inSandbox || !c.sandboxOnly);
    this._servers.clear();
    this._connected.clear();

    const servers: MCPServer[] = [];

    for (const config of this._configs) {
      let server: MCPServer;

      if (config.stdio) {
        server = new MCPServerStdio({
          ...config.stdio,
          name: config.name,
          cacheToolsList: true,
        });
      } else if (config.streamableHttp) {
        server = new MCPServerStreamableHttp({
          ...config.streamableHttp,
          name: config.name,
          cacheToolsList: true,
        });
      } else if (config.sse) {
        server = new MCPServerSSE({
          ...config.sse,
          name: config.name,
          cacheToolsList: true,
        });
      } else {
        throw new Error(`[McpRegistry] ${config.name} 缺少 stdio/streamableHttp/sse 配置`);
      }

      this._servers.set(config.name, server);
      servers.push(server);
    }

    return servers;
  }

  /** 按名称获取 MCP 服务器 */
  getServers(names: string[]): MCPServer[] {
    return names
      .map(n => this._servers.get(n))
      .filter((s): s is MCPServer => s != null);
  }

  /** 获取所有已配置的服务器 */
  get allServers(): MCPServer[] {
    return Array.from(this._servers.values());
  }

  /** 连接所有标记为 autoConnect 的服务器 */
  async connectAuto(): Promise<void> {
    const auto = this._configs.filter(c => c.autoConnect);
    if (auto.length === 0) return;

    const toConnect = auto
      .map(c => this._servers.get(c.name))
      .filter((s): s is MCPServer => s != null)
      .filter(s => !this._connected.has(s.name));

    if (toConnect.length === 0) return;

    await this.connectServers(toConnect);
  }

  /** 连接指定服务器 */
  async connectByName(name: string): Promise<void> {
    const server = this._servers.get(name);
    if (!server) throw new Error(`[McpRegistry] 未知 MCP 服务器: ${name}`);
    if (this._connected.has(name)) return;
    await this.connectServers([server]);
  }

  /** 断开指定服务器 */
  async disconnectByName(name: string): Promise<void> {
    const server = this._servers.get(name);
    if (!server) return;
    try { await server.close(); } catch { /* ignore */ }
    this._connected.delete(name);
  }

  /** 断开所有服务器 */
  async disconnectAll(): Promise<void> {
    if (this._managed) {
      try { await this._managed.close(); } catch { /* ignore */ }
      this._managed = null;
    }
    for (const server of this._servers.values()) {
      try { await server.close(); } catch { /* ignore */ }
    }
    this._connected.clear();
  }

  /** 服务器状态列表 */
  async listStatus(): Promise<McpServerStatus[]> {
    const result: McpServerStatus[] = [];
    for (const config of this._configs) {
      const server = this._servers.get(config.name);
      if (!server) continue;

      const mode = config.stdio ? "stdio" : config.streamableHttp ? "http" : "sse";
      const connected = this._connected.has(config.name);
      let toolCount = 0;
      let error = "";

      if (connected) {
        try {
          const tools = await server.listTools();
          toolCount = tools.length;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err) || "(未知错误)";
        }
      }

      result.push({ name: config.name, mode, connected, toolCount, error });
    }
    return result;
  }

  private async connectServers(servers: MCPServer[]): Promise<void> {
    try {
      this._managed = await connectMcpServers(servers);
      for (const s of servers) this._connected.add(s.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[McpRegistry] MCP 连接失败: ${msg}`);
    }
  }
}
