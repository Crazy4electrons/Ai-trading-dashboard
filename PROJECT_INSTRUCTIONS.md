# Project Instructions

## Project Structure
- `backend/`: Node.js server, API routes, services, utils, and logs.
- `frontend/`: Vite + React app (components, hooks, styles).
- `pythonMT5/`: Python MT5 integration and services (src/, tests/).
- `README.md`: concise project overview and quick start.

## Use Intent
This repository provides a trading dashboard with three main parts:
- Frontend UI for traders and visualization.
- Backend API for AI, auth, MT5 and news integrations.
- Python MT5 service for market/tick streaming and trade detection.

Use the repo for local development, testing connectors, and iterating on trading logic.

## Setup & Startup
Backend (Windows):

```powershell
cd backend
npm install
copy env.example .env
npm run dev
```

Frontend (Windows):

```powershell
cd frontend
npm install
npm run dev
```

Python MT5 service (Windows):

```powershell
cd pythonMT5
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python src/main.py
```

Notes:
- Ensure credentials (e.g., MT5) are set securely before running.
- Check the `logs/` folders for service logs.

## Todo
- Add CI (linting, tests).
- Add Dockerfiles and deployment scripts.
- Improve tests for backend ↔ frontend flows.
- Harden credential storage and rotation.
