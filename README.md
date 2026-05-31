# Vocalendar

Vocalendar 是一个语音优先的日历助手。用户可以通过自然语言创建、查看和删除日程，并将日程同步到 Google Calendar。
演示视频链接：https://www.bilibili.com/video/BV1vPVQ6BEY5/?vd_source=7aed16e1eedfa07381030114d86eee9d

项目采用 monorepo 结构：

- `apps/web`：React、TypeScript、Vite、Tailwind CSS 前端。
- `apps/api`：FastAPI、SQLAlchemy、Alembic 后端。
- `render.yaml`：Render 部署配置。
- `docker-compose.yml`：本地 PostgreSQL 开发环境。

## 功能

- GitHub 登录和游客会话。
- 语音识别日程命令。
- 文本命令创建、查看、删除日程。
- Google Calendar 授权同步。
- 今日概览、时间轴抽屉和日程高亮。
- 浏览器通知和提醒音。
- 默认日程结束时间为开始后 1 分钟。
- 默认日历时区为 `Asia/Shanghai`。

## 环境要求

- Node.js 24.x
- Python 3.11
- Docker Desktop，可选，用于本地 PostgreSQL
- Chrome 或 Edge，语音识别依赖浏览器 Web Speech API

## 本地启动

### 1. 安装前端依赖

```powershell
npm --prefix apps/web install
```

### 2. 创建后端虚拟环境

```powershell
python -m venv apps/api/.venv
apps/api/.venv/Scripts/python -m pip install -e "apps/api[dev]"
```

### 3. 配置环境变量

```powershell
Copy-Item .env.example .env
```

默认 `.env.example` 使用 SQLite：

```text
DATABASE_URL=sqlite:///apps/api/local-dev.db
```

如果要使用本地 PostgreSQL，先启动数据库：

```powershell
docker compose up -d postgres
```

然后将 `.env` 中的 `DATABASE_URL` 改为 PostgreSQL 连接串。

### 4. 启动后端

```powershell
apps/api/.venv/Scripts/python -m uvicorn app.main:app --app-dir apps/api --reload --host 127.0.0.1 --port 8000
```

健康检查：

```text
http://127.0.0.1:8000/health
```

### 5. 启动前端

```powershell
npm run dev:web
```

前端地址：

```text
http://127.0.0.1:5175/
```

## 环境变量

### 前端

```text
VITE_API_URL=http://localhost:8000
```

### 后端

```text
API_ENV=local
API_CORS_ORIGINS=http://localhost:5175,http://127.0.0.1:5175
WEB_APP_URL=http://127.0.0.1:5175/
DATABASE_URL=sqlite:///apps/api/local-dev.db
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=http://localhost:8000/auth/github/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/integrations/google/callback
JWT_SECRET=replace-this-in-production
TOKEN_ENCRYPTION_SECRET=replace-this-in-production
CALENDAR_TIME_ZONE=Asia/Shanghai
```

GitHub 登录需要在 GitHub OAuth App 中配置回调：

```text
http://localhost:8000/auth/github/callback
```

Google Calendar 同步需要在 Google Cloud Console 中配置回调：

```text
http://localhost:8000/integrations/google/callback
```

## 常用命令

前端：

```powershell
npm run dev:web
npm run test:web
npm run lint:web
npm run build:web
```

后端：

```powershell
apps/api/.venv/Scripts/python -m pytest apps/api/tests
apps/api/.venv/Scripts/python -m ruff check apps/api
```

或者进入后端目录执行：

```powershell
cd apps/api
.venv/Scripts/python -m pytest
.venv/Scripts/python -m ruff check .
```

## 数据库迁移

项目使用 Alembic 管理数据库结构。

```powershell
cd apps/api
../api/.venv/Scripts/python -m alembic upgrade head
```

如果使用 SQLite 本地开发，首次运行接口前也可以执行迁移，确保表结构完整。


## 语音命令示例

```text
添加提醒 2026-06-01 09:30 产品评审
明天下午3点和张三开会
下周三上午10点产品评审
帮我定一个一分钟之后的闹铃
查看今天提醒
删除提醒 产品评审
把刚刚添加的闹钟删掉
```

## 注意事项

- 语音识别需要 HTTPS 或本地 `localhost/127.0.0.1` 环境。
- 浏览器需要允许麦克风权限。
- 浏览器通知和提醒音需要用户主动授权或点击启用。
- Google Calendar 同步依赖 Google OAuth 授权。
- 本地数据库、日志和运行缓存不应提交到 Git。
