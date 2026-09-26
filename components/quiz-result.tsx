import { Check, X } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import type { QuizResult } from "@/types/quiz";

function encouragement(percentage: number): string {
  if (percentage >= 90) return "Excellent — le cours est maîtrisé.";
  if (percentage >= 70) return "Bon résultat. Revoyez les points manqués ci-dessous.";
  if (percentage >= 50) return "Les bases sont là, mais il reste du travail.";
  return "Ce chapitre mérite une relecture avant de refaire un QCM.";
}

export function QuizResultView({
  result,
  title,
  quizId,
  courseId,
}: {
  result: QuizResult;
  title: string;
  quizId: string;
  courseId: string;
}) {
  return (
    <div className="space-y-6">
      <Card className="text-center">
        <p className="text-sm text-muted">{title}</p>

        <p className="mt-2 text-5xl font-bold tabular-nums text-accent">{result.percentage} %</p>
        <p className="mt-1 text-lg font-medium">
          Score : {result.score} / {result.total}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-muted">
          <span>{result.score} bonne(s) réponse(s)</span>
          <span>{result.wrong} erreur(s)</span>
          <span>{result.total} question(s)</span>
          {result.durationSeconds !== null && (
            <span>Temps : {formatDuration(result.durationSeconds)}</span>
          )}
        </div>

        <p className="mt-4 text-sm">{encouragement(result.percentage)}</p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href={`/quiz/${quizId}`}
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Refaire ce QCM
          </Link>
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent"
          >
            Nouveau QCM sur ce cours
          </Link>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Correction détaillée</h2>

        {result.results.map(({ question, selected, isCorrect }, index) => (
          <Card
            key={question.id}
            className={cn("border-l-4", isCorrect ? "border-l-success" : "border-l-danger")}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                  isCorrect ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
                aria-hidden
              >
                {isCorrect ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Question {index + 1} — {isCorrect ? "correct" : "incorrect"}
                </p>
                <p className="mt-1 font-medium">{question.question}</p>

                <ul className="mt-3 space-y-1.5">
                  {question.choices.map((choice) => {
                    const isRight = question.correctAnswers.includes(choice.id);
                    const wasChosen = selected.includes(choice.id);
                    return (
                      <li
                        key={choice.id}
                        className={cn(
                          "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm",
                          isRight && "bg-success-soft",
                          !isRight && wasChosen && "bg-danger-soft",
                        )}
                      >
                        <span className="font-semibold">{choice.id}.</span>
                        <span className="flex-1">{choice.text}</span>
                        {isRight && (
                          <span className="shrink-0 text-xs font-medium text-success">
                            bonne réponse
                          </span>
                        )}
                        {!isRight && wasChosen && (
                          <span className="shrink-0 text-xs font-medium text-danger">
                            votre réponse
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {selected.length === 0 && (
                  <p className="mt-2 text-sm text-muted">Aucune réponse donnée.</p>
                )}

                <div className="mt-3 rounded-md bg-accent-soft p-3 text-sm">
                  <p className="font-medium">Explication</p>
                  <p className="mt-1 text-muted">{question.explanation}</p>
                  {question.sourcePage !== null && (
                    <p className="mt-1.5 text-xs text-muted">
                      Voir page {question.sourcePage} du cours.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
