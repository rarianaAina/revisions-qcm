/**
 * Extraction du texte d'un PDF **dans le navigateur**, avec pdf.js.
 *
 * Le fichier ne quitte jamais la machine de l'utilisatrice : seul le texte
 * extrait est envoyé au serveur. Cela évite la limite de 4,5 Mo imposée par
 * Vercel sur le corps des requêtes, et supprime le besoin d'un service
 * d'extraction séparé.
 *
 * Ce module ne doit être importé que depuis un composant client (la route
 * /api/courses n'en importe que des constantes).
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { apisComblees, installPdfPolyfills } from "./polyfills";

/** Taille maximale acceptée (le PDF reste local, c'est une limite de confort). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 600;

/** Le texte extrait transite en JSON : on reste loin de la limite de 4,5 Mo. */
export const MAX_TEXT_CHARS = 1_200_000;

// En dessous de ces seuils, le PDF est considéré comme scanné (images sans
// couche texte) et devra passer par une OCR, non disponible dans cette version.
const MIN_CHARS_PER_PAGE = 40;
const MIN_TOTAL_CHARS = 200;

/**
 * Au-delà de ce délai sans le moindre message, le worker est tenu pour mort
 * (script non chargé, module refusé) : on bascule alors sur le repli.
 */
const DELAI_DEMARRAGE_WORKER_MS = 30_000;

export type ExtractionCode =
  | "empty_file"
  | "file_too_large"
  | "unreadable_file"
  | "not_a_pdf"
  | "encrypted_pdf"
  | "corrupt_pdf"
  | "empty_pdf"
  | "too_many_pages"
  | "needs_ocr"
  | "extraction_failed"
  | "text_too_large";

export class ExtractionError extends Error {
  constructor(
    readonly code: ExtractionCode,
    message: string,
    /**
     * Détail technique à afficher tel quel : étape, erreur d'origine, API
     * comblées, navigateur. Une capture d'écran doit suffire à conclure.
     */
    readonly diagnostic?: string,
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

/* ------------------------------------------------------------------------ */
/* Diagnostic                                                               */
/* ------------------------------------------------------------------------ */

/** Ce qu'on sait de l'extraction en cours, pour le diagnostic en cas d'échec. */
interface Contexte {
  etape: string;
  /** Mode de lecture effectif, une fois le document ouvert. */
  mode: "worker" | "sans worker (repli)" | null;
  /** Pourquoi le worker a été abandonné, le cas échéant. */
  incidentWorker?: string;
  versionPdfJs?: string;
}

/** Le worker n'a pas démarré, ou est mort : distinct d'une erreur du document. */
class WorkerHorsService extends Error {
  constructor(readonly origine: unknown) {
    super("Le worker de pdf.js ne répond pas.");
    this.name = "WorkerHorsService";
  }
}

/** Nom et message de l'erreur d'origine, y compris quand pdf.js l'a enveloppée. */
function decrireErreur(cause: unknown): string {
  if (cause instanceof WorkerHorsService) return decrireErreur(cause.origine);
  if (cause instanceof Error) {
    // pdf.js transmet les erreurs du worker en UnknownErrorException, avec
    // l'erreur d'origine (« TypeError: … ») dans `details`.
    const details = (cause as { details?: unknown }).details;
    if (typeof details === "string" && details && details !== cause.message) {
      return `${cause.name} ← ${details}`;
    }
    return `${cause.name}: ${cause.message}`;
  }
  if (typeof ErrorEvent !== "undefined" && cause instanceof ErrorEvent) {
    const fichier = cause.filename ? cause.filename.split("/").pop() : "";
    const lieu = fichier ? ` (${fichier}:${cause.lineno}:${cause.colno})` : "";
    return `ErrorEvent: ${cause.message || "sans message"}${lieu}`;
  }
  if (typeof Event !== "undefined" && cause instanceof Event) {
    // Un module de worker introuvable ou refusé ne donne qu'un Event nu.
    return `Event « ${cause.type} » sans détail (script du worker non chargé ?)`;
  }
  return String(cause);
}

/** Système et navigateur, tirés du user agent (iOS : version et navigateur). */
function navigateur(): string {
  if (typeof navigator === "undefined") return "inconnu";
  const ua = navigator.userAgent;
  const ios = /(?:iPhone|iPad|iPod|CPU) OS (\d+(?:_\d+)*)/.exec(ua)?.[1];
  if (!ios) return ua;
  // Safari : Version/x = version de Safari ; Chrome, Firefox, Edge : leur jeton.
  const jetons = ua.match(/\b(?:Version|CriOS|FxiOS|EdgiOS|OPT|GSA)\/[\d.]+/g) ?? [];
  return [`iOS ${ios.replace(/_/g, ".")}`, ...jetons].join(", ");
}

/** « Set.prototype.union, Set.prototype.isSubsetOf » → « Set.prototype.{union, isSubsetOf} ». */
function compacter(noms: string[]): string {
  const groupes = new Map<string, string[]>();
  for (const nom of noms) {
    const i = nom.lastIndexOf(".");
    const prefixe = i > 0 ? nom.slice(0, i) : "";
    const groupe = groupes.get(prefixe);
    if (groupe) groupe.push(i > 0 ? nom.slice(i + 1) : nom);
    else groupes.set(prefixe, [i > 0 ? nom.slice(i + 1) : nom]);
  }
  return [...groupes]
    .map(([prefixe, membres]) =>
      !prefixe ? membres.join(", ") : membres.length === 1 ? `${prefixe}.${membres[0]}` : `${prefixe}.{${membres.join(", ")}}`,
    )
    .join(", ");
}

function diagnostic(ctx: Contexte, cause: unknown): string {
  const comblees = apisComblees();
  return [
    `Étape : ${ctx.etape}`,
    `Erreur : ${decrireErreur(cause)}`,
    `Lecture : ${ctx.mode ?? "non démarrée"}`,
    ...(ctx.incidentWorker ? [`Worker abandonné : ${ctx.incidentWorker}`] : []),
    `API comblées : ${comblees.length > 0 ? compacter(comblees) : "aucune"}`,
    `pdf.js : ${ctx.versionPdfJs ?? "non chargé"}`,
    `Navigateur : ${navigateur()}`,
  ].join("\n");
}

/* ------------------------------------------------------------------------ */
/* pdf.js et son worker                                                     */
/* ------------------------------------------------------------------------ */

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

/**
 * Lit le fichier. Sur iPhone, un fichier d'iCloud Drive pas encore téléchargé,
 * ou devenu inaccessible, fait échouer la lecture (NotReadableError,
 * NotFoundError) : ce n'est pas un problème de PDF, et il faut le dire.
 */
async function lireOctets(blob: Blob): Promise<Uint8Array> {
  try {
    return new Uint8Array(await blob.arrayBuffer());
  } catch (cause) {
    throw new ExtractionError(
      "unreadable_file",
      "Le fichier n'a pas pu être lu par le navigateur. S'il est stocké sur iCloud Drive ou un autre service en ligne, ouvrez-le d'abord dans l'app Fichiers pour qu'il soit téléchargé sur l'appareil, puis choisissez-le à nouveau.",
      `Étape : lecture du fichier\nErreur : ${decrireErreur(cause)}\nNavigateur : ${navigateur()}`,
    );
  }
}

/** Vérifie la signature du fichier : l'extension et le type MIME sont déclaratifs. */
async function assertPdfSignature(file: File): Promise<void> {
  const header = await lireOctets(file.slice(0, 5));
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
  installPdfPolyfills();
  return import("pdfjs-dist");
}

/**
 * Worker de pdf.js, lancé depuis notre propre point d'entrée pour qu'il
 * installe les correctifs avant de se charger. Le worker a son propre
 * contexte : ceux de la page ne l'atteignent pas.
 */
function creerWorker(): Worker {
  return new Worker(new URL("./pdf-worker-entry.ts", import.meta.url), { type: "module" });
}

/**
 * Ressources servies depuis public/pdfjs (voir scripts/copy-pdfjs-assets.mjs).
 * Sans elles, un PDF dont les polices sont encodées en Identity-H, ou qui ne
 * embarque pas ses polices, rend un texte vide : l'application conclurait à
 * tort qu'il s'agit d'un document scanné.
 */
const PDFJS_RESOURCES = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
} as const;

type PdfJs = Awaited<ReturnType<typeof loadPdfJs>>;
type LoadingTask = ReturnType<PdfJs["getDocument"]>;
type PdfDocument = Awaited<LoadingTask["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

interface Surveillance {
  /** Rejetée si le worker plante ou reste muet : à mettre en course. */
  echec: Promise<never>;
  arreter(): void;
}

/**
 * Avec un worker fourni par nos soins, pdf.js n'écoute pas ses erreurs : un
 * module qui ne se charge pas laisserait l'extraction en attente sans fin.
 */
function surveillerWorker(worker: Worker): Surveillance {
  let rejeter!: (raison: unknown) => void;
  const echec = new Promise<never>((_, reject) => {
    rejeter = reject;
  });
  echec.catch(() => {}); // personne n'attend plus la promesse une fois arrêtée

  const ac = new AbortController();
  const minuterie = setTimeout(
    () =>
      rejeter(
        new WorkerHorsService(
          new Error(`aucun message du worker après ${DELAI_DEMARRAGE_WORKER_MS / 1000} s`),
        ),
      ),
    DELAI_DEMARRAGE_WORKER_MS,
  );
  const options = { signal: ac.signal };
  worker.addEventListener(
    "message",
    (event: MessageEvent) => {
      clearTimeout(minuterie); // il a parlé : le module s'est au moins chargé
      const echecEntree = (event.data as { echecDemarrageWorker?: string } | null)?.echecDemarrageWorker;
      if (echecEntree) rejeter(new WorkerHorsService(new Error(echecEntree)));
    },
    options,
  );
  worker.addEventListener("error", (event) => rejeter(new WorkerHorsService(event)), options);
  worker.addEventListener("messageerror", (event) => rejeter(new WorkerHorsService(event)), options);

  return {
    echec,
    arreter() {
      clearTimeout(minuterie);
      ac.abort();
    },
  };
}

interface Ouverture {
  loadingTask: LoadingTask;
  doc: PdfDocument;
  worker: Worker | null;
  surveillance: Surveillance | null;
}

async function ouvrirAvecWorker(pdfjs: PdfJs, data: Uint8Array): Promise<Ouverture> {
  let worker: Worker;
  try {
    worker = creerWorker();
  } catch (cause) {
    throw new WorkerHorsService(cause);
  }
  const surveillance = surveillerWorker(worker);

  let loadingTask: LoadingTask;
  try {
    loadingTask = pdfjs.getDocument({
      data,
      // `create` porte la bonne signature ; le constructeur est mal typé en amont.
      worker: pdfjs.PDFWorker.create({ port: worker }),
      ...PDFJS_RESOURCES,
    });
  } catch (cause) {
    surveillance.arreter();
    worker.terminate();
    throw new WorkerHorsService(cause);
  }

  try {
    const doc = await Promise.race([loadingTask.promise, surveillance.echec]);
    return { loadingTask, doc, worker, surveillance };
  } catch (cause) {
    surveillance.arreter();
    // La tâche de chargement possède le worker : c'est elle qu'il faut libérer.
    await loadingTask.destroy().catch(() => {});
    worker.terminate();
    throw cause;
  }
}

/**
 * Repli : pdf.js tourne dans la page (son « faux worker »). Plus lent et
 * bloquant pour l'interface, mais indépendant du chargement des module
 * workers, qui est le point le plus fragile après empaquetage.
 */
async function ouvrirSansWorker(pdfjs: PdfJs, data: Uint8Array, ctx: Contexte): Promise<Ouverture> {
  ctx.etape = "chargement du repli sans worker";
  const globals = globalThis as { pdfjsWorker?: unknown };
  // pdf.js bascule sur le faux worker dès qu'il trouve ce module ici.
  globals.pdfjsWorker ??= await import("pdfjs-dist/build/pdf.worker.min.mjs");

  ctx.etape = "ouverture du document";
  const loadingTask = pdfjs.getDocument({ data, ...PDFJS_RESOURCES });
  try {
    const doc = await loadingTask.promise;
    return { loadingTask, doc, worker: null, surveillance: null };
  } catch (cause) {
    await loadingTask.destroy().catch(() => {});
    throw cause;
  }
}

/** Mémorisé : si le worker a échoué une fois, inutile de le retenter. */
let workerIndisponible = false;

async function ouvrir(pdfjs: PdfJs, file: File, ctx: Contexte): Promise<Ouverture> {
  if (!workerIndisponible) {
    ctx.etape = "démarrage du worker / ouverture du document";
    try {
      const ouverture = await ouvrirAvecWorker(pdfjs, await lireOctets(file));
      ctx.mode = "worker";
      return ouverture;
    } catch (cause) {
      if (!(cause instanceof WorkerHorsService)) {
        ctx.etape = "ouverture du document";
        throw cause;
      }
      workerIndisponible = true;
      ctx.incidentWorker = decrireErreur(cause);
    }
  }

  // Les octets ont pu être transférés au worker abandonné : on relit le fichier.
  ctx.etape = "lecture du fichier (repli)";
  const ouverture = await ouvrirSansWorker(pdfjs, await lireOctets(file), ctx);
  ctx.mode = "sans worker (repli)";
  return ouverture;
}

/** Traduit l'échec d'ouverture du document en message pour l'utilisatrice. */
function erreurOuverture(cause: unknown, ctx: Contexte): ExtractionError {
  const nom = cause instanceof Error ? cause.name : "";
  if (nom === "PasswordException") {
    return new ExtractionError("encrypted_pdf", "Ce PDF est protégé par un mot de passe.");
  }
  if (nom === "InvalidPDFException" || nom === "FormatError") {
    return new ExtractionError(
      "corrupt_pdf",
      `PDF illisible : ${cause instanceof Error ? cause.message : "erreur inconnue"}`,
      diagnostic(ctx, cause),
    );
  }
  if (cause instanceof WorkerHorsService) ctx.etape = "démarrage du worker";
  return new ExtractionError(
    "extraction_failed",
    `La lecture du PDF a échoué (étape : ${ctx.etape}).` + conseilNavigateur(),
    diagnostic(ctx, cause),
  );
}

function conseilNavigateur(): string {
  return apisComblees().length > 0
    ? " Votre navigateur est ancien : mettre à jour l'iPhone (Réglages > Général > Mise à jour logicielle), ou essayer depuis un autre appareil, réglera probablement le problème."
    : "";
}

/** La page dessine-t-elle au moins une image ? (cours scanné ou photographié) */
async function pageContientUneImage(page: PdfPage, pdfjs: PdfJs): Promise<boolean> {
  try {
    const { fnArray } = await page.getOperatorList();
    const opsImage = new Set<number>([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageMaskXObject,
    ]);
    return fnArray.some((op: number) => opsImage.has(op));
  } catch {
    return false; // la détection est un confort : son échec ne doit rien casser
  }
}

/* ------------------------------------------------------------------------ */
/* Extraction                                                               */
/* ------------------------------------------------------------------------ */

export interface ExtractOptions {
  /** Appelé après chaque page, pour l'affichage de la progression. */
  onProgress?: (done: number, total: number) => void;
}

export async function extractPdf(file: File, options: ExtractOptions = {}): Promise<ExtractedPdf> {
  const ctx: Contexte = { etape: "lecture du fichier", mode: null };
  try {
    return await extraire(file, options, ctx);
  } catch (cause) {
    if (cause instanceof ExtractionError) throw cause;
    // Tout échec imprévu est rapporté avec son étape : jamais de message nu.
    throw new ExtractionError(
      "extraction_failed",
      `La lecture du PDF a échoué (étape : ${ctx.etape}).` + conseilNavigateur(),
      diagnostic(ctx, cause),
    );
  }
}

async function extraire(file: File, options: ExtractOptions, ctx: Contexte): Promise<ExtractedPdf> {
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

  ctx.etape = "chargement de pdf.js";
  const pdfjs = await loadPdfJs();
  ctx.versionPdfJs = pdfjs.version;

  let ouverture: Ouverture;
  try {
    ouverture = await ouvrir(pdfjs, file, ctx);
  } catch (cause) {
    if (cause instanceof ExtractionError) throw cause;
    throw erreurOuverture(cause, ctx);
  }

  const { loadingTask, doc, worker, surveillance } = ouverture;
  // Un worker qui meurt en cours de route ne doit pas figer l'extraction.
  const surveille = <T>(promesse: Promise<T>): Promise<T> =>
    surveillance ? Promise.race([promesse, surveillance.echec]) : promesse;

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
    // On distingue trois causes de page vide, pour pouvoir le dire ensuite.
    const echecs: string[] = [];
    let premierEchec: { page: number; cause: unknown } | null = null;
    let pagesImage = 0;

    for (let index = 1; index <= numPages; index++) {
      ctx.etape = `page ${index} sur ${numPages}`;
      let raw = "";

      try {
        const page = await surveille(doc.getPage(index));
        const content = await surveille(page.getTextContent());

        // `hasEOL` marque la fin d'une ligne dans la mise en page d'origine.
        raw = content.items
          .map((item) => {
            const textItem = item as TextItem;
            if (typeof textItem.str !== "string") return "";
            return textItem.hasEOL ? `${textItem.str}\n` : textItem.str;
          })
          .join("");

        // Une page sans texte est-elle une image ? La réponse change le
        // diagnostic, donc le message affiché à l'utilisatrice.
        if (!raw.trim() && (await surveille(pageContientUneImage(page, pdfjs)))) pagesImage++;

        page.cleanup();
      } catch (cause) {
        // Worker mort : inutile de continuer page par page.
        if (cause instanceof WorkerHorsService) throw cause;
        // Une page illisible ne fait pas échouer tout le document, mais elle
        // est comptabilisée : c'est ce qui manquait pour diagnostiquer.
        premierEchec ??= { page: index, cause };
        echecs.push(`page ${index} (${decrireErreur(cause)})`);
      }

      const text = clean(raw);
      pages.push({ page: index, text, chars: text.length });
      options.onProgress?.(index, numPages);
    }

    const numChars = pages.reduce((total, page) => total + page.chars, 0);

    if (numChars < MIN_TOTAL_CHARS || numChars / numPages < MIN_CHARS_PER_PAGE) {
      // La plupart des pages ont planté : ce n'est pas un scan, c'est un
      // problème de lecture, et le dire évite une fausse piste.
      if (premierEchec && echecs.length > numPages / 2) {
        ctx.etape = `page ${premierEchec.page} sur ${numPages} (${echecs.length} page(s) en échec)`;
        throw new ExtractionError(
          "extraction_failed",
          `La lecture de ce PDF a échoué sur ${echecs.length} page(s) sur ${numPages}.` +
            conseilNavigateur(),
          diagnostic(ctx, premierEchec.cause),
        );
      }

      const constat = `${numChars} caractère(s) extrait(s) sur ${numPages} page(s)`;
      if (pagesImage > 0) {
        throw new ExtractionError(
          "needs_ocr",
          `Ce PDF ne contient pas de texte sélectionnable : ${pagesImage} page(s) sur ${numPages} sont des images (${constat}). C'est le cas des cours photographiés, scannés, ou faits de captures d'écran. La reconnaissance de caractères (OCR) fera l'objet d'une version ultérieure.`,
        );
      }
      ctx.etape = "analyse du texte extrait";
      throw new ExtractionError(
        "needs_ocr",
        `Ce PDF ne contient pas de texte exploitable (${constat}). S'il s'affiche pourtant avec du texte net, signalez-le avec le détail ci-dessous : le problème viendrait alors de la lecture, pas du document.`,
        diagnostic(
          ctx,
          premierEchec ? premierEchec.cause : `aucune erreur, ${echecs.length} page(s) en échec`,
        ),
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

    const metadata = await surveille(doc.getMetadata()).catch(() => null);
    const info = metadata?.info as { Title?: string } | undefined;

    return {
      text,
      pages,
      numPages,
      numChars,
      title: info?.Title?.trim() || file.name.replace(/\.pdf$/i, ""),
    };
  } finally {
    surveillance?.arreter();
    await loadingTask.destroy().catch(() => {});
    worker?.terminate();
  }
}
