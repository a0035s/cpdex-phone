import http from "node:http";
import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";

import { loadConfig } from "./config.js";
import { runCodexTurn } from "./codex-runner.js";
import { StateStore, buildTaskDefinitions } from "./state-store.js";
import { transcribeAudio } from "./asr.js";
import { makeId, nowIso, sanitizeFilename } from "./utils.js";
import { TunnelManager } from "./tunnel-manager.js";

const config = await loadConfig();
const taskDefinitions = buildTaskDefinitions(config.defaultTask, config.configuredTasks);
const store = new StateStore(config.statePath, taskDefinitions);
const runningSessions = new Map();
const sessionQueues = new Map();
const tunnelManager = new TunnelManager({
  cloudflaredPath: config.cloudflaredPath,
  targetUrl: `http://127.0.0.1:${config.port}`,
});

await mkdir(config.uploadsRoot, { recursive: true });
await store.init();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.end(`${JSON.stringify(payload)}\n`);
}

function ok(response, requestId, data, statusCode = 200) {
  sendJson(response, statusCode, {
    ok: true,
    requestId,
    data,
  });
}

function fail(response, requestId, statusCode, code, message, details = null) {
  sendJson(response, statusCode, {
    ok: false,
    requestId,
    error: {
      code,
      message,
      details,
    },
  });
}

function sendText(response, statusCode, contentType, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.end(body);
}

function redirect(response, location) {
  response.statusCode = 302;
  response.setHeader("Location", location);
  response.end();
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function isLocalHostHeader(hostHeader) {
  const host = String(hostHeader || "").toLowerCase().split(":")[0];
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}

function isLocalAdminRequest(request) {
  return isLocalHostHeader(request.headers.host)
    && isLoopbackAddress(request.socket.remoteAddress);
}

function resolveStaticFile(rootDir, pathnamePrefix, pathname) {
  let relative = pathname.slice(pathnamePrefix.length);
  if (!relative || relative === "/") {
    relative = "/index.html";
  }

  const normalized = decodeURIComponent(relative).replace(/^\/+/, "");
  const candidate = path.resolve(rootDir, normalized);
  const rootNormalized = path.resolve(rootDir);
  const rootPrefix = rootNormalized.endsWith(path.sep)
    ? rootNormalized
    : `${rootNormalized}${path.sep}`;

  if (candidate !== rootNormalized && !candidate.startsWith(rootPrefix)) {
    return null;
  }

  return candidate;
}

async function serveFile(response, filePath) {
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] ?? "application/octet-stream";
    response.statusCode = 200;
    response.setHeader("Content-Type", type);
    response.setHeader("Cache-Control", "no-store");
    response.end(content);
  } catch {
    sendText(response, 404, "text/plain; charset=utf-8", "Not found");
  }
}

function isAuthorized(request) {
  const authHeader = request.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if ((scheme || "").toLowerCase() !== "bearer") {
    return false;
  }
  return (token || "") === config.bridgeToken;
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > config.maxBodyBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

function withSessionQueue(sessionId, runner) {
  const previous = sessionQueues.get(sessionId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(runner)
    .finally(() => {
      if (sessionQueues.get(sessionId) === next) {
        sessionQueues.delete(sessionId);
      }
    });

  sessionQueues.set(sessionId, next);
  return next;
}

function decodeBase64(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const value = rawValue.trim();
  const commaIndex = value.indexOf(",");
  const picked = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;

  try {
    return Buffer.from(picked, "base64");
  } catch {
    return null;
  }
}

function ensureTask(state, taskId) {
  return state.tasks.find((item) => item.id === taskId) || null;
}

function ensureSession(state, sessionId) {
  return state.sessions.find((item) => item.id === sessionId) || null;
}

function createSession(state, taskId, sessionName = "") {
  const now = nowIso();
  const nextIndex = state.sessions.filter((item) => item.taskId === taskId).length + 1;

  const session = {
    id: makeId("sess"),
    taskId,
    name: sessionName || `Session ${nextIndex}`,
    threadId: "",
    status: "idle",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };

  state.sessions.push(session);

  const task = ensureTask(state, taskId);
  if (task) {
    task.updatedAt = now;
    task.lastActiveAt = now;
  }

  return session;
}

async function saveAttachments(sessionId, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const sessionDir = path.resolve(config.uploadsRoot, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const saved = [];
  for (let index = 0; index < attachments.length; index += 1) {
    const input = attachments[index] || {};
    const payload = input.contentBase64 ?? input.base64 ?? input.data;
    const content = decodeBase64(payload);

    if (!content || content.length === 0) {
      const error = new Error(`Invalid base64 attachment at index ${index}`);
      error.statusCode = 400;
      error.code = "INVALID_ATTACHMENT";
      throw error;
    }

    const safeFilename = sanitizeFilename(input.filename || `attachment_${index + 1}.bin`);
    const filePath = path.resolve(sessionDir, `${Date.now()}_${makeId("file")}_${safeFilename}`);
    await writeFile(filePath, content);

    saved.push({
      filename: safeFilename,
      mimeType: typeof input.mimeType === "string" ? input.mimeType : "application/octet-stream",
      bytes: content.length,
      path: filePath,
    });
  }

  return saved;
}

async function decodeVoiceToFile(sessionId, body) {
  const base64 = body.voiceBase64 ?? body.voice?.contentBase64 ?? "";
  const data = decodeBase64(base64);
  if (!data || data.length === 0) {
    return null;
  }

  const sessionDir = path.resolve(config.uploadsRoot, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const fileName = sanitizeFilename(body.voiceFilename ?? body.voice?.filename ?? "voice_input.wav");
  const tempPath = path.resolve(sessionDir, `${Date.now()}_${makeId("voice")}_${fileName}`);
  await writeFile(tempPath, data);

  return {
    path: tempPath,
    language: body.voiceLanguage ?? body.voice?.language ?? "",
  };
}

function buildPrompt(messageText, attachments, voiceText) {
  const parts = [];

  if (messageText) {
    parts.push(messageText.trim());
  }

  if (voiceText) {
    parts.push(`[Voice Transcript]\n${voiceText}`);
  }

  if (attachments.length > 0) {
    const pathLines = attachments.map((item) => `- ${item.path}`);
    parts.push(`[Attachment Paths]\n${pathLines.join("\n")}`);
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

async function runSessionTurn({ sessionId, taskId, prompt, messageText, attachments, voiceText }) {
  return withSessionQueue(sessionId, async () => {
    const runId = makeId("run");
    const abortController = new AbortController();

    await store.update((state) => {
      const session = ensureSession(state, sessionId);
      const task = ensureTask(state, taskId);
      if (!session || !task) {
        return;
      }

      const now = nowIso();
      session.status = "running";
      session.updatedAt = now;
      session.lastActiveAt = now;

      task.updatedAt = now;
      task.lastActiveAt = now;

      state.messages.push({
        id: makeId("msg"),
        sessionId,
        role: "user",
        text: messageText || "[non-text input]",
        createdAt: now,
        metadata: {
          runId,
          attachmentPaths: attachments.map((item) => item.path),
          voiceText: voiceText || "",
        },
      });
    });

    let killChild = () => undefined;

    runningSessions.set(sessionId, {
      runId,
      startedAt: nowIso(),
      abortController,
      stop: () => {
        abortController.abort();
        killChild();
      },
    });

    const latest = store.snapshot();
    const currentSession = ensureSession(latest, sessionId);
    const currentTask = ensureTask(latest, taskId);

    if (!currentSession || !currentTask) {
      runningSessions.delete(sessionId);
      const error = new Error("Session or task not found before run");
      error.statusCode = 404;
      error.code = "NOT_FOUND";
      throw error;
    }

    const result = await runCodexTurn({
      codexExecutable: config.codexExecutable,
      workdir: currentTask.workdir,
      threadId: currentSession.threadId,
      prompt,
      abortSignal: abortController.signal,
      onSpawn: ({ kill }) => {
        killChild = kill;
      },
    });

    runningSessions.delete(sessionId);

    const now = nowIso();
    const assistantOutput = result.assistantText || "";

    await store.update((state) => {
      const session = ensureSession(state, sessionId);
      const task = ensureTask(state, taskId);
      if (!session || !task) {
        return;
      }

      if (result.threadId) {
        session.threadId = result.threadId;
      }

      session.status = result.interrupted ? "stopped" : result.ok ? "idle" : "failed";
      session.updatedAt = now;
      session.lastActiveAt = now;

      task.updatedAt = now;
      task.lastActiveAt = now;

      const assistantText = result.ok
        ? assistantOutput || "[No assistant text returned]"
        : `[ERROR] ${result.error}`;

      state.messages.push({
        id: makeId("msg"),
        sessionId,
        role: "assistant",
        text: assistantText,
        createdAt: now,
        metadata: {
          runId,
          interrupted: result.interrupted,
          ok: result.ok,
        },
      });
    });

    return {
      runId,
      interrupted: result.interrupted,
      ok: result.ok,
      error: result.error,
      assistantText: assistantOutput,
      threadId: result.threadId,
    };
  });
}

function parseTaskSessionsPath(pathname) {
  const match = pathname.match(/^\/api\/tasks\/([^/]+)\/sessions$/);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function parseSessionStopPath(pathname) {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/stop$/);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function parseSessionMessagesPath(pathname) {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

const server = http.createServer(async (request, response) => {
  const requestId = makeId("req");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (request.method === "GET" && pathname === "/") {
      redirect(response, "/mobile/");
      return;
    }

    if (request.method === "GET" && pathname === "/mobile") {
      redirect(response, "/mobile/");
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/mobile/")) {
      const filePath = resolveStaticFile(config.frontendRoot, "/mobile/", pathname);
      if (!filePath) {
        sendText(response, 400, "text/plain; charset=utf-8", "Invalid path");
        return;
      }
      await serveFile(response, filePath);
      return;
    }

    if (pathname.startsWith("/admin")) {
      if (!isLocalAdminRequest(request)) {
        sendText(response, 403, "text/plain; charset=utf-8", "Admin console is only available on localhost.");
        return;
      }

      if (request.method === "GET" && pathname === "/admin") {
        redirect(response, "/admin/");
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/admin/")) {
        const filePath = resolveStaticFile(config.adminUiRoot, "/admin/", pathname);
        if (!filePath) {
          sendText(response, 400, "text/plain; charset=utf-8", "Invalid path");
          return;
        }
        await serveFile(response, filePath);
        return;
      }
    }

    if (pathname.startsWith("/api/admin/")) {
      if (!isLocalAdminRequest(request)) {
        fail(response, requestId, 403, "FORBIDDEN", "Admin API is only available on localhost");
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/status") {
        const tunnel = tunnelManager.snapshot();
        const localOrigin = `http://127.0.0.1:${config.port}`;
        ok(response, requestId, {
          backend: {
            host: config.host,
            port: config.port,
            origin: localOrigin,
            mobilePath: "/mobile/",
            adminPath: "/admin/",
            bridgeToken: config.bridgeToken,
            cloudflaredPath: config.cloudflaredPath,
          },
          tunnel,
          quickLinks: {
            localMobileUrl: `${localOrigin}/mobile/`,
            localMobileUrlWithToken: `${localOrigin}/mobile/?baseUrl=${encodeURIComponent(localOrigin)}&token=${encodeURIComponent(config.bridgeToken)}`,
            publicMobileUrl: tunnel.publicUrl
              ? `${tunnel.publicUrl}/mobile/?baseUrl=${encodeURIComponent(tunnel.publicUrl)}&token=${encodeURIComponent(config.bridgeToken)}`
              : "",
          },
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/tunnel/start") {
        const tunnel = await tunnelManager.start();
        ok(response, requestId, tunnel);
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/tunnel/stop") {
        const tunnel = tunnelManager.stop();
        ok(response, requestId, tunnel);
        return;
      }
    }

    if (pathname !== "/api/health" && !isAuthorized(request)) {
      fail(response, requestId, 401, "UNAUTHORIZED", "Missing or invalid bearer token");
      return;
    }

    if (request.method === "GET" && pathname === "/api/health") {
      ok(response, requestId, {
        status: "ok",
        service: "cpdex-phone-backend",
        time: nowIso(),
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/tasks") {
      const state = store.snapshot();
      const items = [...state.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      ok(response, requestId, {
        items,
        counts: state.counts,
        lastActiveAt: state.lastActiveAt,
      });
      return;
    }

    const taskIdFromPath = parseTaskSessionsPath(pathname);
    if (request.method === "GET" && taskIdFromPath) {
      const state = store.snapshot();
      const task = ensureTask(state, taskIdFromPath);
      if (!task) {
        fail(response, requestId, 404, "NOT_FOUND", "Task not found");
        return;
      }

      const sessions = state.sessions
        .filter((item) => item.taskId === taskIdFromPath)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      ok(response, requestId, {
        task,
        items: sessions,
      });
      return;
    }

    if (request.method === "POST" && taskIdFromPath) {
      const payload = await readJsonBody(request);
      const desiredName = typeof payload.name === "string" ? payload.name.trim() : "";

      let created = null;
      await store.update((state) => {
        const task = ensureTask(state, taskIdFromPath);
        if (!task) {
          return;
        }

        created = createSession(state, taskIdFromPath, desiredName);
      });

      if (!created) {
        fail(response, requestId, 404, "NOT_FOUND", "Task not found");
        return;
      }

      ok(response, requestId, created, 201);
      return;
    }

    const sessionIdForMessages = parseSessionMessagesPath(pathname);
    if (request.method === "GET" && sessionIdForMessages) {
      const state = store.snapshot();
      const session = ensureSession(state, sessionIdForMessages);
      if (!session) {
        fail(response, requestId, 404, "NOT_FOUND", "Session not found");
        return;
      }

      const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;
      const order = (url.searchParams.get("order") ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";

      const filtered = state.messages.filter((item) => item.sessionId === sessionIdForMessages);
      const sorted = filtered.sort((a, b) =>
        order === "asc" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
      );

      ok(response, requestId, {
        session,
        items: sorted.slice(0, limit).map((item) => ({
          ...item,
          content: item.text,
        })),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/chat/send") {
      const payload = await readJsonBody(request);

      const sessionIdInput = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
      const taskIdInput = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
      const sessionName = typeof payload.sessionName === "string" ? payload.sessionName.trim() : "";

      const messageText = typeof payload.message === "string"
        ? payload.message.trim()
        : typeof payload.content === "string"
          ? payload.content.trim()
          : typeof payload.prompt === "string"
            ? payload.prompt.trim()
            : "";

      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

      let taskId = taskIdInput;
      let sessionId = sessionIdInput;
      let session = null;

      if (sessionId) {
        const snapshot = store.snapshot();
        session = ensureSession(snapshot, sessionId);
        if (!session) {
          fail(response, requestId, 404, "NOT_FOUND", "Session not found");
          return;
        }
        taskId = session.taskId;
      }

      if (!taskId) {
        fail(response, requestId, 400, "INVALID_ARGUMENT", "taskId or sessionId is required");
        return;
      }

      if (!sessionId) {
        await store.update((state) => {
          const task = ensureTask(state, taskId);
          if (!task) {
            return;
          }
          session = createSession(state, taskId, sessionName);
          sessionId = session.id;
        });

        if (!session) {
          fail(response, requestId, 404, "NOT_FOUND", "Task not found");
          return;
        }
      }

      const voiceFile = await decodeVoiceToFile(sessionId, payload);
      let voiceText = "";

      if (voiceFile) {
        try {
          const transcript = await transcribeAudio({
            filePath: voiceFile.path,
            language: voiceFile.language,
            commandTemplate: config.asrCommand,
          });
          voiceText = transcript.text;
        } finally {
          await unlink(voiceFile.path).catch(() => undefined);
        }
      }

      const savedAttachments = await saveAttachments(sessionId, attachments);

      const prompt = buildPrompt(messageText, savedAttachments, voiceText);
      if (!prompt) {
        fail(response, requestId, 400, "INVALID_ARGUMENT", "message, voice, or attachments are required");
        return;
      }

      const result = await runSessionTurn({
        sessionId,
        taskId,
        prompt,
        messageText,
        attachments: savedAttachments,
        voiceText,
      });

      const updatedState = store.snapshot();
      const updatedSession = ensureSession(updatedState, sessionId);

      ok(response, requestId, {
        taskId,
        sessionId,
        runId: result.runId,
        status: updatedSession?.status || "unknown",
        threadId: result.threadId || updatedSession?.threadId || "",
        assistantText: result.assistantText,
        interrupted: result.interrupted,
        error: result.ok ? "" : result.error,
        attachmentPaths: savedAttachments.map((item) => item.path),
        voiceText,
      });
      return;
    }

    const sessionIdForStop = parseSessionStopPath(pathname);
    if (request.method === "POST" && sessionIdForStop) {
      const running = runningSessions.get(sessionIdForStop);
      if (!running) {
        fail(response, requestId, 409, "NOT_RUNNING", "Session is not running");
        return;
      }

      running.stop();

      ok(response, requestId, {
        sessionId: sessionIdForStop,
        stopped: true,
        runId: running.runId,
        at: nowIso(),
      });
      return;
    }

    fail(response, requestId, 404, "NOT_FOUND", "Endpoint not found");
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
    const message = typeof error?.message === "string" ? error.message : "Unexpected error";
    fail(response, requestId, statusCode, code, message);
  }
});

server.listen(config.port, config.host, () => {
  const firstLine = `cpdex backend listening on http://${config.host}:${config.port}`;
  const secondLine = `tasks from ${config.tasksConfigPath}`;
  console.log(firstLine);
  console.log(secondLine);
});

function shutdown() {
  tunnelManager.stop();

  for (const running of runningSessions.values()) {
    running.stop();
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
