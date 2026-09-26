import { z } from "zod";
import type { Quiz, QuestionType } from "@/types/quiz";

const CHOICE_IDS = ["A", "B", "C", "D"] as const;

export const choiceSchema = z.object({
  id: z.enum(CHOICE_IDS),
  text: z.string().trim().min(1, "Un choix ne peut pas être vide"),
});

export const questionSchema = z.object({
  id: z.number().int().positive(),
  question: z.string().trim().min(5, "Énoncé trop court"),
  choices: z.array(choiceSchema).length(4, "Il faut exactement 4 propositions"),
  correctAnswers: z.array(z.enum(CHOICE_IDS)).min(1, "Au moins une bonne réponse"),
  explanation: z.string().trim().min(1, "L'explication est obligatoire"),
  sourcePage: z.number().int().positive().nullable().catch(null),
});

export const quizSchema = z.object({
  title: z.string().trim().min(1),
  questions: z.array(questionSchema).min(1),
});

export type ParsedQuiz = z.infer<typeof quizSchema>;

export interface ValidationIssue {
  questionId: number | null;
  message: string;
}

/**
 * Regles metier que le schema Zod seul ne couvre pas.
 * On les verifie question par question pour pouvoir jeter les mauvaises
 * plutot que tout le lot.
 */
function questionIssues(
  q: ParsedQuiz["questions"][number],
  questionType: QuestionType,
): string[] {
  const issues: string[] = [];

  const ids = q.choices.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    issues.push("Identifiants de propositions dupliqués");
  }
  if (!CHOICE_IDS.every((id) => ids.includes(id))) {
    issues.push("Les propositions doivent être A, B, C et D");
  }

  const texts = q.choices.map((c) => c.text.toLowerCase().trim());
  if (new Set(texts).size !== texts.length) {
    issues.push("Deux propositions sont identiques");
  }

  const correct = new Set(q.correctAnswers);
  if (correct.size !== q.correctAnswers.length) {
    issues.push("Bonnes réponses dupliquées");
  }
  for (const id of correct) {
    if (!ids.includes(id)) {
      issues.push(`La bonne réponse ${id} ne correspond à aucune proposition`);
    }
  }
  if (correct.size === q.choices.length) {
    issues.push("Toutes les propositions sont correctes : question sans intérêt");
  }

  if (questionType === "single" && correct.size !== 1) {
    issues.push("Ce QCM attend exactement une bonne réponse par question");
  }
  if (questionType === "multiple" && correct.size < 2) {
    issues.push("Ce QCM attend au moins deux bonnes réponses par question");
  }

  return issues;
}

export interface QuizValidation {
  quiz: Quiz;
  rejected: ValidationIssue[];
}

/**
 * Valide la reponse brute du LLM et ne conserve que les questions exploitables.
 * Leve une erreur si la structure globale est invalide.
 */
export function validateQuiz(raw: unknown, questionType: QuestionType): QuizValidation {
  const parsed = quizSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "racine"} : ${i.message}`)
      .join(" ; ");
    throw new Error(`Le QCM renvoyé par le modèle est mal formé (${detail}).`);
  }

  const rejected: ValidationIssue[] = [];
  const kept: Quiz["questions"] = [];
  const seenQuestions = new Set<string>();

  for (const q of parsed.data.questions) {
    const issues = questionIssues(q, questionType);

    const fingerprint = q.question.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenQuestions.has(fingerprint)) {
      issues.push("Question en double");
    }

    if (issues.length > 0) {
      rejected.push({ questionId: q.id, message: issues.join(" ; ") });
      continue;
    }

    seenQuestions.add(fingerprint);
    kept.push({
      id: kept.length + 1, // renumerote proprement apres filtrage
      question: q.question,
      choices: q.choices,
      correctAnswers: [...q.correctAnswers].sort(),
      explanation: q.explanation,
      sourcePage: q.sourcePage,
    });
  }

  if (kept.length === 0) {
    throw new Error(
      "Aucune question valide n'a pu être extraite de la réponse du modèle.",
    );
  }

  return { quiz: { title: parsed.data.title, questions: kept }, rejected };
}
