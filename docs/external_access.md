# 外网访问方案（Windows）

本文档面向 `cpdex phone` 项目，目标是让手机在外网访问本机 `codex.exe` 桥接服务，同时保持可控安全边界。

## 1. 两种推荐模式

### 1.1 Cloudflare Tunnel（长期稳定外网域名）

链路：
`Phone -> Cloudflare Edge (TLS) -> cloudflared (Windows) -> 127.0.0.1:8890`

优点：
- 固定域名，适合长期使用。
- 不需要在路由器开入站端口。
- 可叠加 Cloudflare Access 作为前置身份验证。

缺点：
- 首次配置比 Tailscale 更复杂。
- 依赖 Cloudflare 账号与 DNS 管理。

### 1.2 Tailscale Serve / Funnel（个人与小团队最省心）

链路（私网）：
`Phone(Tailscale) -> Tailnet -> Windows Host -> 127.0.0.1:8890`

链路（公网）：
`Phone(Internet) -> Tailscale Funnel -> Windows Host -> 127.0.0.1:8890`

优点：
- 零信任网络，默认不暴露给公网。
- 部署快，设备间互访体验好。
- 支持 `serve`（仅 tailnet）和 `funnel`（公网）两种模式切换。

缺点：
- 纯 `serve` 模式需要手机安装 Tailscale 并加入 tailnet。
- `funnel` 对外公开时仍需自己做好应用层鉴权。

### 1.3 Cloudflare Quick Tunnel（最快上手，无需安装器）

链路：
`Phone -> trycloudflare.com 临时域名 -> cloudflared -> 127.0.0.1:8890`

优点：
- 不需要 `winget/choco/scoop`。
- 不需要先创建 Cloudflare 账号即可快速测试外网连通。

缺点：
- 域名是临时的，每次启动都会变化。
- 不适合长期稳定生产入口。

## 2. 方案选择建议

- 你要长期固定域名、多人偶尔访问：优先 Cloudflare Tunnel。
- 你主要是自己多设备远程：优先 Tailscale Serve。
- 你偶尔需要临时公网：Tailscale Serve 平时开着，临时启用 Funnel。

## 3. Windows 落地步骤（本项目）

### 3.1 启动本项目后端

1. 打开 PowerShell：

```powershell
cd "D:\CODEX项目\cpdex phone\backend"
npm install
```

2. 配置最小环境变量（当前会话）：

```powershell
$env:CPDEX_HOST="127.0.0.1"
$env:CPDEX_PORT="8890"
$env:CPDEX_BRIDGE_TOKEN="REPLACE_WITH_A_LONG_RANDOM_TOKEN"
$env:CPDEX_CODEX_EXECUTABLE="codex.exe"
# 可选：$env:CPDEX_ASR_COMMAND="python D:\asr\transcribe.py --file {file} --lang {lang}"
```

3. 启动服务：

```powershell
npm run start
```

4. 本机验证：

```powershell
Invoke-RestMethod http://127.0.0.1:8890/api/health
```

### 3.2 Cloudflare Tunnel 步骤

1. 安装 `cloudflared`：

```powershell
winget install Cloudflare.cloudflared
```

2. 登录并授权：

```powershell
cloudflared tunnel login
```

3. 创建隧道（示例名 `cpdex-phone`）：

```powershell
cloudflared tunnel create cpdex-phone
```

4. 创建 DNS 路由（示例域名）：

```powershell
cloudflared tunnel route dns cpdex-phone cpdex-phone.yourdomain.com
```

5. 在 `C:\Users\Administrator\.cloudflared\config.yml` 写入：

```yaml
tunnel: cpdex-phone
credentials-file: C:\Users\Administrator\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: cpdex-phone.yourdomain.com
    service: http://127.0.0.1:8890
  - service: http_status:404
```

6. 运行隧道：

```powershell
cloudflared tunnel run cpdex-phone
```

7. 手机访问：
- 入口：`https://cpdex-phone.yourdomain.com`
- 建议再叠加 Cloudflare Access，仅允许你的身份通过。

### 3.2A Cloudflare Quick Tunnel（本项目一键脚本）

如果你机器没有包管理器，或想先快速验证外网连通，直接运行：

```powershell
cd "D:\CODEX项目\cpdex phone"
powershell -ExecutionPolicy Bypass -File .\scripts\start-external-quicktunnel.ps1
```

脚本会自动：
1. 启动 backend（`127.0.0.1:8890`）
2. 自动下载 `cloudflared.exe` 到 `tools/`
3. 启动 Quick Tunnel 并输出临时公网 URL

使用方式：
- 手机前端里 `Backend Base URL` 填 `https://*.trycloudflare.com`
- `Bearer Token` 填脚本输出值
- 结束时在脚本窗口按 `Ctrl+C`

### 3.3 Tailscale Serve / Funnel 步骤

1. 安装并登录 Tailscale：

```powershell
winget install Tailscale.Tailscale
tailscale up
```

2. 仅 tailnet 访问（推荐默认）：

```powershell
tailscale serve https / http://127.0.0.1:8890
```

3. 如需公网访问，临时启用 Funnel：

```powershell
tailscale funnel 443 on
```

4. 查看访问地址：

```powershell
tailscale status
tailscale funnel status
```

5. 手机访问：
- `serve`：手机需安装 Tailscale 并登录同一 tailnet。
- `funnel`：可直接公网访问分配到的 URL。

## 4. TLS + Token 安全最佳实践

1. 强制 HTTPS：仅通过 Tunnel/Funnel 域名访问，不直连 `http://公网IP:8890`。
2. 高强度 `CPDEX_BRIDGE_TOKEN`：至少 32 字节随机值，禁止弱口令。
3. 最小授权：不要把 token 写进公开脚本或截图，手机端只保存在本地。
4. 上传防护：限制 `CPDEX_MAX_BODY_MB`，并只给可信设备使用。
5. 限流与审计：建议在反向代理侧加速率限制，并保留访问日志。
6. 最小暴露：后端监听 `127.0.0.1`，由隧道转发，不直接开公网入站端口。

## 5. 运维检查清单

每天/每次发布后检查：

1. `GET /api/health` 正常返回。
2. 未授权请求返回 `401`。
3. 外网入口证书有效（浏览器无 TLS 警告）。
4. 上传大小限制和语音转写策略仍生效。
5. `backend/data/state.json` 已纳入备份策略。
6. 隧道进程在运行（`cloudflared` 或 `tailscaled`）。

## 6. 常见故障排查

### 6.1 手机外网打不开

- 检查后端是否在 `127.0.0.1:8890` 正常监听。
- 检查隧道状态：`cloudflared tunnel info <name>` 或 `tailscale funnel status`。
- 检查域名 DNS 是否已生效。

### 6.2 返回 401 Unauthorized

- 未附带 `Authorization: Bearer <token>`。
- `CPDEX_BRIDGE_TOKEN` 与服务端配置不一致。

### 6.3 上传失败（413）

- 文件超过 `CPDEX_MAX_BODY_MB`。

### 6.4 语音转写无结果

- 检查 `CPDEX_ASR_COMMAND` 是否可执行。
- 先在本机单独运行转写命令验证，再接入接口。

### 6.5 codex 调用失败

- 检查 `CPDEX_CODEX_EXECUTABLE` 是否在 PATH，或设置绝对路径。
- 在 PowerShell 先执行 `codex.exe --version` 验证可用性。
