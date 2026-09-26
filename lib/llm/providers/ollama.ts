import { LLMError, parseJSONResponse, type LLMProvider, type LLMRequest } from "../types";

/**
 * Modele local via Ollama (https://ollama.com). Aucun compte ni cle requis :
 * c'est le fournisseur par defaut quand aucune API payante n'est configuree.
 */
export function createOllamaProvider(baseUrl: string, model: string): LLMProvider {
  const root = baseUrl.replace(/\/+$/, "");

  return {
    id: "ollama",
    label: "Ollama (local)",
    model,

    async generateJSON({ system, user, jsonSchema, maxTokens }: LLMRequest) {
      let response: Response;
      try {
        response = await fetch(`${root}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            format: jsonSchema, // sortie structuree (Ollama >= 0.5)
            options: { temperature: 0.4, num_predict: maxTokens },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
      } catch (cause) {
        throw new LLMError(
          `Impossible de joindre Ollama sur ${root}. Vérifiez qu'il est démarré (« ollama serve »).`,
          "ollama",
          { cause, providerUnavailable: true },
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if (response.status === 404) {
          throw new LLMError(
            `Le modèle « ${model} » n'est pas installé. Lancez « ollama pull ${model} ».`,
            "ollama",
          );
        }
        throw new LLMError(`Ollama a répondu ${response.status}. ${detail.slice(0, 300)}`, "ollama", {
          providerUnavailable: response.status >= 500,
        });
      }

      const payload = (await response.json()) as { message?: { content?: string } };
      return parseJSONResponse(payload.message?.content ?? "", "ollama");
    },
  };
}
