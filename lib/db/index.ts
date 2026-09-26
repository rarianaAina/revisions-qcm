import { Pool } from "pg";
import type {
  AttemptSummary,
  Course,
  CourseSummary,
  Difficulty,
  Quiz,
  QuizMode,
  QuizOptions,
  QuizSummary,
} from "@/types/quiz";

/**
 * Persistance Postgres (Supabase, Neon, Vercel Postgres ou une base locale).
 * Tout l'accès aux données passe par ce module.
 */

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL n'est pas défini. Renseignez l'URL de connexion Postgres dans .env.local (voir .env.example).",
    );
  }

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);

  return new Pool({
    connectionString,
    // Les hébergeurs gérés (Supabase, Neon) imposent TLS, avec des certificats
    // que Node ne connaît pas toujours ; une base locale n'en a pas besoin.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    // En environnement serverless, chaque instance ne sert qu'un petit nombre
    // de requêtes simultanées : un pool étroit évite d'épuiser la base.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

// Next.js recharge les modules à chaud en développement, et réutilise
// l'instance entre invocations en production : le pool vit sur globalThis.
const globalForDb = globalThis as unknown as { __quizPool?: Pool };

function pool(): Pool {
  globalForDb.__quizPool ??= createPool();
  return globalForDb.__quizPool;
}

async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, values);
  return result.rows;
}

function newId(): string {
  return crypto.randomUUID();
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/* --- Cours --- */

interface CourseRow extends Record<string, unknown> {
  id: string;
  name: string;
  file_name: string;
  num_pages: number;
  num_chars: number;
  text: string;
  created_at: Date;
  quiz_count: string; // COUNT() revient en chaîne avec le driver pg
}

const COURSE_SELECT = `
  SELECT c.*, (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quiz_count
  FROM courses c
`;

function toCourseSummary(row: CourseRow): CourseSummary {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    numPages: row.num_pages,
    numChars: row.num_chars,
    createdAt: iso(row.created_at),
    quizCount: Number(row.quiz_count),
  };
}

export async function createCourse(input: {
  name: string;
  fileName: string;
  numPages: number;
  numChars: number;
  text: string;
}): Promise<CourseSummary> {
  const id = newId();
  const rows = await query<{ created_at: Date }>(
    `INSERT INTO courses (id, name, file_name, num_pages, num_chars, text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING created_at`,
    [id, input.name, input.fileName, input.numPages, input.numChars, input.text],
  );

  return { id, ...input, createdAt: iso(rows[0].created_at), quizCount: 0 };
}

export async function listCourses(): Promise<CourseSummary[]> {
  const rows = await query<CourseRow>(`${COURSE_SELECT} ORDER BY c.created_at DESC`);
  return rows.map(toCourseSummary);
}

export async function getCourse(id: string): Promise<Course | null> {
  const rows = await query<CourseRow>(`${COURSE_SELECT} WHERE c.id = $1`, [id]);
  if (rows.length === 0) return null;
  return { ...toCourseSummary(rows[0]), text: rows[0].text };
}

export async function deleteCourse(id: string): Promise<boolean> {
  const result = await pool().query("DELETE FROM courses WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/* --- QCM --- */

interface QuizRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  course_name: string;
  title: string;
  difficulty: string;
  question_type: string;
  mode: string;
  time_limit_minutes: number | null;
  data: Quiz; // colonne JSONB : déjà désérialisée par le driver
  created_at: Date;
  attempt_count: string;
  best_score: number | null;
}

const QUIZ_SELECT = `
  SELECT q.*, c.name AS course_name,
         (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id) AS attempt_count,
         (SELECT MAX(a.percentage) FROM attempts a WHERE a.quiz_id = q.id) AS best_score
  FROM quizzes q JOIN courses c ON c.id = q.course_id
`;

function toQuizSummary(row: QuizRow): QuizSummary {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    title: row.title,
    numQuestions: row.data.questions.length,
    mode: row.mode as QuizMode,
    difficulty: row.difficulty as Difficulty,
    createdAt: iso(row.created_at),
    bestScore: row.best_score,
    attemptCount: Number(row.attempt_count),
  };
}

export interface StoredQuiz extends QuizSummary {
  quiz: Quiz;
  timeLimitMinutes: number | null;
}

export async function createQuiz(
  courseId: string,
  quiz: Quiz,
  options: QuizOptions,
): Promise<string> {
  const id = newId();
  await query(
    `INSERT INTO quizzes
       (id, course_id, title, difficulty, question_type, mode, time_limit_minutes, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      courseId,
      quiz.title,
      options.difficulty,
      options.questionType,
      options.mode,
      options.mode === "exam" ? (options.timeLimitMinutes ?? null) : null,
      JSON.stringify(quiz),
    ],
  );
  return id;
}

export async function listQuizzes(courseId?: string): Promise<QuizSummary[]> {
  const rows = courseId
    ? await query<QuizRow>(`${QUIZ_SELECT} WHERE q.course_id = $1 ORDER BY q.created_at DESC`, [
        courseId,
      ])
    : await query<QuizRow>(`${QUIZ_SELECT} ORDER BY q.created_at DESC`);
  return rows.map(toQuizSummary);
}

export async function getQuiz(id: string): Promise<StoredQuiz | null> {
  const rows = await query<QuizRow>(`${QUIZ_SELECT} WHERE q.id = $1`, [id]);
  if (rows.length === 0) return null;
  return {
    ...toQuizSummary(rows[0]),
    quiz: rows[0].data,
    timeLimitMinutes: rows[0].time_limit_minutes,
  };
}

/* --- Essais --- */

interface AttemptRow extends Record<string, unknown> {
  id: string;
  quiz_id: string;
  answers: Record<string, string[]>;
  score: number;
  total: number;
  percentage: number;
  duration_seconds: number | null;
  created_at: Date;
}

export async function createAttempt(input: {
  quizId: string;
  answers: Record<number, string[]>;
  score: number;
  total: number;
  percentage: number;
  durationSeconds: number | null;
}): Promise<AttemptSummary> {
  const id = newId();
  const rows = await query<{ created_at: Date }>(
    `INSERT INTO attempts (id, quiz_id, answers, score, total, percentage, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING created_at`,
    [
      id,
      input.quizId,
      JSON.stringify(input.answers),
      input.score,
      input.total,
      input.percentage,
      input.durationSeconds,
    ],
  );

  return { id, ...input, createdAt: iso(rows[0].created_at) };
}

export async function getAttempt(
  id: string,
): Promise<(AttemptSummary & { answers: Record<number, string[]> }) | null> {
  const rows = await query<AttemptRow>("SELECT * FROM attempts WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  const row = rows[0];

  const answers: Record<number, string[]> = {};
  for (const [key, value] of Object.entries(row.answers)) {
    answers[Number(key)] = value;
  }

  return {
    id: row.id,
    quizId: row.quiz_id,
    answers,
    score: row.score,
    total: row.total,
    percentage: row.percentage,
    durationSeconds: row.duration_seconds,
    createdAt: iso(row.created_at),
  };
}

/**
 * La connexion directe de Supabase (db.<ref>.supabase.co) est joignable en
 * IPv6 uniquement, sauf option IPv4 payante. Or les fonctions Vercel sortent
 * en IPv4 : la connexion échoue systématiquement. Le pooler en mode
 * transaction, lui, est toujours en IPv4.
 */
function diagnoseConnection(message: string): string | null {
  const url = process.env.DATABASE_URL ?? "";
  const isSupabaseDirect = /@db\.[a-z0-9]+\.supabase\.co[:/]/i.test(url);
  const unreachable = /ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|Connection terminated|timeout/i.test(
    message,
  );

  if (isSupabaseDirect && unreachable) {
    return (
      "La connexion directe Supabase (db.….supabase.co) n'est accessible qu'en IPv6, " +
      "alors que Vercel sort en IPv4 : elle ne peut pas fonctionner ici. " +
      "Dans Supabase, cliquez sur Connect et prenez la chaîne « Transaction pooler » " +
      "(hôte …pooler.supabase.com, port 6543), puis redéployez."
    );
  }
  if (isSupabaseDirect) {
    return (
      "Vous utilisez la connexion directe Supabase. Sur Vercel, préférez la chaîne " +
      "« Transaction pooler » (port 6543). Erreur d'origine : " + message
    );
  }
  return null;
}

/** Vérifie que la base est joignable et que le schéma est en place. */
export async function databaseReady(): Promise<{ ok: boolean; message: string }> {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      ok: false,
      message:
        "DATABASE_URL n'est pas défini. Ajoutez-le dans .env.local, ou dans les variables d'environnement Vercel puis redéployez (les variables ne s'appliquent qu'aux nouveaux déploiements).",
    };
  }

  try {
    await query("SELECT 1 FROM courses LIMIT 1");
    return { ok: true, message: "Base de données connectée." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";

    if (/relation .* does not exist/i.test(message)) {
      return { ok: false, message: "Le schéma n'est pas créé. Lancez : npm run db:setup" };
    }
    if (/password authentication failed|SASL|SCRAM/i.test(message)) {
      return {
        ok: false,
        message:
          "Mot de passe refusé. Dans la chaîne de connexion, [YOUR-PASSWORD] doit être remplacé par le mot de passe de la base (Project Settings > Database).",
      };
    }

    const hint = diagnoseConnection(message);
    return { ok: false, message: hint ?? `Base de données injoignable : ${message}` };
  }
}
