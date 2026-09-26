import { notFound } from "next/navigation";
import { QuizRunner, type PlayableQuiz } from "@/components/quiz-runner";
import { getQuiz } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await getQuiz(id);
  if (!stored) notFound();

  // Les bonnes reponses et les explications restent cote serveur : seul le
  // nombre de reponses attendues est transmis, pour choisir radio ou case.
  const quiz: PlayableQuiz = {
    id: stored.id,
    title: stored.title,
    courseName: stored.courseName,
    mode: stored.mode,
    timeLimitMinutes: stored.timeLimitMinutes,
    questions: stored.quiz.questions.map((question) => ({
      id: question.id,
      question: question.question,
      choices: question.choices,
      sourcePage: question.sourcePage,
      expectedAnswers: question.correctAnswers.length,
    })),
  };

  return <QuizRunner quiz={quiz} />;
}
