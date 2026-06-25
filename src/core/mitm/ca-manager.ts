/**
 * CA 管理器 — 自签名根证书 + 动态签发服务器证书
 *
 * 需要系统已安装 openssl CLI。
 * 首次运行时生成 CA → ~/.deepagent/certs/，
 * 用户将 ca-cert.pem 安装到系统信任库。
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export class CaManager {
  private certDir: string;
  private _caKeyPem: string | null = null;
  private _caCertPem: string | null = null;

  constructor(certDir?: string) {
    this.certDir = certDir ?? path.join(os.homedir(), ".deepagent", "certs");
  }

  get certDirectory() { return this.certDir; }
  get isReady() { return this._caKeyPem !== null && this._caCertPem !== null; }
  get caCertPath() { return path.join(this.certDir, "ca-cert.pem"); }
  get caKeyPem() { return this._caKeyPem!; }
  get caCertPem() { return this._caCertPem!; }

  /** 加载已有证书，不存在则生成自签名 CA */
  async ensure(): Promise<void> {
    const keyPath = path.join(this.certDir, "ca-key.pem");
    const certPath = path.join(this.certDir, "ca-cert.pem");

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      this._caKeyPem = fs.readFileSync(keyPath, "utf-8");
      this._caCertPem = fs.readFileSync(certPath, "utf-8");
      return;
    }

    fs.mkdirSync(this.certDir, { recursive: true });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepagent-ca-"));
    const tmpKey = path.join(tmpDir, "key.pem");
    const tmpCert = path.join(tmpDir, "cert.pem");

    try {
      // 生成 RSA 私钥
      execFileSync("openssl", [
        "genrsa", "-out", tmpKey, "2048"
      ], { stdio: "pipe" });

      // 自签名根证书（CA）
      execFileSync("openssl", [
        "req", "-x509", "-new", "-nodes",
        "-key", tmpKey,
        "-sha256", "-days", "3650",
        "-out", tmpCert,
        "-subj", "/CN=DeepAgent MITM CA/O=DeepAgent",
        "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
      ], { stdio: "pipe" });

      const key = fs.readFileSync(tmpKey, "utf-8");
      const cert = fs.readFileSync(tmpCert, "utf-8");

      fs.writeFileSync(keyPath, key, { mode: 0o600 });
      fs.writeFileSync(certPath, cert);

      this._caKeyPem = key;
      this._caCertPem = cert;

      console.log(`[CaManager] ✓ CA 证书已生成 → ${certPath}`);
      console.log(`[CaManager] ⚠ 请将 ca-cert.pem 安装到系统信任库`);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
    }
  }

  /** 为目标域名动态签发服务器证书（CA 私钥签名） */
  issueServerCert(hostname: string): { key: string; cert: string } {
    if (!this.isReady) throw new Error("CA 未就绪");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepagent-srv-"));
    const caKeyPath = path.join(tmpDir, "ca-key.pem");
    const caCertPath = path.join(tmpDir, "ca-cert.pem");
    const srvKeyPath = path.join(tmpDir, "srv-key.pem");
    const srvCsrPath = path.join(tmpDir, "srv-csr.pem");
    const srvCertPath = path.join(tmpDir, "srv-cert.pem");
    const extPath = path.join(tmpDir, "ext.cnf");

    try {
      fs.writeFileSync(caKeyPath, this._caKeyPem!);
      fs.writeFileSync(caCertPath, this._caCertPem!);

      // 服务器私钥
      execFileSync("openssl", ["genrsa", "-out", srvKeyPath, "2048"], { stdio: "pipe" });

      // CSR
      execFileSync("openssl", [
        "req", "-new", "-key", srvKeyPath,
        "-out", srvCsrPath,
        "-subj", `/CN=${hostname}`,
      ], { stdio: "pipe" });

      // 扩展文件（SAN + 服务器用途）
      fs.writeFileSync(extPath,
        "basicConstraints=CA:FALSE\n" +
        "keyUsage=digitalSignature,keyEncipherment\n" +
        "extendedKeyUsage=serverAuth\n" +
        `subjectAltName=DNS:${hostname}\n`
      );

      // 用 CA 签发
      execFileSync("openssl", [
        "x509", "-req",
        "-in", srvCsrPath,
        "-CA", caCertPath,
        "-CAkey", caKeyPath,
        "-CAcreateserial",
        "-out", srvCertPath,
        "-days", "365",
        "-sha256",
        "-extfile", extPath,
      ], { stdio: "pipe" });

      return {
        key: fs.readFileSync(srvKeyPath, "utf-8"),
        cert: fs.readFileSync(srvCertPath, "utf-8"),
      };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
    }
  }
}
