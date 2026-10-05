"use client";

import { ChevronLeft, ChevronRight, Send, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProgressBar } from "@/components/progress-bar";
import type { PlayableQuestion } from "@/components/quiz-question";
import { QuizQuestion } from "@/components/quiz-question";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { isAnswerLocked } from "@/lib/quiz/grade";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import type { AnswerMap, QuizMode } from "@/types/quiz";

export interface PlayableQuiz {
  id: string;
  title: string;
  courseName: string;
  mode: QuizMode;
  timeLimitMinutes: number | null;
  questions: PlayableQuestion[];
}

export function QuizRunner({ quiz }: { quiz: PlayableQuiz }) {
  const router = useRouter();

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'horloge demarre a l'affichage, pas au rendu : Date.now() est impur.
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const isExam = quiz.mode === "exam" && quiz.timeLimitMinutes !== null;
  const limitSeconds = isExam ? quiz.timeLimitMinutes! * 60 : null;

  const question = quiz.questions[current];
  const answeredCount = useMemo(
    () => quiz.questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length,
    [answers, quiz.questions],
  );

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          answers,
          durationSeconds: Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { attemptId: string; error?: { message: string } }
        | null;

      if (!response.ok || !payload?.attemptId) {
        setError(payload?.error?.message ?? "L'envoi des réponses a échoué.");
        setSubmitting(false);
        return;
      }

      router.push(`/results/${payload.attemptId}`);
    } catch {
      setError("Connexion au serveur impossible.");
      setSubmitting(false);
    }
  }, [answers, quiz.id, router]);

  // Chronometre du mode examen : soumission automatique a l'expiration.
  // La soumission passe par une ref pour ne pas relancer l'intervalle a
  // chaque reponse cochee.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (!isExam) return;

    const interval = setInterval(() => {
      const seconds = Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000);
      setElapsed(seconds);
      if (limitSeconds !== null && seconds >= limitSeconds) {
        clearInterval(interval);
        void submitRef.current();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isExam, limitSeconds]);

  const toggle = (choiceId: string) => {
    setAnswers((previous) => {
      const selected = previous[question.id] ?? [];

      // Correction immediate : chaque clic est definitif. On ne decoche pas
      // une proposition deja corrigee, et une question verrouillee ne bouge plus.
      if (question.solution) {
        const locked = isAnswerLocked(question.solution.correctAnswers, selected);
        if (locked || selected.includes(choiceId)) return previous;
        return {
          ...previous,
          [question.id]: question.expectedAnswers > 1 ? [...selected, choiceId] : [choiceId],
        };
      }

      if (question.expectedAnswers > 1) {
        return {
          ...previous,
          [question.id]: selected.includes(choiceId)
            ? selected.filter((id) => id !== choiceId)
            : [...selected, choiceId],
        };
      }
      // Choix unique : re-cliquer sur la même proposition la deselectionne.
      return { ...previous, [question.id]: selected[0] === choiceId ? [] : [choiceId] };
    });
  };

  const isLast = current === quiz.questions.length - 1;
  const remaining = limitSeconds !== null ? Math.max(0, limitSeconds - elapsed) : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{quiz.title}</h1>
            <p className="truncate text-sm text-muted">{quiz.courseName}</p>
          </div>

          {remaining !== null && (
            <p
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium tabular-nums",
                remaining <= 60 ? "text-danger" : "text-muted",
              )}
              aria-live="polite"
            >
              <Timer className="size-4" />
              {formatDuration(remaining)}
            </p>
          )}
        </div>

        <div className="mt-3 space-y-1.5">
          <ProgressBar
            value={current + 1}
            max={quiz.questions.length}
            label={`Question ${current + 1} sur ${quiz.questions.length}`}
          />
          <p className="text-xs text-muted">
            {answeredCount} / {quiz.questions.length} question(s) répondue(s)
          </p>
        </div>
      </div>

      <Card>
        <QuizQuestion
          question={question}
          index={current}
          total={quiz.questions.length}
          selected={answers[question.id] ?? []}
          onToggle={toggle}
        />
      </Card>

      {error && <Alert tone="error" title="Envoi impossible">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          disabled={current === 0 || submitting}
          onClick={() => setCurrent((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="size-4" /> Précédent
        </Button>

        {isLast ? (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Spinner /> : <Send className="size-4" />}
            Terminer et corriger
          </Button>
        ) : (
          <Button onClick={() => setCurrent((i) => Math.min(quiz.questions.length - 1, i + 1))}>
            Suivant <ChevronRight className="size-4" />
          </Button>
        )}
      </div>

      {/* Navigation directe : utile pour revenir sur une question laissée de côté. */}
      <nav aria-label="Aller à une question" className="flex flex-wrap gap-1.5">
        {quiz.questions.map((q, index) => {
          const selected = answers[q.id] ?? [];
          const answered = selected.length > 0;
          // Correction immediate : une question verrouillee affiche son verdict.
          const verdict =
            q.solution && isAnswerLocked(q.solution.correctAnswers, selected)
              ? selected.every((id) => q.solution!.correctAnswers.includes(id))
              : null;
          const status =
            verdict === null ? (answered ? " (répondue)" : "") : verdict ? " (juste)" : " (fausse)";
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrent(index)}
              aria-label={`Question ${index + 1}${status}`}
              aria-current={index === current}
              className={cn(
                "size-8 rounded-md border text-xs font-medium transition-colors",
                index === current
                  ? "border-accent bg-accent text-white"
                  : verdict !== null
                    ? verdict
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-danger/40 bg-danger-soft text-danger"
                    : answered
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-line bg-surface text-muted hover:border-accent/40",
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
