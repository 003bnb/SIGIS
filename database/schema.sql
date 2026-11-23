CREATE TABLE IF NOT EXISTS utilisateurs (
    id BIGSERIAL PRIMARY KEY,
    nom_complet VARCHAR(160) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    mot_de_passe_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'SCOLARITE', 'ETUDIANT')),
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS filieres (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    nom VARCHAR(120) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidats (
    id BIGSERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    telephone VARCHAR(30),
    date_naissance DATE,
    filiere_id BIGINT REFERENCES filieres(id) ON DELETE SET NULL,
    niveau_souhaite VARCHAR(30) NOT NULL CHECK (niveau_souhaite IN ('L1', 'L2', 'L3', 'M1', 'M2')),
    annee_academique VARCHAR(9) NOT NULL CHECK (
        CASE
            WHEN annee_academique ~ '^[1-9][0-9]{3}-[1-9][0-9]{3}$' THEN
                substring(annee_academique FROM 6 FOR 4)::integer =
                substring(annee_academique FROM 1 FOR 4)::integer + 1
            ELSE FALSE
        END
    ),
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE'
        CHECK (statut IN ('EN_ATTENTE', 'ACCEPTE', 'REFUSE')),
    notes_admin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidats_statut ON candidats(statut);
CREATE INDEX IF NOT EXISTS idx_candidats_email ON candidats(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidats_email_annee_unique
    ON candidats(LOWER(email), annee_academique);

CREATE TABLE IF NOT EXISTS pieces_candidature (
    id BIGSERIAL PRIMARY KEY,
    candidat_id BIGINT NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
    type_document VARCHAR(30) NOT NULL CHECK (type_document = 'DIPLOME'),
    storage_key UUID NOT NULL UNIQUE,
    nom_original VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    taille_octets INTEGER NOT NULL CHECK (taille_octets BETWEEN 1 AND 5242880),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (candidat_id, type_document)
);

CREATE TABLE IF NOT EXISTS etudiants (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL,
    numero_etudiant VARCHAR(30) NOT NULL UNIQUE,
    candidat_id BIGINT UNIQUE REFERENCES candidats(id) ON DELETE SET NULL,
    filiere_id BIGINT NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
    niveau VARCHAR(30) NOT NULL CHECK (niveau IN ('L1', 'L2', 'L3', 'M1', 'M2')),
    annee_academique VARCHAR(9) NOT NULL CHECK (
        CASE
            WHEN annee_academique ~ '^[1-9][0-9]{3}-[1-9][0-9]{3}$' THEN
                substring(annee_academique FROM 6 FOR 4)::integer =
                substring(annee_academique FROM 1 FOR 4)::integer + 1
            ELSE FALSE
        END
    ),
    date_inscription DATE NOT NULL DEFAULT CURRENT_DATE,
    statut VARCHAR(20) NOT NULL DEFAULT 'ACTIF'
        CHECK (statut IN ('ACTIF', 'SUSPENDU', 'DIPLOME', 'RADIE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etudiants_filiere ON etudiants(filiere_id);

CREATE TABLE IF NOT EXISTS unites_enseignement (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    intitule VARCHAR(180) NOT NULL,
    filiere_id BIGINT NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
    niveau VARCHAR(30) NOT NULL CHECK (niveau IN ('L1', 'L2', 'L3', 'M1', 'M2')),
    semestre SMALLINT NOT NULL CHECK (semestre BETWEEN 1 AND 10),
    ects NUMERIC(4, 1) NOT NULL CHECK (ects > 0),
    coefficient NUMERIC(5, 2) NOT NULL DEFAULT 1 CHECK (coefficient > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inscriptions_ue (
    id BIGSERIAL PRIMARY KEY,
    etudiant_id BIGINT NOT NULL REFERENCES etudiants(id) ON DELETE CASCADE,
    ue_id BIGINT NOT NULL REFERENCES unites_enseignement(id) ON DELETE RESTRICT,
    annee_academique VARCHAR(9) NOT NULL CHECK (
        CASE
            WHEN annee_academique ~ '^[1-9][0-9]{3}-[1-9][0-9]{3}$' THEN
                substring(annee_academique FROM 6 FOR 4)::integer =
                substring(annee_academique FROM 1 FOR 4)::integer + 1
            ELSE FALSE
        END
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (etudiant_id, ue_id, annee_academique)
);

CREATE INDEX IF NOT EXISTS idx_inscriptions_ue_etudiant
    ON inscriptions_ue(etudiant_id, annee_academique);

CREATE TABLE IF NOT EXISTS notes (
    id BIGSERIAL PRIMARY KEY,
    inscription_ue_id BIGINT NOT NULL REFERENCES inscriptions_ue(id) ON DELETE CASCADE,
    type_evaluation VARCHAR(10) NOT NULL CHECK (type_evaluation IN ('CC', 'EXAM')),
    note NUMERIC(4, 2) NOT NULL CHECK (note BETWEEN 0 AND 20),
    commentaire TEXT,
    saisi_par BIGINT REFERENCES utilisateurs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (inscription_ue_id, type_evaluation)
);

CREATE INDEX IF NOT EXISTS idx_notes_inscription ON notes(inscription_ue_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES utilisateurs(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id TEXT,
    details JSONB,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
