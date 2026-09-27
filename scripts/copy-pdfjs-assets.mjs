/**
 * Copie dans public/pdfjs les ressources dont pdf.js a besoin à l'exécution :
 *
 * - cmaps : tables de correspondance des polices CID. Sans elles, les PDF
 *   produits par Word, Google Docs ou InDesign avec des polices asiatiques ou
 *   des sous-ensembles encodés en Identity-H rendent un texte vide ou illisible.
 * - standard_fonts : les 14 polices PostScript de base, pour les PDF qui ne
 *   les embarquent pas.
 *
 * Ces fichiers viennent de node_modules : ils ne sont pas versionnés.
 */
import { cp, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(process.cwd(), "public", "pdfjs");

for (const dossier of ["cmaps", "standard_fonts"]) {
  const src = path.join(pdfjsRoot, dossier);
  const dest = path.join(target, dossier);
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log(`pdfjs: ${dossier} -> public/pdfjs/${dossier} (${(await readdir(dest)).length} fichiers)`);
}
