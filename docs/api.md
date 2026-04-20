# API 文档（Worker 1 Bridge）

Base URL: `/api`

## Auth

- `GET /api/health` 不需要鉴权。
- `GET /api/admin/*` 与 `POST /api/admin/*` 不走 Bearer，但仅允许本机 `localhost/127.0.0.1` 访问。
- 其他接口都需要 Header:

```http
Authorization: Bearer <CPDEX_BRIDGE_TOKEN>
```

- Token 不匹配返回 `401`。

## 通用响应

成功：

```json
{
  "ok": true,
  "requestId": "req_xxx",
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "requestId": "req_xxx",
  "error": {
    "code": "NOT_FOUND",
    "message": "Task not found",
    "details": null
  }
}
```

## 1) GET /api/health

健康检查。

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "status": "ok",
    "service": "cpdex-phone-backend",
    "time": "2026-04-20T10:00:00.000Z"
  }
}
```

## 1A) GET /api/admin/status

仅本机可访问，返回桌面启动台状态（后端信息、tunnel 状态、快速链接）。

## 1B) POST /api/admin/tunnel/start

仅本机可访问，启动 cloudflared quick tunnel。

## 1C) POST /api/admin/tunnel/stop

仅本机可访问，停止 quick tunnel。

## 2) GET /api/tasks

列出任务。

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "items": [
      {
        "id": "task_default",
        "name": "Default Task",
        "workdir": "D:\\CODEX项目\\cpdex phone",
        "sessionCount": 2,
        "createdAt": "2026-04-20T09:00:00.000Z",
        "updatedAt": "2026-04-20T09:10:00.000Z",
        "lastActiveAt": "2026-04-20T09:10:00.000Z"
      }
    ],
    "counts": {
      "taskCount": 1,
      "sessionCount": 2,
      "messageCount": 6
    },
    "lastActiveAt": "2026-04-20T09:10:00.000Z"
  }
}
```

## 3) GET /api/tasks/:taskId/sessions

列出任务下会话。

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "task": {
      "id": "task_default",
      "name": "Default Task",
      "workdir": "D:\\CODEX项目\\cpdex phone",
      "sessionCount": 2,
      "createdAt": "2026-04-20T09:00:00.000Z",
      "updatedAt": "2026-04-20T09:10:00.000Z",
      "lastActiveAt": "2026-04-20T09:10:00.000Z"
    },
    "items": [
      {
        "id": "sess_123",
        "taskId": "task_default",
        "name": "Session 1",
        "threadId": "thread_abc",
        "status": "idle",
        "messageCount": 4,
        "createdAt": "2026-04-20T09:00:00.000Z",
        "updatedAt": "2026-04-20T09:10:00.000Z",
        "lastActiveAt": "2026-04-20T09:10:00.000Z"
      }
    ]
  }
}
```

## 4) POST /api/tasks/:taskId/sessions

创建会话。

请求体：

```json
{
  "name": "Mobile Debug"
}
```

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "id": "sess_456",
    "taskId": "task_default",
    "name": "Mobile Debug",
    "threadId": "",
    "status": "idle",
    "messageCount": 0,
    "createdAt": "2026-04-20T10:20:00.000Z",
    "updatedAt": "2026-04-20T10:20:00.000Z",
    "lastActiveAt": "2026-04-20T10:20:00.000Z"
  }
}
```

## 5) GET /api/sessions/:sessionId/messages

读取指定会话消息历史。

Query:
- `limit`（可选，默认 200，最大 1000）
- `order`（可选，`asc` 或 `desc`，默认 `asc`）

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "session": {
      "id": "sess_456",
      "taskId": "task_default",
      "name": "Session 1",
      "threadId": "thread_abc",
      "status": "idle",
      "messageCount": 6,
      "createdAt": "2026-04-20T09:00:00.000Z",
      "updatedAt": "2026-04-20T09:10:00.000Z",
      "lastActiveAt": "2026-04-20T09:10:00.000Z"
    },
    "items": [
      {
        "id": "msg_1",
        "sessionId": "sess_456",
        "role": "user",
        "text": "你好",
        "content": "你好",
        "createdAt": "2026-04-20T09:05:00.000Z",
        "metadata": {}
      }
    ]
  }
}
```

## 6) POST /api/chat/send

发送消息到会话并调用本机 `codex.exe`。

### 请求体

```json
{
  "taskId": "task_default",
  "sessionId": "",
  "sessionName": "Mobile Chat",
  "message": "请总结今天进度",
  "attachments": [
    {
      "filename": "note.txt",
      "mimeType": "text/plain",
      "contentBase64": "SGVsbG8="
    }
  ],
  "voiceBase64": "",
  "voiceFilename": "voice.wav",
  "voiceLanguage": "zh"
}
```

说明：
- `sessionId` 为空时会自动在 `taskId` 下创建新会话。
- `attachments` 会保存到 `backend/data/uploads/<sessionId>/`。
- 发送给 codex 的 prompt 自动追加附件路径。
- 若传入 `voiceBase64`，后端会调用 `CPDEX_ASR_COMMAND` 转写文本并追加到 prompt。
- 若未设置 `CPDEX_ASR_COMMAND` 且传了语音，将返回明确错误。

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "taskId": "task_default",
    "sessionId": "sess_456",
    "runId": "run_123",
    "status": "idle",
    "threadId": "thread_abc",
    "assistantText": "这是 Codex 回复",
    "interrupted": false,
    "error": "",
    "attachmentPaths": [
      "D:\\CODEX项目\\cpdex phone\\backend\\data\\uploads\\sess_456\\..._note.txt"
    ],
    "voiceText": ""
  }
}
```

## 7) POST /api/sessions/:sessionId/stop

停止某个会话当前正在运行的 `codex` 子进程。

响应示例：

```json
{
  "ok": true,
  "requestId": "req_abc",
  "data": {
    "sessionId": "sess_456",
    "stopped": true,
    "runId": "run_123",
    "at": "2026-04-20T10:30:00.000Z"
  }
}
```

如果该会话当前没有运行中的进程，返回 `409 NOT_RUNNING`。

## 状态码

- `200` 读取成功/发送成功/停止成功
- `201` 会话创建成功
- `400` 参数错误
- `401` 鉴权失败
- `404` 任务或会话不存在
- `409` 会话未运行或冲突
- `413` 请求体过大
- `500` 服务器错误
