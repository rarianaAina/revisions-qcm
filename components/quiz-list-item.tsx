import { RotateCw } from "lucide-react";
import Link from "next/link";
import { DeleteQuizButton } from "@/components/delete-quiz-button";
import { DIFFICULTY_LABELS, type QuizSummary } from "@/types/quiz";
import { formatDate } from "@/lib/utils/format";

/** Une ligne de QCM, partagée par le tableau de bord et la page d'un cours. */
export function QuizListItem({ quiz }: { quiz: QuizSummary }) {
  return (
    // Sur petit écran le titre occupe toute la largeur et les actions passent
    // dessous ; à partir de « sm » tout tient sur une ligne.
    <li className="rounded-lg border border-line bg-background p-3 sm:flex sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 sm:flex-1">
        <p className="truncate text-sm font-medium">{quiz.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {quiz.numQuestions} question{quiz.numQuestions > 1 ? "s" : ""} ·{" "}
          {DIFFICULTY_LABELS[quiz.difficulty]}
          {quiz.mode === "exam" && " · examen"} · {formatDate(quiz.createdAt)}
          {quiz.attemptCount > 0 &&
            ` · ${quiz.attemptCount} essai${quiz.attemptCount > 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2 sm:mt-0">
        {quiz.bestScore === null ? (
          <span className="text-xs text-muted">Jamais passé</span>
        ) : (
          <span
            className="text-sm font-semibold tabular-nums text-accent"
            title="Meilleur score obtenu"
          >
            {quiz.bestScore} %
          </span>
        )}

        <Link
          href={`/quiz/${quiz.id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent"
        >
          <RotateCw className="size-3.5" />
          {quiz.attemptCount > 0 ? "Refaire" : "Commencer"}
        </Link>

        <DeleteQuizButton
          quizId={quiz.id}
          title={quiz.title}
          attemptCount={quiz.attemptCount}
        />
      </div>
    </li>
  );
}
