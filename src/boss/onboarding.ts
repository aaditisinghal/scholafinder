/**
 * Onboarding — the first thing a student hits after texting "let's get started".
 * A short, ordered list of questions; each free-text reply is parsed by Gemini into the
 * structured field (rather than requiring exact keywords) since this runs over plain iMessage text.
 *
 * The questions themselves are deliberately fixed text, not Gemini-generated per send — see
 * src/boss/voice.ts for why (answer-parsing reliability and per-turn latency both matter more
 * than wording variety for a 7-question data-collection flow).
 */
import { askForJson, Type, type Schema } from "../llm.js";
import { pool } from "../db/pool.js";
import type { StudentPreferences } from "../types.js";

interface Question {
  field: keyof StudentPreferences | "rankingBand" | "subjectAndRanking";
  prompt: string;
}

export const ONBOARDING_QUESTIONS: Question[] = [
  { field: "culture", prompt: "First up: what's your vibe for campus culture — startup energy, corporate/professional, liberal arts, research-heavy, or more arts-focused?" },
  { field: "setting", prompt: "Urban, suburban, or rural — where do you actually want to be?" },
  { field: "aidType", prompt: "Let's talk money: full ride, full tuition only, partial aid, or are you open to anything that gets the number down?" },
  { field: "rankingBand", prompt: "Got a world-ranking range in mind? (\"top 50\", \"100-300\", whatever ballpark you're aiming for)" },
  { field: "subjectAndRanking", prompt: "What do you want to study — and does that subject's own ranking matter to you, or mostly the school's overall name?" },
  { field: "satScore", prompt: "SAT score — actual or expected? Text \"skip\" if it doesn't apply to you." },
  { field: "ieltsScore", prompt: "Last one — IELTS score, actual or expected? \"skip\" works here too if it's not applicable." },
];

export interface OnboardingSession {
  studentId: string;
  stepIndex: number;
  answers: Partial<StudentPreferences>;
}

export function startSession(studentId: string): OnboardingSession {
  return { studentId, stepIndex: 0, answers: {} };
}

export function currentQuestion(session: OnboardingSession): Question | null {
  return ONBOARDING_QUESTIONS[session.stepIndex] ?? null;
}

// Every schema forces an OBJECT wrapper (never a bare `null`) — askForJson's caller always
// gets a destructurable object back, even when the model couldn't extract anything useful.
const RANKING_BAND_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { min: { type: Type.INTEGER, nullable: true }, max: { type: Type.INTEGER, nullable: true } },
  required: ["min", "max"],
};
const SUBJECT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING, nullable: true },
    subjectRankingMax: { type: Type.INTEGER, nullable: true },
  },
  required: ["subject", "subjectRankingMax"],
};
const NUMBER_VALUE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { value: { type: Type.NUMBER, nullable: true } },
  required: ["value"],
};
function enumValueSchema(values: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: { value: { type: Type.STRING, enum: values, nullable: true } },
    required: ["value"],
  };
}

async function parseAnswer(question: Question, answerText: string): Promise<Partial<StudentPreferences>> {
  if (/^skip$/i.test(answerText.trim())) return {};

  switch (question.field) {
    case "rankingBand": {
      const { min, max } = await askForJson<{ min: number | null; max: number | null }>({
        system: `Parse a world-ranking range from free text into {min, max} integers, or nulls if not parseable. "top 50" -> {min:1,max:50}.`,
        prompt: answerText,
        maxTokens: 100,
        schema: RANKING_BAND_SCHEMA,
      });
      return { minWorldRanking: min ?? undefined, maxWorldRanking: max ?? undefined };
    }
    case "subjectAndRanking": {
      const { subject, subjectRankingMax } = await askForJson<{ subject: string | null; subjectRankingMax: number | null }>({
        system: `Parse a subject name and an optional max subject-ranking threshold from free text into {subject, subjectRankingMax}.`,
        prompt: answerText,
        maxTokens: 100,
        schema: SUBJECT_SCHEMA,
      });
      return { subject: subject ?? undefined, subjectRankingMax: subjectRankingMax ?? undefined };
    }
    case "satScore":
    case "ieltsScore": {
      const { value } = await askForJson<{ value: number | null }>({
        system: `Extract a single numeric test score from free text, or null if not given.`,
        prompt: answerText,
        maxTokens: 50,
        schema: NUMBER_VALUE_SCHEMA,
      });
      return value == null ? {} : { [question.field]: value };
    }
    case "culture": {
      const { value } = await askForJson<{ value: StudentPreferences["culture"] | null }>({
        system: `Map free text to exactly one of: startup, corporate, liberal_arts, research, arts. Null if unclear.`,
        prompt: answerText,
        maxTokens: 50,
        schema: enumValueSchema(["startup", "corporate", "liberal_arts", "research", "arts"]),
      });
      return value ? { culture: value } : {};
    }
    case "setting": {
      const { value } = await askForJson<{ value: StudentPreferences["setting"] | null }>({
        system: `Map free text to exactly one of: urban, suburban, rural. Null if unclear.`,
        prompt: answerText,
        maxTokens: 50,
        schema: enumValueSchema(["urban", "suburban", "rural"]),
      });
      return value ? { setting: value } : {};
    }
    case "aidType": {
      const { value } = await askForJson<{ value: StudentPreferences["aidType"] | null }>({
        system: `Map free text to exactly one of: full_ride, full_tuition, partial, any. Null if unclear.`,
        prompt: answerText,
        maxTokens: 50,
        schema: enumValueSchema(["full_ride", "full_tuition", "partial", "any"]),
      });
      return value ? { aidType: value } : {};
    }
    default:
      return { notes: answerText };
  }
}

export interface AdvanceResult {
  next: Question | null; // null once onboarding is complete (and preferences are saved)
  parsedAnswer: Partial<StudentPreferences>; // what THIS answer contributed, for composing an acknowledgment
}

export async function advanceOnboarding(session: OnboardingSession, answerText: string): Promise<AdvanceResult> {
  const question = currentQuestion(session);
  if (!question) return { next: null, parsedAnswer: {} };

  const parsed = await parseAnswer(question, answerText);
  Object.assign(session.answers, parsed);
  session.stepIndex++;

  const next = currentQuestion(session);
  if (!next) {
    await savePreferences(session.studentId, session.answers);
  }
  return { next, parsedAnswer: parsed };
}

async function savePreferences(studentId: string, prefs: Partial<StudentPreferences>): Promise<void> {
  await pool.query(
    `INSERT INTO preferences (student_id, culture, setting, aid_type, min_world_ranking, max_world_ranking, subject, subject_ranking_max, sat_score, ielts_score, notes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (student_id) DO UPDATE SET
       culture=$2, setting=$3, aid_type=$4, min_world_ranking=$5, max_world_ranking=$6,
       subject=$7, subject_ranking_max=$8, sat_score=$9, ielts_score=$10, notes=$11, updated_at=now()`,
    [
      studentId,
      prefs.culture ?? null,
      prefs.setting ?? null,
      prefs.aidType ?? null,
      prefs.minWorldRanking ?? null,
      prefs.maxWorldRanking ?? null,
      prefs.subject ?? null,
      prefs.subjectRankingMax ?? null,
      prefs.satScore ?? null,
      prefs.ieltsScore ?? null,
      prefs.notes ?? null,
    ]
  );
}
