"""
Token authentication for MT5 Python server
Simple shared secret validation between Python server and Node backend
"""
import os
from typing import Optional
from logger import logger


class TokenAuth:
    """Token-based authentication helper"""
    
    def __init__(self, token_secret: Optional[str] = None):
        """
        Initialize token auth with shared secret
        
        Args:
            token_secret: Shared secret token. If None, reads from NODE_API_TOKEN env var
        """
        self.token_secret = token_secret or os.getenv(
            "NODE_API_TOKEN", 
            "default_insecure_token_change_this"
        )
        
        if len(self.token_secret) < 32:
            logger.warning(
                f"Token secret is only {len(self.token_secret)} chars. "
                "Recommend at least 32 chars for production."
            )
    
    def validate_token(self, token: str) -> bool:
        """
        Validate incoming token against shared secret
        
        Args:
            token: Token to validate
            
        Returns:
            True if token matches shared secret, False otherwise
        """
        if not token:
            logger.warning("Empty token provided")
            return False
        
        is_valid = token == self.token_secret
        
        if not is_valid:
            logger.warning(f"Invalid token attempt (first 10 chars): {token[:10]}...")
        
        return is_valid
    
    def get_token_for_header(self) -> str:
        """
        Get token formatted for X-API-Token header
        
        Returns:
            Token string ready for HTTP header
        """
        return self.token_secret


# Global auth instance
_auth_instance = None


def get_auth() -> TokenAuth:
    """Get or create global auth instance"""
    global _auth_instance
    if _auth_instance is None:
        _auth_instance = TokenAuth()
    return _auth_instance


def validate_api_token(token: str) -> bool:
    """Convenience function to validate token"""
    return get_auth().validate_token(token)


if __name__ == "__main__":
    auth = TokenAuth("test_token_12345678901234567890")
    print(f"Valid: {auth.validate_token('test_token_12345678901234567890')}")
    print(f"Invalid: {auth.validate_token('wrong_token')}")
