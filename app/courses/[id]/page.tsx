import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/delete-button";
import { QuizConfig } from "@/components/quiz-config";
import { QuizListItem } from "@/components/quiz-list-item";
import { Card, CardTitle } from "@/components/ui/card";
import { getCourse, listQuizzes } from "@/lib/db";
import { getLLMStatus } from "@/lib/llm";
import { courseDeleteQuestion } from "@/lib/utils/confirm";
import { formatDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  const quizzes = await listQuizzes(id);
  const llm = getLLMStatus();
  const preview = course.text.replace(/\[\[page:\d+\]\]\n?/g, "").slice(0, 1200);
  const attemptTotal = quizzes.reduce((n, q) => n + q.attemptCount, 0);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Tableau de bord
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{course.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {course.fileName} · {course.numPages} page{course.numPages > 1 ? "s" : ""} ·{" "}
          {course.numChars.toLocaleString("fr-FR")} caractères · importé le{" "}
          {formatDate(course.createdAt)}
        </p>
        </div>

        {/* La page disparaît avec le cours : on repart au tableau de bord. */}
        <DeleteButton
          endpoint={`/api/courses/${course.id}`}
          ariaLabel={`Supprimer le cours « ${course.name} »`}
          question={courseDeleteQuestion(quizzes.length, attemptTotal)}
          redirectTo="/"
        />
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm text-accent">Aperçu du texte extrait</summary>
          <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-accent-soft p-3 text-xs leading-relaxed text-muted">
            {preview}
            {course.text.length > 1200 && "…"}
          </p>
        </details>
      </Card>

      <Card>
        <CardTitle className="mb-4">Générer un nouveau QCM</CardTitle>
        <QuizConfig courseId={course.id} llmReady={llm.configured} llmMessage={llm.message} />
      </Card>

      <section className="space-y-3">
        <CardTitle>QCM de ce cours ({quizzes.length})</CardTitle>

        {quizzes.length === 0 ? (
          <Card className="text-center text-sm text-muted">
            Aucun QCM généré sur ce cours pour l&apos;instant.
          </Card>
        ) : (
          <ul className="space-y-2">
            {quizzes.map((quiz) => (
              <QuizListItem key={quiz.id} quiz={quiz} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
