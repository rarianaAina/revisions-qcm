/**
 * JSON Schema du QCM, transmis aux fournisseurs qui savent contraindre leur
 * sortie (OpenAI, Anthropic, Gemini). Il double le schema Zod : Zod reste la
 * validation qui fait foi, ce schema n'est qu'une aide au modele.
 */
export const QUIZ_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions"],
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "choices", "correctAnswers", "explanation", "sourcePage"],
        properties: {
          id: { type: "integer" },
          question: { type: "string" },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "text"],
              properties: {
                id: { type: "string", enum: ["A", "B", "C", "D"] },
                text: { type: "string" },
              },
            },
          },
          correctAnswers: {
            type: "array",
            minItems: 1,
            items: { type: "string", enum: ["A", "B", "C", "D"] },
          },
          explanation: { type: "string" },
          sourcePage: { type: ["integer", "null"] },
        },
      },
    },
  },
} as const;
