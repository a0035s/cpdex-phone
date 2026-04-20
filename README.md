# cpdex phone

手机远程对接本机 `codex.exe` 的桥接项目。

当前实现支持：
- 任务列表与会话列表
- 选择会话续聊（基于 `thread_id`）
- 手机端文本、文件、语音输入
- 停止当前会话运行
- 电脑端 Admin 启动台（同端口 Web UI）
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
$env:CPDEX_PORT = "8890"
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
Invoke-RestMethod http://127.0.0.1:8890/api/health
```

或直接用一键脚本（自动生成 token）：

```powershell
cd "D:\CODEX项目\cpdex phone"
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

或双击根目录入口文件：

`start-cpdex.cmd`

它会自动启动后端并打开 `http://127.0.0.1:8890/admin/`。

### 2) 打开 Web UI（同端口）

后端启动后，同一端口直接提供两套页面：

```powershell
start http://127.0.0.1:8890/admin/
```

- 电脑端控制台：`/admin/`
- 手机聊天界面：`/mobile/`

在 `admin` 页面可以直接看到 token、启动/停止 quick tunnel、复制手机端连接地址。

### 3) 外网访问

要实现“不在同一 Wi-Fi 也能用”，请看：

- [外网访问方案（Windows）](D:/CODEX项目/cpdex phone/docs/external_access.md)

建议优先使用 Cloudflare Tunnel 或 Tailscale Funnel，并保留 Bearer Token 鉴权。

如果你当前机器没有 `winget/choco/scoop`，可以直接用 Quick Tunnel 脚本（自动下载 cloudflared）：

```powershell
cd "D:\CODEX项目\cpdex phone"
powershell -ExecutionPolicy Bypass -File .\scripts\start-external-quicktunnel.ps1
```

脚本会输出：
- 本机后端地址（默认 `http://127.0.0.1:8890`）
- Bearer Token
- Cloudflare 临时公网地址（`https://*.trycloudflare.com`）

拿到公网地址后，手机直接打开：

- `https://<你的临时域名>/mobile/`
