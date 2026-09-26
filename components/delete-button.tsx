"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

/**
 * Suppression d'une ressource, avec confirmation en deux temps.
 *
 * Les suppressions sont irréversibles et cascadent (un QCM emporte ses
 * essais, un cours emporte ses QCM) : la question posée doit énoncer
 * exactement ce qui disparaît.
 */
export function DeleteButton({
  endpoint,
  ariaLabel,
  question,
  redirectTo,
  className,
}: {
  /** Route appelée en DELETE. */
  endpoint: string;
  ariaLabel: string;
  /** Question de confirmation, qui doit énoncer ce qui sera supprimé. */
  question: string;
  /** Page vers laquelle partir après coup, quand la page courante disparaît. */
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message: string } }
          | null;
        setError(payload?.error?.message ?? "La suppression a échoué.");
        setDeleting(false);
        return;
      }

      // Les pages lisent la base côté serveur : on les fait recalculer.
      if (redirectTo) router.push(redirectTo);
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
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(
          "rounded-lg border border-line p-2 text-muted transition-colors",
          "hover:border-danger/40 hover:bg-danger-soft hover:text-danger",
          className,
        )}
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
      <span className="text-muted">{question}</span>
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
