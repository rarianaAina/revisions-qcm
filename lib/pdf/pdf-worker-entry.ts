/**
 * Point d'entrée du worker de pdf.js.
 *
 * Le worker possède son propre contexte JavaScript : les correctifs installés
 * par la page ne s'y appliquent pas. On les rejoue donc ici, avant de charger
 * le worker de pdf.js — sans quoi la lecture échoue sur chaque page dans les
 * Safari antérieurs à 17.4.
 */
import { installPdfPolyfills } from "./polyfills";

installPdfPolyfills();

await import("pdfjs-dist/build/pdf.worker.min.mjs");
