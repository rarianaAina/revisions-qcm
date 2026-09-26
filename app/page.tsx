import { BookOpen, FileText, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { QuizListItem } from "@/components/quiz-list-item";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { databaseReady, listCourses, listQuizzes } from "@/lib/db";
import { getLLMStatus } from "@/lib/llm";
import { formatDate } from "@/lib/utils/format";
import { courseDeleteQuestion } from "@/lib/utils/confirm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const llm = getLLMStatus();
  const database = await databaseReady();

  // Sans schéma en place, inutile d'interroger les tables : on affiche le
  // diagnostic plutôt qu'une page en erreur.
  const [courses, quizzes] = database.ok
    ? await Promise.all([listCourses(), listQuizzes()])
    : [[], []];

  // Les QCM sont présentés sous le cours dont ils sont issus.
  const byCourse = new Map<string, typeof quizzes>();
  for (const quiz of quizzes) {
    const list = byCourse.get(quiz.courseId);
    if (list) list.push(quiz);
    else byCourse.set(quiz.courseId, [quiz]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted">
            {courses.length === 0
              ? "Importez un cours, générez un QCM, révisez."
              : `${courses.length} cours · ${quizzes.length} QCM`}
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
          <ul className="space-y-4">
            {courses.map((course) => {
              const courseQuizzes = byCourse.get(course.id) ?? [];
              const attempts = courseQuizzes.reduce((n, q) => n + q.attemptCount, 0);

              return (
                <li key={course.id}>
                  <Card className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/courses/${course.id}`}
                          className="truncate font-medium hover:text-accent"
                        >
                          {course.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {course.numPages} page{course.numPages > 1 ? "s" : ""} · importé le{" "}
                          {formatDate(course.createdAt)} · {courseQuizzes.length} QCM
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={`/courses/${course.id}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors hover:bg-accent-soft hover:text-accent"
                        >
                          <Sparkles className="size-3.5" /> Nouveau QCM
                        </Link>
                        <DeleteButton
                          endpoint={`/api/courses/${course.id}`}
                          ariaLabel={`Supprimer le cours « ${course.name} »`}
                          question={courseDeleteQuestion(courseQuizzes.length, attempts)}
                        />
                      </div>
                    </div>

                    {courseQuizzes.length === 0 ? (
                      <p className="text-xs text-muted">
                        Aucun QCM sur ce cours.{" "}
                        <Link href={`/courses/${course.id}`} className="text-accent underline">
                          En générer un
                        </Link>
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {courseQuizzes.map((quiz) => (
                          <QuizListItem key={quiz.id} quiz={quiz} />
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
