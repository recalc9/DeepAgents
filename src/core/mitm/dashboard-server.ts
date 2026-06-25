/**
 * 实时 Web 面板 — SSE 推送新请求 + 内联 HTML UI
 */
import * as http from "node:http";
import { ProxyServer } from "./proxy-server.js";

const HTML = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeepAgent MITM Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.5 system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:16px}
h1{font-size:18px;color:#58a6ff;margin-bottom:4px}
.meta{color:#8b949e;font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:6px 8px;border-bottom:1px solid #30363d;color:#8b949e;font-weight:500;font-size:12px}
td{padding:6px 8px;border-bottom:1px solid #21262d;font-size:13px}
tr:hover{background:#161b22}
.method{font-weight:600;display:inline-block;width:48px}
.method.GET{color:#3fb950}.method.POST{color:#f0883e}.method.PUT{color:#79c0ff}.method.DELETE{color:#f85149}
.url{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle}
.status{font-weight:600}.status.s2xx{color:#3fb950}.status.s3xx{color:#79c0ff}.status.s4xx{color:#f0883e}.status.s5xx{color:#f85149}
.size{color:#8b949e;font-size:12px}.time{color:#8b949e;font-size:12px}
.empty{text-align:center;color:#8b949e;padding:40px}
</style></head><body>
<h1>DeepAgent MITM Dashboard</h1>
<div class="meta" id="meta">连接中…</div>
<table><thead><tr><th>方法</th><th>URL</th><th>状态</th><th>大小</th><th>耗时</th></tr></thead><tbody id="rows"></tbody></table>
<div class="empty" id="empty">等待请求…</div>
<script>
const rows=document.getElementById("rows"),empty=document.getElementById("empty"),meta=document.getElementById("meta");
const es=new EventSource("/events");
es.onopen=()=>meta.textContent="实时监听中";
es.onmessage=e=>{
  const s=JSON.parse(e.data);empty.style.display="none";
  const sc=s.status>=500?"s5xx":s.status>=400?"s4xx":s.status>=300?"s3xx":"s2xx";
  rows.insertAdjacentHTML("afterbegin",
    '<tr><td><span class="method '+s.method+'">'+s.method+'</span></td>'+
    '<td><span class="url" title="'+s.url+'">'+s.url.split("/").slice(-1)[0]||s.url+'</span></td>'+
    '<td><span class="status '+sc+'">'+s.status+'</span></td>'+
    '<td class="size">'+(s.resSize/1024).toFixed(1)+'KB</td>'+
    '<td class="time">'+s.duration+'ms</td></tr>'
  );
};
</script></body></html>`;

export class DashboardServer {
  private server: http.Server | null = null;
  private proxy: ProxyServer;
  private clients: http.ServerResponse[] = [];

  constructor(proxy: ProxyServer) {
    this.proxy = proxy;
  }

  async start(port = 9090): Promise<void> {
    this.server = http.createServer((req, res) => {
      if (req.url === "/events") {
        // SSE
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        this.clients.push(res);
        req.on("close", () => {
          const idx = this.clients.indexOf(res);
          if (idx >= 0) this.clients.splice(idx, 1);
        });
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
      res.end(HTML);
    });

    // 监听 session 事件 → 推送 SSE
    this.proxy.on("session", (session) => {
      const payload = JSON.stringify({
        id: session.id, method: session.method, url: session.url,
        status: session.status, resSize: session.resSize, duration: session.duration,
      });
      for (const c of this.clients) c.write(`data:${payload}\n\n`);
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(port, "0.0.0.0", () => {
        console.log(`[Dashboard] 面板已启动: http://localhost:${port}`);
        resolve();
      });
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.server) { resolve(); return; }
      for (const c of this.clients) c.end();
      this.clients = [];
      this.server.close(() => resolve());
    });
  }
}
