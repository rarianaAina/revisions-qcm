import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api";
import { deleteCourse, getCourse, listQuizzes } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const course = await getCourse(id);
    if (!course) return apiError("Cours introuvable.", "not_found", 404);

    const { text, ...summary } = course;
    return NextResponse.json({
      course: summary,
      preview: text.replace(/\[\[page:\d+\]\]\n?/g, "").slice(0, 1200),
      quizzes: await listQuizzes(id),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!(await deleteCourse(id))) return apiError("Cours introuvable.", "not_found", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
