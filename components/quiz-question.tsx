"use client";

import { Check, X } from "lucide-react";
import { isAnswerLocked } from "@/lib/quiz/grade";
import { cn } from "@/lib/utils/cn";
import type { PublicQuestion, QuestionSolution } from "@/types/quiz";

export interface PlayableQuestion extends PublicQuestion {
  /** Nombre de bonnes réponses attendues — révèle le format, pas la solution. */
  expectedAnswers: number;
  /** Présente en mode classique seulement : active la correction immédiate. */
  solution?: QuestionSolution;
}

/** État d'une proposition une fois corrigée, en mode classique. */
type ChoiceFeedback = "right" | "wrong" | "missed" | "neutral";

const FEEDBACK_LABELS: Record<Exclude<ChoiceFeedback, "neutral">, string> = {
  right: "Bonne réponse",
  wrong: "Mauvaise réponse",
  missed: "Bonne réponse non cochée",
};

export function QuizQuestion({
  question,
  index,
  total,
  selected,
  onToggle,
}: {
  question: PlayableQuestion;
  index: number;
  total: number;
  selected: string[];
  onToggle: (choiceId: string) => void;
}) {
  const multiple = question.expectedAnswers > 1;
  const solution = question.solution;
  const locked = solution !== undefined && isAnswerLocked(solution.correctAnswers, selected);
  const isCorrect =
    solution !== undefined && locked && selected.every((id) => solution.correctAnswers.includes(id));

  // Chaque proposition cochée est corrigée tout de suite ; les bonnes réponses
  // manquantes ne sont révélées qu'au verrouillage de la question.
  const feedbackFor = (choiceId: string): ChoiceFeedback | null => {
    if (!solution) return null;
    const isRight = solution.correctAnswers.includes(choiceId);
    if (selected.includes(choiceId)) return isRight ? "right" : "wrong";
    if (locked && isRight) return "missed";
    return "neutral";
  };

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Question {index + 1} / {total}
      </p>

      <h2 className="mt-2 text-lg font-semibold leading-snug">{question.question}</h2>

      <p className="mt-1 text-xs text-muted">
        {multiple
          ? `Plusieurs bonnes réponses (${question.expectedAnswers} à cocher)`
          : "Une seule bonne réponse"}
        {solution && !locked && " — chaque clic est définitif"}
      </p>

      <div
        role={multiple ? "group" : "radiogroup"}
        aria-label="Propositions de réponse"
        className="mt-4 space-y-2"
      >
        {question.choices.map((choice) => {
          const isSelected = selected.includes(choice.id);
          const feedback = feedbackFor(choice.id);
          // Une proposition déjà corrigée ne se décoche pas : elle reste
          // focalisable mais n'est plus actionnable.
          const inactive = feedback !== null && (locked || isSelected);

          return (
            <button
              key={choice.id}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={isSelected}
              aria-disabled={inactive || undefined}
              onClick={() => {
                if (!inactive) onToggle(choice.id);
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3.5 text-left text-sm transition-colors",
                feedback === "right" && "border-success bg-success-soft",
                feedback === "wrong" && "border-danger bg-danger-soft",
                feedback === "missed" && "border-dashed border-success bg-surface",
                feedback === "neutral" &&
                  (locked
                    ? "border-line bg-surface opacity-60"
                    : "border-line bg-surface hover:border-accent/40"),
                feedback === null &&
                  (isSelected
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:border-accent/40"),
                inactive && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center border text-xs font-semibold",
                  multiple ? "rounded-md" : "rounded-full",
                  feedback === "right" && "border-success bg-success text-surface",
                  feedback === "wrong" && "border-danger bg-danger text-surface",
                  feedback === "missed" && "border-dashed border-success text-success",
                  (feedback === "neutral" || (feedback === null && !isSelected)) &&
                    "border-line text-muted",
                  feedback === null && isSelected && "border-accent bg-accent text-white",
                )}
                aria-hidden
              >
                {feedback === "right" || feedback === "missed" ? (
                  <Check className="size-3.5" />
                ) : feedback === "wrong" ? (
                  <X className="size-3.5" />
                ) : feedback === null && isSelected ? (
                  <Check className="size-3.5" />
                ) : (
                  choice.id
                )}
              </span>

              <span className="flex-1 pt-0.5">{choice.text}</span>

              {feedback !== null && feedback !== "neutral" && (
                <span
                  className={cn(
                    "shrink-0 pt-0.5 text-xs font-medium",
                    feedback === "wrong" ? "text-danger" : "text-success",
                  )}
                >
                  {FEEDBACK_LABELS[feedback]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Annonce du verdict aux lecteurs d'écran, et explication une fois verrouillée. */}
      <div aria-live="polite">
        {solution && locked && (
          <div
            className={cn(
              "mt-4 rounded-md border-l-4 p-3 text-sm",
              isCorrect ? "border-l-success bg-success-soft" : "border-l-danger bg-danger-soft",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-1.5 font-medium",
                isCorrect ? "text-success" : "text-danger",
              )}
            >
              {isCorrect ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <X className="size-4" aria-hidden />
              )}
              {isCorrect ? "Correct" : "Incorrect"}
            </p>
            <p className="mt-1 text-muted">{solution.explanation}</p>
            {question.sourcePage !== null && (
              <p className="mt-1.5 text-xs text-muted">
                Voir page {question.sourcePage} du cours.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
