# cpdex phone

手机远程对接本机 `codex.exe` 的桥接项目。

当前实现支持：
- 任务列表与会话列表
- 选择会话续聊（基于 `thread_id`）
- 手机端文本、文件、语音输入
- 停止当前会话运行
- 外网访问部署（参考文档）

## 目录

- `backend/` Node.js 桥接服务
- `frontend/` 手机网页（静态文件）
- `docs/prd.md` 需求文档
- `docs/api.md` API 文档
- `docs/service_info.md` 服务说明
- `docs/external_access.md` 外网部署与安全说明

## 快速开始

### 1) 启动后端

```powershell
cd "D:\CODEX项目\cpdex phone\backend"
npm install
```

配置环境变量（PowerShell）：

```powershell
$env:CPDEX_BRIDGE_TOKEN = "请替换成强随机token"
$env:CPDEX_HOST = "127.0.0.1"
$env:CPDEX_PORT = "8787"
$env:CPDEX_CODEX_EXECUTABLE = "codex.exe"
# 可选：默认任务目录（不填则用 backend 的上级目录）
# $env:CPDEX_DEFAULT_TASK_WORKDIR = "D:\你的项目目录"
# 可选：语音转写命令模板，支持 {file} {lang}
# $env:CPDEX_ASR_COMMAND = "python D:\asr\transcribe.py --file {file} --lang {lang}"
```

启动服务：

```powershell
npm start
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

### 2) 打开前端

前端是静态页，直接打开即可：

```powershell
start "D:\CODEX项目\cpdex phone\frontend\index.html"
```

进入页面后填写：
- `Backend Base URL`：例如 `http://127.0.0.1:8787`
- `Bearer Token`：即 `CPDEX_BRIDGE_TOKEN`

### 3) 外网访问

要实现“不在同一 Wi-Fi 也能用”，请看：

- [外网访问方案（Windows）](D:/CODEX项目/cpdex phone/docs/external_access.md)

建议优先使用 Cloudflare Tunnel 或 Tailscale Funnel，并保留 Bearer Token 鉴权。
