"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
import type { Difficulty, QuestionType, QuizMode } from "@/types/quiz";
import { DIFFICULTY_LABELS, MODE_LABELS, QUESTION_TYPE_LABELS } from "@/types/quiz";

const PRESETS = [5, 10, 20, 30] as const;

function OptionGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  columns = 2,
}: {
  legend: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "sm:grid-cols-2")}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
              value === option.value
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line bg-surface hover:border-accent/40",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function QuizConfig({
  courseId,
  llmReady,
  llmMessage,
}: {
  courseId: string;
  llmReady: boolean;
  llmMessage: string;
}) {
  const router = useRouter();

  const [preset, setPreset] = useState<number | "custom">(10);
  const [custom, setCustom] = useState(15);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [questionType, setQuestionType] = useState<QuestionType>("single");
  const [mode, setMode] = useState<QuizMode>("classic");
  const [timeLimit, setTimeLimit] = useState(15);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const numQuestions = preset === "custom" ? custom : preset;

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setWarnings([]);

    try {
      const response = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          numQuestions,
          difficulty,
          questionType,
          mode,
          ...(mode === "exam" ? { timeLimitMinutes: timeLimit } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { quizId: string; warnings?: string[]; error?: { message: string } }
        | null;

      if (!response.ok || !payload?.quizId) {
        setError(payload?.error?.message ?? "La génération a échoué.");
        return;
      }

      if (payload.warnings?.length) {
        // On laisse l'etudiante lire les avertissements avant de commencer.
        setWarnings(payload.warnings);
        setTimeout(() => router.push(`/quiz/${payload.quizId}`), 2500);
        return;
      }

      router.push(`/quiz/${payload.quizId}`);
    } catch {
      setError("Connexion au serveur impossible.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {!llmReady && (
        <Alert tone="warning" title="Fournisseur de génération non configuré">
          <p>{llmMessage}</p>
          <p className="mt-1">
            Renseignez <code>.env.local</code> (voir <code>.env.example</code>), puis relancez le
            serveur.
          </p>
        </Alert>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Nombre de questions</legend>
        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={preset === n}
              onClick={() => setPreset(n)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                preset === n
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-surface hover:border-accent/40",
              )}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={preset === "custom"}
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-lg border px-2 py-2.5 text-sm transition-colors",
              preset === "custom"
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line bg-surface hover:border-accent/40",
            )}
          >
            Autre
          </button>
        </div>

        {preset === "custom" && (
          <label className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-muted">Nombre souhaité (1 à 50)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={custom}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                setCustom(Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 1);
              }}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-center"
            />
          </label>
        )}
      </fieldset>

      <OptionGroup
        legend="Difficulté"
        value={difficulty}
        onChange={setDifficulty}
        options={(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((value) => ({
          value,
          label: DIFFICULTY_LABELS[value],
        }))}
      />

      <OptionGroup
        legend="Type de questions"
        value={questionType}
        onChange={setQuestionType}
        columns={1}
        options={(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((value) => ({
          value,
          label: QUESTION_TYPE_LABELS[value],
        }))}
      />

      <div>
        <OptionGroup
          legend="Mode"
          value={mode}
          onChange={setMode}
          columns={1}
          options={(Object.keys(MODE_LABELS) as QuizMode[]).map((value) => ({
            value,
            label: MODE_LABELS[value],
          }))}
        />

        {mode === "exam" && (
          <label className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-muted">Durée (minutes)</span>
            <input
              type="number"
              min={1}
              max={180}
              value={timeLimit}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                setTimeLimit(Number.isFinite(parsed) ? Math.min(180, Math.max(1, parsed)) : 1);
              }}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-center"
            />
          </label>
        )}
      </div>

      {error && <Alert tone="error" title="Génération impossible">{error}</Alert>}

      {warnings.length > 0 && (
        <Alert tone="warning" title="QCM généré avec des réserves">
          <ul className="list-disc space-y-1 pl-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <p className="mt-1">Ouverture du QCM…</p>
        </Alert>
      )}

      <Button size="lg" className="w-full" disabled={generating || !llmReady} onClick={generate}>
        {generating ? (
          <>
            <Spinner /> Génération en cours… (cela peut prendre une minute)
          </>
        ) : (
          <>
            <Sparkles className="size-4" /> Générer le QCM ({numQuestions} questions)
          </>
        )}
      </Button>
    </div>
  );
}
