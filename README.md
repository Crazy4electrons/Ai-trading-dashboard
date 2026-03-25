# Ai-trading-dashboard

## Project Structure

- README.md
- PROJECT_INSTRUCTIONS.md
- .gitignore
- .hintrc
- backend/
	- package.json
	- package-lock.json
	- server.js
	- env.example
	- logs/
		- debug.log
		- errors.log
		- mt5_service.log
		- websocket.log
	- data/
		- mt5_credentials.json
		- trade_history.db
	- routes/
		- ai.js
		- auth.js
		- mt5.js
	- services/
		- aiService.js
		- mt5Service.js
		- newsService.js
	- utils/
		- authToken.js
		- credentialEncryption.js
		- logger.js
		- tradeHistoryDb.js

- frontend/
	- package.json
	- package-lock.json
	- vite.config.js
	- index.html
	- dist/
		- index.html
		- assets/
			- index-D3SM_0Yn.js
			- index-C91f80Re.css
	- src/
		- main.jsx
		- App.jsx
		- components/
			- AccountPanel.jsx
			- AccountPanel.module.css
			- AIAnalysisTab.jsx
			- AIAnalysisTab.module.css
			- Dashboard.jsx
			- DepthVisualization.jsx
			- Header.jsx
			- Header.module.css
			- IndicatorPills.jsx
			- IndicatorPills.module.css
			- LoginScreen.jsx
			- LoginScreen.module.css
			- NewsTab.jsx
			- NewsTab.module.css
			- OrderModal.jsx
			- OrderModal.module.css
			- SettingsModal.jsx
			- SettingsModal.module.css
			- SignalsTab.jsx
			- SignalsTab.module.css
			- SymbolsList.jsx
			- SymbolsList.module.css
			- TabsSection.jsx
			- TabsSection.module.css
			- TradingChart.jsx
			- TradingChart.module.css
			- Watchlist.jsx
			- Watchlist.module.css
		- context/
			- AppContext.jsx
		- hooks/
			- useMT5.js
			- useNews.js
			- useSymbols.js
			- useWebSocket.js
		- styles/
			- globals.css
		- utils/
			- indicators.js
			- signals.js
			- symbols.js

- pythonMT5/
	- pyproject.toml
	- requirements.txt
	- uv.lock
	- .env.example
	- logs/
		- mt5_server.log
		- errors.log
	- src/
		- main.py
		- auth.py
		- logger.py
		- models.py
		- mt5_handler.py
		- tick_stream.py
		- trade_detector.py
		- websocket_client.py


## Use Intent

This repository provides a local trading dashboard combining a React UI, a Node backend (AI, auth, news, MT5 relay), and a Python MT5 service for market/tick handling. It's intended for development, testing connectors, and iterating trading logic.

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
.venv\\Scripts\\activate
pip install -r requirements.txt
python src/main.py
```

Notes:
- Replace credentials and encrypted keys with secure values before running in production.
- Logs are in the `logs/` folders across services.

## Todo

- Add CI (tests & linting)
- Add Dockerfiles and deployment scripts
- Harden credential storage and rotation
- Add end-to-end tests for backend ↔ frontend

For full operational details see [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md)
