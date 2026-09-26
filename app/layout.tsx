import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { GraduationCap } from "lucide-react";
import { ThemeToggle, themeInitScript } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Révisions — QCM à partir de mes cours",
  description: "Importez un cours en PDF et générez des QCM pour réviser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <GraduationCap className="size-5 text-accent" />
              <span>Révisions</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          Application personnelle de révision — les QCM sont générés automatiquement, vérifiez
          toujours vos cours en cas de doute.
        </footer>
      </body>
    </html>
  );
}
