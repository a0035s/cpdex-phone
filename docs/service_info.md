# Service Info（Worker 1 Backend）

## 目标

提供一个可运行的 Node.js 本地桥接服务，让手机端通过 HTTP 与本机 `codex.exe` 会话。

## 技术实现

- Runtime: Node.js 20+
- HTTP: Node 原生 `http` 模块
- 进程执行: `child_process.spawn`
- 持久化: `backend/data/state.json`
- 上传存储: `backend/data/uploads/<sessionId>/`
- 鉴权: 静态 Bearer Token（`CPDEX_BRIDGE_TOKEN`）

## 关键能力

1. 任务模型
- 默认任务来自 `CPDEX_DEFAULT_TASK_WORKDIR`（未设置则默认上级目录）。
- 可选任务配置文件：`backend/config/tasks.json`。

2. 会话管理
- 支持任务下创建会话。
- 会话保存 `threadId`，用于 `codex exec resume` 续聊。

3. Codex 调用
- 新会话调用：`codex exec --json --skip-git-repo-check -`
- 续聊调用：`codex exec resume --json --skip-git-repo-check <thread_id> -`
- 解析 stdout JSONL，提取 `thread_id` 与 assistant 文本。

4. 单会话串行锁
- 同一 `sessionId` 使用单飞队列串行执行，避免并发写上下文。

5. 停止运行
- `POST /api/sessions/:sessionId/stop` 会终止该会话当前运行中的 codex 子进程。

6. 附件与语音
- 附件：`/api/chat/send` 接收 base64，落盘后把路径附加到 prompt。
- 语音：`/api/chat/send` 可携带 `voiceBase64`，通过 `CPDEX_ASR_COMMAND` 转写。
- 未配置 ASR 命令时会返回明确错误信息。

## 状态文件结构

`backend/data/state.json` 至少包含：

- `tasks`
- `sessions`
- `counts`
- `lastActiveAt`

同时保存 `messages` 用于追踪会话消息历史。

## 环境变量

- `CPDEX_HOST` 默认 `127.0.0.1`
- `CPDEX_PORT` 默认 `8890`
- `CPDEX_BRIDGE_TOKEN` 必填
- `CPDEX_CODEX_EXECUTABLE` 默认 `codex.exe`
- `CPDEX_DEFAULT_TASK_WORKDIR` 默认 `backend` 上级目录
- `CPDEX_DEFAULT_TASK_NAME` 默认 `Default Task`
- `CPDEX_ASR_COMMAND` 可选，示例：`python transcribe.py --file {file} --lang {lang}`
- `CPDEX_MAX_BODY_MB` 默认 `25`

## 启动方式

在 `backend/` 目录：

```bash
npm start
```

服务监听：`http://<CPDEX_HOST>:<CPDEX_PORT>`

## Worker 1 交付边界

仅涉及：
- `backend/**`
- `docs/api.md`
- `docs/service_info.md`
