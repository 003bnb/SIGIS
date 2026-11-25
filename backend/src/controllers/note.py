from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, field_validator
from psycopg2.extras import RealDictCursor
from src.config.database import get_db_connection
from src.utils.auth import get_current_user, require_role

router = APIRouter(prefix="/notes", tags=["Notes & Évaluations"])


# --- Request Schema ---

class GradeUpsert(BaseModel):
    inscription_ue_id: int
    type_evaluation: Literal["CC", "EXAM"]
    note: float
    commentaire: Optional[str] = None

    @field_validator("inscription_ue_id")
    @classmethod
    def valid_inscription_id(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Inscription, type ou note (0–20) invalide.")
        return value

    @field_validator("note")
    @classmethod
    def valid_grade(cls, value: float) -> float:
        if value < 0 or value > 20:
            raise ValueError("Inscription, type ou note (0–20) invalide.")
        return value


# --- Routes ---

@router.post("/", status_code=status.HTTP_200_OK, dependencies=[Depends(require_role("ADMIN", "SCOLARITE"))])
def upsert_grade(
    payload: GradeUpsert,
    current_user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO notes (inscription_ue_id, type_evaluation, note, commentaire, saisi_par)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (inscription_ue_id, type_evaluation)
                DO UPDATE SET
                    note = EXCLUDED.note,
                    commentaire = EXCLUDED.commentaire,
                    saisi_par = EXCLUDED.saisi_par,
                    updated_at = NOW()
                RETURNING id, inscription_ue_id, type_evaluation, note
                """,
                (
                    payload.inscription_ue_id,
                    payload.type_evaluation,
                    payload.note,
                    payload.commentaire,
                    current_user.get("sub"),
                ),
            )
            grade = cur.fetchone()
        conn.commit()
        return {"grade": dict(grade)}
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )


@router.get("/student/{student_id}/transcript")
def transcript(
    student_id: int = Path(..., ge=1),
    current_user: dict = Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT e.id, e.utilisateur_id, e.numero_etudiant, e.niveau, e.annee_academique,
                       u.nom_complet, f.nom AS filiere
                FROM etudiants e
                LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
                JOIN filieres f ON f.id = e.filiere_id
                WHERE e.id = %s
                """,
                (student_id,),
            )
            student_row = cur.fetchone()
            if not student_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Dossier étudiant introuvable.",
                )

            if current_user.get("role") == "ETUDIANT":
                if str(current_user.get("sub")) != str(student_row["utilisateur_id"]):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Vous ne pouvez consulter que votre propre relevé.",
                    )

            cur.execute(
                """
                SELECT ue.id AS ue_id, ue.code, ue.intitule, ue.semestre, ue.ects,
                       ue.coefficient AS ue_coefficient,
                       i.id AS inscription_ue_id,
                       MAX(n.note) FILTER (WHERE n.type_evaluation = 'CC') AS cc,
                       MAX(n.note) FILTER (WHERE n.type_evaluation = 'EXAM') AS exam
                FROM inscriptions_ue i
                JOIN unites_enseignement ue ON ue.id = i.ue_id
                LEFT JOIN notes n ON n.inscription_ue_id = i.id
                WHERE i.etudiant_id = %s
                  AND i.annee_academique = (
                      SELECT annee_academique FROM etudiants WHERE id = %s
                  )
                GROUP BY ue.id, i.id
                ORDER BY ue.semestre, ue.code
                """,
                (student_id, student_id),
            )
            grade_rows = cur.fetchall()

        courses = []
        for row in grade_rows:
            cc = float(row["cc"]) if row["cc"] is not None else None
            exam = float(row["exam"]) if row["exam"] is not None else None

            if cc is not None and exam is not None:
                average = (cc * 0.4) + (exam * 0.6)
            elif cc is not None:
                average = cc
            elif exam is not None:
                average = exam
            else:
                average = None

            course_dict = dict(row)
            course_dict["ects"] = float(row["ects"]) if row["ects"] is not None else 0
            course_dict["cc"] = cc
            course_dict["exam"] = exam
            course_dict["average"] = round(average, 2) if average is not None else None
            courses.append(course_dict)

        graded_courses = [c for c in courses if c["average"] is not None]
        ects_total = sum(c["ects"] for c in courses)
        ects_validated = sum(c["ects"] for c in graded_courses if c["average"] >= 10)

        if graded_courses:
            total_ects_weight = sum(c["ects"] for c in graded_courses)
            weighted_average = (
                sum(c["average"] * c["ects"] for c in graded_courses) / total_ects_weight
                if total_ects_weight
                else None
            )
        else:
            weighted_average = None

        # Exclude internal utilisateur_id from returned student object if desired
        student_data = {k: v for k, v in student_row.items() if k != "utilisateur_id"}

        return {
            "student": student_data,
            "courses": courses,
            "summary": {
                "average": round(weighted_average, 2) if weighted_average is not None else None,
                "ects_total": ects_total,
                "ects_validated": ects_validated,
            },
            "calculation": (
                "Moyenne UE : CC × 40 % + examen × 60 % (ou note disponible). "
                "Moyenne générale pondérée par les ECTS."
            ),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )