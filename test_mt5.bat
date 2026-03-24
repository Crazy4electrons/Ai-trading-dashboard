@echo off
REM Quick test for MetaTrader5 installation in virtual environment

echo Testing MetaTrader5 installation in backend/python/.venv...
echo.

REM Check if venv Python exists
if not exist "backend\python\.venv\Scripts\python.exe" (
    echo ❌ Virtual environment not found at backend\python\.venv
    echo.
    echo Please ensure the .venv folder exists with MetaTrader5 installed.
    echo.
    pause
    exit /b 1
)

REM Test MetaTrader5 import from venv
backend\python\.venv\Scripts\activate
backend\python\.venv\Scripts\python.exe -c "import MetaTrader5; print('✓ MetaTrader5 is installed')" >nul 2>&1

if errorlevel 1 (
    echo ❌ MetaTrader5 NOT installed in .venv
    echo.
    echo Fix this by running:
    echo   cd backend\python
    echo   uv pip install MetaTrader5
    echo or:
    echo   cd backend\python
    echo   .venv\Scripts\pip install MetaTrader5
    echo.
    pause
    exit /b 1
) else (
    echo ✓ MetaTrader5 is installed successfully in .venv
    pause
    exit /b 0
)
