import OpenAI from "openai";
import { LLMError, parseJSONResponse, type LLMProvider, type LLMRequest, type ProviderId } from "../types";

/**
 * Fournisseurs exposant l'API « chat completions » d'OpenAI : OpenAI lui-même,
 * mais aussi Groq (gratuit) et tout service compatible.
 */
export interface OpenAICompatibleConfig {
  id: ProviderId;
  label: string;
  apiKey: string;
  model: string;
  baseURL?: string;
  /**
   * `schema` : le service accepte un JSON Schema complet (OpenAI).
   * `object` : il garantit seulement du JSON valide (Groq et la plupart des autres).
   */
  jsonMode: "schema" | "object";
  /** Nom de la variable d'environnement, cité dans les messages d'erreur. */
  keyEnvVar: string;
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): LLMProvider {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

  return {
    id: config.id,
    label: config.label,
    model: config.model,

    async generateJSON({ system, user, jsonSchema, maxTokens }: LLMRequest) {
      try {
        const completion = await client.chat.completions.create({
          model: config.model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format:
            config.jsonMode === "schema"
              ? { type: "json_schema", json_schema: { name: "quiz", strict: true, schema: jsonSchema } }
              : { type: "json_object" },
        });

        const choice = completion.choices[0];
        if (choice?.finish_reason === "length") {
          throw new LLMError(
            "La réponse a été tronquée. Demandez moins de questions à la fois.",
            config.id,
          );
        }

        return parseJSONResponse(choice?.message?.content ?? "", config.id);
      } catch (cause) {
        if (cause instanceof LLMError) throw cause;
        if (cause instanceof OpenAI.AuthenticationError) {
          throw new LLMError(
            `Clé ${config.label} refusée. Vérifiez ${config.keyEnvVar}.`,
            config.id,
            cause,
          );
        }
        if (cause instanceof OpenAI.RateLimitError) {
          throw new LLMError(
            `Quota ${config.label} atteint. Attendez quelques instants ou réduisez le nombre de questions.`,
            config.id,
            cause,
          );
        }
        if (cause instanceof OpenAI.APIError) {
          throw new LLMError(`Erreur ${config.label} : ${cause.message}`, config.id, cause);
        }
        throw new LLMError(`Appel à ${config.label} impossible.`, config.id, cause);
      }
    },
  };
}
