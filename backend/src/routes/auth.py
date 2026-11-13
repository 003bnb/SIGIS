from fastapi import APIRouter, Depends
from src.utils.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login")
def login():
    # Logic for authentication / token generation
    return {"token": "jwt-token-here"}

@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    # Returns logged-in user details (equivalent to req.user)
    return current_user