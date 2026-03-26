"""
TradeMatrix Backend - Main FastAPI Application
"""
import asyncio
import logging
from contextlib import asynccontextmanager

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
from app.database import create_db_and_tables, get_session
from app.services.mt5_adapter import mt5_manager
from app.services.websocket_service import ws_manager
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
    """WebSocket endpoint for real-time data"""
    
    # Verify token
    from app.security import verify_token
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
    
    try:
        while True:
            # Wait for message or connection closure
            try:
                # Receive message (this blocks until message arrives)
                message = await websocket.receive_text()
                
                # Handle client messages (echo back or process commands)
                import json
                data = json.loads(message)
                
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                
            except Exception as e:
                logger.debug(f"Error receiving message: {e}")
                break
    
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
    
    finally:
        await ws_manager.disconnect(client_id)
        logger.info(f"Client {client_id} disconnected from WebSocket")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

