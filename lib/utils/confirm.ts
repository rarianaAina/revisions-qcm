import { plural } from "./plural";

/**
 * Textes de confirmation des suppressions.
 *
 * Ils sont regroupés ici pour rester cohérents entre le tableau de bord et la
 * page d'un cours, et parce qu'ils doivent énoncer exactement ce qui disparaît
 * en cascade.
 */

export function quizDeleteQuestion(attemptCount: number): string {
  return attemptCount === 0
    ? "Supprimer ce QCM ?"
    : `Supprimer ce QCM et ${plural(attemptCount, "essai")} ?`;
}

export function courseDeleteQuestion(quizCount: number, attemptCount: number): string {
  if (quizCount === 0) return "Supprimer ce cours ?";
  if (attemptCount === 0) return `Supprimer ce cours et ${plural(quizCount, "QCM", "QCM")} ?`;
  return `Supprimer ce cours, ${plural(quizCount, "QCM", "QCM")} et ${plural(attemptCount, "essai")} ?`;
}
