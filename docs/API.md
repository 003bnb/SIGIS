# Documentation API SIGIS

Base URL locale (via Nginx/Compose) : `http://localhost:8080/api`

Toutes les réponses sont en JSON sauf téléchargement de fichier (`GET /api/admission/:id/documents/diplome`).
Les routes protégées requièrent l’en-tête `Authorization: Bearer <jeton>` obtenu via `POST /api/auth/login`.

## Santé
- `GET /api/health` (public) — état de l’API et de la connexion base de données.

## Authentification
- `POST /api/auth/login` (public)
  - Corps JSON : `{ "email": string, "password": string }`
  - Réponse : `{ token, user: { id, nom_complet, email, role } }`
- `GET /api/auth/me` (authentifié)
  - Réponse : `{ user }`
- `POST /api/auth/change-password` (authentifié)
  - Corps JSON : `{ "current_password": string, "new_password": string (>=8, différent de l’actuel) }`
  - Réponse : `{ ok: true }`

## Comptes utilisateurs (ADMIN)
- `GET /api/users`
  - Réponse : `{ users: [...] }` (inclut liaison étudiant si présente)
- `POST /api/users`
  - Corps JSON : `{ "nom_complet": string, "email": string, "password": string (>=8), "role": "ADMIN"|"SCOLARITE"|"ETUDIANT", "actif"?: boolean }`
  - `201` : `{ user }`
- `PATCH /api/users/:id`
  - Corps JSON (au moins un champ) : `nom_complet`, `email`, `role`, `actif` (booléen), `password` (>=8), `etudiant_id` (id ou `null` pour délier)
  - `200` : `{ user }`

## Admission
- `GET /api/scolarite/programs` (public) — `{ programs }`
- `POST /api/admission` (public, `multipart/form-data`)
  - Champs : `nom`, `prenom`, `email`, `telephone?`, `date_naissance?`, `filiere_id`, `niveau_souhaite` (`L1..M2`), `annee_academique` (`YYYY-YYYY` consécutives), `diplome` (fichier obligatoire : PDF/JPEG/PNG, ≤ 5 Mo)
  - Règles : doublon refusé pour même email + année académique ; fichier stocké dans un volume privé.
  - `201` : `{ candidate }`
- `GET /api/admission` (ADMIN, SCOLARITE) — `{ candidates }`
- `GET /api/admission/:id/documents/diplome` (ADMIN, SCOLARITE) — téléchargement du fichier diplôme (`Content-Type` selon le document)
- `PATCH /api/admission/:id/status` (ADMIN, SCOLARITE ; correction d’une décision existante : ADMIN uniquement)
  - Corps JSON : `{ "statut": "EN_ATTENTE"|"ACCEPTE"|"REFUSE", "notes_admin"?: string }` (motif obligatoire si `REFUSE`)
  - Effets : création/réutilisation du dossier étudiant à l’acceptation ; passage à `RADIE` si une candidature acceptée est corrigée vers un autre statut ; ré-acceptation sans réactivation automatique du dossier `RADIE`.
  - `200` : `{ candidate, student }`

## Scolarité
- `GET /api/scolarite/dashboard` (ADMIN, SCOLARITE) — `{ indicators }`
- `GET /api/scolarite/students` (ADMIN, SCOLARITE) — `{ students }`
- `POST /api/scolarite/students` (ADMIN, SCOLARITE)
  - Corps JSON : `{ "numero_etudiant", "utilisateur_id"?, "filiere_id", "niveau", "annee_academique" }`
- `GET /api/scolarite/students/:id` (ADMIN, SCOLARITE) — `{ student }`
- `PATCH /api/scolarite/students/:id` (ADMIN, SCOLARITE)
  - Corps JSON : `filiere_id?`, `niveau?`, `annee_academique?`, `statut?` (`ACTIF|SUSPENDU|DIPLOME|RADIE`)
- `GET /api/scolarite/me/student` (authentifié) — `{ student }` du compte connecté

## Unités d’enseignement (UE)
- `GET /api/scolarite/courses` (ADMIN, SCOLARITE, ETUDIANT)
  - Filtres query : `filiere_id`, `niveau`, `semestre` (1-10)
  - Réponse : `{ courses }`
- `POST /api/scolarite/courses` (ADMIN, SCOLARITE)
  - Corps JSON : `{ "code", "intitule", "filiere_id", "niveau", "semestre", "ects", "coefficient"? }`
- `PATCH /api/scolarite/courses/:id` (ADMIN, SCOLARITE)
  - Corps JSON : champs modifiables parmi `code`, `intitule`, `filiere_id`, `niveau`, `semestre`, `ects`, `coefficient`

## Inscriptions aux UE
- `GET /api/scolarite/enrollments` (ADMIN, SCOLARITE)
  - Filtres query : `etudiant_id`, `annee_academique`
  - Réponse : `{ enrollments }`
- `GET /api/scolarite/me/enrollments` (authentifié, dossier étudiant requis) — `{ enrollments }`
- `POST /api/scolarite/enrollments` (ADMIN, SCOLARITE)
  - Corps JSON : `{ "etudiant_id", "ue_id", "annee_academique" }`
  - Règles : l’UE doit appartenir au même programme et au même niveau que l’étudiant ; une seule inscription par étudiant/UE/année académique.
- `DELETE /api/scolarite/enrollments/:id` (ADMIN, SCOLARITE) — `204`

## Notes et relevés
- `POST /api/notes` (ADMIN, SCOLARITE)
  - Corps JSON : `{ "inscription_ue_id", "type_evaluation": "CC"|"EXAM"|"RATTRAPAGE", "note": 0..20, "commentaire"?, "verrouillee"?: boolean (ADMIN) }`
  - Réponse : `{ grade }`
  - Règles : note verrouillée à la saisie ; SCOLARITE ne peut pas modifier une note verrouillée, ADMIN peut modifier/déverrouiller. Composante examen = meilleure note entre `EXAM` et `RATTRAPAGE` (best-of).
- `GET /api/notes/student/:studentId/transcript` (ADMIN, SCOLARITE, étudiant propriétaire)
  - Réponse : `{ student, courses, summary, calculation }`
  - Calcul : moyenne UE = CC×40% + meilleure note EXAM/RATTRAPAGE×60% (ou note disponible seule). UE validée si moyenne >= 10. Année validée si toutes les UE sont notées et ECTS validés >= 60 ; sinon `REDOUBLEMENT` (`EN_COURS` si notes incomplètes). Moyenne générale pondérée par les ECTS, calculée uniquement lorsque chaque UE a une moyenne.

## Codes d’erreur principaux
- `400` : données invalides/manquantes
- `401` : authentification requise ou jeton invalide/expiré
- `403` : accès interdit
- `404` : ressource introuvable
- `409` : conflit (doublon, contrainte d’unicité)
- `413` : fichier trop volumineux
- `500` : erreur interne
