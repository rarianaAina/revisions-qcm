# Révisions — générateur de QCM à partir de cours PDF

Application web personnelle : importez le PDF d'un cours, l'application en
extrait le texte et génère des QCM auxquels vous répondez, avec correction
automatique, score et explications.

Usage mono-utilisatrice : pas de comptes, pas d'abonnement. Conçue pour être
déployée sur **Vercel**, avec une base Postgres gérée et une API LLM gratuite.

---

## 1. Installation

Prérequis : **Node.js 20+**.

```bash
npm install
```

Il n'y a rien d'autre à installer : l'extraction des PDF se fait dans le
navigateur, il n'y a aucun service séparé à lancer.

## 2. Configuration

```bash
cp .env.example .env.local
```

Deux variables sont obligatoires : `DATABASE_URL` et une clé d'API LLM.

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | URL de connexion Postgres | — (obligatoire) |
| `GEMINI_API_KEY` | clé Google AI Studio, **gratuite** | — |
| `GROQ_API_KEY` | clé Groq, **gratuite** | — |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | alternatives payantes | — |
| `LLM_PROVIDER` | fournisseur principal | détection automatique |
| `LLM_FALLBACK` | `off` pour désactiver la bascule | activée |
| `LLM_MODEL` | modèle du fournisseur principal | dépend du fournisseur |
| `GEMINI_MODEL`, `GROQ_MODEL`, … | modèle d'un fournisseur précis, secours compris | défaut du fournisseur |
| `GEMINI_BASE_URL`, `GROQ_BASE_URL`, … | proxy ou passerelle pour un fournisseur précis | API officielle |
| `LLM_BASE_URL` | pour viser un proxy ou une passerelle compatible | API officielle |

Les clés ne sont lues que côté serveur et ne sont jamais transmises au
navigateur.

### Base de données

N'importe quel Postgres convient. Deux options gratuites :

- **Supabase** — créez un projet, puis *Project Settings → Database →
  Connection string → Transaction pooler*.
- **Neon** — créez un projet, copiez la *Connection string* (intégration
  disponible depuis le tableau de bord Vercel).

> **Sur Vercel, prenez impérativement le *Transaction pooler* (port 6543).**
> La *Direct connection* (`db.<ref>.supabase.co`) n'est joignable qu'en IPv6,
> sauf option IPv4 payante, alors que les fonctions Vercel sortent en IPv4 :
> elle échouera toujours. L'application détecte ce cas et l'explique dans le
> message d'erreur du tableau de bord.

Une fois `DATABASE_URL` renseignée, créez les tables, au choix :

```bash
npm run db:setup
```

ou, sur Supabase, en collant le contenu de [`lib/db/schema.sql`](lib/db/schema.sql)
dans *SQL Editor → New query → Run*. Les deux voies appliquent exactement le
même script, idempotent : vous pouvez le relancer sans risque.

Le script active `ROW LEVEL SECURITY` sans aucune policy sur les trois tables.
Sur Supabase, cela coupe l'accès par l'API REST publique (clé `anon`), que
l'application n'utilise pas : elle se connecte directement en Postgres avec
`DATABASE_URL`, et le propriétaire des tables n'est pas soumis au RLS.

### Fournisseur LLM

**Si aucune clé n'est configurée, l'interface l'indique explicitement et le
bouton de génération reste désactivé.**

L'option recommandée est **Gemini**, gratuite et sans carte bancaire :
créez une clé sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
et renseignez `GEMINI_API_KEY`. Le modèle par défaut est `gemini-3.8-flash`.

**Groq** est une seconde option gratuite, très rapide
([console.groq.com/keys](https://console.groq.com/keys), modèle par défaut
`openai/gpt-oss-120b`). OpenAI et Anthropic restent disponibles si vous
préférez une offre payante.

#### Bascule automatique entre fournisseurs

Renseignez **plusieurs clés** et l'application les enchaîne : si le fournisseur
principal devient indisponible — quota épuisé, clé refusée, panne, erreur
serveur — la génération bascule sur le suivant, sans intervention.

L'ordre par défaut privilégie le gratuit : Gemini, Groq, OpenAI, Anthropic.
`LLM_PROVIDER` force le **principal** ; les autres clés renseignées restent
utilisées en secours. `LLM_FALLBACK=off` désactive la bascule.

La bascule ne se déclenche **que** sur une indisponibilité du fournisseur. Si
le modèle répond mais mal — JSON illisible, réponse tronquée, contenu refusé —
il n'y a pas de bascule : le problème se reproduirait à l'identique ailleurs,
et consommerait un second quota pour rien.

Un fournisseur tombé en panne est écarté pour toute la durée de la génération :
sur un cours long découpé en 6 appels, on ne réinterroge pas six fois un
service dont le quota est déjà épuisé. Chaque bascule est signalée dans les
avertissements affichés à la fin de la génération.

Attention si vous mêlez gratuit et payant : une clé OpenAI ou Anthropic
renseignée **sera** utilisée en secours, donc facturée. Utilisez
`LLM_FALLBACK=off` pour l'éviter. Le fournisseur retenu et sa chaîne de secours
sont affichés sous le bouton de génération.

## 3. Lancer l'application

```bash
npm run dev     # http://localhost:3000
```

Le tableau de bord signale immédiatement si la base ou le fournisseur LLM ne
sont pas configurés.

## 4. Déployer sur Vercel

1. Poussez le dépôt sur GitHub et importez-le depuis le tableau de bord Vercel.
2. Dans *Settings → Environment Variables*, ajoutez `DATABASE_URL` et
   `GEMINI_API_KEY` (plus `LLM_PROVIDER` / `LLM_MODEL` si vous voulez forcer un
   autre fournisseur).
3. Déployez.
4. **Redéployez** si vous avez ajouté les variables après le premier
   déploiement : sur Vercel, une variable d'environnement ne s'applique qu'aux
   déploiements suivants, jamais à ceux déjà en ligne.
5. Appliquez le schéma une fois sur la base de production :
   ```bash
   DATABASE_URL="<url de production>" npm run db:setup
   ```

Aucune configuration particulière n'est nécessaire : l'application est une
application Next.js standard.

### Contraintes de la plateforme prises en compte

- **Corps de requête limité à 4,5 Mo.** Le PDF n'est jamais envoyé au serveur :
  il est lu dans le navigateur et seul le texte extrait transite. Un cours de
  200 pages passe donc sans difficulté.
- **Système de fichiers en lecture seule.** Toute la persistance est en
  Postgres, aucun fichier n'est écrit.
- **Durée maximale d'une fonction : 300 s** (plan Hobby). La route de
  génération déclare `maxDuration = 300`. Un QCM de 30 questions sur un cours
  long enchaîne jusqu'à 6 appels au modèle ; si vous approchez de la limite,
  réduisez le nombre de questions.

## 5. Ajouter un fournisseur LLM

1. Créez `lib/llm/providers/mon-fournisseur.ts` exportant une fonction qui
   renvoie un objet `LLMProvider` (interface dans `lib/llm/types.ts`).
2. Ajoutez son identifiant dans `ProviderId` et une entrée dans le `switch` de
   `lib/llm/index.ts`.

Aucun autre fichier n'a besoin d'être modifié : le reste de l'application ne
connaît que l'interface. Un service exposant l'API « chat completions »
d'OpenAI ne demande même pas de nouveau fichier : réutilisez
`createOpenAICompatibleProvider` avec la bonne `baseURL`.

## 6. Utilisation

1. **Nouveau QCM** — déposez le PDF du cours (25 Mo maximum).
2. Le texte est extrait dans le navigateur, page par page, avec une barre de
   progression, puis un aperçu s'affiche.
3. **Configurez** : nombre de questions (5, 10, 20, 30 ou personnalisé),
   difficulté (facile / moyen / difficile / mixte), type (réponse unique,
   réponses multiples, mélange) et mode (classique ou examen chronométré).
4. **Répondez** : navigation avant/arrière, réponses conservées, barre de
   progression, accès direct à n'importe quelle question.
5. **Corrigez** : score en pourcentage, nombre de bonnes et mauvaises réponses,
   temps écoulé en mode examen, puis pour chaque question votre réponse, la
   bonne réponse, l'explication et la page source du cours.
6. **Refaire** le même QCM ou en **générer un nouveau** depuis le même cours.

Le tableau de bord présente les QCM **regroupés sous le cours** dont ils sont
issus. Chaque QCM peut être supprimé depuis cette liste ou depuis la page du
cours ; la suppression demande une confirmation et emporte l'historique des
scores de ce QCM. Le cours, lui, n'est pas touché.

### PDF scannés

Si le PDF ne contient pas de texte sélectionnable (document photographié ou
scanné), l'import est refusé avec un message explicite : la reconnaissance de
caractères (OCR) n'est pas incluse dans cette version.

## 7. Architecture

```
app/
  page.tsx                 tableau de bord (cours, QCM, scores)
  courses/new/             import d'un PDF puis configuration
  courses/[id]/            détail d'un cours + génération d'un nouveau QCM
  quiz/[id]/               passation du QCM
  results/[id]/            score et correction détaillée
  api/
    courses/               enregistrement du texte extrait, liste, suppression
    quizzes/               génération et lecture d'un QCM
    attempts/              soumission et résultat corrigé
    status/                diagnostic (base de données + fournisseur LLM)

components/
  pdf-upload.tsx           dépôt, extraction locale, progression, erreurs
  quiz-config.tsx          choix du format du QCM
  quiz-question.tsx        une question et ses propositions
  quiz-runner.tsx          navigation, chronomètre, soumission
  quiz-result.tsx          score et correction
  progress-bar.tsx         barre de progression
  theme-toggle.tsx         mode clair / sombre
  ui/                      boutons, cartes, alertes, indicateur de chargement

lib/
  pdf/extract.ts           extraction pdf.js, dans le navigateur
  llm/                     abstraction du fournisseur + prompt système
    providers/             gemini, openai-compatible (OpenAI/Groq), anthropic, ollama
  quiz/
    schema.ts              validation Zod + règles métier
    chunk.ts               découpage des cours longs
    generate.ts            orchestration de la génération
    grade.ts               correction
  db/
    index.ts               accès Postgres
    schema.sql             schéma, appliqué par npm run db:setup
  utils/                   formatage, classes CSS

scripts/db-setup.mjs       création des tables
types/quiz.ts              types partagés
```

### Choix techniques

**L'extraction se fait dans le navigateur.** pdf.js lit le PDF localement ;
seul le texte part vers le serveur. Cela contourne la limite de 4,5 Mo de
Vercel, évite d'héberger un service d'extraction, et le fichier de cours ne
quitte jamais l'appareil.

**Les bonnes réponses ne quittent jamais le serveur pendant la passation.**
La page du QCM ne reçoit que les énoncés, les propositions et le nombre de
réponses attendues. La correction est faite côté serveur à la soumission.

**Validation systématique de la sortie du modèle.** Le JSON renvoyé par le LLM
est validé par Zod puis par des règles métier (4 propositions A–D, pas de
doublon, une seule bonne réponse en mode « réponse unique », au moins deux en
mode « réponses multiples »). Les questions non conformes sont écartées une par
une et signalées, plutôt que de faire échouer tout le QCM.

**Le texte reçu du navigateur est revalidé côté serveur** (longueur, nombre de
pages, taille maximale) avant d'être enregistré.

**Cours longs, et économie de jetons.** `splitTextIntoChunks` découpe le texte
aux frontières de paragraphes. Le nombre de morceaux envoyés au modèle suit le
nombre de questions demandé (environ 8 questions par morceau, 6 morceaux au
maximum) : un QCM de 5 questions ne coûte donc pas autant qu'un de 30. Les
morceaux sont répartis sur tout le cours, et tirés au hasard à l'intérieur de
leur tranche, de sorte que deux QCM successifs portent sur des passages
différents. Pas de base vectorielle ni d'embeddings.

**Requêtes de liste allégées.** Le texte intégral d'un cours et le JSON complet
d'un QCM ne sont chargés que lorsqu'ils servent. Les listes du tableau de bord
ne récupèrent que les colonnes affichées, et comptent les questions avec
`jsonb_array_length` plutôt qu'en rapatriant le document.

**Pages sources.** L'extraction insère des marqueurs `[[page:N]]` dans le texte
envoyé au modèle, ce qui lui permet de citer la page d'origine de chaque
question. Ces marqueurs sont retirés des aperçus affichés.

## 8. Vérifications

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint
npm run build       # build de production
```

## 9. Limites connues

- Pas d'OCR : les PDF scannés sont refusés.
- La qualité des questions dépend directement du modèle choisi ; les offres
  gratuites imposent des quotas (requêtes par minute et par jour).
- Un seul QCM est généré à la fois ; 30 questions sur un cours long peuvent
  prendre une à deux minutes.
- L'extraction mobilise le navigateur : sur un très gros PDF et un téléphone
  ancien, comptez quelques dizaines de secondes.
