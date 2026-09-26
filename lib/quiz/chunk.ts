/** Taille d'un morceau envoyé au LLM, en caractères (~4 caractères par token). */
export const DEFAULT_CHUNK_SIZE = 12_000;

/** Nombre maximal d'appels au LLM pour un seul QCM : borne le coût et la durée. */
export const MAX_CHUNKS_USED = 6;

/**
 * Decoupe le texte du cours en morceaux exploitables par le LLM.
 *
 * Strategie volontairement simple (pas de vectorisation) : on coupe aux
 * frontieres de paragraphes, et seulement en cas de besoin au milieu d'un
 * paragraphe trop long.
 */
export function splitTextIntoChunks(text: string, maxChars = DEFAULT_CHUNK_SIZE): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const paragraph of clean.split(/\n{2,}/)) {
    // Paragraphe plus grand qu'un morceau entier : on le coupe par phrases.
    if (paragraph.length > maxChars) {
      flush();
      for (const piece of splitLongParagraph(paragraph, maxChars)) {
        chunks.push(piece);
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > maxChars) flush();
    current += (current ? "\n\n" : "") + paragraph;
  }

  flush();
  return chunks;
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let current = "";

  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > maxChars) {
      // Cas extreme (texte sans ponctuation) : coupe brute.
      if (current.trim()) pieces.push(current.trim());
      current = "";
      for (let i = 0; i < sentence.length; i += maxChars) {
        pieces.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    if (current.length + sentence.length + 1 > maxChars) {
      if (current.trim()) pieces.push(current.trim());
      current = "";
    }
    current += (current ? " " : "") + sentence;
  }

  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

/**
 * Repartit `total` questions sur `count` morceaux, en distribuant le reste
 * sur les premiers morceaux (somme garantie egale a `total`).
 */
export function distributeQuestions(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0)).filter((n) => n > 0);
}

/**
 * Selectionne au plus `MAX_CHUNKS_USED` morceaux, repartis sur tout le cours
 * afin que le QCM couvre le debut, le milieu et la fin.
 */
export function pickChunks(chunks: string[], max = MAX_CHUNKS_USED): string[] {
  if (chunks.length <= max) return chunks;
  const step = chunks.length / max;
  return Array.from({ length: max }, (_, i) => chunks[Math.floor(i * step)]);
}
