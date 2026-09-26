import { getLLMProvider, LLMError } from "@/lib/llm";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/llm/prompt";
import type { Quiz, QuizOptions } from "@/types/quiz";
import { distributeQuestions, pickChunks, splitTextIntoChunks } from "./chunk";
import { QUIZ_JSON_SCHEMA } from "./json-schema";
import { validateQuiz } from "./schema";

export interface GenerationOutcome {
  quiz: Quiz;
  /** Anomalies non bloquantes, affichees a l'utilisatrice. */
  warnings: string[];
}

/** Budget de sortie : ~600 tokens par question, plus une marge fixe. */
function maxTokensFor(numQuestions: number): number {
  return Math.min(32_000, 2_000 + numQuestions * 600);
}

/**
 * Genere un QCM a partir du texte d'un cours.
 *
 * Si le cours est trop long pour un seul appel, il est decoupe et les
 * questions sont reparties sur les morceaux, puis reassemblees.
 */
export async function generateQuiz(text: string, options: QuizOptions): Promise<GenerationOutcome> {
  const source = text.trim();
  if (source.length < 300) {
    throw new LLMError(
      "Le cours est trop court pour générer un QCM pertinent (moins de 300 caractères de texte).",
      "ollama",
    );
  }

  const provider = getLLMProvider();
  const chunks = pickChunks(splitTextIntoChunks(source));
  const allocation = distributeQuestions(options.numQuestions, chunks.length);

  const warnings: string[] = [];
  const questions: Quiz["questions"] = [];
  let title: string | null = null;
  let lastError: unknown = null;

  for (let i = 0; i < allocation.length; i++) {
    const wanted = allocation[i];

    try {
      const raw = await provider.generateJSON({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt({
          text: chunks[i],
          numQuestions: wanted,
          difficulty: options.difficulty,
          questionType: options.questionType,
          avoidQuestions: questions.slice(-12).map((q) => q.question),
          chunkInfo: { index: i, total: allocation.length },
        }),
        jsonSchema: QUIZ_JSON_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: maxTokensFor(wanted),
      });

      const { quiz, rejected } = validateQuiz(raw, options.questionType);
      title ??= quiz.title;
      questions.push(...quiz.questions);

      if (rejected.length > 0) {
        warnings.push(
          `${rejected.length} question(s) écartée(s) car non conformes : ${rejected[0].message}.`,
        );
      }
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "erreur inconnue";
      warnings.push(
        allocation.length > 1
          ? `Partie ${i + 1}/${allocation.length} ignorée : ${message}`
          : message,
      );
    }
  }

  if (questions.length === 0) {
    if (lastError instanceof LLMError) throw lastError;
    throw new LLMError(
      `Aucune question n'a pu être générée. ${warnings[0] ?? ""}`.trim(),
      provider.id,
    );
  }

  // Deduplication finale entre morceaux, puis renumerotation continue.
  const seen = new Set<string>();
  const unique = questions.filter((q) => {
    const key = q.question.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const finalQuestions = unique
    .slice(0, options.numQuestions)
    .map((q, index) => ({ ...q, id: index + 1 }));

  if (finalQuestions.length < options.numQuestions) {
    warnings.push(
      `${finalQuestions.length} question(s) générée(s) sur les ${options.numQuestions} demandées : le cours ne contenait pas assez de matière exploitable.`,
    );
  }

  return {
    quiz: { title: title ?? "QCM", questions: finalQuestions },
    warnings,
  };
}
