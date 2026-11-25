from fastapi import APIRouter, Depends
from src.utils.auth import get_current_user, require_role

router = APIRouter(prefix="/admissions", tags=["Admissions"])

@router.post("/")
def create_candidate():
    # Logic for submitting candidature (Public route)
    return {"message": "Candidature créée"}

@router.get("/", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def list_candidates():
    # Logic to list candidates (Restricted)
    return []

@router.patch("/{id}/status", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def update_candidate_status(id: int):
    # Logic to update status
    return {"message": f"Statut du candidat {id} mis à jour"}