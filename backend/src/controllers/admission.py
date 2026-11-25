from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, EmailStr, field_validator
from psycopg2.extras import RealDictCursor
from src.config.database import get_db_connection  # Adjust to match your DB connection helper
from src.utils.auth import require_role

router = APIRouter(prefix="/admissions", tags=["Admissions"])


# --- Request Schemas ---

class CandidateCreate(BaseModel):
    nom: str
    prenom: str
    email: EmailStr
    telephone: Optional[str] = None
    date_naissance: Optional[date] = None
    filiere_id: int
    niveau_souhaite: str
    annee_academique: str

    @field_validator("nom", "prenom", "niveau_souhaite", "annee_academique")
    @classmethod
    def must_not_be_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Champ obligatoire.")
        return value.strip()

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("filiere_id")
    @classmethod
    def positive_filiere_id(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Filière invalide.")
        return value


class CandidateStatusUpdate(BaseModel):
    statut: Literal["EN_ATTENTE", "ACCEPTE", "REFUSE"]
    notes_admin: Optional[str] = None


# --- Routes ---

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_candidate(payload: CandidateCreate, conn=Depends(get_db_connection)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO candidats
                   (nom, prenom, email, telephone, date_naissance, filiere_id, niveau_souhaite, annee_academique)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, nom, prenom, email, statut, created_at
                """,
                (
                    payload.nom,
                    payload.prenom,
                    payload.email,
                    payload.telephone,
                    payload.date_naissance,
                    payload.filiere_id,
                    payload.niveau_souhaite,
                    payload.annee_academique,
                ),
            )
            candidate = cur.fetchone()
        conn.commit()
        return {"candidate": dict(candidate)}
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def list_candidates(conn=Depends(get_db_connection)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT c.id, c.nom, c.prenom, c.email, c.telephone, c.niveau_souhaite,
                       c.annee_academique, c.statut, c.notes_admin, c.created_at,
                       f.nom AS filiere, e.numero_etudiant
                FROM candidats c
                LEFT JOIN filieres f ON f.id = c.filiere_id
                LEFT JOIN etudiants e ON e.candidat_id = c.id
                ORDER BY c.created_at DESC
                LIMIT 200
                """
            )
            rows = cur.fetchall()
        return {"candidates": [dict(row) for row in rows]}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.patch("/{candidate_id}/status", dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def update_candidate_status(
    payload: CandidateStatusUpdate,
    candidate_id: int = Path(..., ge=1),
    conn=Depends(get_db_connection),
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, nom, prenom, filiere_id, niveau_souhaite, annee_academique, statut
                FROM candidats
                WHERE id = %s
                FOR UPDATE
                """,
                (candidate_id,),
            )
            candidate = cur.fetchone()
            if not candidate:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Candidat introuvable.",
                )

            cur.execute(
                """
                SELECT id, numero_etudiant
                FROM etudiants
                WHERE candidat_id = %s
                """,
                (candidate_id,),
            )
            existing_student = cur.fetchone()

            if existing_student and payload.statut != "ACCEPTE":
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "error": "Un dossier étudiant existe déjà. Gérez son statut depuis la scolarité.",
                        "student": dict(existing_student),
                    },
                )

            if payload.statut == "ACCEPTE" and not candidate["filiere_id"]:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Une filière doit être associée à la candidature avant son acceptation.",
                )

            student = dict(existing_student) if existing_student else None
            if payload.statut == "ACCEPTE" and not student:
                academic_year = str(candidate["annee_academique"])[:4]
                student_number = f"SIG-{academic_year}-{str(candidate['id']).zfill(6)}"
                cur.execute(
                    """
                    INSERT INTO etudiants
                       (numero_etudiant, candidat_id, filiere_id, niveau, annee_academique)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, numero_etudiant
                    """,
                    (
                        student_number,
                        candidate["id"],
                        candidate["filiere_id"],
                        candidate["niveau_souhaite"],
                        candidate["annee_academique"],
                    ),
                )
                created_student = cur.fetchone()
                student = dict(created_student)

            cur.execute(
                """
                UPDATE candidats
                SET statut = %s, notes_admin = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING id, nom, prenom, email, statut, notes_admin
                """,
                (payload.statut, payload.notes_admin, candidate_id),
            )
            updated_candidate = cur.fetchone()

        conn.commit()
        return {"candidate": dict(updated_candidate), "student": student}
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )