"""
Terminal Manager - handles per-user isolated MT5 terminals in portable mode
Manages folder creation, terminal launching, process tracking, and cleanup
"""
import os
import shutil
import subprocess
import signal
import logging
from typing import Optional, Tuple
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class TerminalManager:
    """Manages user-specific isolated MT5 terminals in portable mode"""
    
    def __init__(self, main_terminal_path: str, user_terminals_base_path: str):
        """
        Initialize terminal manager
        
        Args:
            main_terminal_path: Path to master MT5 installation (C:/Program Files/MetaTrader 5)
            user_terminals_base_path: Base path for user terminals (C:/MT5_UserTerminals)
        """
        self.main_terminal_path = main_terminal_path
        self.user_terminals_base_path = user_terminals_base_path
        
        # Ensure base path exists
        Path(user_terminals_base_path).mkdir(parents=True, exist_ok=True)
        logger.info(f"[TERMINAL] Initialized with main: {main_terminal_path}, users: {user_terminals_base_path}")
    
    def get_user_terminal_path(self, account_id: str) -> str:
        """Get the folder path for a specific user's terminal"""
        return os.path.join(self.user_terminals_base_path, str(account_id))
    
    def setup_user_terminal_folder(self, account_id: str) -> str:
        """
        Create user terminal folder and copy terminal64.exe if missing
        
        Args:
            account_id: User account ID
            
        Returns:
            Path to user terminal folder
        """
        user_terminal_path = self.get_user_terminal_path(account_id)
        
        # Create folder if doesn't exist
        Path(user_terminal_path).mkdir(parents=True, exist_ok=True)
        logger.info(f"[TERMINAL] Created/verified folder for {account_id}: {user_terminal_path}")
        
        # Copy terminal64.exe if missing
        terminal_exe_src = os.path.join(self.main_terminal_path, "terminal64.exe")
        terminal_exe_dst = os.path.join(user_terminal_path, "terminal64.exe")
        
        if not os.path.exists(terminal_exe_dst):
            if not os.path.exists(terminal_exe_src):
                logger.error(f"[TERMINAL] Source terminal64.exe not found: {terminal_exe_src}")
                raise FileNotFoundError(f"Source terminal64.exe not found at {terminal_exe_src}")
            
            try:
                shutil.copy2(terminal_exe_src, terminal_exe_dst)
                logger.info(f"[TERMINAL] Copied terminal64.exe to {user_terminal_path}")
            except Exception as e:
                logger.error(f"[TERMINAL] Failed to copy terminal64.exe: {e}")
                raise
        else:
            logger.debug(f"[TERMINAL] terminal64.exe already exists for {account_id}")
        
        return user_terminal_path
    
    def launch_user_terminal(self, terminal_folder_path: str) -> int:
        """
        Launch MT5 in portable mode for the user
        
        Args:
            terminal_folder_path: Path to user's terminal folder
            
        Returns:
            Process ID (PID) of launched terminal
            
        Raises:
            RuntimeError: If terminal launch fails
        """
        terminal_exe = os.path.join(terminal_folder_path, "terminal64.exe")
        
        if not os.path.exists(terminal_exe):
            logger.error(f"[TERMINAL] terminal64.exe not found: {terminal_exe}")
            raise FileNotFoundError(f"terminal64.exe not found at {terminal_exe}")
        
        try:
            # Launch terminal in portable mode
            # /portable flag stores config in terminal folder, not registry
            proc = subprocess.Popen(
                [terminal_exe, "/portable"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP  # Windows only
            )
            
            logger.info(f"[TERMINAL] Launched portable MT5: PID {proc.pid}, path: {terminal_folder_path}")
            return proc.pid
        
        except Exception as e:
            logger.error(f"[TERMINAL] Failed to launch terminal: {e}")
            raise RuntimeError(f"Failed to launch terminal: {e}")
    
    def is_process_alive(self, pid: int) -> bool:
        """
        Check if a Windows process is still running
        
        Args:
            pid: Process ID to check
            
        Returns:
            True if process is running, False otherwise
        """
        try:
            # Signal 0 = check without sending signal (Windows compatible)
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False
    
    def kill_process(self, pid: int) -> bool:
        """
        Kill a process gracefully
        
        Args:
            pid: Process ID to kill
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_process_alive(pid):
            logger.debug(f"[TERMINAL] Process {pid} already dead")
            return True
        
        try:
            # Send SIGTERM on Windows (becomes TerminateProcess)
            os.kill(pid, signal.SIGTERM)
            logger.info(f"[TERMINAL] Terminated process {pid}")
            return True
        except Exception as e:
            logger.error(f"[TERMINAL] Failed to kill process {pid}: {e}")
            return False
    
    def cleanup_user_terminal_folder(self, account_id: str) -> bool:
        """
        Delete user terminal folder and kill process if running
        
        Args:
            account_id: User account ID
            
        Returns:
            True if successful, False otherwise
        """
        user_terminal_path = self.get_user_terminal_path(account_id)
        
        # Delete folder
        if os.path.exists(user_terminal_path):
            try:
                shutil.rmtree(user_terminal_path)
                logger.info(f"[TERMINAL] Deleted folder: {user_terminal_path}")
            except Exception as e:
                logger.error(f"[TERMINAL] Failed to delete folder {user_terminal_path}: {e}")
                return False
        else:
            logger.debug(f"[TERMINAL] Folder already doesn't exist: {user_terminal_path}")
        
        return True
    
    def get_folder_size_mb(self, account_id: str) -> float:
        """
        Get size of user terminal folder in MB
        
        Args:
            account_id: User account ID
            
        Returns:
            Size in MB, 0 if folder doesn't exist
        """
        user_terminal_path = self.get_user_terminal_path(account_id)
        
        if not os.path.exists(user_terminal_path):
            return 0.0
        
        total_size = 0
        try:
            for dirpath, dirnames, filenames in os.walk(user_terminal_path):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    if os.path.exists(filepath):
                        total_size += os.path.getsize(filepath)
            
            return total_size / (1024 * 1024)  # Convert to MB
        except Exception as e:
            logger.warning(f"[TERMINAL] Failed to calculate size for {account_id}: {e}")
            return 0.0
    
    def list_user_terminals(self) -> list:
        """
        List all user terminal folders
        
        Returns:
            List of account IDs with terminal folders
        """
        try:
            if not os.path.exists(self.user_terminals_base_path):
                return []
            
            user_dirs = [d for d in os.listdir(self.user_terminals_base_path)
                        if os.path.isdir(os.path.join(self.user_terminals_base_path, d))]
            
            return sorted(user_dirs)
        except Exception as e:
            logger.error(f"[TERMINAL] Failed to list user terminals: {e}")
            return []


# Global instance
terminal_manager: Optional[TerminalManager] = None


def init_terminal_manager(main_path: str, user_base_path: str) -> TerminalManager:
    """Initialize global terminal manager instance"""
    global terminal_manager
    terminal_manager = TerminalManager(main_path, user_base_path)
    return terminal_manager


def get_terminal_manager() -> TerminalManager:
    """Get global terminal manager instance"""
    global terminal_manager
    if terminal_manager is None:
        raise RuntimeError("Terminal manager not initialized. Call init_terminal_manager first.")
    return terminal_manager
