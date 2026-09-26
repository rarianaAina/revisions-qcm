/**
 * Types partages entre le serveur et le client.
 * Source de verite : le schema Zod de `lib/quiz/schema.ts` en est derive.
 */

export type Difficulty = "easy" | "medium" | "hard" | "mixed";
export type QuestionType = "single" | "multiple" | "mixed";
export type QuizMode = "classic" | "exam";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Facile",
  medium: "Moyen",
  hard: "Difficile",
  mixed: "Mixte",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "Une seule bonne réponse",
  multiple: "Plusieurs bonnes réponses",
  mixed: "Mélange des deux",
};

export const MODE_LABELS: Record<QuizMode, string> = {
  classic: "QCM classique",
  exam: "Mode examen (chronométré)",
};

export interface Choice {
  id: string; // "A" | "B" | "C" | "D"
  text: string;
}

export interface Question {
  id: number;
  question: string;
  choices: Choice[];
  correctAnswers: string[];
  explanation: string;
  sourcePage: number | null;
}

export interface Quiz {
  title: string;
  questions: Question[];
}

/** Question telle qu'envoyee au navigateur pendant la passation : sans la solution. */
export type PublicQuestion = Omit<Question, "correctAnswers" | "explanation">;

export interface QuizOptions {
  numQuestions: number;
  difficulty: Difficulty;
  questionType: QuestionType;
  mode: QuizMode;
  /** Duree en minutes, uniquement en mode examen. */
  timeLimitMinutes?: number;
}

/** Reponses de l'etudiante : id de question -> ids des choix coches. */
export type AnswerMap = Record<number, string[]>;

export interface QuestionResult {
  question: Question;
  selected: string[];
  isCorrect: boolean;
}

export interface QuizResult {
  score: number; // nombre de bonnes reponses
  total: number;
  percentage: number;
  wrong: number;
  durationSeconds: number | null;
  results: QuestionResult[];
}

/* --- Entites persistees --- */

export interface CourseSummary {
  id: string;
  name: string;
  fileName: string;
  numPages: number;
  numChars: number;
  createdAt: string;
  quizCount: number;
}

export interface Course extends CourseSummary {
  text: string;
}

export interface QuizSummary {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  numQuestions: number;
  mode: QuizMode;
  difficulty: Difficulty;
  createdAt: string;
  bestScore: number | null; // pourcentage du meilleur essai, null si jamais passe
  attemptCount: number;
}

export interface AttemptSummary {
  id: string;
  quizId: string;
  score: number;
  total: number;
  percentage: number;
  durationSeconds: number | null;
  createdAt: string;
}
