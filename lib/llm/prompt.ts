import type { Difficulty, QuestionType } from "@/types/quiz";
import { DIFFICULTY_LABELS } from "@/types/quiz";

const DIFFICULTY_GUIDANCE: Record<Difficulty, string> = {
  easy: "Questions de restitution : définitions, faits explicitement énoncés dans le cours.",
  medium:
    "Questions de compréhension : reformulations, distinctions entre notions proches, application directe.",
  hard: "Questions d'analyse : cas d'application, comparaisons, conséquences, pièges conceptuels fins.",
  mixed:
    "Répartis les questions sur les trois niveaux : environ un tiers de restitution, un tiers de compréhension, un tiers d'analyse.",
};

const TYPE_GUIDANCE: Record<QuestionType, string> = {
  single: "Chaque question a EXACTEMENT UNE bonne réponse : `correctAnswers` contient un seul identifiant.",
  multiple:
    "Chaque question a AU MOINS DEUX bonnes réponses : `correctAnswers` contient 2 ou 3 identifiants (jamais les 4).",
  mixed:
    "Alterne : environ deux tiers de questions à une seule bonne réponse, un tiers à réponses multiples (2 ou 3 bonnes réponses, jamais les 4). Dans tous les cas `correctAnswers` reflète exactement le nombre de bonnes réponses.",
};

export const SYSTEM_PROMPT = `Tu es un enseignant qui rédige des QCM d'entraînement pour une étudiante, à partir de ses supports de cours.

RÈGLES ABSOLUES
1. Tu ne poses des questions QUE sur le contenu du cours fourni. Tu n'ajoutes aucune connaissance extérieure, même si elle est exacte.
2. Si le cours ne contient pas assez de matière pour le nombre de questions demandé, tu produis moins de questions plutôt que d'inventer.
3. Tu produis exactement le nombre de questions demandé lorsque le cours le permet.
4. Chaque question comporte exactement 4 propositions, identifiées A, B, C et D.
5. Avant d'écrire une bonne réponse, tu vérifies qu'elle est littéralement justifiée par un passage du cours.
6. Les distracteurs sont plausibles : ce sont des confusions réalistes (notion voisine, valeur proche, cause inversée), jamais des absurdités ni des remplissages du type « aucune de ces réponses ».
7. Les propositions ont des longueurs comparables : la bonne réponse ne doit pas se repérer à sa taille.
8. Tu répartis les bonnes réponses entre A, B, C et D de façon équilibrée sur l'ensemble du QCM.
9. Aucune question ambiguë : une seule lecture possible, pas de « parfois », pas de double négation, pas de question dont la réponse dépend du contexte.
10. Chaque question porte sur une notion différente. Pas de doublon ni de reformulation d'une autre question.
11. L'énoncé est autoportant : il ne renvoie jamais au support (« d'après le document », « selon le paragraphe 3 »).
12. Tu fournis pour chaque question une explication de 1 à 3 phrases, qui dit pourquoi la bonne réponse est correcte et, si utile, pourquoi le distracteur le plus tentant ne l'est pas.
13. Le texte du cours contient des marqueurs \`[[page:N]]\`. Tu indiques dans \`sourcePage\` le numéro de la page d'où provient la notion. Si tu n'en es pas sûr, tu mets null. Ces marqueurs ne doivent jamais apparaître dans tes questions.
14. Tu rédiges en français.

FORMAT DE SORTIE
Tu réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans bloc de code markdown. Structure exacte :

{
  "title": "QCM - <thème du cours>",
  "questions": [
    {
      "id": 1,
      "question": "Énoncé de la question ?",
      "choices": [
        { "id": "A", "text": "Proposition A" },
        { "id": "B", "text": "Proposition B" },
        { "id": "C", "text": "Proposition C" },
        { "id": "D", "text": "Proposition D" }
      ],
      "correctAnswers": ["B"],
      "explanation": "Pourquoi B est correct.",
      "sourcePage": 12
    }
  ]
}`;

export interface UserPromptInput {
  text: string;
  numQuestions: number;
  difficulty: Difficulty;
  questionType: QuestionType;
  /** Enoncés déjà produits sur d'autres parties du cours, pour éviter les doublons. */
  avoidQuestions?: string[];
  /** Indication de position quand le cours est découpé. */
  chunkInfo?: { index: number; total: number };
}

export function buildUserPrompt({
  text,
  numQuestions,
  difficulty,
  questionType,
  avoidQuestions = [],
  chunkInfo,
}: UserPromptInput): string {
  const parts: string[] = [];

  if (chunkInfo && chunkInfo.total > 1) {
    parts.push(
      `Ce texte est la partie ${chunkInfo.index + 1} sur ${chunkInfo.total} d'un cours plus long. Ne pose des questions que sur cette partie.`,
    );
  }

  parts.push(
    `CONSIGNE
- Nombre de questions à produire : ${numQuestions}
- Niveau de difficulté : ${DIFFICULTY_LABELS[difficulty]}. ${DIFFICULTY_GUIDANCE[difficulty]}
- Type de questions : ${TYPE_GUIDANCE[questionType]}`,
  );

  if (avoidQuestions.length > 0) {
    parts.push(
      `QUESTIONS DÉJÀ POSÉES — n'en produis aucune équivalente :\n${avoidQuestions
        .map((q) => `- ${q}`)
        .join("\n")}`,
    );
  }

  parts.push(`CONTENU DU COURS
<<<COURS
${text}
COURS`);

  parts.push(
    `Produis maintenant le JSON du QCM (${numQuestions} questions) en respectant strictement le format demandé.`,
  );

  return parts.join("\n\n");
}
