"""
Authentication API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from datetime import timedelta

from app.database import get_session
from app.models import User, MTAccount
from app.security import create_access_token, encrypt_password, decrypt_password
from app.services.mt5_adapter import mt5_manager

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Login request schema"""
    server: str
    account_number: int
    password: str


class LoginResponse(BaseModel):
    """Login response schema"""
    access_token: str
    token_type: str
    account_id: str
    account_number: int


class UserInfo(BaseModel):
    """User info schema"""
    id: str
    username: str
    email: str


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, session: Session = Depends(get_session)):
    """Login with MT5 credentials"""
    
    # Verify MT5 credentials
    success, error = await mt5_manager.login(request.server, request.account_number, request.password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid MT5 credentials: {error}"
        )
    
    # Get or create MT account record
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
    else:
        # Update password and last login
        mt_account.password_encrypted = encrypt_password(request.password)
        mt_account.is_active = True
        session.add(mt_account)
        session.commit()
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": mt_account.id,
            "account_id": mt_account.id,
            "account_number": request.account_number,
            "server": request.server
        },
        expires_delta=timedelta(hours=8)
    )
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        account_id=mt_account.id,
        account_number=request.account_number
    )


@router.post("/logout")
async def logout(account_id: str):
    """Logout from account"""
    await mt5_manager.logout(account_id)
    return {"message": "Logged out successfully"}
