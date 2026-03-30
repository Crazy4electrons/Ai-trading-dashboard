"""
Terminal Administration API endpoints
Admin-only endpoints for managing user terminals and database cleanup
"""
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from datetime import datetime, timedelta

from app.database import get_session
from app.models import TerminalProcess, MTAccount, Candle, HistoricalCandle
from app.services.terminal_manager import get_terminal_manager
from app.services.terminal_auth import terminate_user_terminal, cleanup_user_terminal_folder
from app.services.polling_service import polling_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


class TerminalInfo:
    """Terminal information for admin display"""
    def __init__(self, account_id: str, account_number: int, server: str, 
                 process_id: int, is_running: bool, login_status: str,
                 started_at: datetime, last_ping: datetime, 
                 folder_size_mb: float = 0.0):
        self.account_id = account_id
        self.account_number = account_number
        self.server = server
        self.process_id = process_id
        self.is_running = is_running
        self.login_status = login_status
        self.started_at = started_at.isoformat() if started_at else None
        self.last_ping = last_ping.isoformat() if last_ping else None
        self.folder_size_mb = folder_size_mb
        self.uptime_seconds = int((datetime.utcnow() - started_at).total_seconds()) if started_at else 0

    def dict(self):
        return {
            "account_id": self.account_id,
            "account_number": self.account_number,
            "server": self.server,
            "process_id": self.process_id,
            "is_running": self.is_running,
            "login_status": self.login_status,
            "started_at": self.started_at,
            "last_ping": self.last_ping,
            "folder_size_mb": self.folder_size_mb,
            "uptime_seconds": self.uptime_seconds,
        }


@router.get("/terminals/list")
async def list_terminals(session: Session = Depends(get_session)):
    """
    List all active user terminals with their status and resource usage.
    
    Returns:
    - account_id: UUID of MT account
    - account_number: Integer MT5 account number
    - server: MT5 server name
    - process_id: Windows PID
    - is_running: Whether process is alive
    - login_status: "offline", "initializing", "logging_in", "connected", "error"
    - started_at: ISO timestamp when terminal was launched
    - last_ping: ISO timestamp of last activity
    - folder_size_mb: Disk space used by terminal folder
    - uptime_seconds: How long terminal has been running
    """
    logger.info("[ADMIN] Listing all user terminals...")
    try:
        terminal_manager = get_terminal_manager()
        if not terminal_manager:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Terminal manager not initialized"
            )
        
        # Get all terminal process records
        statement = select(TerminalProcess)
        terminal_procs = session.exec(statement).all()
        
        terminals_info = []
        for term_proc in terminal_procs:
            # Check if process is actually alive
            is_alive = terminal_manager.is_process_alive(term_proc.process_id)
            
            # Update DB if status changed
            if is_alive != term_proc.is_running:
                term_proc.is_running = is_alive
                session.add(term_proc)
                logger.warning(f"[ADMIN] Terminal {term_proc.account_id} status changed to {is_alive}")
            
            # Get folder size
            try:
                folder_size_mb = terminal_manager.get_folder_size_mb(term_proc.account_id)
            except Exception as e:
                logger.warning(f"[ADMIN] Could not get folder size for {term_proc.account_id}: {e}")
                folder_size_mb = 0.0
            
            # Get MT account info for display
            mt_account = session.get(MTAccount, term_proc.account_id)
            if mt_account:
                info = TerminalInfo(
                    account_id=term_proc.account_id,
                    account_number=mt_account.account_number,
                    server=mt_account.server,
                    process_id=term_proc.process_id,
                    is_running=term_proc.is_running,
                    login_status=term_proc.login_status,
                    started_at=term_proc.started_at,
                    last_ping=term_proc.last_ping,
                    folder_size_mb=folder_size_mb
                )
                terminals_info.append(info.dict())
        
        session.commit()
        logger.info(f"[ADMIN] Found {len(terminals_info)} active terminals")
        return {"terminals": terminals_info, "total": len(terminals_info)}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN] Error listing terminals: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing terminals: {str(e)}"
        )


@router.post("/terminals/{account_id}/cleanup")
async def cleanup_terminal(account_id: str, session: Session = Depends(get_session)):
    """
    Cleanup a specific user terminal.
    
    - Kills the MT5 process
    - Deletes the terminal folder
    - Removes the TerminalProcess record
    
    Use with caution: User will need to login again to restart their terminal.
    """
    logger.info(f"[ADMIN] Cleaning up terminal for account {account_id}...")
    try:
        terminal_manager = get_terminal_manager()
        if not terminal_manager:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Terminal manager not initialized"
            )
        
        # Get terminal process record
        term_proc = session.get(TerminalProcess, account_id)
        if not term_proc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Terminal not found for account {account_id}"
            )
        
        # Kill process if alive
        if term_proc.is_running:
            try:
                terminal_manager.kill_process(term_proc.process_id)
                logger.info(f"[ADMIN] Killed process {term_proc.process_id} for account {account_id}")
            except Exception as e:
                logger.warning(f"[ADMIN] Failed to kill process {term_proc.process_id}: {e}")
        
        # Cleanup folder
        try:
            terminal_manager.cleanup_user_terminal_folder(account_id)
            logger.info(f"[ADMIN] Cleaned up terminal folder for account {account_id}")
        except Exception as e:
            logger.warning(f"[ADMIN] Failed to cleanup terminal folder: {e}")
        
        # Remove from DB
        session.delete(term_proc)
        session.commit()
        logger.info(f"[ADMIN] Successfully cleaned up terminal for account {account_id}")
        
        return {
            "success": True,
            "message": f"Terminal for account {account_id} cleaned up successfully",
            "account_id": account_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN] Error cleaning up terminal {account_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cleaning up terminal: {str(e)}"
        )


@router.post("/terminals/cleanup/inactive")
async def cleanup_inactive_terminals(max_age_hours: int = 24, session: Session = Depends(get_session)):
    """
    Cleanup inactive terminals that haven't been accessed in specified hours.
    
    Parameters:
    - max_age_hours: Terminals not accessed in this many hours will be cleaned up (default: 24)
    
    Returns:
    - cleaned_count: Number of terminals cleaned up
    - failed_count: Number of cleanup attempts that failed
    - details: List of cleaned terminal IDs
    """
    logger.info(f"[ADMIN] Cleaning up inactive terminals (age > {max_age_hours} hours)...")
    try:
        terminal_manager = get_terminal_manager()
        if not terminal_manager:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Terminal manager not initialized"
            )
        
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
        
        # Get all inactive terminals
        statement = select(TerminalProcess).where(
            TerminalProcess.last_ping < cutoff_time
        )
        inactive_terminals = session.exec(statement).all()
        
        logger.info(f"[ADMIN] Found {len(inactive_terminals)} inactive terminals")
        
        cleaned_count = 0
        failed_count = 0
        cleaned_ids = []
        
        for term_proc in inactive_terminals:
            try:
                # Kill process if alive
                if term_proc.is_running:
                    try:
                        terminal_manager.kill_process(term_proc.process_id)
                    except:
                        pass
                
                # Cleanup folder
                try:
                    terminal_manager.cleanup_user_terminal_folder(term_proc.account_id)
                except:
                    pass
                
                # Remove from DB
                session.delete(term_proc)
                cleaned_count += 1
                cleaned_ids.append(term_proc.account_id)
                logger.info(f"[ADMIN] Cleaned up inactive terminal {term_proc.account_id}")
            except Exception as e:
                failed_count += 1
                logger.error(f"[ADMIN] Failed to cleanup terminal {term_proc.account_id}: {e}")
        
        session.commit()
        logger.info(f"[ADMIN] Inactive cleanup complete: {cleaned_count} cleaned, {failed_count} failed")
        
        return {
            "success": True,
            "cleaned_count": cleaned_count,
            "failed_count": failed_count,
            "details": cleaned_ids,
            "message": f"Cleaned up {cleaned_count} inactive terminals ({failed_count} failed)"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN] Error cleaning up inactive terminals: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cleaning up inactive terminals: {str(e)}"
        )


@router.get("/terminals/stats")
async def get_terminal_stats(session: Session = Depends(get_session)):
    """
    Get terminal statistics and resource usage summary.
    
    Returns:
    - total_terminals: Total number of user terminals
    - running_terminals: Number of currently running terminals
    - offline_terminals: Number of offline terminals
    - total_size_mb: Total disk space used by all terminals
    - error_terminals: Terminals with error status
    - last_updated: ISO timestamp of this stats update
    """
    logger.info("[ADMIN] Getting terminal statistics...")
    try:
        terminal_manager = get_terminal_manager()
        if not terminal_manager:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Terminal manager not initialized"
            )
        
        # Get all terminals
        statement = select(TerminalProcess)
        all_terminals = session.exec(statement).all()
        
        running_count = 0
        offline_count = 0
        error_count = 0
        total_size_mb = 0.0
        
        for term in all_terminals:
            # Update running status
            is_alive = terminal_manager.is_process_alive(term.process_id)
            if is_alive != term.is_running:
                term.is_running = is_alive
                session.add(term)
            
            # Count by status
            if term.login_status == "error":
                error_count += 1
            elif term.is_running:
                running_count += 1
            else:
                offline_count += 1
            
            # Sum folder sizes
            try:
                size_mb = terminal_manager.get_folder_size_mb(term.account_id)
                total_size_mb += size_mb
            except:
                pass
        
        session.commit()
        
        stats = {
            "total_terminals": len(all_terminals),
            "running_terminals": running_count,
            "offline_terminals": offline_count,
            "error_terminals": error_count,
            "total_size_mb": round(total_size_mb, 2),
            "last_updated": datetime.utcnow().isoformat()
        }
        
        logger.info(f"[ADMIN] Terminal stats: {stats}")
        return stats
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN] Error getting terminal stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting terminal stats: {str(e)}"
        )


# ============================================================================
# DATABASE CLEANUP ENDPOINTS
# ============================================================================

@router.post("/database/cleanup")
async def cleanup_database(session: Session = Depends(get_session)):
    """
    Cleanup old data from the database per retention policies.
    
    Policies:
    - Candles: Keep 6 months (older data is deleted)
    - Historical candles: Keep 90 days (older data is deleted)
    - Terminal process logs: Keep 30 days
    
    Returns:
    - candles_deleted: Number of candle records deleted
    - historical_deleted: Number of historical candle records deleted
    - max_size_reached: Whether database reached or would exceed size limit
    """
    logger.info("    [ADMIN] Starting database cleanup...")
    try:
        cleanup_stats = {
            "candles_deleted": 0,
            "historical_deleted": 0,
            "max_size_reached": False,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Delete candles older than 6 months
        cutoff_candles = datetime.utcnow() - timedelta(days=180)
        statement = select(Candle).where(Candle.timestamp < cutoff_candles)
        old_candles = session.exec(statement).all()
        for candle in old_candles:
            session.delete(candle)
        cleanup_stats["candles_deleted"] = len(old_candles)
        
        # Delete historical candles older than 90 days
        cutoff_historical = datetime.utcnow() - timedelta(days=90)
        statement = select(HistoricalCandle).where(HistoricalCandle.timestamp < cutoff_historical)
        old_historical = session.exec(statement).all()
        for candle in old_historical:
            session.delete(candle)
        cleanup_stats["historical_deleted"] = len(old_historical)
        
        session.commit()
        logger.info(f"[ADMIN] Database cleanup complete: {cleanup_stats}")
        
        return {
            "success": True,
            "message": f"Deleted {cleanup_stats['candles_deleted']} candles and {cleanup_stats['historical_deleted']} historical candles",
            **cleanup_stats
        }
    
    except Exception as e:
        logger.error(f"[ADMIN] Error cleaning database: {e}")
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database cleanup failed: {str(e)}"
        )


@router.get("/database/stats")
async def get_database_stats(session: Session = Depends(get_session)):
    """
    Get database statistics and size information.
    
    Returns:
    - total_candles: Total candle records in database
    - total_historical: Total historical candle records
    - oldest_candle: Timestamp of oldest candle record
    - newest_candle: Timestamp of newest candle record
    - symbols_count: Number of unique symbols
    - estimated_size_mb: Rough estimate of database file size
    - cleanup_due: Whether cleanup is recommended
    """
    logger.info("[ADMIN] Getting database statistics...")
    try:
        # Count records
        candle_count = len(session.exec(select(Candle)).all())
        historical_count = len(session.exec(select(HistoricalCandle)).all())
        
        # Get timestamp range
        candles = session.exec(select(Candle).order_by(Candle.timestamp)).all()
        oldest_candle = candles[0].timestamp.isoformat() if candles else None
        newest_candle = candles[-1].timestamp.isoformat() if candles else None
        
        # Count unique symbols
        all_candles = session.exec(select(Candle)).all()
        symbols = set(c.symbol for c in all_candles)
        
        stats = {
            "total_candles": candle_count,
            "total_historical": historical_count,
            "oldest_candle": oldest_candle,
            "newest_candle": newest_candle,
            "symbols_count": len(symbols),
            "estimated_size_mb": round((candle_count + historical_count) * 0.5, 2),  # Rough estimate
            "cleanup_due": candle_count > 100000,  # Suggest cleanup if > 100k records
            "last_updated": datetime.utcnow().isoformat()
        }
        
        logger.info(f"[ADMIN] Database stats: {stats}")
        return stats
    
    except Exception as e:
        logger.error(f"[ADMIN] Error getting database stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting database stats: {str(e)}"
        )


# ============================================================================
# POLLING STATUS ENDPOINTS
# ============================================================================

@router.get("/polling/status")
async def get_polling_status():
    """
    Get current polling status and retry/backoff information for all pollers.
    
    Returns for each poller:
    - is_active: Whether the poller is currently running
    - is_failing: Whether the poller is in a failure/backoff state
    - retry_count: Number of consecutive failures
    - base_interval: Normal poll interval in seconds
    - current_interval: Current interval (may be higher due to backoff)
    - last_error: Error message from last failure
    - last_success_time: ISO timestamp of last successful poll
    - last_failure_time: ISO timestamp of last failure
    """
    logger.info("[ADMIN] Getting polling status...")
    try:
        status_info = polling_service.get_all_poller_status()
        
        # Convert dict of pollers to a list for easier consumption in frontend
        pollers_list = list(status_info.values())
        
        logger.info(f"[ADMIN] Polling status: {len(status_info)} pollers tracked")
        return pollers_list
    
    except Exception as e:
        logger.error(f"[ADMIN] Error getting polling status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting polling status: {str(e)}"
        )


@router.post("/polling/reset/{data_type}")
async def reset_polling_backoff(data_type: str):
    """
    Manually reset a poller's backoff state.
    Use when you want to force immediate retry of a failing poller.
    
    Parameters:
    - data_type: Type of poller (chart, watchlist, account, positions, history)
    """
    logger.info(f"[ADMIN] Resetting polling backoff for {data_type}...")
    try:
        if data_type not in polling_service.poller_state:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Poller '{data_type}' not found"
            )
        
        state = polling_service.poller_state[data_type]
        old_state = {
            "was_failing": state.is_failing,
            "retry_count": state.retry_count,
        }
        
        state.record_success()  # Resets backoff
        
        logger.info(f"[ADMIN] Reset backoff for {data_type}")
        
        return {
            "success": True,
            "data_type": data_type,
            "previous_state": old_state,
            "new_state": {
                "is_failing": state.is_failing,
                "retry_count": state.retry_count,
                "current_interval": state.get_current_interval(),
            },
            "message": f"Backoff reset for {data_type} - will poll immediately"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN] Error resetting polling backoff: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resetting polling: {str(e)}"
        )
