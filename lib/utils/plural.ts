/** « 1 essai », « 3 essais » — accord et affichage du nombre en une fois. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
