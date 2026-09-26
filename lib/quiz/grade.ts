import type { AnswerMap, Question, QuestionResult, QuizResult } from "@/types/quiz";

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

/**
 * Correction stricte : une question compte juste uniquement si la selection
 * correspond exactement a l'ensemble des bonnes reponses (ni oubli, ni ajout).
 */
export function gradeQuiz(
  questions: Question[],
  answers: AnswerMap,
  durationSeconds: number | null = null,
): QuizResult {
  const results: QuestionResult[] = questions.map((question) => {
    const selected = [...(answers[question.id] ?? [])].sort();
    return {
      question,
      selected,
      isCorrect: selected.length > 0 && sameSet(selected, question.correctAnswers),
    };
  });

  const score = results.filter((r) => r.isCorrect).length;
  const total = questions.length;

  return {
    score,
    total,
    percentage: total === 0 ? 0 : Math.round((score / total) * 100),
    wrong: total - score,
    durationSeconds,
    results,
  };
}
