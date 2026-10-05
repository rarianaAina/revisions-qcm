"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format";
import { ExtractionError, MAX_FILE_BYTES, extractPdf } from "@/lib/pdf/extract";
import type { CourseSummary } from "@/types/quiz";

type Phase = "idle" | "extracting" | "saving" | "done" | "error";

export function PdfUpload({
  onUploaded,
}: {
  onUploaded: (course: CourseSummary, preview: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  // Détail technique de l'échec de lecture, à transmettre tel quel (capture d'écran).
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPhase("idle");
    setProgress({ done: 0, total: 0 });
    setError(null);
    setDiagnostic(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handle = useCallback(
    async (candidate: File) => {
      setFile(candidate);
      setError(null);
      setDiagnostic(null);
      setProgress({ done: 0, total: 0 });
      setPhase("extracting");

      // Le PDF est lu dans le navigateur : il ne transite jamais par le
      // serveur, ce qui évite la limite de taille des requêtes. Ses erreurs
      // sont traitées à part : une TypeError de pdf.js (« undefined is not a
      // function ») n'a rien d'un problème de connexion.
      let extracted;
      try {
        extracted = await extractPdf(candidate, {
          onProgress: (done, total) => setProgress({ done, total }),
        });
      } catch (cause) {
        setPhase("error");
        if (cause instanceof ExtractionError) {
          setError(cause.message);
          setDiagnostic(cause.diagnostic ?? null);
        } else {
          setError("La lecture du PDF a échoué.");
          setDiagnostic(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
        }
        return;
      }

      try {
        setPhase("saving");

        const response = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: extracted.title,
            fileName: candidate.name,
            numPages: extracted.numPages,
            text: extracted.text,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { course?: CourseSummary; error?: { message: string } }
          | null;

        if (!response.ok || !payload?.course) {
          setPhase("error");
          setError(payload?.error?.message ?? "L'enregistrement du cours a échoué.");
          return;
        }

        setPhase("done");
        onUploaded(
          payload.course,
          extracted.text.replace(/\[\[page:\d+\]\]\n?/g, "").slice(0, 1200),
        );
      } catch (cause) {
        setPhase("error");
        if (cause instanceof TypeError) {
          setError("Connexion au serveur impossible.");
        } else {
          setError(
            cause instanceof Error ? cause.message : "L'enregistrement du cours a échoué.",
          );
        }
      }
    },
    [onUploaded],
  );

  const busy = phase === "extracting" || phase === "saving";

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) void handle(dropped);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed border-line bg-surface p-8 text-center transition-colors",
          dragging && "border-accent bg-accent-soft",
          busy && "opacity-70",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          id="pdf-input"
          disabled={busy}
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) void handle(chosen);
          }}
        />

        <UploadCloud className="mx-auto size-8 text-accent" />
        <p className="mt-3 text-sm font-medium">Déposez votre cours en PDF</p>
        <p className="mt-1 text-xs text-muted">
          {formatBytes(MAX_FILE_BYTES)} maximum, texte sélectionnable requis — le fichier est lu
          directement sur votre appareil
        </p>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choisir un fichier
        </Button>
      </div>

      {file && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted">
                {formatBytes(file.size)}
                {progress.total > 0 && ` · ${progress.total} page${progress.total > 1 ? "s" : ""}`}
              </p>
            </div>
            {!busy && (
              <button
                type="button"
                onClick={reset}
                aria-label="Retirer le fichier"
                className="text-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {phase === "extracting" && (
            <div className="mt-3 space-y-1.5">
              <ProgressBar
                value={progress.done}
                max={Math.max(1, progress.total)}
                label="Extraction du texte"
              />
              <p className="text-xs text-muted">
                {progress.total > 0
                  ? `Lecture de la page ${progress.done} sur ${progress.total}…`
                  : "Ouverture du document…"}
              </p>
            </div>
          )}

          {phase === "saving" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              <Spinner /> Enregistrement du cours…
            </p>
          )}
        </div>
      )}

      {phase === "error" && error && (
        <Alert tone="error" title="Import impossible">
          <p>{error}</p>
          {diagnostic && (
            <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-surface/60 p-2 font-mono text-[11px] leading-snug select-all">
              {diagnostic}
            </pre>
          )}
          <button type="button" onClick={reset} className="mt-1 underline">
            Choisir un autre fichier
          </button>
        </Alert>
      )}
    </div>
  );
}
