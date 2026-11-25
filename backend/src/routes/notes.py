from fastapi import APIRouter, Depends
from src.utils.auth import get_current_user, require_role

router = APIRouter(prefix="/notes", tags=["Notes & Évaluations"])

@router.get("/student/{student_id}/transcript", dependencies=[Depends(get_current_user)])
def transcript(student_id: int):
    # Get student transcript (Any authenticated user)
    return {"student_id": student_id, "transcript": []}

@router.post("/", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def upsert_grade():
    # Add or update grades (Admin / Scolarité only)
    return {"message": "Note enregistrée"}