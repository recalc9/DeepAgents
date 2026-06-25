# DeepAgent — 红蓝安全 Agent 平台

基于 [OpenAI Agents SDK](https://github.com/openai/openai-agents-typescript) 的多 Agent 编排框架，使用 DeepSeek 作为底层 LLM。专为**红蓝安全作战**设计。

## 特性

- **10 个安全 Agent**：Ops Commander / Mission Lead / Exploit Dev / Recon / Access / Traffic / Audit / Detect / Intel DB / Intel Cache
- **40+ 安全专用工具**：nmap 扫描、DNS 枚举、msfvenom Payload、hashcat 破解、hydra 喷洒、nuclei 扫描、YARA/SIGMA 规则、IOC 查询、MITM 代理
- **嵌套 Agent 拓扑**：Ops Commander → Mission Lead(.asTool) → Exploit/Intel DB，层级清晰
- **声明式配置**：新增 Agent/工具/护栏只需修改 `src/config.ts`
- **沙盒隔离**：所有利用代码和 Payload 生成在临时目录执行，退出即丢弃
- **实时流式展示**：Agent 思考过程、工具调用可见
- **多层护栏**：主动扫描审批、SQL 白名单、敏感信息检测
- **94 条单元测试**：vitest，覆盖 Core / Tools / Harness 三层

## 快速开始

```bash
git clone https://github.com/recalc9/DeepAgents
cd deepagent
npm install
cp .env.example .env  # 填入 DEEPSEEK_API_KEY
npm run dev            # 启动作战指挥 REPL
```

```bash
npm test               # 94 条测试
```

## Agent 拓扑

```
Ops Commander (Triage) ── mission_lead (asTool) ──→ Mission Lead
  │                                                   ├── Exploit Dev (Payload/Exp/Shell)
  │                                                   └── Intel DB (威胁情报查询)
  ├── handoff → Recon Agent       (侦查/扫描/OSINT)
  ├── handoff → Access Agent      (凭证攻击/哈希破解)
  ├── handoff → Traffic Agent     (MITM 代理/抓包)
  ├── handoff → Audit Agent       (漏洞扫描/代码审计)
  ├── handoff → Detect Agent      (YARA/SIGMA/IOC)
  ├── handoff → Intel Cache       (TTPs/IOC 记忆)
  └── handoff → General           (通用问答)
```

### 红队 (Offensive)

| Agent | 工具 |
|------|------|
| **Exploit Dev** | `payload_gen`, `reverse_shell`, `exploit_search`, `privesc_check`, `shell`, `run_code` |
| **Recon** | `port_scan`, `dns_enum`, `whois_lookup`, `ssl_inspect`, `subdomain_enum`, `web_search` |
| **Access** | `hash_identify`, `wordlist_gen`, `hash_crack`, `pass_spray` |
| **Traffic** | `proxy_start/stop/sessions/inspect/export/intercept/dashboard` |

### 蓝队 (Defensive)

| Agent | 工具 |
|------|------|
| **Audit** | `vuln_scan`, `dep_audit`, `secret_scan`, `lint_run`, `type_check`, `pr_review` |
| **Detect** | `yara_scan`, `sigma_validate`, `ioc_check`, `web_search` |
| **Intel DB** | `sql_query`, `sql_execute`, `json_query`, `csv_read` |

### 指挥 (Command)

| Agent | 暴露方式 | 职责 |
|------|---------|------|
| **Ops Commander** | 根 Agent | 顶层分发：攻击→mission_lead / 侦查→Recon / 防御→Audit/Detect |
| **Mission Lead** | .asTool → Ops Commander | 红队任务编排：Exploit Dev ↔ Intel DB |

## 护栏

| 护栏 | 行为 |
|------|------|
| 主动扫描审批 | port_scan / vuln_scan / pass_spray 需人工确认 |
| Payload 审批 | payload_gen / hash_crack 需确认 |
| SQL 白名单 | 禁止 DROP/TRUNCATE |
| 敏感信息检测 | 阻断 API Key / Token / 私钥输出 |
| 沙盒隔离 | Exploit 代码在临时目录执行 |

## 扩展

新增安全 Agent 只需在 `src/config.ts` 加几行配置，Assembler 自动处理拓扑排序和连线。

## 许可证

Apache 2.0

## 作者

**recalc9** <recalc9@yeah.net>

GitHub: [github.com/recalc9/DeepAgents](https://github.com/recalc9/DeepAgents)
