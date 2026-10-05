import { notFound } from "next/navigation";
import { QuizRunner, type PlayableQuiz } from "@/components/quiz-runner";
import { getQuiz } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await getQuiz(id);
  if (!stored) notFound();

  // Mode classique : la solution est transmise pour corriger chaque question
  // des le clic (application personnelle, la triche n'est pas un enjeu).
  // Mode examen : les bonnes reponses et les explications restent cote
  // serveur, seul le nombre de reponses attendues est transmis.
  const instantFeedback = stored.mode === "classic";

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
      ...(instantFeedback && {
        solution: {
          correctAnswers: question.correctAnswers,
          explanation: question.explanation,
        },
      }),
    })),
  };

  return <QuizRunner quiz={quiz} />;
}
