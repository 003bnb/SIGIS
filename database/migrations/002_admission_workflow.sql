BEGIN;

CREATE UNIQUE INDEX idx_candidats_email_annee_unique
    ON candidats(LOWER(email), annee_academique);

CREATE TABLE pieces_candidature (
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

COMMIT;
