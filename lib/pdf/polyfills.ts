/**
 * Comble les API récentes que pdf.js appelle et que les Safari antérieurs à
 * 17.4 ne fournissent pas. Sans elles, la lecture échoue sur chaque page avec
 * un « undefined is not a function » incompréhensible pour l'utilisatrice.
 *
 * Ce module doit être chargé dans les deux contextes JavaScript : la page et
 * le worker de pdf.js, qui ne partagent pas leurs globales.
 *
 * Chaque correctif est conditionnel : sur un navigateur à jour, ce fichier ne
 * modifie rien.
 */

type Mutable = Record<string, unknown>;

/** API qu'il a fallu combler : sert au diagnostic si la lecture échoue quand même. */
let comblees: string[] = [];

export function apisComblees(): string[] {
  return comblees;
}

export function installPdfPolyfills(): void {
  comblees = apisManquantes();

  const PromiseCtor = Promise as unknown as Mutable;
  const ObjectCtor = Object as unknown as Mutable;
  const globals = globalThis as unknown as Mutable;

  // Promise.withResolvers — Safari 17.4, Chrome 119, Firefox 121.
  if (typeof PromiseCtor.withResolvers !== "function") {
    PromiseCtor.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  // Object.hasOwn — Safari 15.4.
  if (typeof ObjectCtor.hasOwn !== "function") {
    ObjectCtor.hasOwn = (target: object, key: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(target, key);
  }

  // Array.prototype.at et String.prototype.at — Safari 15.4.
  for (const proto of [Array.prototype, String.prototype] as unknown as Mutable[]) {
    if (typeof proto.at !== "function") {
      proto.at = function at(this: { length: number; [i: number]: unknown }, index: number) {
        const i = Math.trunc(index) || 0;
        return this[i < 0 ? this.length + i : i];
      };
    }
  }

  // Array.prototype.findLast / findLastIndex — Safari 15.4.
  const arrayProto = Array.prototype as unknown as Mutable;
  if (typeof arrayProto.findLast !== "function") {
    arrayProto.findLast = function findLast<T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => boolean,
    ) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate(this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }
  if (typeof arrayProto.findLastIndex !== "function") {
    arrayProto.findLastIndex = function findLastIndex<T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => boolean,
    ) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate(this[i], i, this)) return i;
      }
      return -1;
    };
  }

  // structuredClone — Safari 15.4. Version suffisante pour les données que
  // pdf.js échange (objets simples, tableaux, typed arrays).
  if (typeof globals.structuredClone !== "function") {
    globals.structuredClone = <T>(value: T): T =>
      typeof value === "object" && value !== null
        ? (JSON.parse(JSON.stringify(value)) as T)
        : value;
  }
}

/** API récentes absentes du navigateur, avant installation des correctifs. */
function apisManquantes(): string[] {
  const manquantes: string[] = [];
  const P = Promise as unknown as Mutable;
  const O = Object as unknown as Mutable;
  const G = globalThis as unknown as Mutable;
  if (typeof P.withResolvers !== "function") manquantes.push("Promise.withResolvers");
  if (typeof O.hasOwn !== "function") manquantes.push("Object.hasOwn");
  if (typeof G.structuredClone !== "function") manquantes.push("structuredClone");
  if (typeof (Array.prototype as unknown as Mutable).at !== "function") manquantes.push("Array.at");
  return manquantes;
}
