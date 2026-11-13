from fastapi import APIRouter, Depends
from src.utils.auth import get_current_user, require_role

router = APIRouter(prefix="/scolarite", tags=["Scolarité"])

# Public route defined before role-restricted routes
@router.get("/programs")
def list_programs():
    return []

# Routes restricted to Admin or Scolarité
@router.get("/dashboard", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def dashboard():
    return {"stats": {}}

@router.get("/students", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def list_students():
    return []

@router.post("/students", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def create_student():
    return {"message": "Étudiant créé"}

@router.get("/students/{id}", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def get_student_file(id: int):
    return {"student_id": id}

@router.patch("/students/{id}", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def update_student(id: int):
    return {"message": f"Étudiant {id} mis à jour"}

# Route accessible by Admin, Scolarité, or Étudiant (matching your base middleware rule)
@router.get("/me/student", dependencies=[Depends(require_role("ADMIN", "SCOLARITE", "ETUDIANT"))])
def my_student_file(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}