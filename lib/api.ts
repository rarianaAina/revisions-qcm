import { NextResponse } from "next/server";
import { LLMError } from "@/lib/llm";

export interface ApiError {
  error: { code: string; message: string };
}

export function apiError(message: string, code = "bad_request", status = 400) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}

/**
 * Traduit une exception en réponse HTTP. Les messages destinés à
 * l'utilisatrice sont conservés ; le reste est masqué derrière un message
 * générique et journalisé côté serveur.
 */
export function handleApiError(error: unknown) {
  if (error instanceof LLMError) {
    return apiError(error.message, "llm_error", 502);
  }
  // Base de données injoignable ou schéma absent : message actionnable.
  if (error instanceof Error && /DATABASE_URL|ECONNREFUSED|does not exist/i.test(error.message)) {
    return apiError(
      `Problème de base de données : ${error.message}`,
      "database_error",
      503,
    );
  }
  console.error("[api]", error);
  return apiError("Une erreur inattendue est survenue.", "internal_error", 500);
}
