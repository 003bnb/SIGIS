BEGIN;

ALTER TABLE candidats
    ADD CONSTRAINT ck_candidats_niveau
        CHECK (niveau_souhaite IN ('L1', 'L2', 'L3', 'M1', 'M2')),
    ADD CONSTRAINT ck_candidats_annee_academique
        CHECK (
            CASE
                WHEN annee_academique ~ '^[1-9][0-9]{3}-[1-9][0-9]{3}$' THEN
                    substring(annee_academique FROM 6 FOR 4)::integer =
                    substring(annee_academique FROM 1 FOR 4)::integer + 1
                ELSE FALSE
            END
        );

ALTER TABLE etudiants
    ADD CONSTRAINT ck_etudiants_niveau
        CHECK (niveau IN ('L1', 'L2', 'L3', 'M1', 'M2')),
    ADD CONSTRAINT ck_etudiants_annee_academique
        CHECK (
            CASE
                WHEN annee_academique ~ '^[1-9][0-9]{3}-[1-9][0-9]{3}$' THEN
                    substring(annee_academique FROM 6 FOR 4)::integer =
                    substring(annee_academique FROM 1 FOR 4)::integer + 1
                ELSE FALSE
            END
        );

ALTER TABLE unites_enseignement
    ADD CONSTRAINT ck_unites_enseignement_niveau
        CHECK (niveau IN ('L1', 'L2', 'L3', 'M1', 'M2')),
    ADD CONSTRAINT ck_unites_enseignement_semestre
        CHECK (semestre BETWEEN 1 AND 10);

ALTER TABLE inscriptions_ue
    ADD CONSTRAINT ck_inscriptions_ue_annee_academique
        CHECK (
            CASE
                WHEN annee_academique ~ '^[1-9][0-9]{3}-[1-9][0-9]{3}$' THEN
                    substring(annee_academique FROM 6 FOR 4)::integer =
                    substring(annee_academique FROM 1 FOR 4)::integer + 1
                ELSE FALSE
            END
        );

COMMIT;
