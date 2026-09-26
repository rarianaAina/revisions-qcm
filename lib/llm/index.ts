import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";
import { createOllamaProvider } from "./providers/ollama";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";
import { LLMError, type LLMProvider, type ProviderId } from "./types";

export * from "./types";

const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-3.8-flash",
  groq: "openai/gpt-oss-120b",
  openai: "gpt-4o-mini",
  anthropic: "claude-opus-5",
  ollama: "llama3.1:8b",
};

const PROVIDER_IDS: ProviderId[] = ["gemini", "groq", "openai", "anthropic", "ollama"];

/**
 * Ordre de détection automatique : les fournisseurs à offre gratuite d'abord.
 * Ollama (local) n'est jamais choisi automatiquement — il n'a aucun sens sur
 * un hébergement serverless — mais reste disponible via LLM_PROVIDER=ollama.
 */
const AUTO_DETECT: Array<{ id: ProviderId; envVar: string }> = [
  { id: "gemini", envVar: "GEMINI_API_KEY" },
  { id: "groq", envVar: "GROQ_API_KEY" },
  { id: "openai", envVar: "OPENAI_API_KEY" },
  { id: "anthropic", envVar: "ANTHROPIC_API_KEY" },
];

const MISSING_PROVIDER_MESSAGE =
  "Aucun fournisseur de génération n'est configuré. Créez une clé gratuite sur Google AI Studio (aistudio.google.com/apikey) et renseignez GEMINI_API_KEY dans .env.local, ou dans les variables d'environnement Vercel.";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function resolveProviderId(): ProviderId {
  const explicit = env("LLM_PROVIDER")?.toLowerCase();
  if (explicit) {
    if (!isProviderId(explicit)) {
      throw new LLMError(
        `LLM_PROVIDER="${explicit}" est inconnu. Valeurs acceptées : ${PROVIDER_IDS.join(", ")}.`,
        "gemini",
      );
    }
    return explicit;
  }

  const detected = AUTO_DETECT.find((candidate) => env(candidate.envVar));
  if (!detected) throw new LLMError(MISSING_PROVIDER_MESSAGE, "gemini");
  return detected.id;
}

function requireKey(id: ProviderId, envVar: string): string {
  const key = env(envVar);
  if (!key) {
    throw new LLMError(
      `Le fournisseur « ${id} » est sélectionné mais ${envVar} n'est pas défini.`,
      id,
    );
  }
  return key;
}

/**
 * Construit le fournisseur configuré.
 * Lève une LLMError explicite si la configuration est incomplète — c'est ce
 * message que l'interface affiche à l'utilisatrice.
 */
export function getLLMProvider(): LLMProvider {
  const id = resolveProviderId();
  const model = env("LLM_MODEL") ?? DEFAULT_MODELS[id];
  // Permet de viser un proxy ou une passerelle compatible avec le fournisseur.
  const baseUrl = env("LLM_BASE_URL");

  switch (id) {
    case "gemini":
      return createGeminiProvider(requireKey(id, "GEMINI_API_KEY"), model, baseUrl);

    case "groq":
      return createOpenAICompatibleProvider({
        id,
        label: "Groq",
        apiKey: requireKey(id, "GROQ_API_KEY"),
        model,
        baseURL: baseUrl ?? "https://api.groq.com/openai/v1",
        jsonMode: "object",
        keyEnvVar: "GROQ_API_KEY",
      });

    case "openai":
      return createOpenAICompatibleProvider({
        id,
        label: "OpenAI",
        apiKey: requireKey(id, "OPENAI_API_KEY"),
        model,
        baseURL: baseUrl,
        jsonMode: "schema",
        keyEnvVar: "OPENAI_API_KEY",
      });

    case "anthropic":
      return createAnthropicProvider(requireKey(id, "ANTHROPIC_API_KEY"), model);

    case "ollama":
      return createOllamaProvider(baseUrl ?? env("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434", model);
  }
}

export interface LLMStatus {
  configured: boolean;
  provider: ProviderId | null;
  providerLabel: string | null;
  model: string | null;
  message: string;
}

/** Diagnostic affiché dans l'interface avant toute tentative de génération. */
export function getLLMStatus(): LLMStatus {
  try {
    const provider = getLLMProvider();
    return {
      configured: true,
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      message: `Prêt — ${provider.label}, modèle ${provider.model}.`,
    };
  } catch (error) {
    return {
      configured: false,
      provider: null,
      providerLabel: null,
      model: null,
      message: error instanceof LLMError ? error.message : MISSING_PROVIDER_MESSAGE,
    };
  }
}
