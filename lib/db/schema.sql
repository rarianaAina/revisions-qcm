-- =====================================================================
-- Révisions — schéma Postgres.
--
-- Deux façons de l'appliquer, au choix :
--   * npm run db:setup
--   * copier-coller dans Supabase : SQL Editor > New query > Run
--
-- Idempotent : réexécutable sans risque.
-- =====================================================================

-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS courses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  num_pages  INTEGER NOT NULL,
  num_chars  INTEGER NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id                 TEXT PRIMARY KEY,
  course_id          TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  difficulty         TEXT NOT NULL,
  question_type      TEXT NOT NULL,
  mode               TEXT NOT NULL,
  time_limit_minutes INTEGER,
  data               JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempts (
  id               TEXT PRIMARY KEY,
  quiz_id          TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  answers          JSONB NOT NULL,
  score            INTEGER NOT NULL,
  total            INTEGER NOT NULL,
  percentage       INTEGER NOT NULL,
  duration_seconds INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz  ON attempts(quiz_id);

-- ---------- Verrouillage de l'API publique ----------
--
-- Supabase expose automatiquement le schéma « public » via une API REST
-- accessible avec la clé « anon », qui est publique par nature.
-- L'application n'utilise PAS cette API : elle se connecte directement en
-- Postgres avec DATABASE_URL. On coupe donc totalement l'accès REST.
--
-- RLS activé SANS aucune policy = personne ne passe par l'API REST.
-- Le rôle « postgres » de DATABASE_URL est propriétaire des tables : sous
-- Postgres, le propriétaire n'est pas soumis à RLS (sauf FORCE ROW LEVEL
-- SECURITY, que l'on n'active pas). L'application continue donc de
-- fonctionner normalement.

ALTER TABLE courses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

-- Ceinture et bretelles : on retire aussi les droits accordés par défaut
-- aux rôles de l'API REST. Le test d'existence permet d'exécuter le même
-- script sur un Postgres ordinaire, où ces rôles n'existent pas.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON courses, quizzes, attempts FROM %I', r);
    END IF;
  END LOOP;
END $$;
