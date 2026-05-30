# Vocalendar

Vocalendar is a voice-first calendar assistant. This repository is organized as a
monorepo with a React web app and a FastAPI backend.

## Apps

- `apps/web`: React, TypeScript, Vite, and Tailwind CSS.
- `apps/api`: FastAPI, SQLAlchemy, Alembic, and PostgreSQL.

## Local Development

Prerequisites:

- Node.js 24
- Python 3.11
- Docker

Install frontend dependencies:

```powershell
npm --prefix apps/web install
```

Create the backend virtual environment and install dependencies:

```powershell
python -m venv apps/api/.venv
apps/api/.venv/Scripts/python -m pip install -e "apps/api[dev]"
```

Copy the environment file and start PostgreSQL:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
```

Run the apps:

```powershell
npm run dev:web
apps/api/.venv/Scripts/python -m uvicorn app.main:app --app-dir apps/api --reload
```

The web app runs on `http://127.0.0.1:5175` by default.

## Verification

```powershell
npm run lint:web
npm run test:web
npm run build:web
apps/api/.venv/Scripts/python -m ruff check apps/api
apps/api/.venv/Scripts/python -m pytest apps/api/tests
```

## Render Deployment

- Web: Render Static Site
  - Root directory: `apps/web`
  - Build command: `npm install && npm run build`
  - Publish directory: `dist`
- API: Render Web Service
  - Root directory: `apps/api`
  - Build command: `pip install -e ".[dev]"`
  - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Database: Render Postgres
  - Set `DATABASE_URL` on the API service.

Set `VITE_API_URL` on the web service to the deployed public API URL. Set
`API_CORS_ORIGINS` on the API service to the deployed public web URL.
