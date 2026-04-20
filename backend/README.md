# cpdex phone backend

Node.js 本地桥接服务，负责把手机请求转发到本机 `codex.exe`。

## 启动

```powershell
cd backend
npm install
$env:CPDEX_BRIDGE_TOKEN="replace_me"
npm start
```

默认地址：`http://127.0.0.1:8890`

## 已实现接口

- `GET /api/health`
- `GET /api/tasks`
- `GET /api/tasks/:taskId/sessions`
- `POST /api/tasks/:taskId/sessions`
- `GET /api/sessions/:sessionId/messages`
- `POST /api/chat/send`
- `POST /api/sessions/:sessionId/stop`

## 关键环境变量

- `CPDEX_BRIDGE_TOKEN` 必填，Bearer 鉴权令牌
- `CPDEX_HOST` 默认 `127.0.0.1`
- `CPDEX_PORT` 默认 `8890`
- `CPDEX_CODEX_EXECUTABLE` 默认 `codex.exe`
- `CPDEX_DEFAULT_TASK_WORKDIR` 默认 backend 上级目录
- `CPDEX_ASR_COMMAND` 可选，语音转写命令模板（支持 `{file}` `{lang}`）

## 说明

- 除 `/api/health` 外都需要 `Authorization: Bearer <token>`。
- 会话执行采用单会话串行队列，避免并发上下文冲突。
- 附件按会话落盘到 `backend/data/uploads/<sessionId>/`。
