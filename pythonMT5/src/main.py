"""
MT5 Python Bridge Server - FastAPI
Main entry point for the Python MT5 server
Handles MT5 connections, REST API, and WebSocket communication with Node backend
"""
import os
import sys
import argparse
import signal
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse
import uvicorn
import asyncio

from logger import logger, log_startup, log_error_with_context
from auth import validate_api_token, get_auth
from mt5_handler import get_mt5_handler
from websocket_client import get_ws_client
from tick_stream import get_tick_stream
from trade_detector import get_trade_detector
from models import (
    LoginRequest, OrderRequest, CandleRequest,
    StatusResponse, GenericErrorResponse
)


# ==================== Application Setup ====================

app = FastAPI(
    title="MT5 Python Bridge Server",
    version="1.0.0",
    description="MetaTrader5 bridge for trading dashboard"
)

# Global state
mt5_handler = get_mt5_handler()
ws_client = get_ws_client()
tick_stream = get_tick_stream()
trade_detector = get_trade_detector()


# ==================== Startup/Shutdown ====================

# Global variable to store startup args
_startup_args = None


@app.on_event("startup")
async def startup_event():
    """Initialize server on startup"""
    global _startup_args
    log_startup("FastAPI server starting")
    
    # Start WebSocket client connection
    ws_client.start()
    log_startup("WebSocket client started")
    
    # Wait for WebSocket to connect (max 5 seconds)
    for i in range(50):  # 50 * 100ms = 5 seconds
        if ws_client.is_connected():
            log_startup("WebSocket connected")
            break
        await asyncio.sleep(0.1)
    
    # Auto-login to MT5 if args are available
    if _startup_args:
        await asyncio.sleep(1)  # Wait for server to be ready
        success = mt5_handler.login(_startup_args.account, _startup_args.password, _startup_args.server)
        if success:
            log_startup(f"Auto-login successful: {_startup_args.account}")
            tick_stream.start_streaming(["EURUSD"])
            trade_detector.start_detection()
            ws_client.send_status(True, mt5_handler.account_id, None, "Connected")
        else:
            logger.error(f"Auto-login failed for account {_startup_args.account}")
            ws_client.send_status(False, None, "Login failed", "Could not connect to MT5")
    
    log_startup("Server initialization complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    log_startup("Server shutting down")
    
    # Stop all background tasks
    tick_stream.stop_streaming()
    trade_detector.stop_detection()
    
    # Close connections
    ws_client.stop()
    mt5_handler.shutdown()
    
    log_startup("Server shutdown complete")


def handle_shutdown(signum, frame):
    """Handle graceful shutdown on SIGINT"""
    logger.info("Received shutdown signal")
    tick_stream.stop_streaming()
    trade_detector.stop_detection()
    ws_client.stop()
    mt5_handler.shutdown()
    sys.exit(0)


# Register shutdown handler
signal.signal(signal.SIGINT, handle_shutdown)


# ==================== Middleware ====================

@app.middleware("http")
async def token_middleware(request: Request, call_next):
    """Validate X-API-Token header on all requests"""
    # Skip health check
    if request.url.path == "/health":
        return await call_next(request)
    
    token = request.headers.get("X-API-Token")
    if not token or not validate_api_token(token):
        logger.warning(f"Unauthorized request to {request.url.path}")
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized"}
        )
    
    return await call_next(request)


# ==================== Health Check ====================

@app.get("/health")
async def health_check():
    """Health check endpoint (no auth required)"""
    return {
        "status": "ok",
        "mt5_connected": mt5_handler.is_connected(),
        "ws_connected": ws_client.is_connected()
    }


# ==================== MT5 Control Endpoints ====================

@app.post("/login", response_model=StatusResponse)
async def login(request: LoginRequest):
    """
    Login to MT5
    
    Args:
        account: MT5 account number
        password: MT5 password
        server: MT5 server name (e.g., MetaQuotes-Demo)
    """
    log_startup(f"Login attempt: account={request.account}")
    
    success = mt5_handler.login(request.account, request.password, request.server)
    
    if success:
        # Start tick streaming and trade detection
        tick_stream.start_streaming(["EURUSD"])  # Start with common pair, client can subscribe
        trade_detector.start_detection()
        
        # Send status via WebSocket
        ws_client.send_status(
            connected=True,
            account_id=mt5_handler.account_id,
            message="Connected to MT5"
        )
        
        return StatusResponse(
            connected=True,
            account_id=mt5_handler.account_id,
            balance=mt5_handler.last_balance,
            message="Login successful"
        )
    else:
        ws_client.send_status(
            connected=False,
            error="Login failed",
            message="Could not connect to MT5"
        )
        
        return StatusResponse(
            connected=False,
            error="Login failed",
            message="Invalid credentials or MT5 not available"
        )


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """Get current MT5 connection status"""
    if mt5_handler.is_connected():
        account_info = mt5_handler.get_account_info()
        return StatusResponse(
            connected=True,
            account_id=mt5_handler.account_id,
            balance=account_info.get("balance"),
            message="Connected"
        )
    else:
        return StatusResponse(
            connected=False,
            error="Not connected",
            message="MT5 disconnected"
        )


# ==================== Account & Data Endpoints ====================

@app.get("/account")
async def get_account_info():
    """Get account information"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    return mt5_handler.get_account_info()


@app.get("/candles/{symbol}")
async def get_candles(
    symbol: str,
    timeframe: str = "1h",
    count: int = 100
):
    """
    Get historical candles
    
    Args:
        symbol: Trading symbol (EURUSD, GBPUSD, etc)
        timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
        count: Number of candles (default 100, max 5000)
    """
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    count = min(count, 5000)  # Cap at 5000
    result = mt5_handler.get_candles(symbol, timeframe, count)
    
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result


@app.get("/positions")
async def get_positions():
    """Get all open positions"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    return mt5_handler.get_positions()


@app.get("/trades")
async def get_trades(days: int = 30):
    """Get trade history"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    return mt5_handler.get_trade_history(days)


@app.get("/symbols")
async def get_symbols():
    """Get available trading symbols"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    return mt5_handler.get_symbols()


@app.get("/symbol/{symbol}")
async def get_symbol(symbol: str):
    """Get symbol information"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    result = mt5_handler.get_symbol_info(symbol)
    
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result


@app.get("/depth/{symbol}")
async def get_depth(symbol: str):
    """Get order book depth"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    result = mt5_handler.get_depth(symbol)
    
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result


# ==================== Trading Endpoints ====================

@app.post("/order")
async def place_order(request: OrderRequest):
    """Place a market order"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    result = mt5_handler.place_order(
        symbol=request.symbol,
        order_type=request.order_type,
        volume=request.volume,
        stop_loss=request.stop_loss,
        take_profit=request.take_profit
    )
    
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result


@app.post("/close/{ticket}")
async def close_position(ticket: int):
    """Close a position by ticket number"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    result = mt5_handler.close_position(ticket)
    
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result


# ==================== Streaming Endpoints ====================

@app.post("/subscribe/{symbol}")
async def subscribe_symbol(symbol: str):
    """Subscribe to real-time ticks for a symbol"""
    if not mt5_handler.is_connected():
        raise HTTPException(status_code=503, detail="MT5 not connected")
    
    tick_stream.add_symbol(symbol)
    
    return {"status": "subscribed", "symbol": symbol}


@app.post("/unsubscribe/{symbol}")
async def unsubscribe_symbol(symbol: str):
    """Unsubscribe from ticks for a symbol"""
    tick_stream.remove_symbol(symbol)
    
    return {"status": "unsubscribed", "symbol": symbol}


# ==================== Error Handlers ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    logger.warning(f"HTTP {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    log_error_with_context(exc, f"Unexpected error on {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )


# ==================== Main ====================

def main():
    """Main entry point"""
    global _startup_args
    
    parser = argparse.ArgumentParser(description="MT5 Python Bridge Server")
    parser.add_argument("--account", type=int, required=True, help="MT5 account number")
    parser.add_argument("--password", type=str, required=True, help="MT5 password")
    parser.add_argument("--server", type=str, required=True, help="MT5 server name")
    parser.add_argument("--port", type=int, default=3002, help="Server port (default 3002)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Server host (default 127.0.0.1)")
    
    args = parser.parse_args()
    _startup_args = args
    
    log_startup(f"Parsed CLI args: account={args.account}, server={args.server}")
    
    # Start server
    log_startup(f"Starting server on {args.host}:{args.port}")
    
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info"
    )


if __name__ == "__main__":
    main()
