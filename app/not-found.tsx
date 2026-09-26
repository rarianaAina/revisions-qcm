import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-sm text-muted">
        Ce cours, ce QCM ou ce résultat n&apos;existe pas (ou plus).
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-accent underline">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
