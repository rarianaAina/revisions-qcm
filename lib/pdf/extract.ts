/**
 * Extraction du texte d'un PDF **dans le navigateur**, avec pdf.js.
 *
 * Le fichier ne quitte jamais la machine de l'utilisatrice : seul le texte
 * extrait est envoyé au serveur. Cela évite la limite de 4,5 Mo imposée par
 * Vercel sur le corps des requêtes, et supprime le besoin d'un service
 * d'extraction séparé.
 *
 * Ce module ne doit être importé que depuis un composant client.
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";

/** Taille maximale acceptée (le PDF reste local, c'est une limite de confort). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 600;

/** Le texte extrait transite en JSON : on reste loin de la limite de 4,5 Mo. */
export const MAX_TEXT_CHARS = 1_200_000;

// En dessous de ces seuils, le PDF est considéré comme scanné (images sans
// couche texte) et devra passer par une OCR, non disponible dans cette version.
const MIN_CHARS_PER_PAGE = 40;
const MIN_TOTAL_CHARS = 200;

export type ExtractionCode =
  | "empty_file"
  | "file_too_large"
  | "not_a_pdf"
  | "encrypted_pdf"
  | "corrupt_pdf"
  | "empty_pdf"
  | "too_many_pages"
  | "needs_ocr"
  | "text_too_large";

export class ExtractionError extends Error {
  constructor(
    readonly code: ExtractionCode,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export interface ExtractedPage {
  page: number;
  text: string;
  chars: number;
}

export interface ExtractedPdf {
  text: string;
  pages: ExtractedPage[];
  numPages: number;
  numChars: number;
  title: string;
}

/** Normalise les espaces sans écraser la structure en paragraphes. */
function clean(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/\s+$/, ""));

  const out: string[] = [];
  let blank = 0;
  for (const line of lines) {
    if (line.trim()) {
      blank = 0;
      out.push(line);
    } else if (++blank <= 1) {
      out.push("");
    }
  }
  return out.join("\n").trim();
}

/** Vérifie la signature du fichier : l'extension et le type MIME sont déclaratifs. */
async function assertPdfSignature(file: File): Promise<void> {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...header);
  if (signature !== "%PDF-") {
    throw new ExtractionError(
      "not_a_pdf",
      "Ce fichier n'est pas un PDF valide (signature %PDF- absente).",
    );
  }
}

/** Charge pdf.js à la demande : la bibliothèque ne pèse sur aucune autre page. */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

export interface ExtractOptions {
  /** Appelé après chaque page, pour l'affichage de la progression. */
  onProgress?: (done: number, total: number) => void;
}

export async function extractPdf(file: File, options: ExtractOptions = {}): Promise<ExtractedPdf> {
  if (file.size === 0) {
    throw new ExtractionError("empty_file", "Le fichier est vide.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ExtractionError(
      "file_too_large",
      `Le fichier dépasse la taille maximale de ${MAX_FILE_BYTES / (1024 * 1024)} Mo.`,
    );
  }

  await assertPdfSignature(file);

  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());

  // La tâche de chargement possède le worker : c'est elle qu'il faut libérer.
  const loadingTask = pdfjs.getDocument({ data });

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (cause) {
    await loadingTask.destroy().catch(() => {});
    if (cause instanceof Error && cause.name === "PasswordException") {
      throw new ExtractionError("encrypted_pdf", "Ce PDF est protégé par un mot de passe.");
    }
    throw new ExtractionError(
      "corrupt_pdf",
      `PDF illisible : ${cause instanceof Error ? cause.message : "erreur inconnue"}`,
    );
  }

  try {
    const numPages = doc.numPages;
    if (numPages === 0) {
      throw new ExtractionError("empty_pdf", "Ce PDF ne contient aucune page.");
    }
    if (numPages > MAX_PAGES) {
      throw new ExtractionError(
        "too_many_pages",
        `Ce PDF contient ${numPages} pages (maximum ${MAX_PAGES}).`,
      );
    }

    const pages: ExtractedPage[] = [];

    for (let index = 1; index <= numPages; index++) {
      let raw = "";
      try {
        const page = await doc.getPage(index);
        const content = await page.getTextContent();

        // `hasEOL` marque la fin d'une ligne dans la mise en page d'origine.
        raw = content.items
          .map((item) => {
            const textItem = item as TextItem;
            if (typeof textItem.str !== "string") return "";
            return textItem.hasEOL ? `${textItem.str}\n` : textItem.str;
          })
          .join("");

        page.cleanup();
      } catch {
        raw = ""; // une page illisible ne doit pas faire échouer tout le document
      }

      const text = clean(raw);
      pages.push({ page: index, text, chars: text.length });
      options.onProgress?.(index, numPages);
    }

    const numChars = pages.reduce((total, page) => total + page.chars, 0);

    if (numChars < MIN_TOTAL_CHARS || numChars / numPages < MIN_CHARS_PER_PAGE) {
      throw new ExtractionError(
        "needs_ocr",
        "Ce PDF ne contient pas de texte exploitable : il s'agit probablement d'un document scanné. La reconnaissance de caractères (OCR) fera l'objet d'une version ultérieure.",
      );
    }
    if (numChars > MAX_TEXT_CHARS) {
      throw new ExtractionError(
        "text_too_large",
        `Ce cours contient ${numChars.toLocaleString("fr-FR")} caractères, au-delà de la limite de ${MAX_TEXT_CHARS.toLocaleString("fr-FR")}. Découpez-le en plusieurs PDF.`,
      );
    }

    // Les marqueurs de page permettent au modèle de citer une page source.
    const text = pages
      .filter((page) => page.text)
      .map((page) => `[[page:${page.page}]]\n${page.text}`)
      .join("\n\n");

    const metadata = await doc.getMetadata().catch(() => null);
    const info = metadata?.info as { Title?: string } | undefined;

    return {
      text,
      pages,
      numPages,
      numChars,
      title: info?.Title?.trim() || file.name.replace(/\.pdf$/i, ""),
    };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}
