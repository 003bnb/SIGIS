# Checklist d’exploitation SIGIS (repo)

Cette checklist couvre les points faisables dans le dépôt et les vérifications à réaliser avant mise en service. Les éléments d’infrastructure externe (hébergeur, DNS/TLS, coffre-fort de secrets, sauvegardes externalisées, supervision managée, conformité légale) doivent être traités dans l’environnement cible.

## Avant déploiement
- [ ] Copier `.env.example` vers `.env` et renseigner des secrets forts (`POSTGRES_PASSWORD`, `JWT_SECRET` long/aléatoire).
- [ ] Vérifier `FRONTEND_ORIGIN`, ports exposés et politique réseau/firewall.
- [ ] Vérifier que le volume `candidate_documents` est persistant et sauvegardé.
- [ ] Construire les images : `docker compose build`.
- [ ] Démarrer : `docker compose up -d`.
- [ ] Vérifier la santé : `curl http://localhost:8080/api/health`.

## Base existante
- [ ] Sauvegarder la base et l’archive documents avant migration.
- [ ] Appliquer les migrations dans l’ordre : `./scripts/apply-migrations.sh`.
- [ ] En cas d’erreur de contrainte, corriger les données existantes non conformes puis relancer la migration concernée.

## Sauvegarde / restauration
- [ ] Sauvegarde : `./scripts/backup.sh` (base + archive documents).
- [ ] Tester une restauration sur un environnement de validation : `./scripts/restore.sh <backup_db.sql.gz> <documents.tar.gz>`.
- [ ] Conserver les sauvegardes hors machine applicative selon la politique de l’organisation.

## Vérifications fonctionnelles minimales
- [ ] Connexion admin/scolarité/étudiant.
- [ ] Création de compte, désactivation, réinitialisation mot de passe, changement de mot de passe self-service.
- [ ] Dépôt de candidature avec diplôme PDF/JPEG/PNG <= 5 Mo, refus doublon email+année, téléchargement par rôle autorisé.
- [ ] Création UE, inscription UE (même programme/niveau, pas de doublon), saisie notes CC/EXAM/RATTRAPAGE.
- [ ] Verrouillage des notes : SCOLARITE bloqué sur note verrouillée, ADMIN peut déverrouiller/modifier.
- [ ] Relevé : moyenne UE avec best-of EXAM/RATTRAPAGE, décision EN_COURS/ADMIS/REDOUBLEMENT.

## CI / qualité
- [ ] Workflow GitHub Actions CI vert sur la branche/PR.
- [ ] Tests backend exécutés : `docker compose exec -T backend npm test`.

## Sécurité / exploitation (à compléter hors repo)
- [ ] TLS terminé au reverse proxy/load balancer.
- [ ] Secrets gérés par coffre-fort/plateforme, rotation définie.
- [ ] Journaux centralisés, alerting, supervision, sauvegardes externalisées.
- [ ] Revue RGPD/juridique : durées de conservation, accès, anonymisation/suppression, mentions légales.
