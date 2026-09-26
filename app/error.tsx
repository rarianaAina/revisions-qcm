"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4 py-12">
      <Alert tone="error" title="Une erreur est survenue">
        {error.message || "L'application a rencontré un problème inattendu."}
      </Alert>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
