# DeepAgent

基于 [OpenAI Agents SDK](https://github.com/openai/openai-agents-typescript) 的多 Agent 编排框架，使用 DeepSeek 作为底层 LLM。

采用 **AgentHarness 声明式运行时容器**，支持嵌套 Agent 拓扑、沙盒隔离、MCP 集成和流式交互。

## 特性

- **嵌套 Agent 拓扑**：Triage → Manager(.asTool) → Code/DB，层级清晰、职责分明
- **声明式配置**：新增 Agent/工具/护栏只需修改 `src/config.ts`，不动框架代码
- **Harness 运行时容器**：拓扑排序 → 自动连线 handoffs → 装配 Agent → 管理生命周期
- **沙盒隔离**：Agent 文件操作和 Shell 命令圈在临时目录，退出即丢弃
- **实时流式展示**：Agent 思考过程、工具调用、handoff 切换可见
- **MCP 集成**：支持 stdio/HTTP/SSE 三种 MCP 服务器模式
- **多层护栏**：SQL 白名单、工具审批、敏感信息检测
- **动态 Prompt**：模板外置 `.md` 文件，修改即生效

## 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL（可选，SQL 功能需要）
- DeepSeek API Key

### 安装

```bash
git clone https://github.com/recalc9/DeepAgents
cd deepagent
npm install
```

### 配置

复制 `.env.example` 为 `.env` 并填入配置：

```bash
# 必填
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-v4-flash

# PostgreSQL（可选，使用 SQL 功能时需要）
PGHOST=localhost
PGPORT=5432
PGDATABASE=deepagent
PGUSER=postgres
PGPASSWORD=your-password
```

### 运行

```bash
npm run dev
```

## REPL 命令

| 命令 | 说明 |
|------|------|
| `/` | 显示可用命令 |
| `/sandbox [名称]` | 进入隔离沙盒模式 |
| `/exit-sandbox` | 退出沙盒（变更丢弃） |
| `/mcp` | MCP 服务器连接状态 |
| `/mcp connect <name>` | 连接 MCP 服务器 |
| `/mcp disconnect <name>` | 断开 MCP 服务器 |
| `/exit` | 退出 REPL |

Tab 键可自动补全命令。

## 架构

```
src/
├── harness/              # 框架引擎
│   ├── types.ts           # 类型定义
│   ├── assembler.ts       # 拓扑排序 + 自动连线
│   ├── runtime.ts         # 运行时容器
│   └── mcp-registry.ts    # MCP 服务器管理
├── agents/                # Agent 工厂（纯函数）
│   ├── factory.ts          # 通用 Agent 工厂
│   └── manager.agent.ts    # Manager 工厂
├── tools/                 # 工具定义
│   ├── file.tool.ts        # 文件读写
│   ├── db.tool.ts          # SQL 查询/执行
│   ├── web.tool.ts         # 网页搜索/抓取
│   ├── git.tool.ts         # Git 版本控制
│   └── code-exec.tool.ts   # 代码执行（沙盒）
├── core/                  # 基础设施
├── prompts/               # Prompt 模板
├── config.ts              # 声明式配置（单一事实来源）
├── bootstrap.ts           # 启动入口
└── index.ts               # REPL 入口
```

### Agent 拓扑

```
Triage Agent
  ├─ tools: [manager_dev]           ← Manager (.asTool)
  │   (Manager 内部)
  │   ├─ handoff → Code Agent       (编程/文件/Shell/SQL 只读)
  │   └─ handoff → DB Agent         (SQL 读写/DDL)
  ├─ handoff → General Agent        (通用问答)
  └─ handoff → Search Agent         (搜索)
```

### 工具矩阵

| Agent | 工具 |
|------|------|
| Code | `file_read`, `apply_patch`, `sql_query`, `web_fetch`, `git` |
| Code (沙盒) | + `shell`, + `run_code` |
| DB | `sql_query`, `sql_execute` |
| Search | `web_search`, `web_fetch` |
| General | `file_read`, `web_fetch` |
| Manager | 无（纯路由） |
| Triage | `manager_dev` (asTool) |

## 护栏

| 护栏 | 层级 | 行为 |
|------|------|------|
| SQL 动词白名单 | Context 实现层 | 禁止 DROP/TRUNCATE |
| sql_execute 审批 | 工具层 | 每次需 REPL 人工确认 |
| apply_patch delete 审批 | 工具层 | 删除文件需确认 |
| 敏感信息检测 | Agent 输出 | 阻断含 API Key/Token 的输出 |

## 扩展

新增 Agent 只需在 `src/config.ts` 中加几行配置：

```ts
{
  name: "websearch",
  factory: createAgent,       // 通用工厂
  promptKey: "websearch",     // → src/prompts/websearch.prompt.md
  description: "网页搜索专家",
  handoffToParents: ["triage"],
  tools: ["web_search", "web_fetch"],
  guardrails: ["secrets"],
  rootHandoff: true,
}
```

Assembler 自动处理拓扑排序、handoff 连线、工具注入和护栏绑定。

## 许可证

Apache 2.0

## 作者

**recalc9** <recalc9@yeah.net>

GitHub: [github.com/recalc9/DeepAgents](https://github.com/recalc9/DeepAgents)
