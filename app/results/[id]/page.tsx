import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizResultView } from "@/components/quiz-result";
import { getAttempt, getQuiz } from "@/lib/db";
import { gradeQuiz } from "@/lib/quiz/grade";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attempt = await getAttempt(id);
  if (!attempt) notFound();

  const stored = await getQuiz(attempt.quizId);
  if (!stored) notFound();

  const result = gradeQuiz(stored.quiz.questions, attempt.answers, attempt.durationSeconds);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Tableau de bord
      </Link>

      <QuizResultView
        result={result}
        title={`${stored.title} — ${stored.courseName}`}
        quizId={stored.id}
        courseId={stored.courseId}
      />
    </div>
  );
}
