/**
 * Comble les API récentes que pdf.js 6 appelle sans vérifier leur présence, et
 * qui manquent aux Safari (donc à tous les navigateurs d'iPhone : Chrome et
 * Firefox y utilisent aussi WebKit). Sans elles, la lecture échoue avec un
 * « undefined is not a function » incompréhensible pour l'utilisatrice.
 *
 * Seules figurent ici des API effectivement appelées par
 * pdfjs-dist/build/pdf.mjs ou pdf.worker.mjs (6.3.289). Les versions indiquées
 * sont celles de Safari (= iOS) où l'API est apparue.
 *
 * Ce module doit être chargé dans les deux contextes JavaScript : la page et
 * le worker de pdf.js, qui ne partagent pas leurs globales. Il ne doit donc
 * jamais toucher à `window` ni au DOM.
 *
 * Chaque correctif est conditionnel : sur un navigateur à jour, ce fichier ne
 * modifie rien.
 */

type Mutable = Record<string, unknown>;
type Fn = (...args: never[]) => unknown;

/** API comblées par ce module (cumulées : l'installation peut être rejouée). */
const comblees = new Set<string>();

export function apisComblees(): string[] {
  return [...comblees];
}

/** Définit `cle` sur `cible` s'il y manque, comme le ferait le moteur. */
function combler(cible: unknown, cle: PropertyKey, valeur: Fn, nom: string): void {
  if (!cible || typeof (cible as Record<PropertyKey, unknown>)[cle] === "function") return;
  Object.defineProperty(cible, cle, {
    value: valeur,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  comblees.add(nom);
}

export function installPdfPolyfills(): void {
  const G = globalThis as unknown as Mutable;

  // ReadableStream.prototype[Symbol.asyncIterator] / values() — absent de
  // WebKit. pdf.js fait `for await (const value of readableStream)` dans
  // PDFPageProxy.getTextContent (page) et sur la sortie de DecompressionStream
  // (page et worker) : sans itérateur asynchrone, for-await retombe sur
  // Symbol.iterator, et Safari lève « undefined is not a function
  // (near '...t of e...') » sur chaque page.
  if (typeof ReadableStream !== "undefined") {
    const values = function values<T>(
      this: ReadableStream<T>,
      options?: { preventCancel?: boolean },
    ): AsyncIterableIterator<T> {
      const reader = this.getReader();
      const preventCancel = !!options?.preventCancel;
      let libere = false;
      const liberer = () => {
        if (!libere) reader.releaseLock();
        libere = true;
      };
      const iterateur: AsyncIterableIterator<T> = {
        async next() {
          try {
            const { done, value } = await reader.read();
            if (done) liberer();
            return done ? { done: true, value: undefined } : { done: false, value };
          } catch (erreur) {
            liberer();
            throw erreur;
          }
        },
        // Appelé quand la boucle est interrompue (break, return, exception).
        async return(value?: unknown) {
          if (!libere && !preventCancel) {
            const annulation = reader.cancel(value);
            liberer();
            await annulation;
          } else {
            liberer();
          }
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      return iterateur;
    };
    combler(ReadableStream.prototype, "values", values, "ReadableStream.prototype.values");
    combler(
      ReadableStream.prototype,
      Symbol.asyncIterator,
      values,
      "ReadableStream.prototype[Symbol.asyncIterator]",
    );
  }

  // Promise.withResolvers — Safari 17.4. Appelé partout dans pdf.js.
  combler(
    Promise,
    "withResolvers",
    function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
    "Promise.withResolvers",
  );

  // Promise.try — Safari 18.2. Utilisé par le MessageHandler de pdf.js pour
  // chaque message entre la page et le worker.
  combler(
    Promise,
    "try",
    function promiseTry(fn: (...a: unknown[]) => unknown, ...args: unknown[]) {
      return new Promise((resolve) => resolve(fn(...args)));
    },
    "Promise.try",
  );

  // Object.hasOwn — Safari 15.4.
  combler(
    Object,
    "hasOwn",
    (target: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(target, key),
    "Object.hasOwn",
  );

  // Array.prototype.at — Safari 15.4.
  combler(
    Array.prototype,
    "at",
    function at(this: unknown[], index: number) {
      const i = Math.trunc(index) || 0;
      return this[i < 0 ? this.length + i : i];
    },
    "Array.prototype.at",
  );

  // Array.prototype.findLast — Safari 15.4.
  combler(
    Array.prototype,
    "findLast",
    function findLast<T>(this: T[], predicate: (value: T, index: number, array: T[]) => boolean) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate(this[i], i, this)) return this[i];
      }
      return undefined;
    },
    "Array.prototype.findLast",
  );

  // structuredClone — Safari 15.4. Version suffisante pour les données que
  // pdf.js échange (objets simples, tableaux, typed arrays).
  combler(
    G,
    "structuredClone",
    <T>(value: T): T =>
      typeof value === "object" && value !== null
        ? (JSON.parse(JSON.stringify(value)) as T)
        : value,
    "structuredClone",
  );

  // Map/WeakMap.prototype.getOrInsert(Computed) — proposition « upsert »,
  // très récente. pdf.js 6 s'en sert pour ses caches, sans repli.
  for (const [proto, nom] of [
    [Map.prototype, "Map"],
    [WeakMap.prototype, "WeakMap"],
  ] as const) {
    combler(
      proto,
      "getOrInsert",
      function getOrInsert(this: Map<unknown, unknown>, key: unknown, value: unknown) {
        if (!this.has(key)) this.set(key, value);
        return this.get(key);
      },
      `${nom}.prototype.getOrInsert`,
    );
    combler(
      proto,
      "getOrInsertComputed",
      function getOrInsertComputed(
        this: Map<unknown, unknown>,
        key: unknown,
        calcul: (key: unknown) => unknown,
      ) {
        if (!this.has(key)) this.set(key, calcul(key));
        return this.get(key);
      },
      `${nom}.prototype.getOrInsertComputed`,
    );
  }

  // Set.prototype.intersection — Safari 17 (worker, destinations nommées).
  combler(
    Set.prototype,
    "intersection",
    function intersection(this: Set<unknown>, autre: { has(v: unknown): boolean }) {
      return new Set([...this].filter((v) => autre.has(v)));
    },
    "Set.prototype.intersection",
  );

  // Helpers d'itérateurs — Safari 18.4. pdf.js exécute dès son chargement
  // `if (typeof Iterator.prototype.join !== "function")` : sans global
  // `Iterator`, le module entier plante (ReferenceError). Il appelle ensuite
  // `keys().filter(…).toArray()`, `values().some(…)`, `keys().find(…)`.
  const IteratorProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  if (typeof G.Iterator === "undefined") {
    const Iterator = function Iterator() {} as unknown as { prototype: unknown };
    Iterator.prototype = IteratorProto;
    G.Iterator = Iterator;
    comblees.add("Iterator");
  }
  type It = Iterable<unknown>;
  type Cb = (value: unknown, index: number) => unknown;
  const iteratorMethods: Record<string, (this: It, fn: Cb) => unknown> = {
    *map(fn) {
      let i = 0;
      for (const v of this) yield fn(v, i++);
    },
    *filter(fn) {
      let i = 0;
      for (const v of this) if (fn(v, i++)) yield v;
    },
    some(fn) {
      let i = 0;
      for (const v of this) if (fn(v, i++)) return true;
      return false;
    },
    find(fn) {
      let i = 0;
      for (const v of this) if (fn(v, i++)) return v;
      return undefined;
    },
    forEach(fn) {
      let i = 0;
      for (const v of this) fn(v, i++);
    },
    toArray() {
      return [...this];
    },
  };
  for (const [cle, fn] of Object.entries(iteratorMethods)) {
    combler(IteratorProto, cle, fn, `Iterator.prototype.${cle}`);
  }

  // Math.sumPrecise — très récent. Somme naïve : la précision exacte n'a pas
  // d'incidence sur l'extraction de texte.
  combler(
    Math,
    "sumPrecise",
    (nombres: Iterable<number>) => {
      let total = 0;
      for (const n of nombres) total += n;
      return total;
    },
    "Math.sumPrecise",
  );

  // ArrayBuffer.prototype.transferToFixedLength — Safari 17.4 (sérialisation
  // des polices dans le worker). Copie au lieu de détacher : même résultat.
  combler(
    ArrayBuffer.prototype,
    "transferToFixedLength",
    function transferToFixedLength(this: ArrayBuffer, longueur?: number) {
      const taille = longueur === undefined ? this.byteLength : longueur;
      const copie = new ArrayBuffer(taille);
      new Uint8Array(copie).set(new Uint8Array(this, 0, Math.min(taille, this.byteLength)));
      return copie;
    },
    "ArrayBuffer.prototype.transferToFixedLength",
  );

  // Uint8Array.prototype.toHex / toBase64, Uint8Array.fromBase64 — Safari
  // 18.2. toHex sert à l'empreinte du document, calculée dès son ouverture.
  combler(
    Uint8Array.prototype,
    "toHex",
    function toHex(this: Uint8Array) {
      let s = "";
      for (const octet of this) s += octet.toString(16).padStart(2, "0");
      return s;
    },
    "Uint8Array.prototype.toHex",
  );
  combler(
    Uint8Array.prototype,
    "toBase64",
    function toBase64(this: Uint8Array) {
      let s = "";
      for (let i = 0; i < this.length; i += 0x8000) {
        s += String.fromCharCode(...this.subarray(i, i + 0x8000));
      }
      return btoa(s);
    },
    "Uint8Array.prototype.toBase64",
  );
  combler(
    Uint8Array,
    "fromBase64",
    (chaine: string) => {
      const binaire = atob(chaine.replace(/[\t\n\f\r ]/g, ""));
      const octets = new Uint8Array(binaire.length);
      for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
      return octets;
    },
    "Uint8Array.fromBase64",
  );

  // URL.parse — Safari 18.
  if (typeof URL !== "undefined") {
    combler(
      URL,
      "parse",
      (url: string | URL, base?: string | URL) => {
        try {
          return new URL(url, base);
        } catch {
          return null;
        }
      },
      "URL.parse",
    );
  }

  // AbortSignal.any — Safari 17.4 (page uniquement).
  if (typeof AbortSignal !== "undefined" && typeof AbortController !== "undefined") {
    combler(
      AbortSignal,
      "any",
      (signaux: Iterable<AbortSignal>) => {
        const controleur = new AbortController();
        for (const signal of signaux) {
          if (signal.aborted) {
            controleur.abort(signal.reason);
            break;
          }
          signal.addEventListener("abort", () => controleur.abort(signal.reason), {
            once: true,
          });
        }
        return controleur.signal;
      },
      "AbortSignal.any",
    );
  }
}
