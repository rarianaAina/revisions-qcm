export type ProviderId = "gemini" | "groq" | "openai" | "anthropic" | "ollama";

export interface LLMRequest {
  system: string;
  user: string;
  /** JSON Schema attendu, pour les fournisseurs qui savent contraindre la sortie. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly model: string;
  /** Renvoie la reponse du modele, deja parsee en JSON (non validee metier). */
  generateJSON(request: LLMRequest): Promise<unknown>;
}

export interface LLMErrorOptions {
  cause?: unknown;
  /**
   * Vrai quand le fournisseur lui-même ne peut pas rendre le service :
   * quota épuisé, clé refusée, panne réseau, erreur serveur. Dans ce cas
   * l'orchestrateur bascule sur le fournisseur suivant.
   *
   * Faux pour les problèmes qui se reproduiraient à l'identique ailleurs :
   * réponse illisible, contenu refusé, réponse tronquée. Basculer ne ferait
   * que consommer un second quota pour rien.
   */
  providerUnavailable?: boolean;
}

/** Erreur imputable au fournisseur (reseau, quota, cle invalide, sortie illisible). */
export class LLMError extends Error {
  readonly provider: ProviderId;
  readonly providerUnavailable: boolean;

  constructor(message: string, provider: ProviderId, options: LLMErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "LLMError";
    this.provider = provider;
    this.providerUnavailable = options.providerUnavailable ?? false;
  }
}

/**
 * Les modeles enrobent souvent le JSON dans du texte ou un bloc markdown.
 * On extrait le premier objet JSON complet plutot que d'echouer betement.
 */
export function parseJSONResponse(raw: string, provider: ProviderId): unknown {
  const text = raw.trim();
  if (!text) {
    throw new LLMError("Le modèle a renvoyé une réponse vide.", provider);
  }

  const candidates: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // on essaie le candidat suivant
    }
  }

  throw new LLMError(
    "Le modèle n'a pas renvoyé de JSON exploitable. Réessayez, ou utilisez un modèle plus performant.",
    provider,
  );
}
