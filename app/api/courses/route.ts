import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api";
import { createCourse, listCourses } from "@/lib/db";
import { MAX_PAGES, MAX_TEXT_CHARS } from "@/lib/pdf/extract";

export const dynamic = "force-dynamic";

/**
 * Le texte est extrait dans le navigateur (voir lib/pdf/extract.ts) : cette
 * route reçoit le résultat, pas le PDF. Les valeurs venant du client sont
 * donc revalidées ici.
 */
const courseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(300),
  numPages: z.number().int().min(1).max(MAX_PAGES),
  text: z.string().min(300, "le texte extrait est trop court pour servir de cours"),
});

export async function GET() {
  try {
    return NextResponse.json({ courses: await listCourses() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = courseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(
        `Cours invalide : ${parsed.error.issues[0]?.message ?? "champs manquants"}.`,
        "invalid_course",
      );
    }

    const { text } = parsed.data;
    if (text.length > MAX_TEXT_CHARS) {
      return apiError(
        `Le texte extrait dépasse ${MAX_TEXT_CHARS.toLocaleString("fr-FR")} caractères. Découpez le cours en plusieurs PDF.`,
        "text_too_large",
        413,
      );
    }

    const course = await createCourse({
      name: parsed.data.name,
      fileName: parsed.data.fileName,
      numPages: parsed.data.numPages,
      // Recalculé côté serveur plutôt que repris du client (hors marqueurs).
      numChars: text.replace(/\[\[page:\d+\]\]\n?/g, "").length,
      text,
    });

    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
