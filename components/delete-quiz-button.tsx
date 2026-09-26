"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

/**
 * Suppression d'un QCM. L'action est irréversible et emporte l'historique des
 * scores : on demande donc une confirmation explicite, en deux temps plutôt
 * qu'avec une boîte de dialogue du navigateur.
 */
export function DeleteQuizButton({
  quizId,
  title,
  attemptCount,
}: {
  quizId: string;
  title: string;
  attemptCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/quizzes/${quizId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message: string } }
          | null;
        setError(payload?.error?.message ?? "La suppression a échoué.");
        setDeleting(false);
        return;
      }
      // Les pages lisent la base côté serveur : on les fait recalculer.
      router.refresh();
    } catch {
      setError("Connexion au serveur impossible.");
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <span className="text-xs text-danger">
        {error}{" "}
        <button type="button" className="underline" onClick={() => setError(null)}>
          Réessayer
        </button>
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Supprimer le QCM « ${title} »`}
        title="Supprimer ce QCM"
        className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">
        {attemptCount === 0
          ? "Supprimer ce QCM ?"
          : attemptCount === 1
            ? "Supprimer ce QCM et son essai ?"
            : `Supprimer ce QCM et ses ${attemptCount} essais ?`}
      </span>
      <button
        type="button"
        onClick={remove}
        disabled={deleting}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md bg-danger px-2 font-medium text-white",
          "transition-opacity hover:opacity-90 disabled:opacity-50",
        )}
      >
        {deleting && <Spinner className="size-3" />}
        Oui
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={deleting}
        className="h-7 rounded-md border border-line px-2 font-medium transition-colors hover:bg-accent-soft disabled:opacity-50"
      >
        Non
      </button>
    </span>
  );
}
