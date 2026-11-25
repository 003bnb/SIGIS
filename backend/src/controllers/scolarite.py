from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, field_validator
from psycopg2.extras import RealDictCursor
from src.config.database import get_db_connection
from src.utils.auth import get_current_user, require_role

router = APIRouter(prefix="/scolarite", tags=["Scolarité"])


# --- Request Schemas ---

class StudentCreate(BaseModel):
    numero_etudiant: str
    utilisateur_id: Optional[int] = None
    filiere_id: int
    niveau: str
    annee_academique: str

    @field_validator("numero_etudiant", "niveau", "annee_academique")
    @classmethod
    def must_not_be_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Numéro étudiant, filière, niveau et année académique sont obligatoires.")
        return value.strip()

    @field_validator("filiere_id")
    @classmethod
    def valid_filiere_id(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Filière invalide.")
        return value


class StudentUpdate(BaseModel):
    filiere_id: Optional[int] = None
    niveau: Optional[str] = None
    annee_academique: Optional[str] = None
    statut: Optional[Literal["ACTIF", "SUSPENDU", "DIPLOME", "RADIE"]] = None

    @field_validator("filiere_id")
    @classmethod
    def valid_filiere_id(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value < 1:
            raise ValueError("Filière invalide.")
        return value

    @field_validator("niveau")
    @classmethod
    def valid_niveau(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("Le niveau ne peut pas être vide.")
        return value.strip() if value is not None else None

    @field_validator("annee_academique")
    @classmethod
    def valid_annee(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("L’année académique ne peut pas être vide.")
        return value.strip() if value is not None else None


# --- Routes ---

@router.get("/dashboard", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def dashboard(conn=Depends(get_db_connection)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                   (SELECT COUNT(*)::int FROM etudiants WHERE statut = 'ACTIF') AS etudiants_actifs,
                   (SELECT COUNT(*)::int FROM candidats WHERE statut = 'EN_ATTENTE') AS candidatures_en_attente,
                   (SELECT COUNT(*)::int FROM unites_enseignement) AS unites_enseignement,
                   (SELECT COUNT(*)::int FROM notes) AS notes_saisies
                """
            )
            row = cur.fetchone()
        return {"indicators": dict(row) if row else {}}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/students", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def list_students(conn=Depends(get_db_connection)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, e.statut,
                       u.nom_complet, u.email, f.nom AS filiere
                FROM etudiants e
                LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
                JOIN filieres f ON f.id = e.filiere_id
                ORDER BY e.numero_etudiant
                LIMIT 500
                """
            )
            rows = cur.fetchall()
        return {"students": [dict(r) for r in rows]}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.post("/students", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def create_student(payload: StudentCreate, conn=Depends(get_db_connection)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO etudiants (numero_etudiant, utilisateur_id, filiere_id, niveau, annee_academique)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, numero_etudiant, niveau, annee_academique, statut
                """,
                (
                    payload.numero_etudiant,
                    payload.utilisateur_id,
                    payload.filiere_id,
                    payload.niveau,
                    payload.annee_academique,
                ),
            )
            student = cur.fetchone()
        conn.commit()
        return {"student": dict(student)}
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/students/{student_id}", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def get_student_file(
    student_id: int = Path(..., ge=1),
    conn=Depends(get_db_connection),
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, e.date_inscription, e.statut,
                       u.nom_complet, u.email, f.nom AS filiere
                FROM etudiants e
                LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
                JOIN filieres f ON f.id = e.filiere_id
                WHERE e.id = %s
                """,
                (student_id,),
            )
            student = cur.fetchone()

        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dossier étudiant introuvable.",
            )
        return {"student": dict(student)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.patch("/students/{student_id}", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def update_student(
    payload: StudentUpdate,
    student_id: int = Path(..., ge=1),
    conn=Depends(get_db_connection),
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE etudiants
                SET filiere_id = COALESCE(%s, filiere_id),
                    niveau = COALESCE(%s, niveau),
                    annee_academique = COALESCE(%s, annee_academique),
                    statut = COALESCE(%s, statut)
                WHERE id = %s
                RETURNING id, numero_etudiant, filiere_id, niveau, annee_academique, statut
                """,
                (
                    payload.filiere_id,
                    payload.niveau,
                    payload.annee_academique,
                    payload.statut,
                    student_id,
                ),
            )
            student = cur.fetchone()

        if not student:
            conn.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dossier étudiant introuvable.",
            )

        conn.commit()
        return {"student": dict(student)}
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/programs")
def list_programs(conn=Depends(get_db_connection)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, code, nom FROM filieres ORDER BY nom")
            rows = cur.fetchall()
        return {"programs": [dict(r) for r in rows]}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/me/student", dependencies=[Depends(require_role("ADMIN", "SCOLARITE", "ETUDIANT"))])
def my_student_file(
    current_user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, e.statut,
                       u.nom_complet, u.email, f.nom AS filiere
                FROM etudiants e
                LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
                JOIN filieres f ON f.id = e.filiere_id
                WHERE e.utilisateur_id = %s
                """,
                (current_user.get("sub"),),
            )
            student = cur.fetchone()

        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aucun dossier étudiant associé à ce compte.",
            )
        return {"student": dict(student)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )