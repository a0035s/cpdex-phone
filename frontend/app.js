const STORAGE_KEYS = {
  baseUrl: "cpdex.baseUrl",
  token: "cpdex.token",
};

const POLL_MS = 4000;

const state = {
  baseUrl: "",
  token: "",
  tasks: [],
  sessions: [],
  messages: [],
  selectedTaskId: "",
  selectedSessionId: "",
  pendingAttachments: [],
  pendingVoice: null,
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
  isRecording: false,
  pollTimer: 0,
  pollBusy: false,
};

const els = {
  baseUrlInput: document.querySelector("#baseUrlInput"),
  tokenInput: document.querySelector("#tokenInput"),
  saveConfigBtn: document.querySelector("#saveConfigBtn"),
  loadTasksBtn: document.querySelector("#loadTasksBtn"),
  taskCount: document.querySelector("#taskCount"),
  taskList: document.querySelector("#taskList"),
  sessionCount: document.querySelector("#sessionCount"),
  sessionList: document.querySelector("#sessionList"),
  newSessionNameInput: document.querySelector("#newSessionNameInput"),
  createSessionBtn: document.querySelector("#createSessionBtn"),
  selectedSessionMeta: document.querySelector("#selectedSessionMeta"),
  messageList: document.querySelector("#messageList"),
  chatForm: document.querySelector("#chatForm"),
  messageInput: document.querySelector("#messageInput"),
  stopBtn: document.querySelector("#stopBtn"),
  fileInput: document.querySelector("#fileInput"),
  uploadBtn: document.querySelector("#uploadBtn"),
  uploadMeta: document.querySelector("#uploadMeta"),
  recordBtn: document.querySelector("#recordBtn"),
  voiceMeta: document.querySelector("#voiceMeta"),
  statusBar: document.querySelector("#statusBar"),
};

function normalizeBaseUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(iso) {
  if (!iso) return "N/A";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function setStatus(message, tone = "info") {
  els.statusBar.textContent = message;
  els.statusBar.className = `status ${tone}`;
}

function loadConfigFromStorage() {
  state.baseUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEYS.baseUrl) || "");
  state.token = (localStorage.getItem(STORAGE_KEYS.token) || "").trim();
  els.baseUrlInput.value = state.baseUrl;
  els.tokenInput.value = state.token;
}

function saveConfigToStorage() {
  state.baseUrl = normalizeBaseUrl(els.baseUrlInput.value);
  state.token = els.tokenInput.value.trim();
  localStorage.setItem(STORAGE_KEYS.baseUrl, state.baseUrl);
  localStorage.setItem(STORAGE_KEYS.token, state.token);
  setStatus("Connection settings saved.", "ok");
}

function requireConfig() {
  if (!state.baseUrl) {
    throw new Error("Please set backend base URL first.");
  }
  if (!state.token) {
    throw new Error("Please set bearer token first.");
  }
}

async function safeJson(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function apiRequest(path, options = {}) {
  requireConfig();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${state.token}`);
  if (typeof options.body !== "undefined") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(new URL(path, `${state.baseUrl}/`), {
    method: options.method || "GET",
    headers,
    body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body),
  });

  const payload = await safeJson(response);
  if (!response.ok || payload.ok === false) {
    const message = payload?.error?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = payload?.error?.code || "REQUEST_FAILED";
    throw error;
  }

  return typeof payload.ok === "boolean" ? payload.data : payload;
}

function getSelectedSession() {
  return state.sessions.find((item) => item.id === state.selectedSessionId) || null;
}

function renderTasks() {
  els.taskCount.textContent = String(state.tasks.length);
  els.taskList.innerHTML = "";

  if (!state.tasks.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No tasks.";
    els.taskList.append(empty);
    return;
  }

  for (const task of state.tasks) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-btn ${task.id === state.selectedTaskId ? "active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(task.name || task.id)}</strong>
      <span>Sessions: ${task.sessionCount || 0}</span>
      <span>Last Active: ${escapeHtml(formatTime(task.lastActiveAt))}</span>
    `;
    button.addEventListener("click", () => {
      selectTask(task.id).catch(handleError);
    });
    item.append(button);
    els.taskList.append(item);
  }
}

function renderSessions() {
  els.sessionCount.textContent = String(state.sessions.length);
  els.sessionList.innerHTML = "";

  if (!state.selectedTaskId) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Select a task first.";
    els.sessionList.append(empty);
    updateSessionMeta();
    return;
  }

  if (!state.sessions.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No sessions.";
    els.sessionList.append(empty);
    updateSessionMeta();
    return;
  }

  for (const session of state.sessions) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-btn ${session.id === state.selectedSessionId ? "active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(session.name || session.id)}</strong>
      <span>Status: ${escapeHtml(session.status || "idle")}</span>
      <span>Last Active: ${escapeHtml(formatTime(session.lastActiveAt))}</span>
    `;
    button.addEventListener("click", () => {
      selectSession(session.id).catch(handleError);
    });
    item.append(button);
    els.sessionList.append(item);
  }

  updateSessionMeta();
}

function renderMessages(forceScroll = false) {
  const list = els.messageList;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;
  list.innerHTML = "";

  if (!state.selectedSessionId) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Select a session to chat.";
    list.append(empty);
    return;
  }

  if (!state.messages.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No messages yet.";
    list.append(empty);
    return;
  }

  for (const msg of state.messages) {
    const wrap = document.createElement("div");
    wrap.className = `message ${msg.role === "user" ? "user" : "assistant"}`;
    wrap.innerHTML = `
      <div class="message-role">${escapeHtml(msg.role || "assistant")}</div>
      <div class="message-content">${escapeHtml(msg.text || msg.content || "")}</div>
      <div class="message-time">${escapeHtml(formatTime(msg.createdAt))}</div>
    `;
    list.append(wrap);
  }

  if (forceScroll || nearBottom) {
    list.scrollTop = list.scrollHeight;
  }
}

function updateSessionMeta() {
  const session = getSelectedSession();
  const fileCount = state.pendingAttachments.length;
  const voiceState = state.pendingVoice ? "voice ready" : "no voice";
  if (!session) {
    els.selectedSessionMeta.textContent = `No session selected | queued files: ${fileCount} | ${voiceState}`;
    return;
  }

  const thread = session.threadId ? `thread: ${session.threadId}` : "thread: (new)";
  els.selectedSessionMeta.textContent = `Session: ${session.name || session.id} | ${thread} | queued files: ${fileCount} | ${voiceState}`;
}

function resetConversationView() {
  state.messages = [];
  renderMessages(true);
  updateSessionMeta();
}

async function loadTasks(options = {}) {
  const data = await apiRequest("/api/tasks");
  state.tasks = Array.isArray(data.items) ? data.items : [];

  if (!state.tasks.some((item) => item.id === state.selectedTaskId)) {
    state.selectedTaskId = state.tasks[0]?.id || "";
  }

  renderTasks();

  if (!state.selectedTaskId) {
    state.sessions = [];
    state.selectedSessionId = "";
    renderSessions();
    resetConversationView();
    return;
  }

  await loadSessions(state.selectedTaskId, options);
}

async function loadSessions(taskId, options = {}) {
  const data = await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/sessions`);
  state.sessions = Array.isArray(data.items) ? data.items : [];

  if (!state.sessions.some((item) => item.id === state.selectedSessionId)) {
    state.selectedSessionId = state.sessions[0]?.id || "";
  }

  renderTasks();
  renderSessions();

  if (!state.selectedSessionId) {
    resetConversationView();
    return;
  }

  await loadMessages(options);
}

async function loadMessages(options = {}) {
  if (!state.selectedSessionId) {
    resetConversationView();
    return;
  }

  const data = await apiRequest(
    `/api/sessions/${encodeURIComponent(state.selectedSessionId)}/messages?limit=300&order=asc`,
  );
  const next = Array.isArray(data.items) ? data.items : [];
  const changed =
    next.length !== state.messages.length ||
    next.at(-1)?.id !== state.messages.at(-1)?.id ||
    next.at(-1)?.text !== state.messages.at(-1)?.text;

  state.messages = next;
  renderMessages(changed);
  updateSessionMeta();

  if (!options.silent) {
    setStatus("Messages synced.", "ok");
  }
}

async function selectTask(taskId) {
  state.selectedTaskId = taskId;
  state.selectedSessionId = "";
  renderTasks();
  await loadSessions(taskId);
  setStatus("Task loaded.", "ok");
}

async function selectSession(sessionId) {
  state.selectedSessionId = sessionId;
  renderSessions();
  await loadMessages();
  setStatus("Session selected.", "ok");
}

async function createSession() {
  if (!state.selectedTaskId) {
    throw new Error("Select a task before creating session.");
  }

  const name = els.newSessionNameInput.value.trim();
  const body = name ? { name } : {};
  const created = await apiRequest(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/sessions`, {
    method: "POST",
    body,
  });

  els.newSessionNameInput.value = "";
  await loadSessions(state.selectedTaskId, { silent: true });
  state.selectedSessionId = created.id || state.selectedSessionId;
  renderSessions();
  await loadMessages({ silent: true });
  setStatus("New session created.", "ok");
}

function fileToBase64(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const commaIndex = raw.indexOf(",");
      resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(fileOrBlob);
  });
}

async function queueAttachment() {
  const file = els.fileInput.files?.[0];
  if (!file) {
    throw new Error("Choose a file first.");
  }

  const base64 = await fileToBase64(file);
  state.pendingAttachments.push({
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    contentBase64: base64,
  });

  els.fileInput.value = "";
  els.uploadMeta.textContent = `${state.pendingAttachments.length} file(s) queued for next send.`;
  updateSessionMeta();
  setStatus("File queued.", "ok");
}

function mediaRecorderSupported() {
  return Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

async function startRecording() {
  if (!mediaRecorderSupported()) {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.audioChunks = [];
  state.mediaRecorder = new MediaRecorder(state.mediaStream);
  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data?.size) {
      state.audioChunks.push(event.data);
    }
  };
  state.mediaRecorder.onstop = () => {
    finalizeRecording().catch(handleError);
  };
  state.mediaRecorder.start();
  state.isRecording = true;
  els.recordBtn.textContent = "Stop Voice";
  els.voiceMeta.textContent = "Recording...";
  setStatus("Voice recording started.", "info");
}

function stopMediaStream() {
  if (!state.mediaStream) return;
  for (const track of state.mediaStream.getTracks()) {
    track.stop();
  }
  state.mediaStream = null;
}

async function finalizeRecording() {
  const blob = new Blob(state.audioChunks, { type: state.mediaRecorder?.mimeType || "audio/webm" });
  state.audioChunks = [];
  state.mediaRecorder = null;
  state.isRecording = false;
  els.recordBtn.textContent = "Start Voice";
  stopMediaStream();

  if (!blob.size) {
    els.voiceMeta.textContent = "Recording was empty.";
    return;
  }

  const filename = `voice_${Date.now()}.webm`;
  const base64 = await fileToBase64(blob);
  state.pendingVoice = {
    filename,
    contentBase64: base64,
  };

  els.voiceMeta.textContent = "Voice queued for next send.";
  updateSessionMeta();
  setStatus("Voice queued.", "ok");
}

async function toggleRecording() {
  if (!mediaRecorderSupported()) {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  if (!state.isRecording) {
    await startRecording();
    return;
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
}

async function sendChat() {
  if (!state.selectedTaskId) {
    throw new Error("Select a task first.");
  }

  const text = els.messageInput.value.trim();
  const hasVoice = Boolean(state.pendingVoice);
  const hasFiles = state.pendingAttachments.length > 0;

  if (!text && !hasVoice && !hasFiles) {
    throw new Error("Message is empty and no queued voice/file.");
  }

  const payload = {
    taskId: state.selectedTaskId,
    sessionId: state.selectedSessionId || "",
    message: text,
    attachments: state.pendingAttachments,
    voiceBase64: state.pendingVoice?.contentBase64 || "",
    voiceFilename: state.pendingVoice?.filename || "",
    voiceLanguage: "zh",
  };

  const result = await apiRequest("/api/chat/send", {
    method: "POST",
    body: payload,
  });

  if (!state.selectedSessionId && result.sessionId) {
    state.selectedSessionId = result.sessionId;
  }

  els.messageInput.value = "";
  state.pendingAttachments = [];
  state.pendingVoice = null;
  els.uploadMeta.textContent = "";
  els.voiceMeta.textContent = "";

  await loadSessions(state.selectedTaskId, { silent: true });
  await loadMessages({ silent: true });
  setStatus("Message sent to Codex.", "ok");
}

async function stopRun() {
  if (!state.selectedSessionId) {
    throw new Error("Select a session first.");
  }

  await apiRequest(`/api/sessions/${encodeURIComponent(state.selectedSessionId)}/stop`, {
    method: "POST",
    body: {},
  });

  await loadSessions(state.selectedTaskId, { silent: true });
  await loadMessages({ silent: true });
  setStatus("Stop signal sent.", "warn");
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(async () => {
    if (!state.selectedTaskId || state.pollBusy) return;
    state.pollBusy = true;
    try {
      await loadSessions(state.selectedTaskId, { silent: true });
    } catch {
      // keep polling quiet
    } finally {
      state.pollBusy = false;
    }
  }, POLL_MS);
}

function stopPolling() {
  if (!state.pollTimer) return;
  window.clearInterval(state.pollTimer);
  state.pollTimer = 0;
}

function handleError(error) {
  const code = error?.code ? ` (${error.code})` : "";
  setStatus(`${error?.message || "Unexpected error"}${code}`, "error");
}

function bindEvents() {
  els.saveConfigBtn.addEventListener("click", () => {
    try {
      saveConfigToStorage();
    } catch (error) {
      handleError(error);
    }
  });

  els.loadTasksBtn.addEventListener("click", () => {
    loadTasks().then(() => setStatus("Tasks loaded.", "ok")).catch(handleError);
  });

  els.createSessionBtn.addEventListener("click", () => {
    createSession().catch(handleError);
  });

  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChat().catch(handleError);
  });

  els.stopBtn.addEventListener("click", () => {
    stopRun().catch(handleError);
  });

  els.uploadBtn.addEventListener("click", () => {
    queueAttachment().catch(handleError);
  });

  els.recordBtn.addEventListener("click", () => {
    toggleRecording().catch(handleError);
  });
}

async function bootstrap() {
  loadConfigFromStorage();
  bindEvents();

  if (!mediaRecorderSupported()) {
    els.recordBtn.disabled = true;
    els.voiceMeta.textContent = "Voice input is not supported in this browser.";
  }

  if (state.baseUrl && state.token) {
    try {
      await loadTasks({ silent: true });
      setStatus("Auto-loaded from saved config.", "ok");
    } catch (error) {
      handleError(error);
    }
  } else {
    setStatus("Set backend URL and token, then load tasks.", "info");
  }

  startPolling();
}

window.addEventListener("beforeunload", () => {
  stopPolling();
  stopMediaStream();
});

bootstrap().catch(handleError);
