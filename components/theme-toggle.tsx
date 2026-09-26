"use client";

import { Moon, Sun } from "lucide-react";

/** Script injecte avant l'hydratation pour eviter le flash de theme clair. */
export const themeInitScript = `
try {
  var stored = localStorage.getItem("theme");
  var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

/**
 * Le theme vit dans la classe `dark` de <html>, pas dans un etat React :
 * les deux icones sont rendues et le CSS affiche la bonne. Cela evite tout
 * decalage entre le rendu serveur et le navigateur.
 */
export function ThemeToggle() {
  const toggle = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      // navigation privee : le choix ne sera simplement pas memorise
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Basculer entre le mode clair et le mode sombre"
      className="rounded-lg border border-line p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent"
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </button>
  );
}
