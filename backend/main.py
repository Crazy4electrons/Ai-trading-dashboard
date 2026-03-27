"""
TradeMatrix Backend - Main FastAPI Application
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

import app.api.auth as auth_api
import app.api.symbols as symbols_api
import app.api.watchlist as watchlist_api
import app.api.account as account_api
import app.api.candles as candles_api
import app.api.debug as debug_api
import app.api.debug_ohlc as debug_ohlc_api
from app.database import create_db_and_tables, get_session, SessionLocal
from app.models import AccountState
from app.services.mt5_adapter import mt5_manager
from app.services.websocket_service import ws_manager
from app.services.polling_service import polling_service
from app.services.candle_cache import candle_cache
from app.config import SYMBOL_CATEGORIES

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("=" * 60)
    logger.info("Starting TradeMatrix backend...")
    logger.info("=" * 60)
    
    create_db_and_tables()
    logger.info("[STARTUP] Database initialized")
    
    logger.info("[STARTUP] Initializing MT5...")
    init_result = await mt5_manager.initialize()
    logger.info(f"[STARTUP] MT5 initialization result: {init_result}")
    
    if init_result:
        logger.info("[STARTUP] Loading symbols from MT5...")
        try:
            symbols = await mt5_manager.get_symbols()
            logger.info(f"[STARTUP] Successfully loaded {len(symbols)} symbols from MT5")
        except Exception as e:
            logger.error(f"[STARTUP] Error loading symbols: {e}")
    
    # Start WebSocket batch processor
    logger.info("[STARTUP] Starting WebSocket batch processor...")
    asyncio.create_task(ws_manager.start_batch_processor())
    logger.info("[STARTUP] WebSocket batch processor started")
    
    logger.info("=" * 60)
    logger.info("TradeMatrix backend ready!")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("=" * 60)
    logger.info("Shutting down TradeMatrix backend...")
    logger.info("=" * 60)
    await mt5_manager.shutdown()
    logger.info("TradeMatrix backend shutdown complete")
    logger.info("=" * 60)


# Create FastAPI app
app = FastAPI(
    title="TradeMatrix API",
    description="MT5 Trading Dashboard Backend",
    version="0.1.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_api.router)
app.include_router(symbols_api.router)
app.include_router(watchlist_api.router)
app.include_router(account_api.router)
app.include_router(candles_api.router)
app.include_router(debug_api.router)
app.include_router(debug_ohlc_api.router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "TradeMatrix API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(None),
    session: Session = Depends(get_session)
):
    """WebSocket endpoint for real-time data with subscription support"""
    import json
    from app.security import verify_token
    
    # Verify token
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="No token provided")
        return
    
    token_data = verify_token(token)
    if not token_data:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return
    
    account_id = token_data.get("account_id")
    client_id = f"{account_id}_{id(websocket)}"
    
    # Accept connection
    await websocket.accept()
    logger.info(f"Client {client_id} connected to WebSocket")
    
    # Register connection
    await ws_manager.connect(client_id, account_id)
    
    # Set up polling for this account (only if not already polling)
    if not polling_service.get_active_pollers():
        logger.info(f"[MAIN] Setting up polling for account {account_id}")
        
        # Account data polling (10 seconds)
        async def fetch_account_data():
            return await mt5_manager.get_account_info()
        
        polling_service.register_callback("account", lambda data: ws_manager.broadcast_to_account(account_id, {
            "type": "account",
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }))
        polling_service.start_polling("account", fetch_account_data, account_id)
        
        # Positions polling (5 seconds)
        async def fetch_positions():
            return await mt5_manager.get_positions()
        
        polling_service.register_callback("positions", lambda data: ws_manager.broadcast_to_account(account_id, {
            "type": "positions",
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }))
        polling_service.start_polling("positions", fetch_positions, account_id)
        
        # History polling (30 seconds) - fetch latest account state and append to DB
        async def fetch_history():
            try:
                info = await mt5_manager.get_account_info()
                if not info:
                    logger.warning(f"[HISTORY] No account info from MT5 for account {account_id}")
                    return []

                # Save account state to DB history table
                try:
                    with SessionLocal() as session:
                        state = AccountState(
                            mt_account_id=account_id,
                            balance=info.get("balance", 0),
                            equity=info.get("equity", 0),
                            margin=info.get("margin", 0),
                            free_margin=info.get("free_margin", 0),
                            margin_level=info.get("margin_level", 0),
                        )
                        session.add(state)
                        session.commit()

                    logger.info(f"[HISTORY] Stored account state for account {account_id}")
                    return [{
                        "balance": state.balance,
                        "equity": state.equity,
                        "margin": state.margin,
                        "free_margin": state.free_margin,
                        "margin_level": state.margin_level,
                        "timestamp": state.timestamp.isoformat(),
                    }]
                except Exception as e:
                    logger.error(f"[HISTORY] Failed to store account history for {account_id}: {e}", exc_info=True)
                    return []

            except Exception as e:
                logger.error(f"[HISTORY] Error polling history for {account_id}: {e}", exc_info=True)
                return []

        polling_service.register_callback("history", lambda data: ws_manager.broadcast_to_account(account_id, {
            "type": "history",
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }))
        polling_service.start_polling("history", fetch_history, account_id)
    
    try:
        # Start message reader and writer tasks
        async def read_messages():
            """Read incoming messages (commands) from client"""
            while True:
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)
                    
                    command_type = data.get("type")
                    
                    # Handle subscription commands (only watch_quotes and chart_ticks allowed)
                    if command_type == "subscribe_watch_quotes":
                        await ws_manager.subscribe_watch_quotes(client_id, account_id)
                        await websocket.send_json({"type": "subscribed", "stream": "watch_quotes"})
                        logger.info(f"[WS] Client {client_id} subscribed to watch_quotes")
                    
                    elif command_type == "unsubscribe_watch_quotes":
                        await ws_manager.unsubscribe_watch_quotes(client_id, account_id)
                        await websocket.send_json({"type": "unsubscribed", "stream": "watch_quotes"})
                        logger.info(f"[WS] Client {client_id} unsubscribed from watch_quotes")
                    
                    elif command_type == "subscribe_chart_ticks":
                        symbol = data.get("symbol")
                        if symbol:
                            await ws_manager.subscribe_chart_ticks(client_id, account_id, symbol)
                            await websocket.send_json({"type": "subscribed", "stream": "chart_ticks", "symbol": symbol})
                            logger.info(f"[WS] Client {client_id} subscribed to chart_ticks for {symbol}")
                    
                    elif command_type == "unsubscribe_chart_ticks":
                        symbol = data.get("symbol")
                        if symbol:
                            await ws_manager.unsubscribe_chart_ticks(client_id, account_id, symbol)
                            await websocket.send_json({"type": "unsubscribed", "stream": "chart_ticks", "symbol": symbol})
                            logger.info(f"[WS] Client {client_id} unsubscribed from chart_ticks for {symbol}")
                    
                    elif command_type == "ping":
                        await websocket.send_json({"type": "pong"})
                    
                    else:
                        logger.warning(f"[WS] Unknown command type: {command_type}")
                        await websocket.send_json({"type": "error", "message": f"Unknown command: {command_type}"})
                    
                except Exception as e:
                    logger.debug(f"Error reading message from {client_id}: {e}")
                    break
        
        async def write_messages():
            """Send queued messages to client"""
            queue = await ws_manager.get_client_queue(client_id)
            while True:
                try:
                    message = await queue.get()
                    await websocket.send_json(message)
                except Exception as e:
                    logger.debug(f"Error writing message to {client_id}: {e}")
                    break
        
        # Run both tasks concurrently
        read_task = asyncio.create_task(read_messages())
        write_task = asyncio.create_task(write_messages())
        
        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [read_task, write_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel pending tasks
        for task in pending:
            task.cancel()
    
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
    
    finally:
        await ws_manager.disconnect(client_id)
        logger.info(f"Client {client_id} disconnected from WebSocket")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

