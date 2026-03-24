# MT5 Python Bridge

This folder contains the Python bridge that communicates with MetaTrader 5.

## Setup

### 1. Install Python (if not already installed)
Download from https://www.python.org/downloads/

**Important on Windows**: During installation, check the option "Add Python to PATH"

### 2. Install MetaTrader5 Library

#### Option A: Using uv (Recommended - fastest)

If you have [uv](https://astral.sh/blog/uv) installed:

```bash
uv pip install MetaTrader5
```

Or using the pyproject.toml:
```bash
uv sync
```

#### Option B: Using pip

```bash
pip install MetaTrader5
```

Or using the requirements file:
```bash
pip install -r requirements.txt
```

### 3. Verify Installation

```bash
python -c "import MetaTrader5; print('MetaTrader5 installed successfully')"
```

## Files

- **mt5_bridge.py** - Main bridge script that communicates with MT5 terminal
- **pyproject.toml** - Project metadata and dependencies (modern approach)
- **requirements.txt** - Legacy requirements file (compatible with pip and uv)

## How It Works

The Node.js backend spawns `mt5_bridge.py` as a subprocess:
- Backend sends commands as JSON via stdin
- Bridge processes commands and returns results as JSON via stdout
- Messages are one JSON object per line

## Troubleshooting

### "ModuleNotFoundError: No module named 'MetaTrader5'"

**Using uv:**
```bash
uv pip install MetaTrader5
```

**Using pip:**
```bash
pip install MetaTrader5
```

### "spawn python ENOENT" error

Python is not in your system PATH:
1. On Windows: Add Python installation directory to PATH
2. On macOS/Linux: Install Python 3 (`brew install python3` or `apt install python3`)

### "MT5 init failed" 

MetaTrader 5 terminal is not running:
1. Start your MT5 terminal
2. Keep it running while using the dashboard

### "MT5 login failed"

- Check account number is correct
- Verify password is correct
- Confirm server name (usually "MetaQuotes-Demo" for demo accounts)
