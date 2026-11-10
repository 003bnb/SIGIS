const db = require('../config/db');

async function upsertGrade(req, res, next) {
  const { inscription_ue_id, type_evaluation, note, commentaire } = req.body || {};
  const parsedGrade = Number(note);
  if (!Number.isInteger(Number(inscription_ue_id)) || Number(inscription_ue_id) < 1 ||
      !['CC', 'EXAM'].includes(type_evaluation) || !Number.isFinite(parsedGrade) ||
      parsedGrade < 0 || parsedGrade > 20) {
    return res.status(400).json({ error: 'Inscription, type ou note (0–20) invalide.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO notes (inscription_ue_id, type_evaluation, note, commentaire, saisi_par)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (inscription_ue_id, type_evaluation)
       DO UPDATE SET note = EXCLUDED.note, commentaire = EXCLUDED.commentaire,
                     saisi_par = EXCLUDED.saisi_par,
                     updated_at = NOW()
       RETURNING id, inscription_ue_id, type_evaluation, note`,
      [inscription_ue_id, type_evaluation, parsedGrade, commentaire || null, req.user.sub]
    );
    return res.status(200).json({ grade: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function transcript(req, res, next) {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId < 1) {
    return res.status(400).json({ error: 'Identifiant étudiant invalide.' });
  }
  try {
    const studentResult = await db.query(
      `SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, u.nom_complet,
              f.nom AS filiere
       FROM etudiants e
       LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
       JOIN filieres f ON f.id = e.filiere_id
       WHERE e.id = $1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) return res.status(404).json({ error: 'Dossier étudiant introuvable.' });
    if (req.user.role === 'ETUDIANT' && Number(req.user.sub) !== Number(
      (await db.query('SELECT utilisateur_id FROM etudiants WHERE id = $1', [studentId])).rows[0].utilisateur_id
    )) {
      return res.status(403).json({ error: 'Vous ne pouvez consulter que votre propre relevé.' });
    }

    const gradesResult = await db.query(
      `SELECT ue.id AS ue_id, ue.code, ue.intitule, ue.semestre, ue.ects, ue.coefficient AS ue_coefficient,
              i.id AS inscription_ue_id,
              MAX(n.note) FILTER (WHERE n.type_evaluation = 'CC') AS cc,
              MAX(n.note) FILTER (WHERE n.type_evaluation = 'EXAM') AS exam
       FROM inscriptions_ue i
       JOIN unites_enseignement ue ON ue.id = i.ue_id
       LEFT JOIN notes n ON n.inscription_ue_id = i.id
       WHERE i.etudiant_id = $1
         AND i.annee_academique = (SELECT annee_academique FROM etudiants WHERE id = $1)
       GROUP BY ue.id, i.id
       ORDER BY ue.semestre, ue.code`,
      [studentId]
    );

    const courses = gradesResult.rows.map((row) => {
      const cc = row.cc === null ? null : Number(row.cc);
      const exam = row.exam === null ? null : Number(row.exam);
      let average = null;
      if (cc !== null && exam !== null) average = (cc * 0.4) + (exam * 0.6);
      else if (cc !== null) average = cc;
      else if (exam !== null) average = exam;
      return {
        ...row,
        ects: Number(row.ects),
        cc,
        exam,
        average: average === null ? null : Number(average.toFixed(2))
      };
    });
    const gradedCourses = courses.filter((course) => course.average !== null);
    const ectsTotal = courses.reduce((sum, course) => sum + course.ects, 0);
    const ectsValidated = gradedCourses.reduce(
      (sum, course) => sum + (course.average >= 10 ? course.ects : 0), 0
    );
    const weightedAverage = gradedCourses.length
      ? gradedCourses.reduce((sum, course) => sum + course.average * course.ects, 0) /
        gradedCourses.reduce((sum, course) => sum + course.ects, 0)
      : null;

    return res.json({
      student,
      courses,
      summary: {
        average: weightedAverage === null ? null : Number(weightedAverage.toFixed(2)),
        ects_total: ectsTotal,
        ects_validated: ectsValidated
      },
      calculation: 'Moyenne UE : CC × 40 % + examen × 60 % (ou note disponible). Moyenne générale pondérée par les ECTS.'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { upsertGrade, transcript };
