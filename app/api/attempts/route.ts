import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api";
import { createAttempt, getQuiz } from "@/lib/db";
import { gradeQuiz } from "@/lib/quiz/grade";
import type { AnswerMap } from "@/types/quiz";

export const dynamic = "force-dynamic";

const submissionSchema = z.object({
  quizId: z.string().min(1),
  // Cles JSON : toujours des chaines, converties en numeros ci-dessous.
  answers: z.record(z.string(), z.array(z.string())),
  durationSeconds: z.number().int().min(0).nullable().optional(),
});

/** Corrige une soumission cote serveur et enregistre l'essai. */
export async function POST(request: NextRequest) {
  try {
    const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("Soumission invalide.", "invalid_submission");

    const stored = await getQuiz(parsed.data.quizId);
    if (!stored) return apiError("QCM introuvable.", "not_found", 404);

    const answers: AnswerMap = {};
    for (const [key, value] of Object.entries(parsed.data.answers)) {
      const id = Number(key);
      if (Number.isInteger(id)) answers[id] = value;
    }

    const result = gradeQuiz(stored.quiz.questions, answers, parsed.data.durationSeconds ?? null);
    const attempt = await createAttempt({
      quizId: stored.id,
      answers,
      score: result.score,
      total: result.total,
      percentage: result.percentage,
      durationSeconds: result.durationSeconds,
    });

    return NextResponse.json({ attemptId: attempt.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
