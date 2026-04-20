const state = {
  status: null,
  pollTimer: 0,
};

const els = {
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

function setStatus(message) {
  els.statusBar.textContent = message;
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
      "Accept": "application/json",
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
    return "No tunnel logs yet.";
  }

  return logs.map((item) => `[${item.at}] (${item.stream}) ${item.text}`).join("\n");
}

function render() {
  if (!state.status) {
    return;
  }

  const { backend, tunnel, quickLinks } = state.status;
  els.backendMeta.textContent = `Backend: ${backend.origin} | cloudflared: ${backend.cloudflaredPath}`;
  els.tokenBox.value = backend.bridgeToken || "";

  els.tunnelMeta.textContent = tunnel.running
    ? `Tunnel running (pid=${tunnel.pid || "n/a"})`
    : `Tunnel stopped${tunnel.lastError ? ` | last error: ${tunnel.lastError}` : ""}`;

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
    setStatus(`No ${label} to copy.`);
    return;
  }

  await navigator.clipboard.writeText(value);
  setStatus(`${label} copied.`);
}

async function startTunnel() {
  setStatus("Starting tunnel...");
  await api("/api/admin/tunnel/start", "POST", {});
  await refreshStatus();
  setStatus("Tunnel start requested.");
}

async function stopTunnel() {
  setStatus("Stopping tunnel...");
  await api("/api/admin/tunnel/stop", "POST", {});
  await refreshStatus();
  setStatus("Tunnel stop requested.");
}

function bindEvents() {
  els.refreshBtn.addEventListener("click", () => {
    refreshStatus().then(() => setStatus("Status refreshed.")).catch((error) => setStatus(error.message));
  });

  els.copyTokenBtn.addEventListener("click", () => {
    copyText(els.tokenBox.value.trim(), "Token").catch((error) => setStatus(error.message));
  });

  els.startTunnelBtn.addEventListener("click", () => {
    startTunnel().catch((error) => setStatus(error.message));
  });

  els.stopTunnelBtn.addEventListener("click", () => {
    stopTunnel().catch((error) => setStatus(error.message));
  });

  els.copyPublicBtn.addEventListener("click", () => {
    copyText(els.publicUrlBox.value.trim(), "Public URL").catch((error) => setStatus(error.message));
  });

  els.copyMobileBtn.addEventListener("click", () => {
    copyText(els.publicMobileBox.value.trim(), "Mobile URL").catch((error) => setStatus(error.message));
  });
}

async function bootstrap() {
  bindEvents();
  await refreshStatus();
  setStatus("Admin console ready.");

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
  setStatus(error.message || "Failed to bootstrap admin console.");
});
