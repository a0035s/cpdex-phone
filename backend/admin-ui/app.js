const STORAGE_KEY_LANG = "cpdex.admin.lang";
const LANG_AUTO = "auto";
const SUPPORTED_LANGS = ["en", "zh-CN", "zh-TW"];

const I18N = {
  en: {
    titleMain: "cpdex Admin Console",
    titleSub: "Desktop startup panel for mobile connection and tunnel control",
    langLabel: "Language",
    backendTitle: "Backend",
    tokenTitle: "Access Token",
    tokenLabel: "Bearer Token",
    tunnelTitle: "Quick Tunnel",
    publicUrlLabel: "Public URL",
    mobileUrlLabel: "Mobile URL (Auto Token)",
    logsTitle: "Tunnel Logs",
    refreshBtn: "Refresh",
    openMobileLocal: "Open Mobile UI (Local)",
    copyTokenBtn: "Copy Token",
    startTunnelBtn: "Start Tunnel",
    stopTunnelBtn: "Stop Tunnel",
    copyPublicBtn: "Copy Public URL",
    copyMobileBtn: "Copy Mobile URL",
    openMobilePublic: "Open Public Mobile UI",
    loading: "Loading...",
    backendMeta: "Backend: {origin} | cloudflared: {path}",
    tunnelRunning: "Tunnel running (pid={pid})",
    tunnelStopped: "Tunnel stopped",
    tunnelStoppedWithError: "Tunnel stopped | last error: {error}",
    logsEmpty: "No tunnel logs yet.",
    statusIdle: "Idle",
    statusRefreshed: "Status refreshed.",
    statusReady: "Admin console ready.",
    statusStartingTunnel: "Starting tunnel...",
    statusStartRequested: "Tunnel start requested.",
    statusStoppingTunnel: "Stopping tunnel...",
    statusStopRequested: "Tunnel stop requested.",
    statusNoToCopy: "No {label} to copy.",
    statusCopied: "{label} copied.",
    statusLanguageUpdated: "Language updated.",
    statusBootstrapFailed: "Failed to bootstrap admin console.",
    labelToken: "Token",
    labelPublicUrl: "Public URL",
    labelMobileUrl: "Mobile URL",
  },
  "zh-CN": {
    titleMain: "cpdex 管理控制台",
    titleSub: "电脑端启动面板（用于手机连接与隧道控制）",
    langLabel: "语言",
    backendTitle: "后端服务",
    tokenTitle: "访问令牌",
    tokenLabel: "Bearer 令牌",
    tunnelTitle: "快速隧道",
    publicUrlLabel: "公网 URL",
    mobileUrlLabel: "手机 URL（自动带 Token）",
    logsTitle: "隧道日志",
    refreshBtn: "刷新",
    openMobileLocal: "打开本地手机界面",
    copyTokenBtn: "复制 Token",
    startTunnelBtn: "启动隧道",
    stopTunnelBtn: "停止隧道",
    copyPublicBtn: "复制公网 URL",
    copyMobileBtn: "复制手机 URL",
    openMobilePublic: "打开公网手机界面",
    loading: "加载中...",
    backendMeta: "后端：{origin} | cloudflared：{path}",
    tunnelRunning: "隧道运行中（pid={pid}）",
    tunnelStopped: "隧道已停止",
    tunnelStoppedWithError: "隧道已停止 | 最近错误：{error}",
    logsEmpty: "暂无隧道日志。",
    statusIdle: "空闲",
    statusRefreshed: "状态已刷新。",
    statusReady: "管理台已就绪。",
    statusStartingTunnel: "正在启动隧道...",
    statusStartRequested: "已发送启动请求。",
    statusStoppingTunnel: "正在停止隧道...",
    statusStopRequested: "已发送停止请求。",
    statusNoToCopy: "没有可复制的{label}。",
    statusCopied: "{label}已复制。",
    statusLanguageUpdated: "语言已更新。",
    statusBootstrapFailed: "管理台初始化失败。",
    labelToken: "Token",
    labelPublicUrl: "公网 URL",
    labelMobileUrl: "手机 URL",
  },
  "zh-TW": {
    titleMain: "cpdex 管理控制台",
    titleSub: "電腦端啟動面板（用於手機連線與隧道控制）",
    langLabel: "語言",
    backendTitle: "後端服務",
    tokenTitle: "存取權杖",
    tokenLabel: "Bearer 權杖",
    tunnelTitle: "快速隧道",
    publicUrlLabel: "公網 URL",
    mobileUrlLabel: "手機 URL（自動帶 Token）",
    logsTitle: "隧道日誌",
    refreshBtn: "重新整理",
    openMobileLocal: "開啟本機手機介面",
    copyTokenBtn: "複製 Token",
    startTunnelBtn: "啟動隧道",
    stopTunnelBtn: "停止隧道",
    copyPublicBtn: "複製公網 URL",
    copyMobileBtn: "複製手機 URL",
    openMobilePublic: "開啟公網手機介面",
    loading: "載入中...",
    backendMeta: "後端：{origin} | cloudflared：{path}",
    tunnelRunning: "隧道執行中（pid={pid}）",
    tunnelStopped: "隧道已停止",
    tunnelStoppedWithError: "隧道已停止 | 最近錯誤：{error}",
    logsEmpty: "尚無隧道日誌。",
    statusIdle: "閒置",
    statusRefreshed: "狀態已更新。",
    statusReady: "管理台已就緒。",
    statusStartingTunnel: "正在啟動隧道...",
    statusStartRequested: "已送出啟動請求。",
    statusStoppingTunnel: "正在停止隧道...",
    statusStopRequested: "已送出停止請求。",
    statusNoToCopy: "沒有可複製的{label}。",
    statusCopied: "{label}已複製。",
    statusLanguageUpdated: "語言已更新。",
    statusBootstrapFailed: "管理台初始化失敗。",
    labelToken: "Token",
    labelPublicUrl: "公網 URL",
    labelMobileUrl: "手機 URL",
  },
};

const state = {
  status: null,
  pollTimer: 0,
  languageSelection: LANG_AUTO,
  activeLanguage: "en",
};

const els = {
  titleMain: document.querySelector("#titleMain"),
  titleSub: document.querySelector("#titleSub"),
  langLabel: document.querySelector("#langLabel"),
  languageSelect: document.querySelector("#languageSelect"),
  backendTitle: document.querySelector("#backendTitle"),
  tokenTitle: document.querySelector("#tokenTitle"),
  tokenLabel: document.querySelector("#tokenLabel"),
  tunnelTitle: document.querySelector("#tunnelTitle"),
  publicUrlLabel: document.querySelector("#publicUrlLabel"),
  mobileUrlLabel: document.querySelector("#mobileUrlLabel"),
  logsTitle: document.querySelector("#logsTitle"),
  backendMeta: document.querySelector("#backendMeta"),
  tokenBox: document.querySelector("#tokenBox"),
  tunnelMeta: document.querySelector("#tunnelMeta"),
  publicUrlBox: document.querySelector("#publicUrlBox"),
  publicMobileBox: document.querySelector("#publicMobileBox"),
  logBox: document.querySelector("#logBox"),
  statusBar: document.querySelector("#statusBar"),
  refreshBtn: document.querySelector("#refreshBtn"),
  copyTokenBtn: document.querySelector("#copyTokenBtn"),
  startTunnelBtn: document.querySelector("#startTunnelBtn"),
  stopTunnelBtn: document.querySelector("#stopTunnelBtn"),
  copyPublicBtn: document.querySelector("#copyPublicBtn"),
  copyMobileBtn: document.querySelector("#copyMobileBtn"),
  openMobileLocal: document.querySelector("#openMobileLocal"),
  openMobilePublic: document.querySelector("#openMobilePublic"),
};

function detectSystemLanguage() {
  const preferred = navigator.languages?.[0] || navigator.language || "en";
  const lower = String(preferred).toLowerCase();
  if (!lower.startsWith("zh")) {
    return "en";
  }
  if (lower.includes("tw") || lower.includes("hk") || lower.includes("mo") || lower.includes("hant")) {
    return "zh-TW";
  }
  return "zh-CN";
}

function normalizeLanguageSelection(selection) {
  if (selection === LANG_AUTO) {
    return LANG_AUTO;
  }
  return SUPPORTED_LANGS.includes(selection) ? selection : LANG_AUTO;
}

function resolveActiveLanguage(selection) {
  if (selection === LANG_AUTO) {
    return detectSystemLanguage();
  }
  return SUPPORTED_LANGS.includes(selection) ? selection : "en";
}

function tr(key, vars = {}) {
  const dict = I18N[state.activeLanguage] ?? I18N.en;
  const fallback = I18N.en[key] ?? key;
  const template = dict[key] ?? fallback;

  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

function setStatus(message) {
  els.statusBar.textContent = message;
}

function setStatusByKey(key, vars) {
  setStatus(tr(key, vars));
}

function loadLanguagePreference() {
  const saved = localStorage.getItem(STORAGE_KEY_LANG) || LANG_AUTO;
  state.languageSelection = normalizeLanguageSelection(saved);
  state.activeLanguage = resolveActiveLanguage(state.languageSelection);
}

function saveLanguagePreference(value) {
  const normalized = normalizeLanguageSelection(value);
  state.languageSelection = normalized;
  state.activeLanguage = resolveActiveLanguage(normalized);
  localStorage.setItem(STORAGE_KEY_LANG, normalized);
}

function applyStaticTranslations() {
  document.documentElement.lang = state.activeLanguage;
  els.languageSelect.value = state.languageSelection;

  els.titleMain.textContent = tr("titleMain");
  els.titleSub.textContent = tr("titleSub");
  els.langLabel.textContent = tr("langLabel");
  els.backendTitle.textContent = tr("backendTitle");
  els.tokenTitle.textContent = tr("tokenTitle");
  els.tokenLabel.textContent = tr("tokenLabel");
  els.tunnelTitle.textContent = tr("tunnelTitle");
  els.publicUrlLabel.textContent = tr("publicUrlLabel");
  els.mobileUrlLabel.textContent = tr("mobileUrlLabel");
  els.logsTitle.textContent = tr("logsTitle");

  els.refreshBtn.textContent = tr("refreshBtn");
  els.openMobileLocal.textContent = tr("openMobileLocal");
  els.copyTokenBtn.textContent = tr("copyTokenBtn");
  els.startTunnelBtn.textContent = tr("startTunnelBtn");
  els.stopTunnelBtn.textContent = tr("stopTunnelBtn");
  els.copyPublicBtn.textContent = tr("copyPublicBtn");
  els.copyMobileBtn.textContent = tr("copyMobileBtn");
  els.openMobilePublic.textContent = tr("openMobilePublic");
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

async function api(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
  });

  const payload = await safeJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload?.error?.message || `Request failed (${response.status})`);
  }
  return payload.data ?? payload;
}

function formatLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return tr("logsEmpty");
  }
  return logs.map((item) => `[${item.at}] (${item.stream}) ${item.text}`).join("\n");
}

function render() {
  if (!state.status) {
    els.backendMeta.textContent = tr("loading");
    els.tunnelMeta.textContent = tr("tunnelStopped");
    els.logBox.textContent = tr("logsEmpty");
    return;
  }

  const { backend, tunnel, quickLinks } = state.status;
  els.backendMeta.textContent = tr("backendMeta", {
    origin: backend.origin,
    path: backend.cloudflaredPath,
  });
  els.tokenBox.value = backend.bridgeToken || "";

  if (tunnel.running) {
    els.tunnelMeta.textContent = tr("tunnelRunning", { pid: tunnel.pid || "n/a" });
  } else if (tunnel.lastError) {
    els.tunnelMeta.textContent = tr("tunnelStoppedWithError", { error: tunnel.lastError });
  } else {
    els.tunnelMeta.textContent = tr("tunnelStopped");
  }

  els.publicUrlBox.value = tunnel.publicUrl || "";
  els.publicMobileBox.value = quickLinks.publicMobileUrl || "";
  els.logBox.textContent = formatLogs(tunnel.logs);

  els.openMobileLocal.href = quickLinks.localMobileUrlWithToken || "/mobile/";
  els.openMobilePublic.href = quickLinks.publicMobileUrl || "#";
}

async function refreshStatus() {
  const data = await api("/api/admin/status");
  state.status = data;
  render();
}

async function copyText(value, label) {
  if (!value) {
    setStatusByKey("statusNoToCopy", { label });
    return;
  }

  await navigator.clipboard.writeText(value);
  setStatusByKey("statusCopied", { label });
}

async function startTunnel() {
  setStatusByKey("statusStartingTunnel");
  await api("/api/admin/tunnel/start", "POST", {});
  await refreshStatus();
  setStatusByKey("statusStartRequested");
}

async function stopTunnel() {
  setStatusByKey("statusStoppingTunnel");
  await api("/api/admin/tunnel/stop", "POST", {});
  await refreshStatus();
  setStatusByKey("statusStopRequested");
}

function handleLanguageChange(value) {
  saveLanguagePreference(value);
  applyStaticTranslations();
  render();
  setStatusByKey("statusLanguageUpdated");
}

function bindEvents() {
  els.languageSelect.addEventListener("change", (event) => {
    handleLanguageChange(event.target.value);
  });

  els.refreshBtn.addEventListener("click", () => {
    refreshStatus()
      .then(() => setStatusByKey("statusRefreshed"))
      .catch((error) => setStatus(error.message));
  });

  els.copyTokenBtn.addEventListener("click", () => {
    copyText(els.tokenBox.value.trim(), tr("labelToken")).catch((error) => setStatus(error.message));
  });

  els.startTunnelBtn.addEventListener("click", () => {
    startTunnel().catch((error) => setStatus(error.message));
  });

  els.stopTunnelBtn.addEventListener("click", () => {
    stopTunnel().catch((error) => setStatus(error.message));
  });

  els.copyPublicBtn.addEventListener("click", () => {
    copyText(els.publicUrlBox.value.trim(), tr("labelPublicUrl")).catch((error) => setStatus(error.message));
  });

  els.copyMobileBtn.addEventListener("click", () => {
    copyText(els.publicMobileBox.value.trim(), tr("labelMobileUrl")).catch((error) => setStatus(error.message));
  });
}

async function bootstrap() {
  loadLanguagePreference();
  applyStaticTranslations();
  bindEvents();
  await refreshStatus();
  setStatusByKey("statusReady");

  state.pollTimer = window.setInterval(() => {
    refreshStatus().catch(() => undefined);
  }, 3000);
}

window.addEventListener("beforeunload", () => {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
  }
});

bootstrap().catch((error) => {
  setStatus(error.message || tr("statusBootstrapFailed"));
});
