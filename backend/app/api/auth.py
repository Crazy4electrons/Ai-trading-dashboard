"""
Authentication API endpoints
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from datetime import timedelta
from typing import Optional

from app.database import get_session
from app.models import User, MTAccount, Admin
from app.security import create_access_token, encrypt_password, decrypt_password
from app.services.mt5_adapter import mt5_manager
from app.services.terminal_auth import ensure_user_terminal, terminate_user_terminal
from app.config import ADMIN_ACCOUNT_NUMBER, ADMIN_PASSWORD

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Login request schema - handles both admin and user authentication.
    
    If server is None or empty: admin login
    If server provided: user MT5 login with terminal isolation
    """
    server: Optional[str] = None
    account_number: int
    password: str
    
    def validate_credentials(self) -> Optional[str]:
        """Validate input. Returns error message if invalid, None if OK."""
        if not self.password or len(self.password) == 0:
            return "Password cannot be empty"
        if len(self.password) < 3:
            return "Password must be at least 3 characters"
        if self.account_number < 0:
            return "Account number must be positive"
        if self.server:
            self.server = self.server.strip()
            if self.server == "":
                self.server = None
        return None


class LoginResponse(BaseModel):
    """Login response schema"""
    access_token: str
    token_type: str
    account_id: str
    account_number: int
    role: str = "user"  # "admin" or "user"


class UserInfo(BaseModel):
    """User info schema"""
    id: str
    username: str
    email: str


def _ensure_admin_exists(session: Session):
    """Create default admin account if doesn't exist"""
    statement = select(Admin).where(Admin.account_number == ADMIN_ACCOUNT_NUMBER)
    admin = session.exec(statement).first()
    
    if not admin:
        admin = Admin(
            account_number=ADMIN_ACCOUNT_NUMBER,
            password_encrypted=encrypt_password(ADMIN_PASSWORD),
            is_active=True
        )
        session.add(admin)
        session.commit()
        logger.info(f"[AUTH] Created default admin account {ADMIN_ACCOUNT_NUMBER}")
    
    return admin


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, session: Session = Depends(get_session)):
    """
    Login endpoint - handles both admin and user authentication.
    
    Admin Login (server=None or empty):
      - Requires ADMIN_ACCOUNT_NUMBER and ADMIN_PASSWORD match
      - Returns admin token with elevated privileges
      - 401: Invalid account number or password
    
    User Login (server provided):
      - Initializes MT5 connection with per-user terminal
      - Creates user record automatically on first login
      - 401: Invalid MT5 credentials
      - 503: Terminal unavailable (MT5 not installed/configured)
    """
    # Validate input credentials format
    validation_error = request.validate_credentials()
    if validation_error:
        logger.warning(f"[AUTH-LOGIN] Validation failed: {validation_error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation_error
        )
    
    # If no server provided, try admin login
    if not request.server:
        logger.info(f"[AUTH-LOGIN] No server provided - attempting admin authentication for account {request.account_number}")
        
        # Ensure admin account exists
        admin = _ensure_admin_exists(session)
        
        # Check admin account number
        if request.account_number != admin.account_number:
            logger.warning(f"[AUTH-LOGIN] Account {request.account_number} is not admin (admin is {admin.account_number})")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not authorized for admin access. To login as a user, provide your MT5 server and credentials."
            )
        
        # Verify admin password
        try:
            stored_password = decrypt_password(admin.password_encrypted)
            if request.password != stored_password:
                logger.warning(f"[AUTH-LOGIN] Invalid admin password for account {request.account_number}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid admin password. Check your credentials and try again."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[AUTH-LOGIN] Error verifying admin credentials: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Error validating admin credentials. Please try again."
            )
        
        # Admin authentication successful
        logger.info(f"[AUTH-LOGIN] Admin login successful for account {request.account_number}")
        
        access_token = create_access_token(
            data={
                "sub": admin.id,
                "account_number": admin.account_number,
                "role": "admin"
            },
            expires_delta=timedelta(hours=8)
        )
        
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            account_id=admin.id,
            account_number=admin.account_number,
            role="admin"
        )
    
    # Server provided - user login with MT5
    logger.info(f"[AUTH-LOGIN] User login attempt for account {request.account_number} on {request.server}")
    
    # Get or create MT account record first
    statement = select(MTAccount).where(
        (MTAccount.account_number == request.account_number) &
        (MTAccount.server == request.server)
    )
    mt_account = session.exec(statement).first()
    
    if not mt_account:
        # Create a guest user if account doesn't exist
        guest_user = User(
            username=f"user_{request.account_number}",
            email=f"user_{request.account_number}@tradematrix.local"
        )
        session.add(guest_user)
        session.flush()
        
        # Create MT account record
        mt_account = MTAccount(
            user_id=guest_user.id,
            server=request.server,
            account_number=request.account_number,
            password_encrypted=encrypt_password(request.password),
            is_active=True
        )
        session.add(mt_account)
        session.commit()
        logger.info(f"[AUTH-LOGIN] Created new MT account record for {request.account_number}")
    else:
        # Update password for existing account
        mt_account.password_encrypted = encrypt_password(request.password)
        mt_account.is_active = True
        session.add(mt_account)
        session.commit()
    
    # Use multi-user terminal authentication (per-user terminal in portable mode)
    logger.info(f"[AUTH-LOGIN] Ensuring user terminal for account {request.account_number}...")
    term_success, term_error = await ensure_user_terminal(
        account_id=mt_account.id,
        user_id=mt_account.user_id,
        account_number=request.account_number,
        server=request.server,
        login_password=request.password,
        session=session
    )
    
    if not term_success:
        logger.error(f"[AUTH-LOGIN] Terminal authentication failed: {term_error}")
        
        # Distinguish between authorization failures and terminal availability issues
        error_str = str(term_error).lower()
        if any(x in error_str for x in ["authorization", "error -6", "invalid", "rejected"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MT5 account credentials or server. Verify account number, password, and server name."
            )
        elif any(x in error_str for x in ["terminal", "not available", "initialize"]):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MetaTrader5 is unavailable. Ensure MT5 is installed and configured properly."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Terminal initialization failed. Please check connection and try again."
            )
    
    logger.info(f"[AUTH-LOGIN] User terminal authenticated successfully for account {request.account_number}")
    
    # Create access token with role='user'
    access_token = create_access_token(
        data={
            "sub": mt_account.id,
            "account_id": mt_account.id,
            "account_number": request.account_number,
            "server": request.server,
            "role": "user"
        },
        expires_delta=timedelta(hours=8)
    )
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        account_id=mt_account.id,
        account_number=request.account_number,
        role="user"
    )


@router.post("/logout")
async def logout(account_id: str, session: Session = Depends(get_session)):
    """Logout from account and cleanup terminal resources"""
    logger.info(f"[AUTH-LOGOUT] Logging out account {account_id}...")
    
    # Terminate user terminal (kills process, marks DB record as offline)
    # This handles both user terminals and regular MT5 manager logout
    try:
        await terminate_user_terminal(account_id, session)
        logger.info(f"[AUTH-LOGOUT] User terminal terminated for account {account_id}")
    except Exception as e:
        logger.warning(f"[AUTH-LOGOUT] Terminal termination warning for {account_id}: {e}")
        # Continue with logout even if terminal cleanup fails
    
    # Also call mt5_manager logout for consistency (will return gracefully if no connection)
    try:
        await mt5_manager.logout(account_id)
    except Exception as e:
        logger.warning(f"[AUTH-LOGOUT] MT5 manager logout warning for {account_id}: {e}")
    
    logger.info(f"[AUTH-LOGOUT] Account {account_id} logged out successfully")
    return {"message": "Logged out successfully"}
