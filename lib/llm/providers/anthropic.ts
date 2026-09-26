import Anthropic from "@anthropic-ai/sdk";
import { LLMError, parseJSONResponse, type LLMProvider, type LLMRequest } from "../types";

export function createAnthropicProvider(apiKey: string, model: string): LLMProvider {
  const client = new Anthropic({ apiKey });

  return {
    id: "anthropic",
    label: "Claude (Anthropic)",
    model,

    async generateJSON({ system, user, maxTokens }: LLMRequest) {
      try {
        // Streaming : la generation d'un QCM long depasse facilement le delai
        // d'une requete non streamee.
        const stream = client.messages.stream({
          model,
          max_tokens: maxTokens,
          system,
          thinking: { type: "adaptive" },
          messages: [{ role: "user", content: user }],
        });
        const message = await stream.finalMessage();

        if (message.stop_reason === "refusal") {
          throw new LLMError(
            "Claude a refusé de traiter ce contenu. Essayez avec un autre cours.",
            "anthropic",
          );
        }
        if (message.stop_reason === "max_tokens") {
          throw new LLMError(
            "La réponse a été tronquée. Demandez moins de questions à la fois.",
            "anthropic",
          );
        }

        const text = message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

        return parseJSONResponse(text, "anthropic");
      } catch (cause) {
        if (cause instanceof LLMError) throw cause;
        if (cause instanceof Anthropic.AuthenticationError) {
          throw new LLMError("Clé Anthropic refusée. Vérifiez ANTHROPIC_API_KEY.", "anthropic", cause);
        }
        if (cause instanceof Anthropic.RateLimitError) {
          throw new LLMError("Quota Anthropic atteint. Réessayez plus tard.", "anthropic", cause);
        }
        if (cause instanceof Anthropic.APIError) {
          throw new LLMError(`Erreur Anthropic : ${cause.message}`, "anthropic", cause);
        }
        throw new LLMError("Appel à Claude impossible.", "anthropic", cause);
      }
    },
  };
}
