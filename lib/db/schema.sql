-- Schéma Postgres. Idempotent : exécutable autant de fois que nécessaire.
-- Appliqué par « npm run db:setup ».

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
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
