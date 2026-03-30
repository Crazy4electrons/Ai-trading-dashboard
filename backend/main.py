"""
TradeMatrix Backend - Main FastAPI Application
"""
import asyncio
import logging
import os
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
import app.api.admin as admin_api
import app.api.terminal_admin as terminal_admin_api
from app.database import create_db_and_tables, get_session, SessionLocal
from app.models import AccountState
from app.services.mt5_adapter import mt5_manager
from app.services.websocket_service import ws_manager
from app.services.polling_service import polling_service
from app.services.candle_cache import candle_cache, CandleCacheService
from app.services.cache_worker import cache_worker
from app.services.terminal_manager import init_terminal_manager
from app.config import SYMBOL_CATEGORIES, CACHE_WORKER_ENABLED

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def admin_broadcast_updates():
    """Background task: Periodically broadcast admin status updates via WebSocket"""
    from app.services.polling_service import polling_service
    import asyncio
    
    logger.info("[ADMIN_BROADCAST] Started admin update broadcaster")
    
    while True:
        try:
            await asyncio.sleep(5)  # Broadcast every 5 seconds
            
            # Get current polling status
            polling_status = polling_service.get_all_poller_status()
            pollers_list = list(polling_status.values())
            
            # Broadcast polling update
            await ws_manager.broadcast_admin_update("polling_status", pollers_list)
            
            logger.debug(f"[ADMIN_BROADCAST] Sent polling status update with {len(pollers_list)} pollers")
            
        except Exception as e:
            logger.error(f"[ADMIN_BROADCAST] Error broadcasting admin update: {e}")
            await asyncio.sleep(1)  # Brief delay before retry


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("=" * 60)
    logger.info("Starting TradeMatrix backend...")
    logger.info("=" * 60)
    
    create_db_and_tables()
    logger.info("[STARTUP] Database initialized")
    
    # Initialize terminal manager for multi-user support
    mt5_main_path = os.getenv("MT5_MAIN_TERMINAL_PATH", "C:/Program Files/MetaTrader 5")
    mt5_user_base_path = os.getenv("MT5_USER_TERMINALS_PATH", "C:/MT5_UserTerminals")
    try:
        init_terminal_manager(mt5_main_path, mt5_user_base_path)
        logger.info(f"[STARTUP] Terminal manager initialized")
        logger.info(f"  - Main terminal path: {mt5_main_path}")
        logger.info(f"  - User terminals path: {mt5_user_base_path}")
    except Exception as e:
        logger.error(f"[STARTUP] Failed to initialize terminal manager: {e}")
        raise
    
    # Initialize cache service and configuration
    session = SessionLocal()
    try:
        cache_service = CandleCacheService(session)
        logger.info("[STARTUP] Cache service initialized")
    finally:
        session.close()
    
    # NOTE: MT5 initialization is deferred to user login flow via auth.py
    # This prevents authorization failures at startup when no account is logged in.
    # MT5 will be initialized when the first user logs in with valid credentials.
    logger.info("[STARTUP] MT5 initialization deferred to login flow")
    
    # Start WebSocket batch processor
    logger.info("[STARTUP] Starting WebSocket batch processor...")
    asyncio.create_task(ws_manager.start_batch_processor())
    logger.info("[STARTUP] WebSocket batch processor started")
    
    # Start admin WebSocket broadcaster (sends real-time admin status updates)
    logger.info("[STARTUP] Starting admin WebSocket broadcaster...")
    asyncio.create_task(admin_broadcast_updates())
    logger.info("[STARTUP] Admin WebSocket broadcaster started")
    
    # Start cache worker for background candle syncing (if enabled in config)
    if CACHE_WORKER_ENABLED:
        logger.info("[STARTUP] Starting cache worker...")
        cache_worker.start()
        logger.info("[STARTUP] Cache worker started (background prefetching enabled)")
    else:
        logger.info("[STARTUP] Cache worker disabled - data will be lazy-loaded on-demand")
    
    logger.info("=" * 60)
    logger.info("TradeMatrix backend ready!")
    logger.info("[INFO] MT5 will be initialized on first user login")
    if not CACHE_WORKER_ENABLED:
        logger.info("[INFO] Cache is lazy-loaded: data fetched when charts are viewed")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("=" * 60)
    logger.info("Shutting down TradeMatrix backend...")
    logger.info("=" * 60)
    if CACHE_WORKER_ENABLED:
        cache_worker.stop()
        logger.info("[SHUTDOWN] Cache worker stopped")
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
app.include_router(admin_api.router)
app.include_router(terminal_admin_api.router)
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
                    
                    elif command_type == "subscribe_admin_status":
                        # Only allow admin role to subscribe to admin updates
                        if token_data.get("role") == "admin":
                            await ws_manager.subscribe_admin_status(client_id)
                            await websocket.send_json({"type": "subscribed", "stream": "admin_status"})
                            logger.info(f"[WS] Admin client {client_id} subscribed to admin_status")
                        else:
                            await websocket.send_json({"type": "error", "message": "Unauthorized: admin role required"})
                            logger.warning(f"[WS] Non-admin client {client_id} attempted admin subscription")
                    
                    elif command_type == "unsubscribe_admin_status":
                        await ws_manager.unsubscribe_admin_status(client_id)
                        await websocket.send_json({"type": "unsubscribed", "stream": "admin_status"})
                        logger.info(f"[WS] Client {client_id} unsubscribed from admin_status")
                    
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

