"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PublicQuestion } from "@/types/quiz";

export interface PlayableQuestion extends PublicQuestion {
  /** Nombre de bonnes réponses attendues — révèle le format, pas la solution. */
  expectedAnswers: number;
}

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
      </p>

      <div
        role={multiple ? "group" : "radiogroup"}
        aria-label="Propositions de réponse"
        className="mt-4 space-y-2"
      >
        {question.choices.map((choice) => {
          const isSelected = selected.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={isSelected}
              onClick={() => onToggle(choice.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3.5 text-left text-sm transition-colors",
                isSelected
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface hover:border-accent/40",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center border text-xs font-semibold",
                  multiple ? "rounded-md" : "rounded-full",
                  isSelected
                    ? "border-accent bg-accent text-white"
                    : "border-line text-muted",
                )}
              >
                {isSelected ? <Check className="size-3.5" /> : choice.id}
              </span>
              <span className="pt-0.5">{choice.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
