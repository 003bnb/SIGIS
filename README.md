# SIGIS

SIGIS (Système Intégré de Gestion des Inscriptions et Scolarité) est une application web 3-tiers destinée au suivi des admissions, des dossiers étudiants, des unités d’enseignement et des résultats académiques.

## Architecture

- **Base de données** : PostgreSQL 16, schéma relationnel versionné dans `database/schema.sql`.
- **API** : Node.js 22, Express et PostgreSQL (`pg`), authentification JWT et contrôle d’accès par rôle.
- **Interface** : SPA HTML/CSS/JavaScript avec utilitaires Tailwind CSS, compilée dans l’image puis servie par Nginx. Nginx relaie `/api` vers le backend.
- **Orchestration** : Docker Compose avec contrôle de santé et volume persistant PostgreSQL.

L’interface utilise une feuille de style locale, sans CDN, afin de rester disponible sur un réseau isolé. Le build Tailwind est effectué dans l’image frontend.

## Prérequis

- Docker Engine récent et le plugin `docker compose` v2.
- Git.
- Ports `8080` (interface) et `5432` (PostgreSQL) libres par défaut.

Node.js et PostgreSQL installés localement ne sont pas requis.

## Démarrage local

Depuis la racine du dépôt :

```bash
cp .env.example .env
```

Modifiez au minimum `POSTGRES_PASSWORD` et `JWT_SECRET` dans `.env`. Pour générer un secret JWT robuste :

```bash
openssl rand -base64 48
```

Lancez les trois services :

```bash
./scripts/deploy.sh
```

Ou directement avec Docker Compose :

```bash
docker compose up --build -d
docker compose ps
```

Ouvrez [http://localhost:8080](http://localhost:8080). L’API est disponible à `http://localhost:8080/api`; son contrôle de santé est `GET /api/health`.
Les journaux se consultent avec `docker compose logs -f backend frontend db`.

Les scripts `schema.sql` et `seeds.sql` sont exécutés automatiquement par PostgreSQL uniquement lors de l’initialisation d’un volume de données vierge. Pour une base déjà initialisée, sauvegardez-la puis appliquez une seule fois les migrations dans l’ordre :

```bash
./scripts/apply-migrations.sh
# ou manuellement :
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/001_academic_validation.sql
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/002_admission_workflow.sql
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/003_audit_logs.sql
```

Les migrations refusent les données existantes qui ne respectent pas les contraintes (notamment les doublons email/année). Corrigez-les avant de les appliquer. Pour injecter à nouveau les données de démonstration dans la base courante :

```bash
./scripts/seed-db.sh
```

Ce script est réexécutable : les identifiants uniques de démonstration ne sont pas dupliqués. Les scripts d’initialisation Docker ne sont pas un mécanisme de migration ; toute évolution ultérieure du schéma devra faire l’objet de migrations explicites.

### Comptes de démonstration

Les comptes sont créés par `database/seeds.sql`. Le mot de passe de démonstration est `password` pour chacun :

| Rôle | Identifiant |
|---|---|
| Administration | `admin@sigis.local` |
| Scolarité | `scolarite@sigis.local` |
| Étudiant | `etudiant@sigis.local` |

Ces comptes et mots de passe sont réservés au développement local. Désactivez-les ou remplacez-les avant tout déploiement réel. Le formulaire de candidature public se trouve sur `/admission.html`.

## Fonctions incluses

- Authentification par email et mot de passe, jeton JWT expirant par défaut après 8 heures.
- Rôles `ADMIN`, `SCOLARITE` et `ETUDIANT`. Les actions de gestion et la saisie des notes sont limitées à l’administration et à la scolarité ; un étudiant ne consulte que son relevé.
- Dépôt public d’une candidature avec dernier diplôme obligatoire (PDF/JPEG/PNG, 5 Mo maximum), unicité de l’email par année académique, consultation des pièces réservée au personnel habilité et motif obligatoire en cas de refus. Une acceptation crée atomiquement un dossier étudiant et son numéro `SIG-<année>-<id>` ; l’opération est idempotente. Seul un administrateur peut corriger une décision déjà prise; une candidature acceptée corrigée vers un autre statut conserve son dossier, marqué `RADIE`.
- Tableau de bord : effectifs actifs, candidatures en attente, UE et notes saisies.
- Création et consultation des dossiers étudiants.
- Saisie et mise à jour des notes de contrôle continu (`CC`) et d’examen (`EXAM`).
- Relevé de notes avec moyenne d’UE `CC × 40 % + examen × 60 %` (une note disponible est affichée seule), puis moyenne générale pondérée uniquement par les ECTS. Le coefficient de l’UE n’intervient pas dans ce calcul. La moyenne générale reste indisponible tant qu’une UE inscrite n’a aucune note. Une UE est validée à partir de 10/20.
- Niveaux autorisés : `L1`, `L2`, `L3`, `M1`, `M2`. Les années académiques suivent le format `YYYY-YYYY` avec deux années consécutives, et les semestres sont numérotés de 1 à 10.

Le calcul s’effectue sur les inscriptions de l’année académique active du dossier étudiant. La pondération CC/examen est une règle de démonstration et doit être validée par l’établissement avant l’usage officiel. L’acceptation d’une candidature crée le dossier administratif, mais pas de compte de connexion étudiant : celui-ci doit être créé séparément.

## API principale

Toutes les réponses sont en JSON sauf le téléchargement de document (`GET /api/admission/:id/documents/diplome`). Les routes protégées prennent `Authorization: Bearer <jeton>`.

Documentation détaillée des endpoints : [docs/API.md](docs/API.md).

| Méthode | Route | Accès | Fonction |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Connexion et création du JWT |
| `GET` | `/api/auth/me` | Authentifié | Profil de l’utilisateur connecté |
| `POST` | `/api/auth/change-password` | Authentifié | Changer son mot de passe (mot de passe actuel requis) |
| `GET` | `/api/users` | Admin | Lister les comptes utilisateurs |
| `POST` | `/api/users` | Admin | Créer un compte (mot de passe ≥ 8 caractères) |
| `PATCH` | `/api/users/:id` | Admin | Modifier, activer/désactiver, réinitialiser le mot de passe ou lier/délier un dossier étudiant (`etudiant_id`) |
| `GET` | `/api/scolarite/programs` | Public | Liste des filières |
| `POST` | `/api/admission` | Public | Déposer une candidature en `multipart/form-data` avec le champ fichier obligatoire `diplome` |
| `GET` | `/api/admission` | Admin, Scolarité | Lister les candidatures |
| `GET` | `/api/admission/:id/documents/diplome` | Admin, Scolarité | Télécharger le diplôme |
| `PATCH` | `/api/admission/:id/status` | Admin, Scolarité en attente; Admin pour corriger | Décider d’une candidature en attente; motif obligatoire pour un refus |
| `GET` | `/api/scolarite/dashboard` | Admin, Scolarité | Indicateurs du tableau de bord |
| `GET` | `/api/scolarite/students` | Admin, Scolarité | Lister les dossiers étudiants |
| `POST` | `/api/scolarite/students` | Admin, Scolarité | Créer un dossier étudiant |
| `GET` | `/api/scolarite/students/:id` | Admin, Scolarité | Consulter un dossier |
| `PATCH` | `/api/scolarite/students/:id` | Admin, Scolarité | Mettre à jour la filière, le niveau, l’année ou le statut |
| `GET` | `/api/scolarite/me/student` | Authentifié | Dossier associé au compte connecté |
| `GET` | `/api/scolarite/courses` | Admin, Scolarité, Étudiant | Lister les unités d’enseignement (filtres `filiere_id`, `niveau`, `semestre`) |
| `POST` | `/api/scolarite/courses` | Admin, Scolarité | Créer une unité d’enseignement |
| `PATCH` | `/api/scolarite/courses/:id` | Admin, Scolarité | Modifier une unité d’enseignement |
| `GET` | `/api/scolarite/enrollments` | Admin, Scolarité | Lister les inscriptions aux UE (filtres `etudiant_id`, `annee_academique`) |
| `GET` | `/api/scolarite/me/enrollments` | Authentifié (étudiant) | Lister les inscriptions du dossier associé au compte connecté |
| `POST` | `/api/scolarite/enrollments` | Admin, Scolarité | Inscrire un étudiant à une UE |
| `DELETE` | `/api/scolarite/enrollments/:id` | Admin, Scolarité | Supprimer une inscription à une UE |
| `POST` | `/api/notes` | Admin, Scolarité | Créer ou mettre à jour une note |
| `GET` | `/api/notes/student/:studentId/transcript` | Admin, Scolarité, étudiant propriétaire | Relevé et agrégats ECTS |

## Vérification CI

Le workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) construit les services Docker (`db`, `backend`), attend la disponibilité de l’API, puis exécute `npm test` dans le conteneur backend. En cas d’échec, consultez les journaux du job GitHub Actions correspondant (étapes *Wait for backend health* et *Show logs on failure*).

## Sauvegarde et restauration

Une sauvegarde de la base PostgreSQL et une archive des pièces jointes sont créées dans `backups/`. Les deux fichiers doivent être conservés ensemble :

```bash
./scripts/backup.sh
# ou chemin explicite
./scripts/backup.sh /chemin/securise/sigis.dump
```

Restaurez un dump après confirmation interactive :

```bash
./scripts/restore.sh backups/sigis_20261109_120000.dump
```

La restauration remplace les objets de la base portant les mêmes noms et restaure les pièces jointes associées. Stockez les deux fichiers hors du serveur de l’application et testez périodiquement leur restauration.

## Tests

Avec les services démarrés, exécutez la suite d’intégration depuis le conteneur API :

```bash
docker compose exec backend npm test
```

Les tests exercent les parcours API et suppriment leurs données temporaires à la fin.

## Configuration

Les variables peuvent être définies dans `.env` (voir `.env.example`) :

| Variable | Valeur locale par défaut | Description |
|---|---|---|
| `POSTGRES_DB` | `sigis` | Base PostgreSQL |
| `POSTGRES_USER` | `sigis` | Compte PostgreSQL |
| `POSTGRES_PASSWORD` | `sigis-dev` dans Compose | Mot de passe DB |
| `POSTGRES_PORT` | `5432` | Port PostgreSQL exposé sur l’hôte |
| `FRONTEND_PORT` | `8080` | Port Nginx exposé sur l’hôte |
| `JWT_SECRET` | valeur de développement Compose | Secret JWT, au moins 32 caractères |
| `JWT_EXPIRES_IN` | `8h` | Durée de validité du JWT |
| `FRONTEND_ORIGIN` | `http://localhost:8080` | Origine autorisée par CORS |

Les valeurs par défaut Compose facilitent le premier démarrage, mais ne sont pas adaptées à un environnement partagé ou de production.

## Arrêt et données

```bash
docker compose down
```

Les données persistent dans le volume `postgres_data`. Ne supprimez pas ce volume pour arrêter l’application. Les images et données peuvent être reconstruites sans supprimer ce volume :

```bash
docker compose up --build -d
```

## Démarrage de l’équipe

Répartition initiale proposée pour l’onboarding, à ajuster selon les compétences et décisions de l’équipe :

| Membre | Sujet de prise en main |
|---|---|
| **Balawe** | Architecture, priorisation produit et validation des règles métier |
| **Kwembou** | API Express, authentification et autorisations RBAC |
| **Nguegni** | Modèle relationnel PostgreSQL, intégrité des données et migrations |
| **Habiba** | Parcours utilisateur, accessibilité et interface frontend |
| **Sanama** | Qualité, scénarios de recette, exploitation Docker et sauvegardes |

Pour toute contribution : créer une branche dédiée, documenter les changements de schéma, vérifier les rôles et les entrées de l’API, puis valider le parcours concerné sur Docker Compose avant revue.

## Règles métier à préciser

Certaines règles académiques ne sont pas encore spécifiées formellement et ne sont **pas inventées** dans l’implémentation actuelle (seules des validations techniques sûres sont appliquées : formats, plages, contraintes d’intégrité, contrôles d’accès, calculs de notes explicitement définis). À valider et implémenter avec le référent métier :

- **Passage / validation** : conditions de validation d’une UE, d’un semestre ou d’une année (seuils, compensation, ECTS requis, mentions).
- **Redoublement** : critères, conservation des crédits/notes, nombre de tentatives, impact sur les inscriptions et le statut étudiant.
- **Jury / décisions académiques** : processus, rôles, traçabilité des délibérations, décisions exceptionnelles et recours.
- **Parcours et inscriptions** : prérequis/co-requis entre UE, règles d’inscription par niveau/semestre/filière, capacité, périodes d’inscription.
- **Notes et évaluations** : barèmes particuliers, sessions de rattrapage, absence/dispense, arrondis officiels et verrouillage après validation.
- **Dossiers et comptes** : cycle de vie complet des comptes (invitation/activation/réinitialisation), pièces complémentaires exigibles, conservation/archivage des données (RGPD/réglementation locale).

## Sécurité et journalisation (socle)

- **Comptes** : endpoints ADMIN pour créer/lister/modifier les utilisateurs, activer/désactiver les comptes, réinitialiser les mots de passe (≥ 8 caractères) et lier/délier un dossier étudiant.
- **Journalisation d’audit** : table `audit_logs` (migration `003_audit_logs.sql`) et enregistrement des actions sensibles (gestion des comptes, décisions d’admission, saisie/mise à jour de notes) avec utilisateur, ressource, horodatage et adresse IP lorsque disponible.
- **Contrôles existants** : authentification JWT, RBAC, limitation de débit sur connexion/dépôt de candidature, en-têtes de sécurité (`helmet`), validation des entrées et contraintes d’intégrité en base.

## Limites avant production

Cette base constitue un socle de démarrage, pas un déploiement institutionnel prêt à accueillir des données réelles. Avant production, prévoir notamment TLS derrière un reverse proxy, secrets gérés hors dépôt, politique de rotation/révocation des clés, sauvegardes externalisées, migrations contrôlées et testées, supervision/alerting, durcissement complet des politiques de mots de passe/sessions, protection RGPD/rétention des données, et validation formelle des règles métier et du calcul des notes. Les données seed sont fictives.
