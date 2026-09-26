"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { PdfUpload } from "@/components/pdf-upload";
import { QuizConfig } from "@/components/quiz-config";
import { Card, CardTitle } from "@/components/ui/card";
import type { CourseSummary } from "@/types/quiz";

/** Enchaine import du PDF -> aperçu du texte -> configuration du QCM. */
export function NewCourseFlow({
  llmReady,
  llmMessage,
}: {
  llmReady: boolean;
  llmMessage: string;
}) {
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [preview, setPreview] = useState("");

  if (!course) {
    return (
      <PdfUpload
        onUploaded={(uploaded, extractedPreview) => {
          setCourse(uploaded);
          setPreview(extractedPreview);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="truncate font-medium">{course.name}</p>
            <p className="mt-1 text-xs text-muted">
              {course.fileName} · {course.numPages} page{course.numPages > 1 ? "s" : ""} ·{" "}
              {course.numChars.toLocaleString("fr-FR")} caractères extraits
            </p>
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-accent">
            Aperçu du texte extrait
          </summary>
          <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-accent-soft p-3 text-xs leading-relaxed text-muted">
            {preview}
            {preview.length >= 1200 && "…"}
          </p>
        </details>
      </Card>

      <Card>
        <CardTitle className="mb-4">Configuration du QCM</CardTitle>
        <QuizConfig courseId={course.id} llmReady={llmReady} llmMessage={llmMessage} />
      </Card>
    </div>
  );
}
