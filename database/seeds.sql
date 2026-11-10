INSERT INTO utilisateurs (nom_complet, email, mot_de_passe_hash, role)
VALUES
    ('Administrateur SIGIS', 'admin@sigis.local',
     '$2b$10$6ku/8g7aUFl6HFcw9NiS8.9lhfEMmzyN8A334Hg6RkCsqrCgmmz6y', 'ADMIN'),
    ('Agent Scolarité', 'scolarite@sigis.local',
     '$2b$10$6ku/8g7aUFl6HFcw9NiS8.9lhfEMmzyN8A334Hg6RkCsqrCgmmz6y', 'SCOLARITE'),
    ('Amina Etudiant', 'etudiant@sigis.local',
     '$2b$10$6ku/8g7aUFl6HFcw9NiS8.9lhfEMmzyN8A334Hg6RkCsqrCgmmz6y', 'ETUDIANT')
ON CONFLICT (email) DO NOTHING;

INSERT INTO filieres (code, nom, description)
VALUES
    ('INFO', 'Informatique', 'Développement logiciel et systèmes d’information'),
    ('GEST', 'Gestion', 'Management, comptabilité et administration'),
    ('RESEAUX', 'Réseaux et Télécommunications', 'Infrastructures et télécommunications')
ON CONFLICT (code) DO NOTHING;

INSERT INTO candidats (nom, prenom, email, telephone, filiere_id, niveau_souhaite, annee_academique, statut)
SELECT 'Mbuyi', 'Junior', 'junior.mbuyi@example.test', '+237600000001', f.id, 'L1', '2026-2027', 'EN_ATTENTE'
FROM filieres f WHERE f.code = 'INFO'
  AND NOT EXISTS (SELECT 1 FROM candidats c WHERE c.email = 'junior.mbuyi@example.test' AND c.annee_academique = '2026-2027');

INSERT INTO etudiants (utilisateur_id, numero_etudiant, filiere_id, niveau, annee_academique)
SELECT u.id, 'SIG-2026-001', f.id, 'L2', '2026-2027'
FROM utilisateurs u CROSS JOIN filieres f
WHERE u.email = 'etudiant@sigis.local' AND f.code = 'INFO'
  AND NOT EXISTS (SELECT 1 FROM etudiants e WHERE e.numero_etudiant = 'SIG-2026-001');

INSERT INTO etudiants (numero_etudiant, filiere_id, niveau, annee_academique)
SELECT 'SIG-2026-002', f.id, 'L2', '2026-2027'
FROM filieres f
WHERE f.code = 'INFO'
  AND NOT EXISTS (SELECT 1 FROM etudiants e WHERE e.numero_etudiant = 'SIG-2026-002');

INSERT INTO unites_enseignement (code, intitule, filiere_id, niveau, semestre, ects, coefficient)
SELECT v.code, v.intitule, f.id, v.niveau, v.semestre, v.ects, v.coefficient
FROM (VALUES
    ('INFO-L2-ALGO', 'Algorithmique avancée', 'L2', 3, 5.0, 2.0),
    ('INFO-L2-BDD', 'Bases de données', 'L2', 3, 5.0, 2.0),
    ('INFO-L2-WEB', 'Développement web', 'L2', 3, 4.0, 1.5)
) AS v(code, intitule, niveau, semestre, ects, coefficient)
CROSS JOIN filieres f
WHERE f.code = 'INFO'
ON CONFLICT (code) DO NOTHING;

INSERT INTO inscriptions_ue (etudiant_id, ue_id, annee_academique)
SELECT e.id, ue.id, '2026-2027'
FROM etudiants e
CROSS JOIN unites_enseignement ue
WHERE e.numero_etudiant IN ('SIG-2026-001', 'SIG-2026-002')
  AND ue.code IN ('INFO-L2-ALGO', 'INFO-L2-BDD', 'INFO-L2-WEB')
ON CONFLICT (etudiant_id, ue_id, annee_academique) DO NOTHING;

INSERT INTO notes (inscription_ue_id, type_evaluation, note)
SELECT i.id, v.type_evaluation, v.note
FROM (VALUES
    ('SIG-2026-001', 'INFO-L2-ALGO', 'CC', 15.0),
    ('SIG-2026-001', 'INFO-L2-ALGO', 'EXAM', 16.0),
    ('SIG-2026-001', 'INFO-L2-BDD', 'CC', 14.0),
    ('SIG-2026-001', 'INFO-L2-BDD', 'EXAM', 13.0),
    ('SIG-2026-001', 'INFO-L2-WEB', 'CC', 17.0),
    ('SIG-2026-001', 'INFO-L2-WEB', 'EXAM', 16.0)
) AS v(numero_etudiant, code_ue, type_evaluation, note)
JOIN etudiants e ON e.numero_etudiant = v.numero_etudiant
JOIN unites_enseignement ue ON ue.code = v.code_ue
JOIN inscriptions_ue i ON i.etudiant_id = e.id AND i.ue_id = ue.id
ON CONFLICT (inscription_ue_id, type_evaluation) DO NOTHING;
