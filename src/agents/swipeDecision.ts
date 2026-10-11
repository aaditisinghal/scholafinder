/**
 * Shared "record a swipe decision" core, used by both the boss agent (iMessage) and the
 * web swipe deck (drag gestures). On yes: saves the swipe, computes true cost, generates
 * the explainer card, and kicks off call + email outreach with default questions — the web
 * deck has no per-school customization step, that's covered by iMessage follow-up only if
 * the student asks for it directly.
 */
import { pool } from "../db/pool.js";
import { computeTrueCost } from "./trueCostAgent.js";
import { explainScholarship } from "./explainerAgent.js";
import { placeAdmissionsCall } from "./callAgent.js";
import { draftAndSendEmail } from "./emailAgent.js";

export type SwipeDecision = "yes" | "no" | "skip";

const DEFAULT_QUESTIONS = [
  "Are international students eligible for need-based financial aid?",
  "What does the application process look like for international applicants?",
  "When are admission and aid decisions released?",
];

export async function recordSwipe(studentId: string, universityId: string, decision: SwipeDecision): Promise<{ card?: string }> {
  await pool.query(
    `INSERT INTO swipes (student_id, university_id, decision) VALUES ($1,$2,$3)
     ON CONFLICT (student_id, university_id) DO UPDATE SET decision = $3`,
    [studentId, universityId, decision]
  );

  if (decision !== "yes") return {};

  await computeTrueCost(studentId, universityId).catch((err) => console.error("[trueCostAgent] failed:", err.message));
  const card = await explainScholarship(studentId, universityId).catch((err) => {
    console.error("[explainerAgent] failed:", err.message);
    return "Saved — I don't have full details yet, but I'll keep researching.";
  });

  kickOffOutreach(studentId, universityId).catch((err) => console.error("[swipeDecision] outreach failed:", err.message));

  return { card };
}

async function kickOffOutreach(studentId: string, universityId: string): Promise<void> {
  const { rows: uniRows } = await pool.query(
    `SELECT name, admissions_phone, admissions_email FROM universities WHERE id = $1`,
    [universityId]
  );
  const uni = uniRows[0];
  if (!uni) return;

  const { rows: callRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_calls (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, universityId, DEFAULT_QUESTIONS]
  );
  const { rows: emailRows } = await pool.query<{ id: string }>(
    `INSERT INTO outreach_emails (student_id, university_id, custom_questions) VALUES ($1,$2,$3) RETURNING id`,
    [studentId, universityId, DEFAULT_QUESTIONS]
  );

  if (uni.admissions_phone) {
    placeAdmissionsCall(callRows[0].id, uni.admissions_phone, uni.name, DEFAULT_QUESTIONS).catch((err) =>
      console.error("[callAgent] failed:", err.message)
    );
  }
  if (uni.admissions_email) {
    draftAndSendEmail(emailRows[0].id, uni.admissions_email, uni.name, DEFAULT_QUESTIONS).catch((err) =>
      console.error("[emailAgent] failed:", err.message)
    );
  }
}
