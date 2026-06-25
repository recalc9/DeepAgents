/**
 * 网络服务 — DuckDuckGo 搜索后端 + WebFetch
 *
 * 零依赖，零 API Key。
 * webSearch：抓取 DuckDuckGo HTML 结果页，正则解析
 * webFetch：Node 内置 fetch()，HTML→纯文本
 */

/** 搜索结果 */
export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * DuckDuckGo HTML 搜索（免费，无需 Key）
 * 抓取 https://html.duckduckgo.com/html/?q=... 并解析结果
 */
export async function searchDuckDuckGo(
  query: string,
  maxResults = 5
): Promise<WebSearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "DeepAgent/1.0" },
    });
    const html = await resp.text();
    return parseDuckDuckGoResults(html, maxResults);
  } finally {
    clearTimeout(timer);
  }
}

function parseDuckDuckGoResults(html: string, max: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  // DuckDuckGo HTML 结果页结构：
  // <a class="result__a" href="...">标题</a>
  // <a class="result__snippet">摘要</a>
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let m;
  while ((m = linkRe.exec(html)) && links.length < max) {
    links.push({
      url: m[1]!,
      title: stripHtml(m[2]!).trim(),
    });
  }

  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) && snippets.length < max) {
    snippets.push(stripHtml(m[1]!).trim());
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

/** 简单 HTML 标签剥离 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * HTTP GET 一个 URL，返回纯文本。
 * HTML 页面会被去标签。非 HTML（JSON/XML）原样返回。
 */
export async function fetchUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "DeepAgent/1.0" },
      redirect: "follow",
    });

    const MAX_BYTES = 500 * 1024;
    const contentType = resp.headers.get("content-type") ?? "";
    const buf = await resp.arrayBuffer();
    const totalBytes = buf.byteLength;

    let text: string;
    if (totalBytes > MAX_BYTES) {
      text = Buffer.from(buf.slice(0, MAX_BYTES)).toString("utf-8");
      text += `\n\n[TRUNCATED ${totalBytes - MAX_BYTES} bytes]`;
    } else {
      text = Buffer.from(buf).toString("utf-8");
    }

    // HTML → 纯文本
    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      return stripHtml(text).replace(/\n{3,}/g, "\n\n").trim();
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}
