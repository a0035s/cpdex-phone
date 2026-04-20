import { spawn } from "node:child_process";

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function buildArgs(threadId) {
  if (threadId) {
    return ["exec", "resume", "--json", "--skip-git-repo-check", threadId, "-"];
  }
  return ["exec", "--json", "--skip-git-repo-check", "-"];
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

function extractThreadId(event, fallback) {
  const candidates = [
    event?.thread_id,
    event?.threadId,
    event?.thread?.id,
    event?.item?.thread_id,
    event?.data?.thread_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function extractAssistantText(event) {
  const outputs = [];

  if (event?.type === "item.completed" && event?.item?.type === "agent_message") {
    if (typeof event.item.text === "string" && event.item.text.trim()) {
      outputs.push(event.item.text.trim());
    }

    if (Array.isArray(event.item.content)) {
      for (const item of event.item.content) {
        if (typeof item?.text === "string" && item.text.trim()) {
          outputs.push(item.text.trim());
        }
      }
    }
  }

  if (typeof event?.output_text === "string" && event.output_text.trim()) {
    outputs.push(event.output_text.trim());
  }

  if (typeof event?.text === "string" && event?.role === "assistant" && event.text.trim()) {
    outputs.push(event.text.trim());
  }

  return outputs;
}

function extractError(event, fallback) {
  if (typeof event?.error === "string" && event.error.trim()) {
    return event.error.trim();
  }

  if (typeof event?.message === "string" && event.type === "error" && event.message.trim()) {
    return event.message.trim();
  }

  if (event?.error && typeof event.error.message === "string" && event.error.message.trim()) {
    return event.error.message.trim();
  }

  return fallback;
}

export async function runCodexTurn({
  codexExecutable,
  workdir,
  threadId,
  prompt,
  abortSignal,
  onSpawn,
}) {
  const child = spawn(codexExecutable, buildArgs(threadId), {
    cwd: workdir,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const kill = () => killProcessTree(child.pid);
  onSpawn?.({ child, kill });

  let interrupted = false;
  let resolvedThreadId = threadId || "";
  let lastError = "";
  let stderrTail = "";
  let stdoutBuffer = "";
  const assistantMessages = [];

  const onAbort = () => {
    interrupted = true;
    kill();
  };

  if (abortSignal) {
    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        continue;
      }

      const event = parseJsonLine(line);
      if (!event || typeof event !== "object") {
        continue;
      }

      resolvedThreadId = extractThreadId(event, resolvedThreadId);
      const textParts = extractAssistantText(event);
      for (const text of textParts) {
        assistantMessages.push(text);
      }

      lastError = extractError(event, lastError);
    }
  });

  child.stderr.on("data", (chunk) => {
    const merged = `${stderrTail}${chunk.toString()}`;
    const maxBytes = 64 * 1024;
    if (Buffer.byteLength(merged, "utf8") <= maxBytes) {
      stderrTail = merged;
      return;
    }

    let start = merged.length - maxBytes;
    while (start < merged.length && Buffer.byteLength(merged.slice(start), "utf8") > maxBytes) {
      start += 1;
    }
    stderrTail = merged.slice(start);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
    child.stdin.end(prompt);
  });

  if (abortSignal) {
    abortSignal.removeEventListener("abort", onAbort);
  }

  if (interrupted || abortSignal?.aborted) {
    return {
      ok: false,
      interrupted: true,
      threadId: resolvedThreadId,
      assistantText: "",
      error: "Run interrupted by user",
    };
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      interrupted: false,
      threadId: resolvedThreadId,
      assistantText: "",
      error: lastError || stderrTail.trim() || `codex exited with code ${exitCode}`,
    };
  }

  const assistantText = assistantMessages.filter(Boolean).join("\n\n").trim();

  return {
    ok: true,
    interrupted: false,
    threadId: resolvedThreadId,
    assistantText,
    error: "",
  };
}
