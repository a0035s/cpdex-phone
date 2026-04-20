import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

function nowIso() {
  return new Date().toISOString();
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractTryCloudflareUrl(line) {
  const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
  return match?.[0] ?? "";
}

function trimLogs(items, maxItems = 200) {
  if (items.length <= maxItems) {
    return items;
  }
  return items.slice(items.length - maxItems);
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already exited
  }
}

export class TunnelManager {
  constructor({ cloudflaredPath, targetUrl }) {
    this.cloudflaredPath = cloudflaredPath;
    this.targetUrl = targetUrl;
    this.child = null;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.state = {
      running: false,
      pid: 0,
      publicUrl: "",
      lastError: "",
      lastEventAt: "",
      logs: [],
    };
  }

  pushLog(stream, line) {
    const text = String(line || "").trim();
    if (!text) {
      return;
    }

    const at = nowIso();
    this.state.logs.push({ at, stream, text });
    this.state.logs = trimLogs(this.state.logs);
    this.state.lastEventAt = at;

    const url = extractTryCloudflareUrl(text);
    if (url) {
      this.state.publicUrl = url;
    }
  }

  consumeChunk(stream, chunk) {
    const key = stream === "stderr" ? "stderrBuffer" : "stdoutBuffer";
    this[key] += chunk.toString();

    const lines = this[key].split(/\r?\n/);
    this[key] = lines.pop() ?? "";

    for (const line of lines) {
      this.pushLog(stream, line);
    }
  }

  snapshot() {
    return {
      running: this.state.running,
      pid: this.state.pid,
      publicUrl: this.state.publicUrl,
      lastError: this.state.lastError,
      lastEventAt: this.state.lastEventAt,
      logs: [...this.state.logs],
      cloudflaredPath: this.cloudflaredPath,
      targetUrl: this.targetUrl,
    };
  }

  async start() {
    if (this.state.running) {
      return this.snapshot();
    }

    const exists = await fileExists(this.cloudflaredPath);
    if (!exists) {
      const error = new Error(`cloudflared not found at: ${this.cloudflaredPath}`);
      error.code = "CLOUDFLARED_NOT_FOUND";
      throw error;
    }

    this.state.lastError = "";
    this.state.publicUrl = "";
    this.state.logs = [];
    this.state.lastEventAt = nowIso();

    try {
      this.child = spawn(
        this.cloudflaredPath,
        ["tunnel", "--url", this.targetUrl, "--protocol", "http2"],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      const startError = new Error(
        `Failed to launch cloudflared. The executable may be invalid. Path: ${this.cloudflaredPath}`,
      );
      startError.code = "CLOUDFLARED_LAUNCH_FAILED";
      startError.cause = error;
      throw startError;
    }

    this.state.running = true;
    this.state.pid = this.child.pid ?? 0;
    this.state.lastEventAt = nowIso();
    this.pushLog("system", `Starting quick tunnel for ${this.targetUrl}`);

    this.child.stdout.on("data", (chunk) => {
      this.consumeChunk("stdout", chunk);
    });
    this.child.stderr.on("data", (chunk) => {
      this.consumeChunk("stderr", chunk);
    });

    this.child.once("error", (error) => {
      this.state.lastError = error.message || "Failed to start cloudflared";
      this.pushLog("system", `ERROR: ${this.state.lastError}`);
      this.state.running = false;
      this.state.pid = 0;
      this.child = null;
    });

    this.child.once("close", (code) => {
      const tailStdout = this.stdoutBuffer.trim();
      const tailStderr = this.stderrBuffer.trim();
      if (tailStdout) {
        this.pushLog("stdout", tailStdout);
      }
      if (tailStderr) {
        this.pushLog("stderr", tailStderr);
      }

      if (!this.state.lastError && code !== 0) {
        this.state.lastError = `cloudflared exited with code ${code}`;
      }
      this.pushLog("system", `Tunnel process exited (code: ${code ?? "null"})`);
      this.state.running = false;
      this.state.pid = 0;
      this.state.lastEventAt = nowIso();
      this.child = null;
      this.stdoutBuffer = "";
      this.stderrBuffer = "";
    });

    return this.snapshot();
  }

  stop() {
    if (!this.child || !this.state.running) {
      return this.snapshot();
    }

    killProcessTree(this.child.pid);
    this.pushLog("system", "Stop signal sent to tunnel process");
    this.state.running = false;
    this.state.pid = 0;
    this.state.lastEventAt = nowIso();
    return this.snapshot();
  }
}
