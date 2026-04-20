# Multi-Agent Template

這是一份可重複使用的多 Agent 協作模板，用來約束角色分工、步驟順序、輸入輸出、回環修正與交付檢查。

## 一、角色模板

你可以沿用預設角色，也可以按專案類型替換。

### `pm`
- 用途：需求整理、任務拆分、定義驗收標準
- 典型輸出：`docs/prd.md`

### `dba`
- 用途：資料模型、資料庫腳本、結構約束
- 典型輸出：`docs/db_design.md`、`sql/init.sql`

### `backend`
- 用途：API、服務邏輯、後端程式碼
- 典型輸出：`backend/`、`docs/api.md`、`docs/service_info.md`

### `frontend`
- 用途：頁面、互動邏輯、前端程式碼
- 典型輸出：`frontend/`

### `reviewer`
- 用途：驗證輸出是否完整、對齊、可交付
- 典型輸出：`docs/review.json`

## 二、通用協作表

| Agent | 可替換成 | 常見輸入 | 常見輸出 |
| --- | --- | --- | --- |
| `pm` | planner, analyst | 原始需求 | `docs/prd.md` |
| `dba` | architect, schema | `docs/prd.md` | `docs/db_design.md`, `sql/init.sql` |
| `backend` | service, api | PRD、DB 設計 | `backend/`, `docs/api.md` |
| `frontend` | ui, client | PRD、API 文檔 | `frontend/` |
| `reviewer` | qa, auditor | 全部交付物 | `docs/review.json` |

## 三、Pipeline 模板

```json
{
  "pipeline": [
    {
      "step": 1,
      "agent": "pm",
      "input": [],
      "output": ["docs/prd.md"]
    },
    {
      "step": 2,
      "agent": "dba",
      "input": ["docs/prd.md"],
      "output": ["docs/db_design.md", "sql/init.sql"]
    },
    {
      "step": 3,
      "agent": "backend",
      "input": ["docs/prd.md", "docs/db_design.md", "sql/init.sql"],
      "loop_input": ["docs/review.json"],
      "output": ["backend/", "docs/api.md", "docs/service_info.md"]
    },
    {
      "step": 4,
      "agent": "frontend",
      "input": ["docs/prd.md", "docs/api.md"],
      "loop_input": ["docs/review.json"],
      "output": ["frontend/"]
    },
    {
      "step": 5,
      "agent": "reviewer",
      "input": ["docs/prd.md", "docs/db_design.md", "docs/api.md", "docs/service_info.md"],
      "output": ["docs/review.json"]
    }
  ]
}
```

## 四、狀態模板

### `pending`
- 尚未開始

### `running`
- 正在執行

### `blocked`
- 缺少必要輸入

### `review_required`
- 等待檢查

### `done`
- 已完成且可交付

## 五、通用規則

### 1. 明確輸入
- 每個 Agent 只依賴已聲明的輸入

### 2. 明確輸出
- 每個 Agent 必須把產出寫到固定位置

### 3. 最小修改範圍
- 盡量只改自己負責的文件與資料夾

### 4. 回環修正
- 若 Reviewer 指出問題，由對應 Agent 根據 `docs/review.json` 回改

### 5. 可替換角色
- 若專案不需要資料庫或前端，可裁掉對應角色與步驟

## 六、目錄模板

- `docs/`：需求、設計、API、review 文檔
- `sql/`：資料庫腳本
- `backend/`：後端程式碼
- `frontend/`：前端程式碼
- `*.toml`：角色定義
- `pipeline.json`：流程定義

## 七、使用方式

1. 複製整個模板目錄
2. 改寫 `docs/prd.md`
3. 視需要保留或刪除某些 Agent
4. 調整 `pipeline.json` 和各個 `*.toml`
5. 開始讓不同 Agent 按順序產出內容
