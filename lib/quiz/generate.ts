import { getLLMProviders, LLMError, type LLMProvider, type LLMRequest } from "@/lib/llm";
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

  const warnings: string[] = [];

  const providers = getLLMProviders();
  // Fournisseurs écartés pour la durée de cette génération : inutile de
  // relancer six fois un service dont le quota est déjà épuisé.
  const unavailable = new Set<string>();

  /**
   * Essaie les fournisseurs dans l'ordre. On ne passe au suivant que si le
   * précédent est hors service (quota, clé refusée, panne) — pas si le modèle
   * a simplement mal répondu, ce qui se reproduirait à l'identique.
   */
  async function callWithFallback(
    request: LLMRequest,
  ): Promise<{ raw: unknown; provider: LLMProvider }> {
    const candidates = providers.filter((p) => !unavailable.has(p.id));
    if (candidates.length === 0) {
      throw new LLMError(
        "Tous les fournisseurs configurés sont indisponibles (quota épuisé ou service en panne).",
        providers[0].id,
        { providerUnavailable: true },
      );
    }

    let lastUnavailable: LLMError | null = null;

    for (const candidate of candidates) {
      try {
        return { raw: await candidate.generateJSON(request), provider: candidate };
      } catch (error) {
        if (error instanceof LLMError && error.providerUnavailable) {
          unavailable.add(candidate.id);
          lastUnavailable = error;
          warnings.push(
            `${candidate.label} indisponible (${error.message}) — bascule vers le fournisseur suivant.`,
          );
          continue;
        }
        throw error;
      }
    }

    // Toute la chaîne y est passée : on le dit explicitement plutôt que de
    // remonter la seule erreur du dernier fournisseur essayé.
    const names = candidates.map((c) => c.label).join(", ");
    throw new LLMError(
      candidates.length > 1
        ? `Tous les fournisseurs sont indisponibles (${names}). Dernière erreur : ${lastUnavailable?.message ?? "inconnue"}`
        : (lastUnavailable?.message ?? "Aucun fournisseur disponible."),
      candidates[candidates.length - 1].id,
      { providerUnavailable: true },
    );
  }

  const chunks = pickChunks(splitTextIntoChunks(source));
  const allocation = distributeQuestions(options.numQuestions, chunks.length);

  const questions: Quiz["questions"] = [];
  let title: string | null = null;
  let lastError: unknown = null;

  for (let i = 0; i < allocation.length; i++) {
    const wanted = allocation[i];

    try {
      const { raw } = await callWithFallback({
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
      providers[0].id,
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
