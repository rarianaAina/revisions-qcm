import { LLMError, parseJSONResponse, type LLMProvider, type LLMRequest } from "../types";

const DEFAULT_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
}

/**
 * Gemini via l'API REST : le schema JSON complet n'est pas transmis (Gemini
 * attend un sous-ensemble OpenAPI), on se repose sur `responseMimeType` et sur
 * le prompt, puis sur la validation Zod cote serveur.
 */
export function createGeminiProvider(
  apiKey: string,
  model: string,
  baseUrl = DEFAULT_API_ROOT,
): LLMProvider {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    id: "gemini",
    label: "Gemini (Google)",
    model,

    async generateJSON({ system, user, maxTokens }: LLMRequest) {
      let response: Response;
      try {
        response = await fetch(`${root}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
            },
          }),
        });
      } catch (cause) {
        throw new LLMError("Impossible de joindre l'API Gemini.", "gemini", cause);
      }

      const payload = (await response.json().catch(() => ({}))) as GeminiResponse;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new LLMError("Clé Gemini refusée. Vérifiez GEMINI_API_KEY.", "gemini");
        }
        if (response.status === 429) {
          throw new LLMError("Quota Gemini atteint. Réessayez plus tard.", "gemini");
        }
        throw new LLMError(
          `Erreur Gemini (${response.status}) : ${payload.error?.message ?? "réponse inattendue"}`,
          "gemini",
        );
      }

      const candidate = payload.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new LLMError(
          "La réponse a été tronquée. Demandez moins de questions à la fois.",
          "gemini",
        );
      }

      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return parseJSONResponse(text, "gemini");
    },
  };
}
