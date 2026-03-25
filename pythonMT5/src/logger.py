"""
Centralized logging for MT5 Python server
Logs to pythonMT5/logs/ with separate files for debug and errors
"""
import logging
import logging.handlers
import os
from datetime import datetime
from pathlib import Path

# Create logs directory
LOGS_DIR = Path(__file__).parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# Log file paths
DEBUG_LOG = LOGS_DIR / "mt5_server.log"
ERROR_LOG = LOGS_DIR / "errors.log"


def setup_logger(name: str = "mt5_server", level=logging.DEBUG) -> logging.Logger:
    """
    Setup logger with file handlers for debug and error logs
    
    Args:
        name: Logger name
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Remove existing handlers to prevent duplicates
    logger.handlers.clear()
    
    # Log format: [TIMESTAMP] [LEVEL] [MODULE] Message
    formatter = logging.Formatter(
        fmt='[%(asctime)s] [%(levelname)-8s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Debug log handler (all messages)
    debug_handler = logging.handlers.RotatingFileHandler(
        DEBUG_LOG,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    debug_handler.setLevel(logging.DEBUG)
    debug_handler.setFormatter(formatter)
    logger.addHandler(debug_handler)
    
    # Error log handler (only errors and above)
    error_handler = logging.handlers.RotatingFileHandler(
        ERROR_LOG,
        maxBytes=5*1024*1024,  # 5MB
        backupCount=3
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)
    logger.addHandler(error_handler)
    
    # Console handler (DEBUG and above during development)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger


# Module-level logger instance
logger = setup_logger()


def log_startup(message: str):
    """Log startup messages"""
    logger.info(f"[STARTUP] {message}")


def log_mt5_event(event: str, details: dict = None):
    """Log MT5-related events"""
    msg = f"[MT5] {event}"
    if details:
        msg += f": {details}"
    logger.debug(msg)


def log_websocket_event(event: str, endpoint: str = None):
    """Log WebSocket events"""
    msg = f"[WebSocket] {event}"
    if endpoint:
        msg += f" - {endpoint}"
    logger.debug(msg)


def log_error_with_context(error: Exception, context: str):
    """Log error with context information"""
    logger.error(f"[ERROR] {context}: {str(error)}", exc_info=True)


if __name__ == "__main__":
    log_startup("Logger test")
    logger.debug("Debug message test")
    logger.info("Info message test")
    logger.warning("Warning message test")
    logger.error("Error message test")
    print(f"Logs written to: {LOGS_DIR}")
