import { BookOpen, FileText, ListChecks, Plus, RotateCw } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { databaseReady, listCourses, listQuizzes } from "@/lib/db";
import { getLLMStatus } from "@/lib/llm";
import { DIFFICULTY_LABELS } from "@/types/quiz";
import { formatDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const llm = getLLMStatus();
  const database = await databaseReady();

  // Sans schéma en place, inutile d'interroger les tables : on affiche le
  // diagnostic plutôt qu'une page en erreur.
  const [courses, quizzes] = database.ok
    ? await Promise.all([listCourses(), listQuizzes()])
    : [[], []];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted">
            Importez un cours, générez un QCM, révisez.
          </p>
        </div>
        <Link
          href="/courses/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Nouveau QCM
        </Link>
      </div>

      {!database.ok && (
        <Alert tone="error" title="Base de données indisponible">
          {database.message}
        </Alert>
      )}

      {!llm.configured && (
        <Alert tone="warning" title="Fournisseur de génération non configuré">
          {llm.message}
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-accent" />
          <CardTitle>Mes cours</CardTitle>
          <span className="text-sm text-muted">({courses.length})</span>
        </div>

        {courses.length === 0 ? (
          <Card className="text-center text-sm text-muted">
            <FileText className="mx-auto size-6 text-muted" />
            <p className="mt-2">Aucun cours importé pour le moment.</p>
            <Link href="/courses/new" className="mt-1 inline-block text-accent underline">
              Importer un premier PDF
            </Link>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.id}>
                <Link href={`/courses/${course.id}`} className="block">
                  <Card className="h-full transition-colors hover:border-accent/50">
                    <p className="truncate font-medium">{course.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      Importé le {formatDate(course.createdAt)} · {course.numPages} page
                      {course.numPages > 1 ? "s" : ""}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {course.quizCount} QCM généré{course.quizCount > 1 ? "s" : ""}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-accent" />
          <CardTitle>Mes QCM</CardTitle>
          <span className="text-sm text-muted">({quizzes.length})</span>
        </div>

        {quizzes.length === 0 ? (
          <Card className="text-center text-sm text-muted">
            Aucun QCM pour l&apos;instant. Ouvrez un cours pour en générer un.
          </Card>
        ) : (
          <ul className="space-y-3">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{quiz.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {quiz.courseName} · {quiz.numQuestions} question
                      {quiz.numQuestions > 1 ? "s" : ""} · {DIFFICULTY_LABELS[quiz.difficulty]} ·{" "}
                      {formatDate(quiz.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {quiz.bestScore === null ? (
                      <span className="text-xs text-muted">Jamais passé</span>
                    ) : (
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
