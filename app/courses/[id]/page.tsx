import { ArrowLeft, RotateCw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizConfig } from "@/components/quiz-config";
import { Card, CardTitle } from "@/components/ui/card";
import { getCourse, listQuizzes } from "@/lib/db";
import { getLLMStatus } from "@/lib/llm";
import { formatDate } from "@/lib/utils/format";
import { DIFFICULTY_LABELS } from "@/types/quiz";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  const quizzes = await listQuizzes(id);
  const llm = getLLMStatus();
  const preview = course.text.replace(/\[\[page:\d+\]\]\n?/g, "").slice(0, 1200);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Tableau de bord
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{course.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {course.fileName} · {course.numPages} page{course.numPages > 1 ? "s" : ""} ·{" "}
          {course.numChars.toLocaleString("fr-FR")} caractères · importé le{" "}
          {formatDate(course.createdAt)}
        </p>
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
          <ul className="space-y-3">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{quiz.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {quiz.numQuestions} question{quiz.numQuestions > 1 ? "s" : ""} ·{" "}
                      {DIFFICULTY_LABELS[quiz.difficulty]} · {formatDate(quiz.createdAt)} ·{" "}
                      {quiz.attemptCount} essai{quiz.attemptCount > 1 ? "s" : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {quiz.bestScore !== null && (
                      <span className="text-sm font-semibold tabular-nums text-accent">
                        {quiz.bestScore} %
                      </span>
                    )}
                    <Link
                      href={`/quiz/${quiz.id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent"
                    >
                      <RotateCw className="size-3.5" />
                      {quiz.attemptCount > 0 ? "Refaire" : "Commencer"}
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
