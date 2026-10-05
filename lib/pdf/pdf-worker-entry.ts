/**
 * Point d'entrée du worker de pdf.js.
 *
 * Le worker possède son propre contexte JavaScript : les correctifs installés
 * par la page ne s'y appliquent pas. On les rejoue donc ici, avant de charger
 * le worker de pdf.js — sans quoi la lecture échoue sur chaque page dans les
 * Safari antérieurs à 17.4.
 */
import { installPdfPolyfills } from "./polyfills";

try {
  installPdfPolyfills();
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
} catch (cause) {
  // Selon les navigateurs, un module de worker qui échoue ne déclenche pas
  // toujours d'événement « error » côté page : on le signale explicitement
  // (voir surveillerWorker dans extract.ts), avec l'erreur d'origine.
  self.postMessage({
    echecDemarrageWorker: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
  });
  throw cause;
}
