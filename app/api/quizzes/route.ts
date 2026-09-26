import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api";
import { createQuiz, getCourse, listQuizzes } from "@/lib/db";
import { generateQuiz } from "@/lib/quiz/generate";
import type { QuizOptions } from "@/types/quiz";

export const dynamic = "force-dynamic";
// La generation enchaine plusieurs appels au LLM sur les cours longs.
export const maxDuration = 300;

const optionsSchema = z.object({
  courseId: z.string().min(1),
  numQuestions: z.number().int().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
  questionType: z.enum(["single", "multiple", "mixed"]),
  mode: z.enum(["classic", "exam"]),
  timeLimitMinutes: z.number().int().min(1).max(180).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const courseId = request.nextUrl.searchParams.get("courseId") ?? undefined;
    return NextResponse.json({ quizzes: await listQuizzes(courseId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = optionsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(
        `Configuration du QCM invalide : ${parsed.error.issues[0]?.message ?? "champs manquants"}.`,
        "invalid_options",
      );
    }

    const { courseId, ...rest } = parsed.data;
    const course = await getCourse(courseId);
    if (!course) return apiError("Cours introuvable.", "not_found", 404);

    const options: QuizOptions = rest;
    const { quiz, warnings } = await generateQuiz(course.text, options);
    const id = await createQuiz(courseId, quiz, options);

    return NextResponse.json({ quizId: id, numQuestions: quiz.questions.length, warnings }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
