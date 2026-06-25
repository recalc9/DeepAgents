/**
 * 会话存储 — RingBuffer + HAR 导出
 */
export interface CapturedSession {
  id: string;
  method: string;
  url: string;
  status: number;
  /** ISO 时间戳 */
  time: string;
  /** 请求头 */
  reqHeaders: Record<string, string>;
  /** 响应头 */
  resHeaders: Record<string, string>;
  /** 请求体（截断后） */
  reqBody: string;
  /** 响应体（截断后） */
  resBody: string;
  /** 请求体大小（字节） */
  reqSize: number;
  /** 响应体大小（字节） */
  resSize: number;
  /** 耗时（毫秒） */
  duration: number;
  /** 目标 host */
  host: string;
  /** 请求相对路径 */
  path: string;
  /** Content-Type */
  contentType: string;
  /** 是否 HTTPS */
  encrypted: boolean;
}

const MAX_SESSIONS = 500;
const MAX_BODY = 50 * 1024;

export class SessionStore {
  private sessions: CapturedSession[] = [];
  private seq = 0;

  /** 添加一条捕获 */
  add(
    method: string, url: string, status: number,
    reqHeaders: Record<string, string>, resHeaders: Record<string, string>,
    reqBody: string | Buffer, resBody: string | Buffer,
    startTime: number, endTime: number, encrypted: boolean,
  ): CapturedSession {
    const id = `#${++this.seq}`;
    const parsed = this.parseUrl(url);

    const truncate = (b: string | Buffer) => {
      const s = typeof b === "string" ? b : b.toString("utf-8");
      return s.length > MAX_BODY ? s.substring(0, MAX_BODY) + "\n...[TRUNCATED]" : s;
    };

    const session: CapturedSession = {
      id,
      method: method.toUpperCase(),
      url,
      status,
      time: new Date(startTime).toISOString(),
      reqHeaders,
      resHeaders,
      reqBody: truncate(reqBody),
      resBody: truncate(resBody),
      reqSize: typeof reqBody === "string" ? Buffer.byteLength(reqBody) : reqBody.length,
      resSize: typeof resBody === "string" ? Buffer.byteLength(resBody) : resBody.length,
      duration: endTime - startTime,
      host: parsed.host,
      path: parsed.path,
      contentType: resHeaders["content-type"] ?? "",
      encrypted,
    };

    this.sessions.push(session);
    if (this.sessions.length > MAX_SESSIONS) this.sessions.shift();
    return session;
  }

  /** 获取会话列表 */
  list(filter?: string, limit = 20): CapturedSession[] {
    let result = [...this.sessions].reverse();
    if (filter) {
      const f = filter.toLowerCase();
      result = result.filter(s =>
        s.url.toLowerCase().includes(f) ||
        s.host.toLowerCase().includes(f) ||
        s.method.toLowerCase().includes(f)
      );
    }
    return result.slice(0, limit);
  }

  /** 获取指定会话 */
  get(id: string): CapturedSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  /** 获取会话总数 */
  get count(): number { return this.sessions.length; }

  /** 清空 */
  clear(): void { this.sessions = []; this.seq = 0; }

  /** 导出为标准 HAR 格式 */
  toHar(): object {
    const entries = this.sessions.map(s => ({
      startedDateTime: s.time,
      time: s.duration,
      request: {
        method: s.method,
        url: s.url,
        httpVersion: "HTTP/1.1",
        headers: Object.entries(s.reqHeaders).map(([name, value]) => ({ name, value })),
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: s.reqSize,
        postData: s.reqBody ? { mimeType: s.reqHeaders["content-type"] ?? "text/plain", text: s.reqBody } : undefined,
      },
      response: {
        status: s.status,
        statusText: "",
        httpVersion: "HTTP/1.1",
        headers: Object.entries(s.resHeaders).map(([name, value]) => ({ name, value })),
        cookies: [],
        content: {
          size: s.resSize,
          mimeType: s.contentType || "text/plain",
          text: s.resBody,
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: s.resSize,
      },
      cache: {},
      timings: { send: 0, wait: s.duration, receive: 0 },
      _host: s.host,
      _encrypted: s.encrypted,
    }));

    return {
      log: {
        version: "1.2",
        creator: { name: "DeepAgent MITM", version: "1.0" },
        entries,
      },
    };
  }

  private parseUrl(url: string): { host: string; path: string } {
    try {
      if (url.startsWith("http")) {
        const u = new URL(url);
        return { host: u.host, path: u.pathname + u.search };
      }
      // CONNECT 代理模式，url 是 host:port
      return { host: url, path: "/" };
    } catch {
      return { host: url, path: "/" };
    }
  }
}
