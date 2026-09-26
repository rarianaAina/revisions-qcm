import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api";
import { getAttempt, getQuiz } from "@/lib/db";
import { gradeQuiz } from "@/lib/quiz/grade";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Resultat detaille : corrections, explications et pages sources. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const attempt = await getAttempt(id);
    if (!attempt) return apiError("Résultat introuvable.", "not_found", 404);

    const stored = await getQuiz(attempt.quizId);
    if (!stored) return apiError("QCM introuvable.", "not_found", 404);

    const result = gradeQuiz(stored.quiz.questions, attempt.answers, attempt.durationSeconds);

    return NextResponse.json({
      attemptId: attempt.id,
      quizId: stored.id,
      quizTitle: stored.title,
      courseId: stored.courseId,
      courseName: stored.courseName,
      mode: stored.mode,
      createdAt: attempt.createdAt,
      result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
