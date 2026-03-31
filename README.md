# Claude Code Hub

多租户 Claude Code 服务 —— 一个容器支持多用户隔离使用 Claude Code 功能。

## 功能

- **多用户隔离**: 每个用户独立的工作目录、API Key、模型配置
- **实时流式对话**: WebSocket 实现流式响应，体验接近原生 Claude Code
- **工具系统**: 支持 Bash 执行、文件读写编辑、Glob 搜索、Grep 搜索
- **会话管理**: 创建、重命名、删除对话，完整历史记录
- **设置面板**: 配置 API Key、模型、系统提示词、工作目录
- **Docker Compose**: 一键部署，SQLite 持久化存储

## 快速开始

### Docker Compose 部署

```bash
# 克隆项目
git clone <repo-url>
cd claude-code-hub

# 启动服务
docker compose up -d

# 访问前端: http://localhost:3000
# 后端 API: http://localhost:8000
```

环境变量（可选）：
```bash
# .env 文件
JWT_SECRET=your-secret-key
VITE_API_URL=http://your-backend-url:8000
```

### 本地开发

**Backend:**
```bash
cd claude-code-hub-backend
poetry install
DB_PATH=/data/app.db poetry run fastapi dev app/main.py --port 8000
```

**Frontend:**
```bash
cd claude-code-hub-frontend
npm install
npm run dev
```

## 架构

```
claude-code-hub/
├── claude-code-hub-backend/     # FastAPI 后端
│   ├── app/
│   │   ├── main.py              # 入口 + CORS + 路由注册
│   │   ├── database.py          # SQLite 数据库初始化
│   │   ├── auth.py              # JWT 认证 + bcrypt 密码
│   │   ├── models.py            # Pydantic 数据模型
│   │   ├── routers/
│   │   │   ├── users.py         # 注册/登录/个人信息
│   │   │   ├── sessions.py      # 会话 CRUD
│   │   │   └── chat.py          # WebSocket 流式对话
│   │   ├── services/
│   │   │   └── claude_service.py # Anthropic API 集成
│   │   └── tools/
│   │       ├── base.py          # 工具定义（6个工具）
│   │       └── executor.py      # 沙箱化工具执行
│   ├── Dockerfile
│   └── pyproject.toml
├── claude-code-hub-frontend/    # React 前端
│   ├── src/
│   │   ├── App.tsx              # 主应用 + 路由
│   │   ├── contexts/AuthContext.tsx
│   │   ├── pages/LoginPage.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx      # 会话列表侧边栏
│   │   │   ├── ChatArea.tsx     # 对话区域 + WebSocket
│   │   │   ├── MessageBubble.tsx # 消息渲染 + Markdown
│   │   │   └── SettingsPanel.tsx # 设置面板
│   │   └── lib/api.ts           # API 客户端
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/users/register` | 用户注册 |
| POST | `/api/users/login` | 用户登录 |
| GET | `/api/users/me` | 获取当前用户信息 |
| PATCH | `/api/users/me` | 更新用户设置 |
| GET | `/api/sessions/` | 列出所有会话 |
| POST | `/api/sessions/` | 创建新会话 |
| PATCH | `/api/sessions/{id}` | 更新会话标题 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| GET | `/api/sessions/{id}/messages` | 获取会话消息 |
| WS | `/api/chat/ws/{session_id}` | WebSocket 流式对话 |

## 工具系统

内置 6 个工具，模仿 Claude Code 的核心能力：

| 工具 | 说明 |
|------|------|
| `bash` | 在用户工作目录执行 Shell 命令 |
| `file_read` | 读取文件内容（支持行号范围） |
| `file_write` | 写入文件 |
| `file_edit` | 精确字符串替换编辑 |
| `glob` | 文件名模式匹配搜索 |
| `grep` | 文件内容正则搜索 |

所有工具操作均限制在用户工作目录内，防止跨用户访问。
