import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

function nowIso() {
  return new Date().toISOString();
}

function makeTask(definition, now) {
  return {
    id: definition.id,
    name: definition.name,
    workdir: definition.workdir,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
}

function normalizeTaskDefinitions(defaultTask, configuredTasks) {
  const map = new Map();
  map.set(defaultTask.id, {
    id: defaultTask.id,
    name: defaultTask.name,
    workdir: defaultTask.workdir,
  });

  for (const item of configuredTasks) {
    if (!item || !item.id || !item.workdir) {
      continue;
    }
    map.set(item.id, {
      id: item.id,
      name: item.name || item.id,
      workdir: item.workdir,
    });
  }

  return [...map.values()];
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeIso(value, fallback) {
  const text = normalizeString(value, "");
  if (!text) {
    return fallback;
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return new Date(parsed).toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function refreshDerivedState(state) {
  state.tasks = ensureArray(state.tasks);
  state.sessions = ensureArray(state.sessions);
  state.messages = ensureArray(state.messages);

  const sessionCountByTask = new Map();
  const messageCountBySession = new Map();
  const latestMessageAtBySession = new Map();

  for (const session of state.sessions) {
    const current = sessionCountByTask.get(session.taskId) || 0;
    sessionCountByTask.set(session.taskId, current + 1);
  }

  for (const message of state.messages) {
    const current = messageCountBySession.get(message.sessionId) || 0;
    messageCountBySession.set(message.sessionId, current + 1);

    const latest = latestMessageAtBySession.get(message.sessionId) || "";
    if (message.createdAt > latest) {
      latestMessageAtBySession.set(message.sessionId, message.createdAt);
    }
  }

  for (const session of state.sessions) {
    session.messageCount = messageCountBySession.get(session.id) || 0;
    const latest = latestMessageAtBySession.get(session.id);
    if (latest) {
      session.lastActiveAt = latest;
    }
  }

  for (const task of state.tasks) {
    task.sessionCount = sessionCountByTask.get(task.id) || 0;
  }

  const timestamps = [
    ...state.tasks.map((item) => item.lastActiveAt || item.updatedAt || item.createdAt),
    ...state.sessions.map((item) => item.lastActiveAt || item.updatedAt || item.createdAt),
    ...state.messages.map((item) => item.createdAt),
  ]
    .filter(Boolean)
    .sort();

  state.counts = {
    taskCount: state.tasks.length,
    sessionCount: state.sessions.length,
    messageCount: state.messages.length,
  };

  state.lastActiveAt = timestamps.at(-1) || nowIso();
}

function createEmptyState(taskDefinitions) {
  const now = nowIso();
  const tasks = taskDefinitions.map((definition) => makeTask(definition, now));

  const state = {
    version: 1,
    counts: {
      taskCount: tasks.length,
      sessionCount: 0,
      messageCount: 0,
    },
    lastActiveAt: now,
    tasks,
    sessions: [],
    messages: [],
  };

  refreshDerivedState(state);
  return state;
}

function mergeTaskDefinitions(state, taskDefinitions) {
  const now = nowIso();
  const existingById = new Map(state.tasks.map((item) => [item.id, item]));

  for (const def of taskDefinitions) {
    const existing = existingById.get(def.id);
    if (existing) {
      existing.name = normalizeString(existing.name, def.name);
      existing.workdir = normalizeString(existing.workdir, def.workdir);
      existing.updatedAt = normalizeIso(existing.updatedAt, now);
      existing.createdAt = normalizeIso(existing.createdAt, now);
      existing.lastActiveAt = normalizeIso(existing.lastActiveAt, existing.updatedAt);
      continue;
    }

    state.tasks.push(makeTask(def, now));
  }
}

function normalizeState(input, taskDefinitions) {
  const now = nowIso();
  const fallback = createEmptyState(taskDefinitions);

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const state = {
    version: 1,
    counts: {
      taskCount: 0,
      sessionCount: 0,
      messageCount: 0,
    },
    lastActiveAt: normalizeIso(input.lastActiveAt, now),
    tasks: ensureArray(input.tasks).map((task) => ({
      id: normalizeString(task.id),
      name: normalizeString(task.name, "Unnamed Task"),
      workdir: normalizeString(task.workdir),
      sessionCount: Number.isFinite(task.sessionCount) ? task.sessionCount : 0,
      createdAt: normalizeIso(task.createdAt, now),
      updatedAt: normalizeIso(task.updatedAt, now),
      lastActiveAt: normalizeIso(task.lastActiveAt, now),
    })).filter((task) => task.id && task.workdir),
    sessions: ensureArray(input.sessions).map((session) => ({
      id: normalizeString(session.id),
      taskId: normalizeString(session.taskId),
      name: normalizeString(session.name, "Session"),
      threadId: normalizeString(session.threadId),
      status: normalizeString(session.status, "idle"),
      messageCount: Number.isFinite(session.messageCount) ? session.messageCount : 0,
      createdAt: normalizeIso(session.createdAt, now),
      updatedAt: normalizeIso(session.updatedAt, now),
      lastActiveAt: normalizeIso(session.lastActiveAt, now),
    })).filter((session) => session.id && session.taskId),
    messages: ensureArray(input.messages).map((message) => ({
      id: normalizeString(message.id),
      sessionId: normalizeString(message.sessionId),
      role: normalizeString(message.role, "assistant"),
      text: normalizeString(message.text, normalizeString(message.content)),
      createdAt: normalizeIso(message.createdAt, now),
      metadata: message.metadata && typeof message.metadata === "object" ? message.metadata : {},
    })).filter((message) => message.id && message.sessionId),
  };

  mergeTaskDefinitions(state, taskDefinitions);

  const validTaskIds = new Set(state.tasks.map((task) => task.id));
  state.sessions = state.sessions.filter((session) => validTaskIds.has(session.taskId));

  const validSessionIds = new Set(state.sessions.map((session) => session.id));
  state.messages = state.messages.filter((message) => validSessionIds.has(message.sessionId));

  const messageCountBySession = new Map();
  for (const message of state.messages) {
    const count = messageCountBySession.get(message.sessionId) || 0;
    messageCountBySession.set(message.sessionId, count + 1);
  }

  for (const session of state.sessions) {
    session.messageCount = messageCountBySession.get(session.id) || 0;
  }

  refreshDerivedState(state);
  return state;
}

async function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  const tempPath = path.resolve(
    directory,
    `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );

  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export class StateStore {
  #state = null;

  #queue = Promise.resolve();

  constructor(statePath, taskDefinitions) {
    this.statePath = statePath;
    this.taskDefinitions = taskDefinitions;
  }

  async init() {
    await mkdir(path.dirname(this.statePath), { recursive: true });

    let parsed = null;
    try {
      const raw = await readFile(this.statePath, "utf8");
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    this.#state = normalizeState(parsed, this.taskDefinitions);
    await writeJsonAtomic(this.statePath, this.#state);
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  async update(mutator) {
    this.#queue = this.#queue.then(async () => {
      const result = await mutator(this.#state);
      refreshDerivedState(this.#state);
      await writeJsonAtomic(this.statePath, this.#state);
      return result;
    });

    return this.#queue;
  }
}

export function buildTaskDefinitions(defaultTask, configuredTasks) {
  return normalizeTaskDefinitions(defaultTask, configuredTasks);
}
