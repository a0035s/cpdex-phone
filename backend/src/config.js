import path from "node:path";
import { access, readFile } from "node:fs/promises";

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toResolvedPath(baseDir, value, fallback) {
  const picked = value ? value.trim() : "";
  if (!picked) {
    return path.resolve(baseDir, fallback);
  }
  return path.resolve(picked);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeTaskItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "";
  const workdir = typeof item.workdir === "string" && item.workdir.trim() ? item.workdir.trim() : "";

  if (!id || !workdir) {
    return null;
  }

  return {
    id,
    name: name || id,
    workdir: path.resolve(workdir),
  };
}

async function loadOptionalTasks(tasksConfigPath) {
  const exists = await fileExists(tasksConfigPath);
  if (!exists) {
    return [];
  }

  const raw = await readFile(tasksConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tasks) ? parsed.tasks : [];

  return list.map(normalizeTaskItem).filter(Boolean);
}

export async function loadConfig() {
  const backendRoot = process.cwd();
  const projectRoot = path.resolve(backendRoot, "..");
  const dataDir = path.resolve(backendRoot, "data");
  const defaultWorkdir = toResolvedPath(
    backendRoot,
    process.env.CPDEX_DEFAULT_TASK_WORKDIR ?? process.env.DEFAULT_WORKSPACE ?? "",
    "..",
  );
  const tasksConfigPath = path.resolve(backendRoot, "config", "tasks.json");
  const maxBodyMb = toInt(process.env.CPDEX_MAX_BODY_MB, 25);

  const bridgeToken = (process.env.CPDEX_BRIDGE_TOKEN ?? "").trim();
  if (!bridgeToken) {
    throw new Error("CPDEX_BRIDGE_TOKEN is required");
  }

  const configuredTasks = await loadOptionalTasks(tasksConfigPath);

  return {
    projectRoot,
    backendRoot,
    frontendRoot: path.resolve(projectRoot, "frontend"),
    adminUiRoot: path.resolve(backendRoot, "admin-ui"),
    host: process.env.CPDEX_HOST ?? process.env.HOST ?? "127.0.0.1",
    port: toInt(process.env.CPDEX_PORT ?? process.env.PORT, 8890),
    bridgeToken,
    codexExecutable: process.env.CPDEX_CODEX_EXECUTABLE ?? process.env.CODEX_EXECUTABLE ?? "codex.exe",
    cloudflaredPath: path.resolve(
      process.env.CPDEX_CLOUDFLARED_PATH ?? path.resolve(projectRoot, "tools", "cloudflared.exe"),
    ),
    asrCommand: (process.env.CPDEX_ASR_COMMAND ?? "").trim(),
    defaultTask: {
      id: "task_default",
      name: process.env.CPDEX_DEFAULT_TASK_NAME ?? "Default Task",
      workdir: defaultWorkdir,
    },
    configuredTasks,
    tasksConfigPath,
    maxBodyBytes: Math.max(1, maxBodyMb) * 1024 * 1024,
    dataDir,
    uploadsRoot: path.resolve(dataDir, "uploads"),
    statePath: path.resolve(dataDir, "state.json"),
  };
}
