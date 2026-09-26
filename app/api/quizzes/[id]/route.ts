import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api";
import { getQuiz } from "@/lib/db";
import type { PublicQuestion } from "@/types/quiz";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Renvoie le QCM pour la passation.
 * Les bonnes reponses et les explications sont volontairement retirees : la
 * correction se fait cote serveur, a la soumission.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const stored = await getQuiz(id);
    if (!stored) return apiError("QCM introuvable.", "not_found", 404);

    const questions: PublicQuestion[] = stored.quiz.questions.map((question) => ({
      id: question.id,
      question: question.question,
      choices: question.choices,
      sourcePage: question.sourcePage,
    }));

    return NextResponse.json({
      id: stored.id,
      title: stored.title,
      courseId: stored.courseId,
      courseName: stored.courseName,
      mode: stored.mode,
      difficulty: stored.difficulty,
      timeLimitMinutes: stored.timeLimitMinutes,
      // Le nombre de bonnes reponses attendues guide l'interface (case a
      // cocher ou bouton radio) sans reveler lesquelles.
      questions: questions.map((q, i) => ({
        ...q,
        expectedAnswers: stored.quiz.questions[i].correctAnswers.length,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
