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

/** Par fournisseur : variable de clé, de modèle, et d'URL de base. */
const PROVIDER_ENV: Record<ProviderId, { key: string | null; model: string; baseUrl: string }> = {
  gemini: { key: "GEMINI_API_KEY", model: "GEMINI_MODEL", baseUrl: "GEMINI_BASE_URL" },
  groq: { key: "GROQ_API_KEY", model: "GROQ_MODEL", baseUrl: "GROQ_BASE_URL" },
  openai: { key: "OPENAI_API_KEY", model: "OPENAI_MODEL", baseUrl: "OPENAI_BASE_URL" },
  anthropic: { key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL", baseUrl: "ANTHROPIC_BASE_URL" },
  // Ollama tourne en local : il n'a pas de clé, et n'est donc jamais détecté
  // automatiquement — il n'aurait aucun sens sur un hébergement serverless.
  ollama: { key: null, model: "OLLAMA_MODEL", baseUrl: "OLLAMA_BASE_URL" },
};

/** Ordre de préférence : les offres gratuites d'abord. */
const PREFERENCE: ProviderId[] = ["gemini", "groq", "openai", "anthropic"];
const PROVIDER_IDS: ProviderId[] = [...PREFERENCE, "ollama"];

const MISSING_PROVIDER_MESSAGE =
  "Aucun fournisseur de génération n'est configuré. Créez une clé gratuite sur Google AI Studio (aistudio.google.com/apikey) et renseignez GEMINI_API_KEY dans .env.local, ou dans les variables d'environnement Vercel.";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function hasKey(id: ProviderId): boolean {
  const keyVar = PROVIDER_ENV[id].key;
  return keyVar === null ? false : Boolean(env(keyVar));
}

/**
 * Construit un fournisseur.
 *
 * `LLM_MODEL` et `LLM_BASE_URL` ne s'appliquent qu'au fournisseur principal :
 * les appliquer à toute la chaîne enverrait par exemple un nom de modèle
 * Gemini à Groq, et ferait échouer la bascule. Les variables dédiées
 * (`GEMINI_MODEL`, `GROQ_BASE_URL`, …) visent un fournisseur précis, qu'il
 * soit principal ou de secours, et priment sur les précédentes.
 */
function build(id: ProviderId, isPrimary: boolean): LLMProvider {
  const model =
    env(PROVIDER_ENV[id].model) ?? (isPrimary ? env("LLM_MODEL") : undefined) ?? DEFAULT_MODELS[id];
  const baseUrl =
    env(PROVIDER_ENV[id].baseUrl) ?? (isPrimary ? env("LLM_BASE_URL") : undefined);

  const keyVar = PROVIDER_ENV[id].key;
  const apiKey = keyVar ? env(keyVar) : undefined;
  if (keyVar && !apiKey) {
    throw new LLMError(
      `Le fournisseur « ${id} » est sélectionné mais ${keyVar} n'est pas défini.`,
      id,
    );
  }

  switch (id) {
    case "gemini":
      return createGeminiProvider(apiKey!, model, baseUrl);

    case "groq":
      return createOpenAICompatibleProvider({
        id,
        label: "Groq",
        apiKey: apiKey!,
        model,
        baseURL: baseUrl ?? "https://api.groq.com/openai/v1",
        jsonMode: "object",
        keyEnvVar: "GROQ_API_KEY",
      });

    case "openai":
      return createOpenAICompatibleProvider({
        id,
        label: "OpenAI",
        apiKey: apiKey!,
        model,
        baseURL: baseUrl,
        jsonMode: "schema",
        keyEnvVar: "OPENAI_API_KEY",
      });

    case "anthropic":
      return createAnthropicProvider(apiKey!, model, baseUrl);

    case "ollama":
      return createOllamaProvider(baseUrl ?? "http://127.0.0.1:11434", model);
  }
}

/**
 * Chaîne ordonnée des fournisseurs utilisables.
 *
 * Le premier est le fournisseur principal ; les suivants ne servent que si
 * celui-ci devient indisponible (quota épuisé, clé refusée, panne).
 * `LLM_FALLBACK=off` réduit la chaîne au seul fournisseur principal.
 */
export function getLLMProviders(): LLMProvider[] {
  const explicit = env("LLM_PROVIDER")?.toLowerCase();
  if (explicit && !isProviderId(explicit)) {
    throw new LLMError(
      `LLM_PROVIDER="${explicit}" est inconnu. Valeurs acceptées : ${PROVIDER_IDS.join(", ")}.`,
      "gemini",
    );
  }

  const primary = (explicit as ProviderId | undefined) ?? PREFERENCE.find(hasKey);
  if (!primary) throw new LLMError(MISSING_PROVIDER_MESSAGE, "gemini");

  const order: ProviderId[] =
    env("LLM_FALLBACK")?.toLowerCase() === "off"
      ? [primary]
      : [primary, ...PREFERENCE.filter((id) => id !== primary && hasKey(id))];

  const providers: LLMProvider[] = [];
  for (const id of order) {
    try {
      providers.push(build(id, id === primary));
    } catch (error) {
      // Un fournisseur secondaire mal configuré est ignoré ; si c'est le
      // principal, l'erreur doit remonter à l'utilisatrice.
      if (id === primary) throw error;
    }
  }

  return providers;
}

/** Fournisseur principal seul — utilisé par le diagnostic. */
export function getLLMProvider(): LLMProvider {
  return getLLMProviders()[0];
}

export interface LLMStatus {
  configured: boolean;
  provider: ProviderId | null;
  providerLabel: string | null;
  model: string | null;
  /** Fournisseurs de secours, dans l'ordre d'essai. */
  fallbacks: Array<{ provider: ProviderId; label: string; model: string }>;
  message: string;
}

/** Diagnostic affiché dans l'interface avant toute tentative de génération. */
export function getLLMStatus(): LLMStatus {
  try {
    const [primary, ...rest] = getLLMProviders();
    const fallbacks = rest.map((p) => ({ provider: p.id, label: p.label, model: p.model }));

    return {
      configured: true,
      provider: primary.id,
      providerLabel: primary.label,
      model: primary.model,
      fallbacks,
      message:
        `Prêt — ${primary.label}, modèle ${primary.model}.` +
        (fallbacks.length > 0
          ? ` En cas de quota épuisé : ${fallbacks.map((f) => f.label).join(", puis ")}.`
          : ""),
    };
  } catch (error) {
    return {
      configured: false,
      provider: null,
      providerLabel: null,
      model: null,
      fallbacks: [],
      message: error instanceof LLMError ? error.message : MISSING_PROVIDER_MESSAGE,
    };
  }
}
