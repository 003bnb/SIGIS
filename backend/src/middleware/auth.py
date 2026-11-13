import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from dotenv import load_dotenv

load_dotenv()

# Match your environment variable for JWT secret
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"

# Extracts the Bearer token from the Authorization header automatically
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Equivalent to authenticateToken middleware in Node.js"""
    token = credentials.credentials
    try:
        # Decode and verify the JWT token
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload  # This acts like req.user
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton invalide ou expiré.",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_role(*roles: str):
    """Equivalent to authorize(...roles) middleware in Node.js"""
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role")
        if not current_user or user_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accès interdit."
            )
        return current_user
    return role_checker