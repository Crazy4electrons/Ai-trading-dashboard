"""
Multi-user terminal authentication helper
Integrates terminal manager with MT5 adapter for per-user terminal support
"""
import logging
from typing import Optional, Tuple
from sqlmodel import Session, select
from app.models import TerminalProcess, MTAccount, User
from app.services.terminal_manager import get_terminal_manager
from app.services.mt5_adapter import mt5_manager

logger = logging.getLogger(__name__)


async def ensure_user_terminal(
    account_id: str,
    user_id: str,
    account_number: int,
    server: str,
    login_password: str,
    session: Session
) -> Tuple[bool, Optional[str]]:
    """
    Ensure user's terminal is running and authenticated.
    If PID running → use mt5.login(). If crashed/dead → initialize fresh.
    
    Args:
        account_id: MT5 account ID from database
        user_id: User ID from database
        account_number: MT5 account number
        server: MT5 server name
        login_password: MT5 password
        session: Database session
        
    Returns:
        Tuple[bool, Optional[str]]: (success, error_message)
    """
    try:
        terminal_manager = get_terminal_manager()
        
        # Check if terminal process record exists
        statement = select(TerminalProcess).where(TerminalProcess.account_id == account_id)
        term_proc = session.exec(statement).first()
        
        # Logically determine if terminal should be running
        if term_proc and terminal_manager.is_process_alive(term_proc.process_id):
            # Terminal PID is alive → reuse via mt5.login()
            logger.info(
                f"[TERMINAL-AUTH] Terminal running for account {account_number} (PID {term_proc.process_id}), "
                f"using mt5.login()"
            )
            success, error = await mt5_manager.login(server, account_number, login_password)
            
            if success:
                term_proc.is_running = True
                term_proc.login_status = "connected"
                session.add(term_proc)
                session.commit()
                logger.info(f"[TERMINAL-AUTH] Login successful for account {account_number}")
                return True, None
            else:
                logger.error(f"[TERMINAL-AUTH] Login failed: {error}")
                # If login fails with running terminal, still report the error
                return False, error
        
        # Terminal dead or doesn't exist → initialize fresh
        logger.info(f"[TERMINAL-AUTH] Terminal not running for account {account_number}, initializing fresh")
        
        # Kill orphan if exists
        if term_proc and term_proc.process_id:
            logger.debug(f"[TERMINAL-AUTH] Killing orphan process {term_proc.process_id}")
            terminal_manager.kill_process(term_proc.process_id)
        
        # Setup user terminal folder
        try:
            terminal_path = terminal_manager.setup_user_terminal_folder(account_id)
            logger.info(f"[TERMINAL-AUTH] User terminal folder ready: {terminal_path}")
        except Exception as e:
            logger.error(f"[TERMINAL-AUTH] Failed to setup terminal folder: {e}")
            return False, f"Failed to setup terminal folder: {e}"
        
        # Launch terminal in portable mode
        try:
            pid = terminal_manager.launch_user_terminal(terminal_path)
            logger.info(f"[TERMINAL-AUTH] Terminal launched: PID {pid}")
        except Exception as e:
            logger.error(f"[TERMINAL-AUTH] Failed to launch terminal: {e}")
            return False, f"Failed to launch terminal: {e}"
        
        # Initialize MT5
        logger.info(f"[TERMINAL-AUTH] Calling mt5.initialize()")
        success, error = await mt5_manager.initialize(
            login=account_number,
            password=login_password,
            server=server,
            max_retries=3
        )
        
        if not success:
            logger.error(f"[TERMINAL-AUTH] MT5 initialize failed: {error}")
            terminal_manager.kill_process(pid)
            return False, f"MT5 initialization failed: {error}"
        
        # Store/update terminal process record in database
        if term_proc:
            # Update existing record
            term_proc.terminal_path = terminal_path
            term_proc.process_id = pid
            term_proc.is_running = True
            term_proc.login_status = "connected"
        else:
            # Create new record
            term_proc = TerminalProcess(
                account_id=account_id,
                user_id=user_id,
                terminal_path=terminal_path,
                process_id=pid,
                is_running=True,
                login_status="connected"
            )
        
        session.add(term_proc)
        session.commit()
        
        logger.info(f"[TERMINAL-AUTH] Terminal authentication successful for account {account_number}")
        return True, None
        
    except Exception as e:
        logger.error(f"[TERMINAL-AUTH] Unexpected error: {e}", exc_info=True)
        return False, f"Unexpected error: {e}"


def terminate_user_terminal(account_id: str, session: Session) -> bool:
    """
    Stop user's MT5 terminal and free resources
    
    Args:
        account_id: MT5 account ID from database
        session: Database session
        
    Returns:
        bool: True if successful
    """
    try:
        terminal_manager = get_terminal_manager()
        
        # Fetch terminal process record
        statement = select(TerminalProcess).where(TerminalProcess.account_id == account_id)
        term_proc = session.exec(statement).first()
        
        if not term_proc:
            logger.debug(f"[TERMINAL-LOGOUT] No terminal process record for {account_id}")
            return True
        
        # Kill process if running
        if term_proc.process_id:
            terminal_manager.kill_process(term_proc.process_id)
            logger.info(f"[TERMINAL-LOGOUT] Killed terminal process {term_proc.process_id}")
        
        # Update record
        term_proc.is_running = False
        term_proc.login_status = "offline"
        session.add(term_proc)
        session.commit()
        
        logger.info(f"[TERMINAL-LOGOUT] Terminal terminated for account {account_id}")
        return True
        
    except Exception as e:
        logger.error(f"[TERMINAL-LOGOUT] Error terminating terminal: {e}")
        return False


def cleanup_user_terminal_folder(account_id: str, session: Session) -> bool:
    """
    Delete user terminal folder and terminate process (admin cleanup)
    
    Args:
        account_id: MT5 account ID from database
        session: Database session
        
    Returns:
        bool: True if successful
    """
    try:
        terminal_manager = get_terminal_manager()
        
        # Terminate first
        terminate_user_terminal(account_id, session)
        
        # Delete folder
        success = terminal_manager.cleanup_user_terminal_folder(account_id)
        
        if success:
            # Delete database record
            statement = select(TerminalProcess).where(TerminalProcess.account_id == account_id)
            term_proc = session.exec(statement).first()
            if term_proc:
                session.delete(term_proc)
                session.commit()
            logger.info(f"[TERMINAL-CLEANUP] User terminal cleaned up: {account_id}")
        
        return success
        
    except Exception as e:
        logger.error(f"[TERMINAL-CLEANUP] Error cleaning up terminal: {e}")
        return False
