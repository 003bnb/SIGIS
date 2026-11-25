from datetime import datetime, timedelta, timezone
import os
from fastapi import APIRouter, Depends, HTTPException, status
import bcrypt
import jwt
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor
from src.config.database import get_db_connection
from src.utils.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key")
JWT_EXPIRES_IN = os.getenv("JWT_EXPIRES_IN", "8h")
ALGORITHM = "HS256"


# --- Request Schema ---

class LoginRequest(BaseModel):
    email: str
    password: str


# --- Helpers ---

def parse_expires_in(expires_value: str) -> timedelta:
    """Supports strings like '8h', '30m', '7d', or seconds as a string."""
    raw = str(expires_value).strip().lower()
    if raw.endswith("h") and raw[:-1].isdigit():
        return timedelta(hours=int(raw[:-1]))
    if raw.endswith("m") and raw[:-1].isdigit():
        return timedelta(minutes=int(raw[:-1]))
    if raw.endswith("d") and raw[:-1].isdigit():
        return timedelta(days=int(raw[:-1]))
    if raw.isdigit():
        return timedelta(seconds=int(raw))
    return timedelta(hours=8)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


# --- Routes ---

@router.post("/login")
def login(payload: LoginRequest, conn=Depends(get_db_connection)):
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email et mot de passe sont obligatoires.",
        )

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, nom_complet, email, mot_de_passe_hash, role
                FROM utilisateurs
                WHERE LOWER(email) = %s AND actif = TRUE
                """,
                (email,),
            )
            user = cur.fetchone()

        if not user or not verify_password(password, user["mot_de_passe_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Identifiants incorrects.",
            )

        now = datetime.now(timezone.utc)
        expires_delta = parse_expires_in(JWT_EXPIRES_IN)

        claims = {
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"],
            "name": user["nom_complet"],
            "iat": now,
            "exp": now + expires_delta,
        }
        token = jwt.encode(claims, JWT_SECRET, algorithm=ALGORITHM)

        return {
            "token": token,
            "user": {
                "id": user["id"],
                "nom_complet": user["nom_complet"],
                "email": user["email"],
                "role": user["role"],
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/me")
def me(
    current_user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    user_id = current_user.get("sub")
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, nom_complet, email, role
                FROM utilisateurs
                WHERE id = %s AND actif = TRUE
                """,
                (user_id,),
            )
            user = cur.fetchone()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Compte introuvable.",
            )

        return {"user": dict(user)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )