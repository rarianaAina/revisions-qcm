import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCourseFlow } from "./new-course-flow";
import { getLLMStatus } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  const llm = getLLMStatus();

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Tableau de bord
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Nouveau QCM</h1>
        <p className="mt-1 text-sm text-muted">
          Importez le PDF de votre cours, puis choisissez le format du QCM.
        </p>
      </div>

      <NewCourseFlow llmReady={llm.configured} llmMessage={llm.message} />
    </div>
  );
}
