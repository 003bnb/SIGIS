const db = require('../config/db');
const { recordAudit } = require('../utils/audit');

const GRADE_TYPES = ['CC', 'EXAM', 'RATTRAPAGE'];

async function upsertGrade(req, res, next) {
  const { inscription_ue_id, type_evaluation, note, commentaire, verrouillee } = req.body || {};
  const parsedGrade = Number(note);
  if (!Number.isInteger(Number(inscription_ue_id)) || Number(inscription_ue_id) < 1 ||
      !GRADE_TYPES.includes(type_evaluation) || !Number.isFinite(parsedGrade) ||
      parsedGrade < 0 || parsedGrade > 20) {
    return res.status(400).json({ error: 'Inscription, type (CC/EXAM/RATTRAPAGE) ou note (0–20) invalide.' });
  }
  if (verrouillee !== undefined && typeof verrouillee !== 'boolean') {
    return res.status(400).json({ error: 'Le champ verrouillee doit être booléen.' });
  }

  try {
    const existing = await db.query(
      `SELECT id, verrouillee FROM notes WHERE inscription_ue_id = $1 AND type_evaluation = $2`,
      [inscription_ue_id, type_evaluation]
    );
    const current = existing.rows[0];
    if (current?.verrouillee && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Note verrouillée : seul un administrateur peut la modifier ou la déverrouiller.' });
    }

    const nextLocked = req.user.role === 'ADMIN' && typeof verrouillee === 'boolean' ? verrouillee : true;
    const lockedAt = nextLocked ? new Date().toISOString() : null;
    const lockedBy = nextLocked ? req.user.sub : null;

    const { rows } = await db.query(
      `INSERT INTO notes (inscription_ue_id, type_evaluation, note, commentaire, saisi_par, verrouillee, verrouillee_at, verrouillee_par, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (inscription_ue_id, type_evaluation)
       DO UPDATE SET note = EXCLUDED.note,
                     commentaire = EXCLUDED.commentaire,
                     saisi_par = EXCLUDED.saisi_par,
                     verrouillee = EXCLUDED.verrouillee,
                     verrouillee_at = EXCLUDED.verrouillee_at,
                     verrouillee_par = EXCLUDED.verrouillee_par,
                     updated_at = NOW()
       RETURNING id, inscription_ue_id, type_evaluation, note, verrouillee`,
      [inscription_ue_id, type_evaluation, parsedGrade, commentaire || null, req.user.sub, nextLocked, lockedAt, lockedBy]
    );
    await recordAudit({
      userId: req.user?.sub,
      action: 'GRADE_UPSERT',
      resourceType: 'note',
      resourceId: rows[0].id,
      details: {
        inscription_ue_id: rows[0].inscription_ue_id,
        type_evaluation: rows[0].type_evaluation,
        note: rows[0].note,
        verrouillee: rows[0].verrouillee
      },
      ipAddress: req.ip
    });
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
              MAX(n.note) FILTER (WHERE n.type_evaluation = 'EXAM') AS exam,
              MAX(n.note) FILTER (WHERE n.type_evaluation = 'RATTRAPAGE') AS rattrapage,
              BOOL_OR(n.verrouillee) FILTER (WHERE n.type_evaluation = 'CC') AS cc_verrouillee,
              BOOL_OR(n.verrouillee) FILTER (WHERE n.type_evaluation = 'EXAM') AS exam_verrouillee,
              BOOL_OR(n.verrouillee) FILTER (WHERE n.type_evaluation = 'RATTRAPAGE') AS rattrapage_verrouillee
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
      const rattrapage = row.rattrapage === null ? null : Number(row.rattrapage);
      const examComponent = [exam, rattrapage].filter((value) => value !== null);
      const examRetenu = examComponent.length ? Math.max(...examComponent) : null;
      let average = null;
      if (cc !== null && examRetenu !== null) average = (cc * 0.4) + (examRetenu * 0.6);
      else if (cc !== null) average = cc;
      else if (examRetenu !== null) average = examRetenu;
      const finalAverage = average === null ? null : Number(average.toFixed(2));
      return {
        ...row,
        ects: Number(row.ects),
        cc,
        exam,
        rattrapage,
        exam_retenu: examRetenu,
        average: finalAverage,
        validee: finalAverage !== null && finalAverage >= 10
      };
    });
    const gradedCourses = courses.filter((course) => course.average !== null);
    const ectsTotal = courses.reduce((sum, course) => sum + course.ects, 0);
    const ectsValidated = courses.reduce(
      (sum, course) => sum + (course.validee ? course.ects : 0), 0
    );
    const allGraded = courses.length > 0 && courses.every((course) => course.average !== null);
    const weightedAverage = allGraded
      ? courses.reduce((sum, course) => sum + course.average * course.ects, 0) /
        courses.reduce((sum, course) => sum + course.ects, 0)
      : null;
    const ectsRequired = 60;
    const anneeValidee = allGraded && ectsValidated >= ectsRequired;
    const decision = !allGraded ? 'EN_COURS' : (anneeValidee ? 'ADMIS' : 'REDOUBLEMENT');

    return res.json({
      student,
      courses,
      summary: {
        average: weightedAverage === null ? null : Number(weightedAverage.toFixed(2)),
        ects_total: ectsTotal,
        ects_validated: ectsValidated,
        ects_required: ectsRequired,
        annee_validee: anneeValidee,
        decision
      },
      calculation: 'Moyenne UE : CC × 40 % + meilleure note EXAM/RATTRAPAGE × 60 % (ou note disponible). UE validée si moyenne >= 10. Année validée si toutes les UE sont notées et ECTS validés >= 60 ; sinon redoublement. Moyenne générale pondérée par les ECTS, calculée uniquement lorsque chaque UE a au moins une note.'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { upsertGrade, transcript };
