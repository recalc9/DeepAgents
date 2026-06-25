# DeepAgent — 红蓝安全 Agent 平台

基于 [OpenAI Agents SDK](https://github.com/openai/openai-agents-typescript) 的多 Agent 编排框架，使用 DeepSeek 作为底层 LLM。专为**红蓝安全作战**设计。

---

## ⚠️ 法律免责声明

**在使用本软件之前，请仔细阅读本声明。**

本软件（DeepAgent）是一款网络安全研究与测试工具，仅供以下合法用途使用：

1. **授权安全测试**：经信息系统所有者明确书面授权后，对其自有系统进行的安全评估、渗透测试和漏洞验证。
2. **安全研究与教育**：在隔离的实验环境中进行的安全技术研究、学术教育和 CTF（Capture The Flag）竞赛训练。
3. **防御能力验证**：蓝队/安全运营团队对自身防护能力的验证和提升。

### 严禁行为

使用者**绝对不得**将本软件用于以下任何行为：

- 未经授权侵入、干扰、破坏他人计算机信息系统或网络
- 非法获取、删除、篡改他人计算机信息系统中的数据
- 制作、传播计算机病毒、木马、勒索软件等恶意程序
- 为上述违法行为提供程序、工具或技术支持
- 其他违反中华人民共和国法律法规的行为

### 法律依据

本声明依据但不限于以下法律法规：

- **《中华人民共和国网络安全法》** — 第二十七条：任何个人和组织不得从事非法侵入他人网络、干扰他人网络正常功能、窃取网络数据等危害网络安全的活动
- **《中华人民共和国刑法》第二百八十五条、第二百八十六条** — 非法侵入计算机信息系统罪、破坏计算机信息系统罪
- **《中华人民共和国数据安全法》** — 第三十二条：任何组织、个人收集数据，应当采取合法、正当的方式，不得窃取或者以其他非法方式获取数据
- **《中华人民共和国个人信息保护法》** — 第十条：任何组织、个人不得非法收集、使用、加工、传输他人个人信息

### 责任声明

1. **使用者全责**：使用本软件产生的一切后果由使用者自行承担。本软件的作者、贡献者和维护者不对任何因使用本软件而导致的直接或间接损失承担法律责任。
2. **无默示授权**：本软件的任何功能或文档均不构成对未授权目标进行测试的许可。用户在使用前必须自行确认其行为符合当地法律法规。
3. **工具中立性**：本软件为中立技术工具。使用者应在法律允许的范围内使用本软件。任何超出合法范围的使用均与本软件开发者无关。

**若您不同意以上条款，请立即停止使用并删除本软件。使用本软件即视为您已充分理解并同意本声明的全部内容。**

---

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
