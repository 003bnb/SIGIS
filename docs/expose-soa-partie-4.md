# Exposé SOA — Partie 4 : domaines d’application et cas pratique

## 1. Idée essentielle

Une architecture orientée services (SOA) organise un système en services métier autonomes. Chaque service expose des fonctions clairement définies par un contrat et communique avec les autres par des interfaces documentées, souvent des API ou des messages.

L’objectif n’est pas de découper une application en petits morceaux pour le principe : c’est de permettre à plusieurs applications ou équipes de réutiliser des capacités métier sans dépendre de leur implémentation interne.

## 2. Domaines d’application

- **Banque et assurance** : consulter un compte, vérifier un paiement, calculer une prime ou contrôler un dossier.
- **Commerce et distribution** : gérer le catalogue, les commandes, les stocks, la livraison et les paiements.
- **Santé** : échanger des informations entre prise de rendez-vous, dossier patient, laboratoire et facturation, avec des règles strictes de confidentialité.
- **Services publics** : relier des démarches administratives, l’identité, les paiements et les référentiels de plusieurs organismes.
- **Éducation** : faire coopérer admissions, scolarité, inscriptions pédagogiques, notes, paiement des frais et notifications.
- **Transport et logistique** : coordonner réservation, suivi des colis, disponibilité et facturation.

La SOA est particulièrement utile lorsqu’une organisation possède plusieurs applications qui doivent partager des processus ou des données. Elle nécessite toutefois une gouvernance des contrats, de la sécurité, des versions et de la disponibilité des services.

## 3. Cas pratique : ajouter le paiement mobile des frais de scolarité

### Situation initiale

Une université utilise une application de scolarité pour gérer les étudiants et les inscriptions. Le paiement des frais est traité manuellement. L’université veut accepter les paiements mobiles, puis pouvoir changer de fournisseur de paiement sans réécrire le module de scolarité.

### Proposition SOA

On expose un **Service de paiement** avec un contrat stable, par exemple :

- `POST /paiements` : demander le paiement d’une facture ;
- `GET /paiements/{reference}` : connaître son état ;
- événement `PaiementConfirme` ou `PaiementRefuse` : communiquer le résultat.

Le service de scolarité demande un paiement avec une référence de facture et le montant. Le Service de paiement dialogue avec le fournisseur mobile, vérifie le résultat et signale l’état final. La scolarité met alors à jour le dossier de l’étudiant. Les autres applications peuvent réutiliser le même service sans intégrer directement le fournisseur.

```text
Étudiant
   │ demande de paiement
   ▼
Service de scolarité ── API de paiement ──► Service de paiement
   ▲                                           │
   │ mise à jour après confirmation            ▼
   └──────────── événement ◄──────────── Fournisseur mobile
```

### Déroulement illustratif

1. L’étudiant choisit une facture à régler dans le portail.
2. Le portail demande à la scolarité de créer une demande de paiement avec une référence unique.
3. La scolarité appelle le Service de paiement, qui transmet la demande au fournisseur mobile.
4. Le fournisseur confirme ou refuse la transaction.
5. Le Service de paiement transmet le résultat ; la scolarité enregistre le statut et le portail l’affiche.

### Pourquoi ce découpage aide lors d’un changement

Si l’université adopte un autre fournisseur mobile, l’adaptation se fait principalement derrière le contrat du Service de paiement. La scolarité continue à utiliser les mêmes opérations. Si un autre canal est ajouté plus tard, comme le paiement par carte, il peut être intégré au service sans obliger chaque application consommatrice à connaître ce fournisseur.

Pour éviter les doubles débits, chaque demande doit porter une référence unique et le service doit traiter les répétitions de façon idempotente. Il faut également authentifier les appels, protéger les données, journaliser les changements d’état et prévoir les délais d’indisponibilité du fournisseur. Une confirmation de paiement et la mise à jour du dossier peuvent être asynchrones : le portail doit alors afficher un état « en attente » tant que le résultat n’est pas reçu.

## 4. Conclusion orale

La SOA permet de relier des applications autour de services métier réutilisables et de contrats explicites. Le paiement des frais universitaires illustre l’intérêt pratique : le système de scolarité peut accepter de nouveaux moyens de paiement sans dépendre directement de chaque fournisseur. Cette souplesse a un coût : il faut gérer sérieusement la sécurité, les erreurs, les versions et la cohérence entre services.
