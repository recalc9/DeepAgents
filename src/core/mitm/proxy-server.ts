/**
 * HTTP/HTTPS 代理服务器
 *
 * HTTP: 直接代理请求 → 转发 → 返回
 * HTTPS: CONNECT 隧道 → 动态签发证书 → MITM 解密 → 转发
 */
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";
import * as url from "node:url";
import { CaManager } from "./ca-manager.js";
import { SessionStore, type CapturedSession } from "./session-store.js";
import { EventEmitter } from "node:events";

export class ProxyServer extends EventEmitter {
  private server: http.Server | null = null;
  private ca: CaManager;
  public store = new SessionStore();

  private _running = false;
  private _port = 8888;
  private _host = "0.0.0.0";

  get running() { return this._running; }
  get port() { return this._port; }
  get host() { return this._host; }

  constructor(ca: CaManager) {
    super();
    this.ca = ca;
  }

  async start(port = 8888, host = "0.0.0.0"): Promise<void> {
    if (this._running) throw new Error("代理已在运行");
    await this.ca.ensure();

    this._port = port;
    this._host = host;

    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.server.on("connect", (req, clientSocket: net.Socket, head: Buffer) => this.handleConnect(req, clientSocket, head));

    return new Promise((resolve, reject) => {
      this.server!.listen(port, host, () => {
        this._running = true;
        console.log(`[ProxyServer] 代理已启动: http://${host}:${port}`);
        resolve();
      });
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => {
        this._running = false;
        this.server = null;
        console.log(`[ProxyServer] 代理已停止，共捕获 ${this.store.count} 条请求`);
        resolve();
      });
    });
  }

  /** HTTP 代理：直接转发 */
  private handleHttp(clientReq: http.IncomingMessage, clientRes: http.ServerResponse) {
    const targetUrl = clientReq.url ?? "";
    if (!targetUrl.startsWith("http")) {
      clientRes.writeHead(400);
      clientRes.end("Bad Request: 仅支持 HTTP 代理请求");
      return;
    }

    const parsed = new url.URL(targetUrl);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: clientReq.method,
      headers: { ...clientReq.headers },
    };

    const startTime = Date.now();
    let reqBody: Buffer[] = [];
    let resBody: Buffer[] = [];

    clientReq.on("data", (chunk: Buffer) => reqBody.push(chunk));
    clientReq.on("end", () => {
      const proxyReq = http.request(options, (proxyRes) => {
        proxyRes.on("data", (chunk: Buffer) => resBody.push(chunk));
        proxyRes.on("end", () => {
          const endTime = Date.now();
          const session = this.store.add(
            clientReq.method ?? "GET", targetUrl, proxyRes.statusCode ?? 0,
            this.headersToObj(clientReq.headers),
            this.headersToObj(proxyRes.headers),
            Buffer.concat(reqBody).toString("utf-8"),
            Buffer.concat(resBody).toString("utf-8"),
            startTime, endTime, false,
          );
          this.emit("session", session);
        });

        clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(clientRes);
      });

      proxyReq.on("error", (err) => {
        clientRes.writeHead(502);
        clientRes.end(`代理错误: ${err.message}`);
      });

      if (reqBody.length > 0) {
        proxyReq.write(Buffer.concat(reqBody));
      }
      proxyReq.end();
    });
  }

  /** HTTPS CONNECT 隧道 → MITM */
  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    _head: Buffer,
  ) {
    const [hostname, portStr] = (req.url ?? "").split(":");
    const port = parseInt(portStr || "443", 10);
    if (!hostname) { clientSocket.end(); return; }

    try {
      // 签发该域名的服务器证书
      const { key, cert } = this.ca.issueServerCert(hostname);

      // TLS 服务端（面向客户端）
      const tlsServer = tls.createServer({ key, cert }, (tlsSocket) => {
        // 连接到真实服务器
        const serverSocket = net.connect(port, hostname, () => {
          // 现在 tlsSocket 是"客户端看到的"，serverSocket 是"连真实服务器的"
          // 我们需要在这个连接上做 HTTP 代理
          this.handleHttpsRequest(tlsSocket, serverSocket, hostname, port);
        });

        serverSocket.on("error", () => tlsSocket.end());
      });

      // 告知客户端连接成功
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

      // 将客户端原始 TCP 流转发到 TLS 服务端
      tlsServer.emit("connection", clientSocket);
      clientSocket.on("error", () => {});
    } catch (err: any) {
      clientSocket.write("HTTP/1.1 500 Connection Failed\r\n\r\n");
      clientSocket.end();
      console.error(`[ProxyServer] MITM 失败: ${err.message}`);
    }
  }

  /** HTTPS 解密后的 HTTP 代理 */
  private handleHttpsRequest(
    clientSocket: net.Socket,
    serverSocket: net.Socket,
    host: string,
    port: number,
  ) {
    // 用解析器读取 HTTP 请求
    let reqBuffer = Buffer.alloc(0);
    let reqParsed = false;
    let reqMethod = "GET";
    let reqPath = "/";
    let reqHeaders: Record<string, string> = {};
    let reqBodyChunks: Buffer[] = [];
    let contentLength = 0;
    let bodyReceived = 0;
    let headerEnd = -1;

    const startTime = Date.now();

    clientSocket.on("data", (chunk: Buffer) => {
      if (!reqParsed) {
        reqBuffer = Buffer.concat([reqBuffer, chunk]);
        headerEnd = reqBuffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const headerStr = reqBuffer.subarray(0, headerEnd).toString("utf-8");
        const lines = headerStr.split("\r\n");
        const [method, fullPath] = lines[0]?.split(" ") ?? ["GET", "/"];
        reqMethod = method!;
        reqPath = fullPath!;

        reqHeaders = {};
        for (let i = 1; i < lines.length; i++) {
          const colonIdx = lines[i]!.indexOf(":");
          if (colonIdx > 0) {
            reqHeaders[lines[i]!.substring(0, colonIdx).trim().toLowerCase()] =
              lines[i]!.substring(colonIdx + 1).trim();
          }
        }

        contentLength = parseInt(reqHeaders["content-length"] ?? "0", 10);
        reqParsed = true;

        // 超头部部分 → body
        const bodyStart = headerEnd + 4;
        if (reqBuffer.length > bodyStart) {
          const bodyChunk = reqBuffer.subarray(bodyStart);
          reqBodyChunks.push(bodyChunk);
          bodyReceived += bodyChunk.length;
        }

        if (bodyReceived >= contentLength && reqParsed) {
          this.doHttpsForward(
            host, port, reqMethod, reqPath, reqHeaders,
            Buffer.concat(reqBodyChunks),
            clientSocket, serverSocket, startTime, true,
          );
          return;
        }
        return;
      }

      // body 继续收
      reqBodyChunks.push(chunk);
      bodyReceived += chunk.length;
      if (bodyReceived >= contentLength) {
        this.doHttpsForward(
          host, port, reqMethod, reqPath, reqHeaders,
          Buffer.concat(reqBodyChunks),
          clientSocket, serverSocket, startTime, true,
        );
      }
    });

    clientSocket.on("error", () => {});
    serverSocket.on("error", () => clientSocket.end());
  }

  private doHttpsForward(
    host: string, port: number, method: string, path: string,
    reqHeaders: Record<string, string>, reqBody: Buffer,
    clientSocket: net.Socket, serverSocket: net.Socket,
    startTime: number, encrypted: boolean,
  ) {
    // 清理不应该转发的头
    delete reqHeaders["proxy-connection"];
    delete reqHeaders["proxy-authorization"];

    const options = {
      hostname: host, port,
      path, method,
      headers: reqHeaders,
    };

    const proxyReq = https.request(options, (proxyRes) => {
      let resBodyChunks: Buffer[] = [];

      proxyRes.on("data", (chunk: Buffer) => resBodyChunks.push(chunk));
      proxyRes.on("end", () => {
        const endTime = Date.now();
        const fullUrl = `https://${host}${path}`;
        const resBody = Buffer.concat(resBodyChunks);

        const session = this.store.add(
          method, fullUrl, proxyRes.statusCode ?? 0,
          reqHeaders, this.headersToObj(proxyRes.headers),
          reqBody, resBody, startTime, endTime, encrypted,
        );
        this.emit("session", session);

        // 构造 HTTP 响应发回客户端
        let respStr = `HTTP/1.1 ${proxyRes.statusCode} ${http.STATUS_CODES[proxyRes.statusCode ?? 200]}\r\n`;
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v) respStr += `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`;
        }
        respStr += "\r\n";
        clientSocket.write(respStr);
        clientSocket.write(resBody);
        clientSocket.end();
      });
    });

    proxyReq.on("error", (err) => {
      clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\n\r\n代理错误: ${err.message}`);
      clientSocket.end();
    });

    if (reqBody.length > 0) proxyReq.write(reqBody);
    proxyReq.end();
  }

  private headersToObj(headers: http.IncomingHttpHeaders | Record<string, string | string[] | undefined>): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v != null) obj[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    return obj;
  }
}
